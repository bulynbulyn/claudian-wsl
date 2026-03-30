/**
 * Custom spawn logic for Claude Agent SDK.
 *
 * Provides a custom spawn function that resolves the full path to Node.js
 * instead of relying on PATH lookup. This fixes issues in GUI apps (like Obsidian)
 * where the minimal PATH doesn't include Node.js.
 *
 * Also supports WSL2 mode for running Claude CLI inside WSL distributions.
 */

import type { SpawnedProcess, SpawnOptions } from '@anthropic-ai/claude-agent-sdk';
import { spawn } from 'child_process';

import { findNodeExecutable } from '../../utils/env';
import type { WslConfig } from '../../utils/wslPath';
import { windowsToWslPath } from '../../utils/wslPath';

/**
 * Creates a custom spawn function for the Claude Agent SDK.
 *
 * @param enhancedPath - Enhanced PATH with Node.js directories
 * @param wslConfig - Optional WSL configuration for running in WSL2 mode
 */
export function createCustomSpawnFunction(
  enhancedPath: string,
  wslConfig?: WslConfig
): (options: SpawnOptions) => SpawnedProcess {
  return (options: SpawnOptions): SpawnedProcess => {
    let { command } = options;
    const { args, cwd, env, signal } = options;
    const shouldPipeStderr = !!env?.DEBUG_CLAUDE_AGENT_SDK;

    // WSL mode: execute through wsl.exe
    if (wslConfig) {
      return spawnWslProcess(wslConfig, options);
    }

    // Native mode: resolve full path to avoid PATH lookup issues in GUI apps
    if (command === 'node') {
      const nodeFullPath = findNodeExecutable(enhancedPath);
      if (nodeFullPath) {
        command = nodeFullPath;
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

/**
 * Spawns a process in WSL2.
 *
 * Uses wsl.exe to execute the Claude CLI inside the specified WSL distribution.
 */
function spawnWslProcess(
  wslConfig: WslConfig,
  options: SpawnOptions
): SpawnedProcess {
  const { args, cwd, env, signal } = options;

  // Convert Windows cwd to WSL path if provided
  let wslCwd: string | undefined;
  if (cwd) {
    // Check if cwd is already a WSL path
    if (cwd.startsWith('/')) {
      wslCwd = cwd;
    } else {
      wslCwd = windowsToWslPath(cwd);
    }
  }

  // Build wsl.exe arguments
  // In WSL, the claude CLI is a standalone binary, not a node script
  // The SDK passes args like: [cliPath, ...otherArgs]
  // We need to run: wsl -d distro --cd wslCwd --exec claude arg1 arg2 ...
  //
  // Note: args[0] is the CLI path from SDK, but we use wslConfig.cliPath instead
  // The remaining args are passed to the CLI
  const cliArgs = args.length > 0 ? args.slice(1) : []; // Skip the CLI path in args[0]

  const wslArgs: string[] = ['-d', wslConfig.distro];

  if (wslConfig.user) {
    wslArgs.push('-u', wslConfig.user);
  }

  // Set working directory if provided (must be WSL path)
  if (wslCwd) {
    wslArgs.push('--cd', wslCwd);
  }

  // Check if --input-format stream-json is present but --output-format is missing
  // The CLI requires both to be specified when using stream-json input
  const hasInputStreamJson = cliArgs.includes('--input-format') &&
    cliArgs[cliArgs.indexOf('--input-format') + 1] === 'stream-json';
  const hasOutputStreamJson = cliArgs.includes('--output-format');

  // Add output-format if input-format is stream-json but output-format is missing
  const finalCliArgs = [...cliArgs];
  if (hasInputStreamJson && !hasOutputStreamJson) {
    finalCliArgs.push('--output-format', 'stream-json');
  }

  // Use --exec to bypass shell and avoid quoting issues with special characters
  // --exec runs the command directly without going through bash
  wslArgs.push('--exec', wslConfig.cliPath, ...finalCliArgs);

  console.log('[Claudian WSL] Spawning process:', {
    distro: wslConfig.distro,
    cliPath: wslConfig.cliPath,
    cwd: wslCwd,
    args: cliArgs.slice(0, 5).join(' ') + (cliArgs.length > 5 ? '...' : ''),
    argCount: cliArgs.length,
  });

  // Build environment for WSL
  const wslEnv: Record<string, string> = {};

  // Pass through relevant environment variables
  if (env) {
    const envKeysToPass = [
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_BASE_URL',
      'ANTHROPIC_MODEL',
      'ANTHROPIC_DEFAULT_OPUS_MODEL',
      'ANTHROPIC_DEFAULT_SONNET_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL',
      'DEBUG_CLAUDE_AGENT_SDK',
    ];

    for (const key of envKeysToPass) {
      if (env[key]) {
        wslEnv[key] = String(env[key]);
      }
    }

    // Use WSLENV to pass variables to WSL
    const wslenvParts: string[] = [];
    for (const key of Object.keys(wslEnv)) {
      wslenvParts.push(key);
    }
    if (wslenvParts.length > 0) {
      wslEnv.WSLENV = wslenvParts.join(':');
    }
  }

  const child = spawn('wsl.exe', wslArgs, {
    cwd: undefined, // We use --cd instead
    env: { ...process.env, ...wslEnv },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  // Capture stderr for debugging
  if (child.stderr) {
    child.stderr.on('data', (data: Buffer) => {
      console.error('[Claudian WSL] stderr:', data.toString());
    });
  }

  // Log when process exits
  child.on('exit', (code, signal) => {
    console.log('[Claudian WSL] Process exited:', { code, signal });
  });

  child.on('error', (err) => {
    console.error('[Claudian WSL] Process error:', err);
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