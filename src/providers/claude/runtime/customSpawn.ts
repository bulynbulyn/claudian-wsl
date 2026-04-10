import type { SpawnedProcess, SpawnOptions } from '@anthropic-ai/claude-agent-sdk';
import { spawn } from 'child_process';

import { findNodeExecutable } from '../../../utils/env';
import type { ClaudeLaunchSpec } from './claudeLaunchTypes';

export function createCustomSpawnFunction(
  enhancedPath: string,
  launchSpec?: ClaudeLaunchSpec,
): (options: SpawnOptions) => SpawnedProcess {
  return (options: SpawnOptions): SpawnedProcess => {
    let { command } = options;
    const { args, cwd, env, signal } = options;

    // WSL mode: use launch spec to spawn via wsl.exe
    if (launchSpec && launchSpec.target.method === 'wsl') {
      return spawnWslProcess(launchSpec, options);
    }

    // Resolve full path to avoid PATH lookup issues in GUI apps
    if (command === 'node') {
      const nodeFullPath = findNodeExecutable(enhancedPath);
      if (nodeFullPath) {
        command = nodeFullPath;
      }
    }

    // Do not pass `signal` directly to spawn() — Obsidian's Electron runtime
    // uses a different realm for AbortSignal, causing `instanceof EventTarget`
    // checks inside Node's internals to fail. Handle abort manually instead.
    const shouldPipeStderr = !!env?.DEBUG_CLAUDE_AGENT_SDK;
    const child = spawn(command, args, {
      cwd,
      env: env as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', shouldPipeStderr ? 'pipe' : 'ignore'],
      windowsHide: true,
    });

    if (signal) {
      if (signal.aborted) {
        child.kill();
      } else {
        signal.addEventListener('abort', () => child.kill(), { once: true });
      }
    }

    if (!child.stdin || !child.stdout) {
      throw new Error('Failed to create process streams');
    }

    return child as unknown as SpawnedProcess;
  };
}

function spawnWslProcess(
  launchSpec: ClaudeLaunchSpec,
  options: SpawnOptions,
): SpawnedProcess {
  const { signal } = options;
  const spawnCwd = launchSpec.spawnCwd || process.cwd();

  const child = spawn(launchSpec.command, launchSpec.args, {
    cwd: spawnCwd,
    env: launchSpec.env as NodeJS.ProcessEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  if (signal) {
    if (signal.aborted) {
      child.kill();
    } else {
      signal.addEventListener('abort', () => child.kill(), { once: true });
    }
  }

  if (!child.stdin || !child.stdout) {
    throw new Error('Failed to create WSL process streams');
  }

  return child as unknown as SpawnedProcess;
}