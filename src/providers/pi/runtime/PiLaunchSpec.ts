import type { WslLaunchSpec } from '../../../core/wsl';
import { createWslPathMapper, resolveWslExecutionTarget } from '../../../core/wsl';
import { decodePiModelId, normalizePiThinkingLevel } from '../models';
import type { PiProviderSettings } from '../settings';
import type { PiProviderState } from '../types';

export interface BuildPiLaunchSpecParams {
  command: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  envText?: string;
  model?: string | null;
  noSession?: boolean;
  noTools?: boolean;
  providerState?: PiProviderState | null;
  settings: PiProviderSettings;
  systemPrompt?: string;
  systemPromptFile?: string;
  thinkingLevel?: string | null;
}

export interface PiLaunchSpec {
  args: string[];
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  launchKey: string;
  wslLaunchSpec?: WslLaunchSpec;
}

export interface BuildPiWslLaunchSpecOptions {
  command: string;
  cliArgs: string[];
  hostVaultPath: string;
  env: NodeJS.ProcessEnv;
  installationMethod?: 'native-windows' | 'wsl';
  wslDistroOverride?: string;
}

export function buildPiWslLaunchSpec(
  options: BuildPiWslLaunchSpecOptions,
): WslLaunchSpec | undefined {
  const target = resolveWslExecutionTarget({
    hostPlatform: process.platform,
    hostVaultPath: options.hostVaultPath,
    installationMethod: options.installationMethod,
    wslDistroOverride: options.wslDistroOverride,
  });

  if (target.method !== 'wsl') {
    return undefined;
  }

  const pathMapper = createWslPathMapper(target);
  const distro = target.distroName ?? 'Ubuntu';
  const targetCwd = pathMapper.toTargetPath(options.hostVaultPath) ?? '/';
  const targetCommand = pathMapper.toTargetPath(options.command) ?? options.command;

  // WSL's .bashrc has an interactive guard that prevents fnm/nvm from loading
  // in non-interactive shells. Use bash -i to force interactive mode so that
  // .bashrc is fully sourced and Node.js version managers are initialized.
  const allArgs = [targetCommand, ...options.cliArgs];
  const escapedArgs = allArgs.map(a => a.replace(/'/g, "'\\''"));
  const commandString = `'${escapedArgs.join("' '")}'`;

  const wslArgs = [
    '-d', distro,
    '--',
    'bash', '-i', '-c', commandString,
  ];

  return {
    args: wslArgs,
    command: 'wsl.exe',
    env: options.env as Record<string, string>,
    pathMapper,
    spawnCwd: options.hostVaultPath,
    target,
    targetCwd,
  };
}

const READONLY_TOOLS = 'read,grep,find,ls';

export function buildPiLaunchSpec(params: BuildPiLaunchSpecParams): PiLaunchSpec {
  const args = ['--mode', 'rpc'];
  const systemPrompt = params.systemPrompt?.trim();
  if (systemPrompt) {
    // In WSL mode, write system prompt to a temp file and use --append-system-prompt
    // to avoid bash interpreting multi-line content with special characters as commands.
    if (params.systemPromptFile) {
      args.push('--append-system-prompt', params.systemPromptFile);
    } else {
      args.push('--system-prompt', systemPrompt);
    }
  }

  if (params.noSession) {
    args.push('--no-session');
  } else if (params.providerState?.sessionFile || params.providerState?.sessionId) {
    args.push('--session', params.providerState.sessionFile ?? params.providerState.sessionId!);
  }

  if (params.noTools) {
    args.push('--no-tools');
  } else if (params.settings.toolMode === 'readonly') {
    args.push('--tools', READONLY_TOOLS);
  }

  const decodedModel = typeof params.model === 'string' ? decodePiModelId(params.model) : null;
  if (decodedModel) {
    args.push('--provider', decodedModel.provider, '--model', decodedModel.modelId);
  }

  const thinkingLevel = normalizePiThinkingLevel(params.thinkingLevel);
  if (thinkingLevel && thinkingLevel !== 'off') {
    args.push('--thinking', thinkingLevel);
  }

  return {
    args,
    command: params.command,
    cwd: params.cwd,
    env: params.env ?? process.env,
    launchKey: JSON.stringify({
      args,
      command: params.command,
      cwd: params.cwd,
      envText: params.envText ?? params.settings.environmentVariables,
    }),
  };
}
