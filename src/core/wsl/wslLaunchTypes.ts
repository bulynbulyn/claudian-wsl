/**
 * Shared WSL execution types.
 * Extracted from Claude/Codex providers for reuse.
 */

export type WslExecutionMethod = 'host-native' | 'wsl';
export type WslExecutionPlatformOs = 'windows' | 'linux' | 'macos';
export type WslExecutionPlatformFamily = 'windows' | 'unix';

export interface WslExecutionTarget {
  method: WslExecutionMethod;
  platformFamily: WslExecutionPlatformFamily;
  platformOs: WslExecutionPlatformOs;
  distroName?: string;
}

export interface WslPathMapper {
  target: WslExecutionTarget;
  toTargetPath(hostPath: string): string | null;
  toHostPath(targetPath: string): string | null;
  mapTargetPathList(hostPaths: string[]): string[];
  canRepresentHostPath(hostPath: string): boolean;
}

export interface WslLaunchSpec {
  target: WslExecutionTarget;
  command: string;
  args: string[];
  spawnCwd: string;
  targetCwd: string;
  env: Record<string, string>;
  pathMapper: WslPathMapper;
}