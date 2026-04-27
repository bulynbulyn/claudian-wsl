import { getProviderConfig, setProviderConfig } from '../../core/providers/providerConfig';
import { getProviderEnvironmentVariables } from '../../core/providers/providerEnvironment';
import type { HostnameCliPaths } from '../../core/types/settings';

export type ClaudeSafeMode = 'acceptEdits' | 'default';
export type ClaudeInstallationMethod = 'native-windows' | 'wsl';
export type HostnameInstallationMethods = Record<string, ClaudeInstallationMethod>;

export interface ClaudeProviderSettings {
  safeMode: ClaudeSafeMode;
  cliPath: string;
  cliPathsByHost: HostnameCliPaths;
  loadUserSettings: boolean;
  enableChrome: boolean;
  enableBangBash: boolean;
  enableOpus1M: boolean;
  enableSonnet1M: boolean;
  customModels: string;
  lastModel: string;
  environmentVariables: string;
  environmentHash: string;
  // WSL support
  installationMethod: ClaudeInstallationMethod;
  installationMethodsByHost: HostnameInstallationMethods;
  wslDistroOverride: string;
  wslDistroOverridesByHost: HostnameCliPaths;
  /** WSL home directory path (e.g., /home/username). Used for finding SDK session files. */
  wslHomePath: string;
}

export const DEFAULT_CLAUDE_PROVIDER_SETTINGS: Readonly<ClaudeProviderSettings> = Object.freeze({
  safeMode: 'acceptEdits',
  cliPath: '',
  cliPathsByHost: {},
  loadUserSettings: true,
  enableChrome: false,
  enableBangBash: false,
  enableOpus1M: false,
  enableSonnet1M: false,
  customModels: '',
  lastModel: 'haiku',
  environmentVariables: '',
  environmentHash: '',
  // WSL defaults
  installationMethod: 'native-windows',
  installationMethodsByHost: {},
  wslDistroOverride: '',
  wslDistroOverridesByHost: {},
  wslHomePath: '',
});

function normalizeHostnameCliPaths(value: unknown): HostnameCliPaths {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const result: HostnameCliPaths = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof key === 'string' && key.trim() && typeof entry === 'string' && entry.trim()) {
      result[key] = entry.trim();
    }
  }
  return result;
}

function normalizeInstallationMethod(value: unknown): ClaudeInstallationMethod {
  return value === 'wsl' ? 'wsl' : 'native-windows';
}

function normalizeInstallationMethodsByHost(value: unknown): HostnameInstallationMethods {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const result: HostnameInstallationMethods = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof key === 'string' && key.trim()) {
      result[key] = normalizeInstallationMethod(entry);
    }
  }
  return result;
}

export function getClaudeProviderSettings(
  settings: Record<string, unknown>,
): ClaudeProviderSettings {
  const config = getProviderConfig(settings, 'claude');
  const installationMethodsByHost = normalizeInstallationMethodsByHost(config.installationMethodsByHost);
  const wslDistroOverridesByHost = normalizeHostnameCliPaths(config.wslDistroOverridesByHost);

  return {
    safeMode: (config.safeMode as ClaudeSafeMode | undefined)
      ?? (settings.claudeSafeMode as ClaudeSafeMode | undefined)
      ?? DEFAULT_CLAUDE_PROVIDER_SETTINGS.safeMode,
    cliPath: (config.cliPath as string | undefined)
      ?? (settings.claudeCliPath as string | undefined)
      ?? DEFAULT_CLAUDE_PROVIDER_SETTINGS.cliPath,
    cliPathsByHost: normalizeHostnameCliPaths(config.cliPathsByHost ?? settings.claudeCliPathsByHost),
    loadUserSettings: (config.loadUserSettings as boolean | undefined)
      ?? (settings.loadUserClaudeSettings as boolean | undefined)
      ?? DEFAULT_CLAUDE_PROVIDER_SETTINGS.loadUserSettings,
    enableChrome: (config.enableChrome as boolean | undefined)
      ?? (settings.enableChrome as boolean | undefined)
      ?? DEFAULT_CLAUDE_PROVIDER_SETTINGS.enableChrome,
    enableBangBash: (config.enableBangBash as boolean | undefined)
      ?? (settings.enableBangBash as boolean | undefined)
      ?? DEFAULT_CLAUDE_PROVIDER_SETTINGS.enableBangBash,
    enableOpus1M: (config.enableOpus1M as boolean | undefined)
      ?? (settings.enableOpus1M as boolean | undefined)
      ?? DEFAULT_CLAUDE_PROVIDER_SETTINGS.enableOpus1M,
    enableSonnet1M: (config.enableSonnet1M as boolean | undefined)
      ?? (settings.enableSonnet1M as boolean | undefined)
      ?? DEFAULT_CLAUDE_PROVIDER_SETTINGS.enableSonnet1M,
    customModels: (config.customModels as string | undefined)
      ?? DEFAULT_CLAUDE_PROVIDER_SETTINGS.customModels,
    lastModel: (config.lastModel as string | undefined)
      ?? (settings.lastClaudeModel as string | undefined)
      ?? DEFAULT_CLAUDE_PROVIDER_SETTINGS.lastModel,
    environmentVariables: (config.environmentVariables as string | undefined)
      ?? getProviderEnvironmentVariables(settings, 'claude')
      ?? DEFAULT_CLAUDE_PROVIDER_SETTINGS.environmentVariables,
    environmentHash: (config.environmentHash as string | undefined)
      ?? (settings.lastEnvHash as string | undefined)
      ?? DEFAULT_CLAUDE_PROVIDER_SETTINGS.environmentHash,
    // WSL settings
    installationMethod: normalizeInstallationMethod(config.installationMethod),
    installationMethodsByHost,
    wslDistroOverride: typeof config.wslDistroOverride === 'string'
      ? config.wslDistroOverride.trim()
      : DEFAULT_CLAUDE_PROVIDER_SETTINGS.wslDistroOverride,
    wslDistroOverridesByHost,
    wslHomePath: typeof config.wslHomePath === 'string'
      ? config.wslHomePath.trim()
      : DEFAULT_CLAUDE_PROVIDER_SETTINGS.wslHomePath,
  };
}

export function updateClaudeProviderSettings(
  settings: Record<string, unknown>,
  updates: Partial<ClaudeProviderSettings>,
): ClaudeProviderSettings {
  const next = {
    ...getClaudeProviderSettings(settings),
    ...updates,
  };
  setProviderConfig(settings, 'claude', next);
  return next;
}
