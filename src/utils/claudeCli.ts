/**
 * Claudian - Claude CLI resolver
 *
 * Shared resolver for Claude CLI path detection across services.
 * Supports WSL2 paths via wsl:// URI format.
 */

import * as fs from 'fs';

import { type HostnameCliPaths } from '../core/types/settings';
import { getHostnameKey, parseEnvironmentVariables } from './env';
import { expandHomePath, findClaudeCLIPath } from './path';
import { isWslCliPath, parseWslUri,type WslConfig } from './wslPath';

/** Result of CLI path resolution, including WSL config if applicable. */
export interface CliResolveResult {
  /** Resolved CLI path (or WSL CLI path for display) */
  path: string | null;
  /** WSL configuration if the path is a WSL path */
  wslConfig?: WslConfig;
}

export class ClaudeCliResolver {
  private resolvedPath: string | null = null;
  private resolvedWslConfig: WslConfig | undefined;
  private lastHostnamePath = '';
  private lastLegacyPath = '';
  private lastEnvText = '';
  // Cache hostname since it doesn't change during a session
  private readonly cachedHostname = getHostnameKey();

  /**
   * Resolves CLI path with priority: hostname-specific -> legacy -> auto-detect.
   * @param hostnamePaths Per-device CLI paths keyed by hostname (preferred)
   * @param legacyPath Legacy claudeCliPath (for backwards compatibility)
   * @param envText Environment variables text
   */
  resolve(
    hostnamePaths: HostnameCliPaths | undefined,
    legacyPath: string | undefined,
    envText: string
  ): string | null {
    const result = this.resolveWithWsl(hostnamePaths, legacyPath, envText);
    return result.path;
  }

  /**
   * Resolves CLI path with WSL configuration.
   * Returns both the path and WSL config if applicable.
   */
  resolveWithWsl(
    hostnamePaths: HostnameCliPaths | undefined,
    legacyPath: string | undefined,
    envText: string
  ): CliResolveResult {
    const hostnameKey = this.cachedHostname;

    const hostnamePath = (hostnamePaths?.[hostnameKey] ?? '').trim();
    const normalizedLegacy = (legacyPath ?? '').trim();
    const normalizedEnv = envText ?? '';

    // Check cache
    if (
      this.resolvedPath &&
      hostnamePath === this.lastHostnamePath &&
      normalizedLegacy === this.lastLegacyPath &&
      normalizedEnv === this.lastEnvText
    ) {
      return {
        path: this.resolvedPath,
        wslConfig: this.resolvedWslConfig,
      };
    }

    // Update cache keys
    this.lastHostnamePath = hostnamePath;
    this.lastLegacyPath = normalizedLegacy;
    this.lastEnvText = normalizedEnv;

    // Resolve the path
    const result = resolveClaudeCliPathWithWsl(hostnamePath, normalizedLegacy, normalizedEnv);
    this.resolvedPath = result.path;
    this.resolvedWslConfig = result.wslConfig;

    return result;
  }

  /**
   * Gets the WSL configuration if the current CLI path is a WSL path.
   */
  getWslConfig(): WslConfig | undefined {
    return this.resolvedWslConfig;
  }

  reset(): void {
    this.resolvedPath = null;
    this.resolvedWslConfig = undefined;
    this.lastHostnamePath = '';
    this.lastLegacyPath = '';
    this.lastEnvText = '';
  }
}

/**
 * Resolves CLI path with fallback chain.
 * @param hostnamePath Hostname-specific path for this device (preferred)
 * @param legacyPath Legacy claudeCliPath (backwards compatibility)
 * @param envText Environment variables text
 */
export function resolveClaudeCliPath(
  hostnamePath: string | undefined,
  legacyPath: string | undefined,
  envText: string
): string | null {
  const result = resolveClaudeCliPathWithWsl(hostnamePath, legacyPath, envText);
  return result.path;
}

/**
 * Resolves CLI path with WSL configuration.
 */
export function resolveClaudeCliPathWithWsl(
  hostnamePath: string | undefined,
  legacyPath: string | undefined,
  envText: string
): CliResolveResult {
  // Check hostname-specific path first
  const trimmedHostname = (hostnamePath ?? '').trim();
  if (trimmedHostname) {
    // Check if it's a WSL path
    if (isWslCliPath(trimmedHostname)) {
      const wslConfig = parseWslUri(trimmedHostname);
      if (wslConfig) {
        return {
          path: trimmedHostname, // Return the original URI for display
          wslConfig,
        };
      }
    }

    // Try as native path
    try {
      const expandedPath = expandHomePath(trimmedHostname);
      if (fs.existsSync(expandedPath)) {
        const stat = fs.statSync(expandedPath);
        if (stat.isFile()) {
          return { path: expandedPath };
        }
      }
    } catch {
      // Fall through to next resolution method
    }
  }

  // Check legacy path
  const trimmedLegacy = (legacyPath ?? '').trim();
  if (trimmedLegacy) {
    // Check if it's a WSL path
    if (isWslCliPath(trimmedLegacy)) {
      const wslConfig = parseWslUri(trimmedLegacy);
      if (wslConfig) {
        return {
          path: trimmedLegacy,
          wslConfig,
        };
      }
    }

    // Try as native path
    try {
      const expandedPath = expandHomePath(trimmedLegacy);
      if (fs.existsSync(expandedPath)) {
        const stat = fs.statSync(expandedPath);
        if (stat.isFile()) {
          return { path: expandedPath };
        }
      }
    } catch {
      // Fall through to auto-detect
    }
  }

  // Auto-detect native CLI
  const customEnv = parseEnvironmentVariables(envText || '');
  const autoDetectedPath = findClaudeCLIPath(customEnv.PATH);
  return { path: autoDetectedPath };
}