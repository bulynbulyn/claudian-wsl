/**
 * Claude launch spec builder for WSL support.
 * Builds the command and arguments to launch Claude CLI via WSL.
 *
 * IMPORTANT: This only builds WSL execution wrapper args (--distribution, --cd).
 * All CLI arguments (--verbose, --permission-mode, etc.) are built by SDK
 * and merged in customSpawn.ts. This prevents parameter duplication.
 */

import {
  inferWslDistroFromWindowsPath,
  resolveClaudeExecutionTarget,
} from './ClaudeExecutionTargetResolver';
import type { ClaudeLaunchSpec } from './claudeLaunchTypes';
import { createClaudePathMapper } from './ClaudePathMapper';

export interface BuildClaudeLaunchSpecOptions {
  settings: Record<string, unknown>;
  resolvedCliCommand: string | null;
  hostVaultPath: string | null;
  env: Record<string, string>;
  hostPlatform?: NodeJS.Platform;
  resolveDefaultWslDistro?: () => string | undefined;
}

export function buildClaudeLaunchSpec(
  options: BuildClaudeLaunchSpecOptions,
): ClaudeLaunchSpec {
  const target = resolveClaudeExecutionTarget({
    settings: options.settings,
    hostPlatform: options.hostPlatform,
    hostVaultPath: options.hostVaultPath,
    resolveDefaultWslDistro: options.resolveDefaultWslDistro,
  });
  const pathMapper = createClaudePathMapper(target);
  const spawnCwd = options.hostVaultPath || process.cwd();

  // Validate WSL distro matches workspace if both are set
  const workspaceDistro = inferWslDistroFromWindowsPath(options.hostVaultPath);
  if (
    target.method === 'wsl'
    && target.distroName
    && workspaceDistro
    && target.distroName.toLowerCase() !== workspaceDistro.toLowerCase()
  ) {
    throw new Error(
      `WSL distro override "${target.distroName}" does not match workspace distro "${workspaceDistro}"`,
    );
  }

  // Ensure we have a distro name for WSL mode
  if (target.method === 'wsl' && !target.distroName) {
    throw new Error(
      'Unable to determine the WSL distro. Set WSL distro override or configure a default WSL distro.',
    );
  }

  const targetCwd = pathMapper.toTargetPath(spawnCwd);

  if (!targetCwd) {
    throw new Error('WSL mode only supports Windows drive paths and \\\\wsl$ workspace paths');
  }

  const resolvedCliCommand = options.resolvedCliCommand?.trim() || 'claude';

  // WSL mode: build wsl.exe wrapper args ONLY (no CLI args)
  // CLI args (--verbose, --permission-mode, --permission-prompt-tool, etc.)
  // are built by SDK and merged in customSpawn.ts
  if (target.method === 'wsl') {
    const args = [
      ...(target.distroName ? ['--distribution', target.distroName] : []),
      '--cd',
      targetCwd,
      resolvedCliCommand,
    ];

    return {
      target,
      command: 'wsl.exe',
      args,
      spawnCwd,
      targetCwd,
      env: options.env,
      pathMapper,
    };
  }

  // Native mode: direct CLI execution (args handled by SDK)
  return {
    target,
    command: resolvedCliCommand,
    args: [],
    spawnCwd,
    targetCwd,
    env: options.env,
    pathMapper,
  };
}