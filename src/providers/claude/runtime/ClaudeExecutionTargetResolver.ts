/**
 * Claude execution target resolver for WSL support.
 * Modeled after Codex provider's execution target resolver.
 */

import { execFileSync } from 'child_process';

import { getClaudeProviderSettings } from '../settings';
import type {
  ClaudeExecutionPlatformFamily,
  ClaudeExecutionPlatformOs,
  ClaudeExecutionTarget,
} from './claudeLaunchTypes';

export interface ResolveClaudeExecutionTargetOptions {
  settings: Record<string, unknown>;
  hostPlatform?: NodeJS.Platform;
  hostVaultPath?: string | null;
  resolveDefaultWslDistro?: () => string | undefined;
}

function resolveHostPlatformOs(hostPlatform: NodeJS.Platform): ClaudeExecutionPlatformOs {
  if (hostPlatform === 'win32') {
    return 'windows';
  }

  if (hostPlatform === 'darwin') {
    return 'macos';
  }

  return 'linux';
}

function resolveHostPlatformFamily(hostPlatform: NodeJS.Platform): ClaudeExecutionPlatformFamily {
  return hostPlatform === 'win32' ? 'windows' : 'unix';
}

export function inferWslDistroFromWindowsPath(hostPath: string | null | undefined): string | undefined {
  if (!hostPath) {
    return undefined;
  }

  const normalized = hostPath.replace(/\//g, '\\');
  const match = normalized.match(/^\\\\wsl\$\\([^\\]+)(?:\\|$)/i);
  return match?.[1] || undefined;
}

export function parseDefaultWslDistroListOutput(output: string): string | undefined {
  for (const line of output.replace(/\uFEFF/g, '').split(/\r?\n/)) {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith('*')) {
      continue;
    }

    const candidate = trimmed.slice(1).trimStart().split(/\s{2,}/)[0]?.trim();
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function resolveDefaultWslDistroName(): string | undefined {
  try {
    const output = execFileSync('wsl.exe', ['--list', '--verbose'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    return parseDefaultWslDistroListOutput(output);
  } catch {
    return undefined;
  }
}

export function resolveClaudeExecutionTarget(
  options: ResolveClaudeExecutionTargetOptions,
): ClaudeExecutionTarget {
  const hostPlatform = options.hostPlatform ?? process.platform;
  if (hostPlatform !== 'win32') {
    return {
      method: 'host-native',
      platformFamily: resolveHostPlatformFamily(hostPlatform),
      platformOs: resolveHostPlatformOs(hostPlatform),
    };
  }

  const claudeSettings = getClaudeProviderSettings(options.settings);
  if (claudeSettings.installationMethod === 'wsl') {
    const distroName = claudeSettings.wslDistroOverride
      || inferWslDistroFromWindowsPath(options.hostVaultPath)
      || options.resolveDefaultWslDistro?.()
      || resolveDefaultWslDistroName();

    return {
      method: 'wsl',
      platformFamily: 'unix',
      platformOs: 'linux',
      distroName,
    };
  }

  return {
    method: 'host-native',
    platformFamily: 'windows',
    platformOs: 'windows',
  };
}