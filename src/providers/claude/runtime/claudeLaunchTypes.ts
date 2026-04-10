/**
 * Claude execution types for WSL support.
 * Modeled after Codex provider's launch types.
 */

export type ClaudeExecutionMethod = 'host-native' | 'wsl';
export type ClaudeExecutionPlatformOs = 'windows' | 'linux' | 'macos';
export type ClaudeExecutionPlatformFamily = 'windows' | 'unix';

export interface ClaudeExecutionTarget {
  method: ClaudeExecutionMethod;
  platformFamily: ClaudeExecutionPlatformFamily;
  platformOs: ClaudeExecutionPlatformOs;
  distroName?: string;
}

export interface ClaudePathMapper {
  target: ClaudeExecutionTarget;
  toTargetPath(hostPath: string): string | null;
  toHostPath(targetPath: string): string | null;
  mapTargetPathList(hostPaths: string[]): string[];
  canRepresentHostPath(hostPath: string): boolean;
}

export interface ClaudeLaunchSpec {
  target: ClaudeExecutionTarget;
  command: string;
  args: string[];
  spawnCwd: string;
  targetCwd: string;
  env: Record<string, string>;
  pathMapper: ClaudePathMapper;
}