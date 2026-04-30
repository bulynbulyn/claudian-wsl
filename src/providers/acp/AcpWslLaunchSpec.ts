/**
 * WSL launch spec builder for ACP-based providers.
 * Constructs wsl.exe wrapper arguments for subprocess spawning.
 */

import type { WslExecutionTarget, WslLaunchSpec, WslPathMapper } from '../../core/wsl';
import { createWslPathMapper, resolveWslExecutionTarget } from '../../core/wsl';

export interface BuildAcpWslLaunchSpecOptions {
  command: string;
  cliArgs: string[];
  settings: Record<string, unknown>;
  hostVaultPath: string | null;
  env: Record<string, string>;
  installationMethod?: 'native-windows' | 'wsl';
  wslDistroOverride?: string;
}

export function buildAcpWslLaunchSpec(
  options: BuildAcpWslLaunchSpecOptions,
): WslLaunchSpec {
  const target = resolveWslExecutionTarget({
    hostPlatform: process.platform,
    hostVaultPath: options.hostVaultPath,
    installationMethod: options.installationMethod,
    wslDistroOverride: options.wslDistroOverride,
  });

  const pathMapper = createWslPathMapper(target);

  if (target.method === 'wsl') {
    return buildWslLaunchSpec(options, target, pathMapper);
  }

  return buildNativeLaunchSpec(options, target, pathMapper);
}

function buildNativeLaunchSpec(
  options: BuildAcpWslLaunchSpecOptions,
  target: WslExecutionTarget,
  pathMapper: WslPathMapper,
): WslLaunchSpec {
  return {
    args: options.cliArgs,
    command: options.command,
    env: options.env,
    pathMapper,
    spawnCwd: options.hostVaultPath ?? process.cwd(),
    target,
    targetCwd: options.hostVaultPath ?? process.cwd(),
  };
}

function buildWslLaunchSpec(
  options: BuildAcpWslLaunchSpecOptions,
  target: WslExecutionTarget,
  pathMapper: WslPathMapper,
): WslLaunchSpec {
  const distro = target.distroName ?? 'Ubuntu';
  const targetCwd = pathMapper.toTargetPath(options.hostVaultPath ?? process.cwd()) ?? '/';
  const targetCommand = pathMapper.toTargetPath(options.command) ?? options.command;

  // Map environment variables with WSL paths
  const mappedEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.env)) {
    if (key === 'PATH' || key === 'OPENCODE_CONFIG') {
      // PATH and config paths need conversion
      mappedEnv[key] = pathMapper.toTargetPath(value) ?? value;
    } else {
      mappedEnv[key] = value;
    }
  }

  // WSL wrapper args: -d <distro> -- <command> <args>
  const wslArgs = [
    '-d', distro,
    '--',
    targetCommand,
    ...options.cliArgs.map(arg => {
      // Convert cwd arg if it's a Windows path
      if (arg.startsWith('--cwd=')) {
        const cwdValue = arg.slice('--cwd='.length);
        const mappedCwd = pathMapper.toTargetPath(cwdValue);
        return mappedCwd ? `--cwd=${mappedCwd}` : arg;
      }
      return arg;
    }),
  ];

  return {
    args: wslArgs,
    command: 'wsl.exe',
    env: mappedEnv,
    pathMapper,
    spawnCwd: options.hostVaultPath ?? process.cwd(),
    target,
    targetCwd,
  };
}