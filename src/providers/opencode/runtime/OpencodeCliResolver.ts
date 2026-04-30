import * as fs from 'node:fs';

import { getRuntimeEnvironmentText } from '../../../core/providers/providerEnvironment';
import { getHostnameKey } from '../../../utils/env';
import { expandHomePath } from '../../../utils/path';
import { getOpencodeProviderSettings } from '../settings';

export class OpencodeCliResolver {
  private readonly cachedHostname = getHostnameKey();
  private lastCliPath = '';
  private lastHostnamePath = '';
  private lastEnvText = '';
  private lastInstallationMethod = '';
  private resolvedPath: string | null = null;

  resolveFromSettings(settings: Record<string, unknown>): string | null {
    const opencodeSettings = getOpencodeProviderSettings(settings);
    const cliPath = opencodeSettings.cliPath.trim();
    const hostnamePath = (opencodeSettings.cliPathsByHost[this.cachedHostname] ?? '').trim();
    const envText = getRuntimeEnvironmentText(settings, 'opencode');
    const installationMethod = opencodeSettings.installationMethod;

    if (
      this.resolvedPath !== null
      && cliPath === this.lastCliPath
      && hostnamePath === this.lastHostnamePath
      && envText === this.lastEnvText
      && installationMethod === this.lastInstallationMethod
    ) {
      return this.resolvedPath;
    }

    this.lastCliPath = cliPath;
    this.lastHostnamePath = hostnamePath;
    this.lastEnvText = envText;
    this.lastInstallationMethod = installationMethod;
    this.resolvedPath = this.resolve(
      opencodeSettings.cliPathsByHost,
      cliPath,
      envText,
      installationMethod,
    );
    return this.resolvedPath;
  }

  resolve(
    hostnamePaths: Record<string, string> | undefined,
    legacyPath: string,
    _envText: string,
    installationMethod?: string,
  ): string | null {
    const hostnamePath = (hostnamePaths?.[this.cachedHostname] ?? '').trim();
    return resolveConfiguredCliPath(hostnamePath, installationMethod === 'wsl')
      ?? resolveConfiguredCliPath(legacyPath.trim(), installationMethod === 'wsl');
  }

  reset(): void {
    this.lastCliPath = '';
    this.lastHostnamePath = '';
    this.lastEnvText = '';
    this.lastInstallationMethod = '';
    this.resolvedPath = null;
  }
}

function resolveConfiguredCliPath(cliPath: string, isWslMode: boolean): string | null {
  if (!cliPath) {
    return null;
  }

  // WSL mode: skip fs validation for Linux paths
  if (isWslMode) {
    // Linux absolute path or plain command name
    if (cliPath.startsWith('/') || !cliPath.includes('/') && !cliPath.includes('\\')) {
      return cliPath;
    }
    // Windows path in WSL mode - should be converted, but accept as-is
    return cliPath;
  }

  // Native mode: validate path exists
  try {
    const expanded = expandHomePath(cliPath);
    if (fs.existsSync(expanded) && fs.statSync(expanded).isFile()) {
      return expanded;
    }
  } catch {
    return null;
  }

  return null;
}
