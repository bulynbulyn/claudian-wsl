import { getRuntimeEnvironmentText } from '../../../core/providers/providerEnvironment';
import { findCliBinaryPath, resolveConfiguredCliPath } from '../../../utils/cliBinaryLocator';
import { getHostnameKey, parseEnvironmentVariables } from '../../../utils/env';
import { getPiProviderSettings } from '../settings';

export class PiCliResolver {
  private readonly cachedHostname = getHostnameKey();
  private lastCliPath = '';
  private lastEnvText = '';
  private lastHostnamePath = '';
  private lastInstallationMethod = '';
  private resolvedPath: string | null = null;

  resolveFromSettings(settings: Record<string, unknown>): string | null {
    const piSettings = getPiProviderSettings(settings);
    const cliPath = piSettings.cliPath.trim();
    const hostnamePath = (piSettings.cliPathsByHost[this.cachedHostname] ?? '').trim();
    const envText = getRuntimeEnvironmentText(settings, 'pi');
    const installationMethod = piSettings.installationMethod;

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
      piSettings.cliPathsByHost,
      cliPath,
      envText,
      installationMethod,
    );
    return this.resolvedPath;
  }

  resolve(
    hostnamePaths: Record<string, string> | undefined,
    legacyPath: string,
    envText: string,
    installationMethod?: string,
  ): string | null {
    const hostnamePath = (hostnamePaths?.[this.cachedHostname] ?? '').trim();
    const isWsl = installationMethod === 'wsl';

    if (isWsl) {
      return resolveWslCliPath(hostnamePath)
        ?? resolveWslCliPath(legacyPath.trim());
    }

    const customEnv = parseEnvironmentVariables(envText || '');
    return resolveConfiguredCliPath(hostnamePath)
      ?? resolveConfiguredCliPath(legacyPath.trim())
      ?? findCliBinaryPath('pi', customEnv.PATH);
  }

  reset(): void {
    this.lastCliPath = '';
    this.lastHostnamePath = '';
    this.lastEnvText = '';
    this.lastInstallationMethod = '';
    this.resolvedPath = null;
  }
}

function resolveWslCliPath(cliPath: string): string | null {
  const trimmed = cliPath.trim();
  if (!trimmed) {
    return null;
  }

  // WSL mode: skip fs validation for Linux paths
  // Linux absolute path or plain command name
  if (trimmed.startsWith('/') || (!trimmed.includes('/') && !trimmed.includes('\\'))) {
    return trimmed;
  }
  // Windows path in WSL mode - accept as-is
  return trimmed;
}
