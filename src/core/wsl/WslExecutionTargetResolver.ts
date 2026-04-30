/**
 * Shared WSL execution target resolver.
 * Extracted from Claude/Codex providers for reuse.
 */

import { execFileSync } from 'child_process';

import type {
  WslExecutionPlatformFamily,
  WslExecutionPlatformOs,
  WslExecutionTarget,
} from './wslLaunchTypes';

export interface ResolveWslExecutionTargetOptions {
  installationMethod?: 'native-windows' | 'wsl';
  wslDistroOverride?: string;
  hostPlatform?: NodeJS.Platform;
  hostVaultPath?: string | null;
  resolveDefaultWslDistro?: () => string | undefined;
}

function resolveHostPlatformOs(hostPlatform: NodeJS.Platform): WslExecutionPlatformOs {
  if (hostPlatform === 'win32') {
    return 'windows';
  }

  if (hostPlatform === 'darwin') {
    return 'macos';
  }

  return 'linux';
}

function resolveHostPlatformFamily(hostPlatform: NodeJS.Platform): WslExecutionPlatformFamily {
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

export function resolveWslExecutionTarget(
  options: ResolveWslExecutionTargetOptions,
): WslExecutionTarget {
  const hostPlatform = options.hostPlatform ?? process.platform;
  if (hostPlatform !== 'win32') {
    return {
      method: 'host-native',
      platformFamily: resolveHostPlatformFamily(hostPlatform),
      platformOs: resolveHostPlatformOs(hostPlatform),
    };
  }

  if (options.installationMethod === 'wsl') {
    const distroName = options.wslDistroOverride
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