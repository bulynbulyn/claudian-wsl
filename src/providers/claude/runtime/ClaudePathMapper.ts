/**
 * Claude path mapper for WSL support.
 * Handles Windows ↔ WSL path conversions.
 * Modeled after Codex provider's path mapper.
 */

import * as path from 'path';

import type { McpServerConfig } from '../../../core/types/mcp';
import type { ClaudeExecutionTarget, ClaudePathMapper } from './claudeLaunchTypes';

function normalizeWindowsPath(value: string | undefined | null): string {
  if (!value) {
    return '';
  }

  let normalized = value.replace(/\//g, '\\');
  if (normalized.startsWith('\\\\?\\UNC\\')) {
    normalized = `\\\\${normalized.slice('\\\\?\\UNC\\'.length)}`;
  } else if (normalized.startsWith('\\\\?\\')) {
    normalized = normalized.slice('\\\\?\\'.length);
  }

  return path.win32.normalize(normalized);
}

function normalizePosixPath(value: string | undefined | null): string {
  if (!value) {
    return '';
  }

  const normalized = path.posix.normalize(value.replace(/\\/g, '/'));
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '');
}

function maybeMapWindowsDriveToWsl(hostPath: string): string | null {
  const normalized = normalizeWindowsPath(hostPath);
  const match = normalized.match(/^([A-Za-z]):(?:\\(.*))?$/);
  if (!match) {
    return null;
  }

  const drive = match[1].toLowerCase();
  const tail = (match[2] ?? '').replace(/\\/g, '/');
  return tail ? `/mnt/${drive}/${tail}` : `/mnt/${drive}`;
}

function maybeMapWslUncToLinux(hostPath: string, distroName?: string): string | null {
  const normalized = normalizeWindowsPath(hostPath);
  const match = normalized.match(/^\\\\wsl\$\\([^\\]+)(?:\\(.*))?$/i);
  if (!match) {
    return null;
  }

  const uncDistro = match[1];
  if (distroName && uncDistro.toLowerCase() !== distroName.toLowerCase()) {
    return null;
  }

  const tail = match[2] ? match[2].replace(/\\/g, '/') : '';
  return tail ? `/${tail}` : '/';
}

function maybeMapLinuxToWindowsDrive(targetPath: string): string | null {
  const normalized = normalizePosixPath(targetPath);
  const match = normalized.match(/^\/mnt\/([a-zA-Z])(?:\/(.*))?$/);
  if (!match) {
    return null;
  }

  const drive = match[1].toUpperCase();
  const tail = match[2] ? match[2].replace(/\//g, '\\') : '';
  return tail ? `${drive}:\\${tail}` : `${drive}:\\`;
}

function maybeMapLinuxToWslUnc(targetPath: string, distroName?: string): string | null {
  if (!distroName) {
    return null;
  }

  const normalized = normalizePosixPath(targetPath);
  if (!normalized.startsWith('/')) {
    return null;
  }

  const tail = normalized === '/' ? '' : normalized.slice(1).replace(/\//g, '\\');
  return tail ? `\\\\wsl$\\${distroName}\\${tail}` : `\\\\wsl$\\${distroName}`;
}

function createIdentityMapper(target: ClaudeExecutionTarget): ClaudePathMapper {
  return {
    target,
    toTargetPath(hostPath: string): string | null {
      if (!hostPath) {
        return null;
      }

      return target.platformFamily === 'windows'
        ? normalizeWindowsPath(hostPath)
        : normalizePosixPath(hostPath);
    },
    toHostPath(targetPath: string): string | null {
      if (!targetPath) {
        return null;
      }

      return target.platformFamily === 'windows'
        ? normalizeWindowsPath(targetPath)
        : normalizePosixPath(targetPath);
    },
    mapTargetPathList(hostPaths: string[]): string[] {
      return hostPaths
        .map(hostPath => this.toTargetPath(hostPath))
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
    },
    canRepresentHostPath(hostPath: string): boolean {
      return this.toTargetPath(hostPath) !== null;
    },
  };
}

function createWslPathMapper(target: ClaudeExecutionTarget): ClaudePathMapper {
  return {
    target,
    toTargetPath(hostPath: string): string | null {
      if (!hostPath) {
        return null;
      }

      return maybeMapWslUncToLinux(hostPath, target.distroName)
        ?? maybeMapWindowsDriveToWsl(hostPath);
    },
    toHostPath(targetPath: string): string | null {
      if (!targetPath) {
        return null;
      }

      return maybeMapLinuxToWindowsDrive(targetPath)
        ?? maybeMapLinuxToWslUnc(targetPath, target.distroName);
    },
    mapTargetPathList(hostPaths: string[]): string[] {
      return hostPaths
        .map(hostPath => this.toTargetPath(hostPath))
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
    },
    canRepresentHostPath(hostPath: string): boolean {
      return this.toTargetPath(hostPath) !== null;
    },
  };
}

export function createClaudePathMapper(target: ClaudeExecutionTarget): ClaudePathMapper {
  return target.method === 'wsl'
    ? createWslPathMapper(target)
    : createIdentityMapper(target);
}

/**
 * Map MCP server configs for WSL execution.
 * Transforms stdio server command paths from Windows to WSL paths.
 */
export function mapMcpServersForWsl(
  servers: Record<string, McpServerConfig>,
  pathMapper: ClaudePathMapper,
): Record<string, McpServerConfig> {
  const result: Record<string, McpServerConfig> = {};

  for (const [name, config] of Object.entries(servers)) {
    // Only stdio servers need path mapping
    if (config.type === 'sse' || config.type === 'http' || !('command' in config)) {
      result[name] = config;
      continue;
    }

    // Map command path if it's a Windows path
    const mappedCommand = pathMapper.toTargetPath(config.command);
    if (!mappedCommand) {
      // Can't map this path - skip or use original
      result[name] = config;
      continue;
    }

    // Map args if they contain paths (heuristic: absolute Windows paths)
    const mappedArgs = config.args?.map((arg: string) => {
      // Check if arg looks like an absolute Windows path
      if (/^[A-Za-z]:[/\\]/.test(arg)) {
        const mapped = pathMapper.toTargetPath(arg);
        return mapped ?? arg;
      }
      return arg;
    });

    result[name] = {
      ...config,
      command: mappedCommand,
      args: mappedArgs,
    };
  }

  return result;
}