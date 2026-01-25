/**
 * Custom spawn logic for Claude Agent SDK.
 *
 * Provides a custom spawn function that resolves the full path to Node.js
 * instead of relying on PATH lookup. This fixes issues in GUI apps (like Obsidian)
 * where the minimal PATH doesn't include Node.js.
 */

import type { SpawnedProcess, SpawnOptions } from '@anthropic-ai/claude-agent-sdk';
import { spawn } from 'child_process';

import { findNodeExecutable } from '../../utils/env';

/**
 * Creates a custom spawn function for the Claude Agent SDK.
 *
 * When the SDK tries to spawn "node", this function resolves the full path
 * to the Node.js executable using the enhanced PATH, avoiding PATH lookup issues.
 *
 * @param enhancedPath - The enhanced PATH string with user-configured paths
 * @returns A spawn function compatible with SDK's spawnClaudeCodeProcess option
 */
export function createCustomSpawnFunction(
  enhancedPath: string
): (options: SpawnOptions) => SpawnedProcess {
  return (options: SpawnOptions): SpawnedProcess => {
    let { command } = options;
    const { args, cwd, env, signal } = options;
    const shouldPipeStderr = Boolean(env?.DEBUG_CLAUDE_AGENT_SDK);

    // If command is "node", resolve to full path to avoid PATH lookup issues
    // This fixes spawning in GUI apps where PATH is minimal
    if (command === 'node') {
      const nodeFullPath = findNodeExecutable(enhancedPath);
      if (nodeFullPath) {
        command = nodeFullPath;
      }
      // If not found, fall through with "node" and hope PATH works
    }

    // Spawn the process
    const child = spawn(command, args, {
      cwd,
      env: env as NodeJS.ProcessEnv,
      signal,
      stdio: ['pipe', 'pipe', shouldPipeStderr ? 'pipe' : 'ignore'],
      // On Windows, avoid showing console window
      windowsHide: true,
    });

    if (shouldPipeStderr && child.stderr && typeof child.stderr.on === 'function') {
      child.stderr.on('data', () => {});
    }

    // Ensure stdin/stdout are available (they should be with stdio: 'pipe')
    if (!child.stdin || !child.stdout) {
      throw new Error('Failed to create process streams');
    }

    // ChildProcess satisfies SpawnedProcess interface
    // We cast through unknown to handle minor type differences between Node.js versions
    return child as unknown as SpawnedProcess;
  };
}
