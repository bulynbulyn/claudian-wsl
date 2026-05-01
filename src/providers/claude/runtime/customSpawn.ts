import type { SpawnedProcess, SpawnOptions } from '@anthropic-ai/claude-agent-sdk';
import { spawn } from 'child_process';

import { cliPathRequiresNode, findNodeExecutable } from '../../../utils/env';
import type { ClaudeLaunchSpec } from './claudeLaunchTypes';

export function createCustomSpawnFunction(
  enhancedPath: string,
  launchSpec?: ClaudeLaunchSpec,
): (options: SpawnOptions) => SpawnedProcess {
  return (options: SpawnOptions): SpawnedProcess => {
    let { command } = options;
    let { args } = options;
    const { cwd, env, signal } = options;

    // WSL mode: use launch spec to spawn via wsl.exe
    if (launchSpec && launchSpec.target.method === 'wsl') {
      return spawnWslProcess(launchSpec, options);
    }

    const shouldPipeStderr = !!env?.DEBUG_CLAUDE_AGENT_SDK;

    // The SDK only routes some script extensions through `node`; normalize the
    // remaining Node-backed paths here before Electron spawns with shell=false.
    if (command === 'node' || cliPathRequiresNode(command)) {
      const nodeFullPath = findNodeExecutable(enhancedPath);
      if (command === 'node') {
        if (nodeFullPath) {
          command = nodeFullPath;
        }
      } else {
        args = [command, ...args];
        command = nodeFullPath ?? 'node';
      }
    }

    // Do not pass `signal` directly to spawn() — Obsidian's Electron runtime
    // uses a different realm for AbortSignal, causing `instanceof EventTarget`
    // checks inside Node's internals to fail. Handle abort manually instead.
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

    if (shouldPipeStderr && child.stderr && typeof child.stderr.on === 'function') {
      child.stderr.on('data', () => {});
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

  // launchSpec.args contains WSL wrapper: [--distribution, distro, --cd, cwd, claude]
  // options.args contains SDK-built CLI args: [--verbose, --permission-mode, --permission-prompt-tool, etc.]
  // Simply concatenate them - no duplication possible since they're different categories
  const wslArgs = launchSpec.args;  // WSL execution wrapper
  const cliArgs = options.args;      // Claude CLI arguments (built by SDK)

  // WSL executes commands via /bin/bash -c, which interprets special characters
  // like parentheses, brackets, etc. We need to quote arguments containing these.
  const quotedCliArgs = cliArgs.map(arg => {
    // Check if arg contains bash special characters that need quoting
    if (/[(){}<>$`!;&|*?[\]\\]/.test(arg) || arg.includes(' ')) {
      // Escape any existing double quotes and wrap in double quotes
      return `"${arg.replace(/"/g, '\\"')}"`;
    }
    return arg;
  });

  const fullArgs = [...wslArgs, ...quotedCliArgs];

  // WSL doesn't inherit Windows env vars by default. Use WSLENV to pass specific vars.
  // Format: VAR1:VAR2:VAR3 (colon-separated, /p suffix for path translation)
  const wslEnvVars = [
    'CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING',
    'CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING',
  ];
  const existingWslenv = process.env.WSLENV || '';
  const newWslenv = existingWslenv
    ? `${existingWslenv}:${wslEnvVars.join(':')}`
    : wslEnvVars.join(':');

  const mergedEnv = {
    ...process.env,
    ...launchSpec.env,
    // Pass these env vars to WSL via WSLENV
    WSLENV: newWslenv,
    // Set the actual values
    CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: 'true',
  };

  console.log('[Claudian] WSL spawn env:', {
    WSLENV: mergedEnv.WSLENV,
    CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: mergedEnv.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING,
  });

  const child = spawn(launchSpec.command, fullArgs, {
    cwd: spawnCwd,
    env: mergedEnv as NodeJS.ProcessEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  // Debug: log stderr output
  if (child.stderr) {
    child.stderr.on('data', (data: Buffer) => {
      console.log('[WSL Debug] stderr:', data.toString());
    });
  }

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