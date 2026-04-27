import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import type { SDKNativeMessage, SDKSessionReadResult } from './sdkHistoryTypes';

/**
 * Converts a Windows path to WSL path format.
 * E.g., D:\Downloads\ObsidianAi\Test → /mnt/d/Downloads/ObsidianAi/Test
 */
export function windowsToWslPath(winPath: string): string {
  // Normalize path separators
  const normalized = winPath.replace(/\\/g, '/');

  // Match drive letter pattern (e.g., "D:/...")
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (match) {
    const driveLetter = match[1].toLowerCase();
    const rest = match[2];
    return `/mnt/${driveLetter}/${rest}`;
  }

  // Already a Unix-like path, return as-is
  return normalized;
}

/**
 * Converts a WSL Unix path to Windows UNC path for file system access.
 * E.g., /home/bulinbulin/.claude → \\wsl$\Ubuntu\home\bulinbulin\.claude
 *
 * This is needed because Windows fs module cannot directly read WSL paths.
 */
export function wslPathToWindowsUNC(wslPath: string, wslDistro?: string): string {
  // Normalize to forward slashes first
  const normalized = wslPath.replace(/\\/g, '/');

  // Remove leading slash if present
  const withoutLeadingSlash = normalized.startsWith('/') ? normalized.slice(1) : normalized;

  // Use wsl$ UNC prefix (works with default distro or specified one)
  // \\wsl$\Ubuntu\home\... or \\wsl$\home\... (default distro)
  const distroPrefix = wslDistro ? `wsl$\\${wslDistro}` : 'wsl$';

  // Convert to Windows path with UNC prefix
  return `\\\\${distroPrefix}\\${withoutLeadingSlash.replace(/\//g, '\\')}`;
}

/**
 * Gets the WSL distro name to use for UNC path.
 * Uses provided override or tries to detect from environment.
 */
export function getWslDistroName(wslDistroOverride?: string): string | undefined {
  if (wslDistroOverride && wslDistroOverride.trim()) {
    console.log('[Claudian] WSL distro from settings:', wslDistroOverride);
    return wslDistroOverride.trim();
  }

  // Try WSL_DISTRO env var
  const wslDistroEnv = process.env.WSL_DISTRO;
  if (wslDistroEnv) {
    console.log('[Claudian] WSL_DISTRO from env:', wslDistroEnv);
    return wslDistroEnv;
  }

  // Default to empty (uses system default distro)
  return undefined;
}

/**
 * Gets the WSL home directory path.
 * Uses provided wslHomePath from settings, then env vars, then tries common patterns.
 */
export function getWslHomePath(wslHomePathOverride?: string): string {
  // Try settings override first
  if (wslHomePathOverride && wslHomePathOverride.trim()) {
    console.log('[Claudian] WSL home from settings:', wslHomePathOverride);
    return wslHomePathOverride.trim();
  }

  // Try WSL_HOME env var
  const wslHomeEnv = process.env.WSL_HOME;
  if (wslHomeEnv) {
    console.log('[Claudian] WSL_HOME from env:', wslHomeEnv);
    return wslHomeEnv;
  }

  // Try WSL_USER env var
  const wslUserEnv = process.env.WSL_USER;
  if (wslUserEnv) {
    console.log('[Claudian] WSL_USER from env:', wslUserEnv);
    return `/home/${wslUserEnv}`;
  }

  // Try common WSL username patterns
  const winUser = os.userInfo().username;

  // Default to first option (most common case)
  const defaultWslUser = winUser.toLowerCase() === 'administrator' ? 'root' : winUser.toLowerCase();
  const defaultHome = `/home/${defaultWslUser}`;
  console.log('[Claudian] Using default WSL home:', defaultHome, '(winUser:', winUser, ')');
  return defaultHome;
}

/**
 * Encodes a vault path for the SDK project directory name.
 * The SDK replaces ALL non-alphanumeric characters with `-`.
 * This handles Unicode characters and special chars.
 *
 * @param vaultPath The vault path to encode
 * @param skipResolve When true, skip path.resolve() - used for WSL Unix paths that
 *                    should be encoded directly without Windows path resolution.
 *                    Without this, path.resolve('/mnt/d/...') on Windows becomes
 *                    'F:/mnt/d/...' (relative to current drive), causing wrong encoding.
 */
export function encodeVaultPathForSDK(vaultPath: string, skipResolve?: boolean): string {
  // For WSL Unix paths, encode directly without path.resolve() which
  // would incorrectly prepend the current Windows drive letter
  const absolutePath = skipResolve ? vaultPath : path.resolve(vaultPath);
  return absolutePath.replace(/[^a-zA-Z0-9]/g, '-');
}

export function getSDKProjectsPath(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

/**
 * Gets the SDK session path, with WSL support.
 * When running in WSL mode on Windows, returns UNC path (\\wsl$\...) for fs access.
 */
export function getSDKSessionPath(
  vaultPath: string,
  sessionId: string,
  isWslMode?: boolean,
  wslHomePath?: string,
  wslDistro?: string,
): string {
  if (!isValidSessionId(sessionId)) {
    throw new Error(`Invalid session ID: ${sessionId}`);
  }

  // Native Windows mode - use standard path
  if (!isWslMode || process.platform !== 'win32') {
    const projectsPath = getSDKProjectsPath();
    const encodedVault = encodeVaultPathForSDK(vaultPath);
    return path.join(projectsPath, encodedVault, `${sessionId}.jsonl`);
  }

  // WSL mode - need to:
  // 1. Convert vault path to WSL format for encoding
  // 2. Build Unix-style session path
  // 3. Convert to Windows UNC path for fs access

  const wslVaultPath = windowsToWslPath(vaultPath);
  // Skip path.resolve() for Unix paths - it would incorrectly prepend Windows drive letter
  const encodedVault = encodeVaultPathForSDK(wslVaultPath, true);
  const wslHome = getWslHomePath(wslHomePath);
  const distro = getWslDistroName(wslDistro);

  // Build Unix-style session path first
  const unixSessionPath = `${wslHome}/.claude/projects/${encodedVault}/${sessionId}.jsonl`;
  console.log('[Claudian] WSL Unix session path:', unixSessionPath);

  // Convert to Windows UNC path for fs access
  const windowsUNCPath = wslPathToWindowsUNC(unixSessionPath, distro);
  console.log('[Claudian] Windows UNC session path:', windowsUNCPath);

  return windowsUNCPath;
}

/** Validates an identifier for safe use in filesystem paths (no traversal, bounded length). */
export function isPathSafeId(value: string): boolean {
  if (!value || value.length === 0 || value.length > 128) {
    return false;
  }
  if (value.includes('..') || value.includes('/') || value.includes('\\')) {
    return false;
  }
  return /^[a-zA-Z0-9_-]+$/.test(value);
}

export function isValidSessionId(sessionId: string): boolean {
  return isPathSafeId(sessionId);
}

export function sdkSessionExists(
  vaultPath: string,
  sessionId: string,
  isWslMode?: boolean,
  wslHomePath?: string,
  wslDistro?: string,
): boolean {
  try {
    const sessionPath = getSDKSessionPath(vaultPath, sessionId, isWslMode, wslHomePath, wslDistro);
    console.log('[Claudian] sdkSessionExists checking:', { vaultPath, sessionId, sessionPath, isWslMode, wslHomePath, wslDistro });
    const exists = existsSync(sessionPath);
    console.log('[Claudian] sdkSessionExists result:', exists);
    return exists;
  } catch (e) {
    console.warn('[Claudian] sdkSessionExists error:', e);
    return false;
  }
}

export async function deleteSDKSession(
  vaultPath: string,
  sessionId: string,
  isWslMode?: boolean,
  wslHomePath?: string,
  wslDistro?: string,
): Promise<void> {
  try {
    const sessionPath = getSDKSessionPath(vaultPath, sessionId, isWslMode, wslHomePath, wslDistro);
    if (!existsSync(sessionPath)) {
      return;
    }

    await fs.unlink(sessionPath);
  } catch {
    // Best-effort deletion
  }
}

export async function readSDKSession(
  vaultPath: string,
  sessionId: string,
  isWslMode?: boolean,
  wslHomePath?: string,
  wslDistro?: string,
): Promise<SDKSessionReadResult> {
  try {
    const sessionPath = getSDKSessionPath(vaultPath, sessionId, isWslMode, wslHomePath, wslDistro);
    console.log('[Claudian] readSDKSession path:', sessionPath);
    if (!existsSync(sessionPath)) {
      console.log('[Claudian] readSDKSession: file does not exist');
      return { messages: [], skippedLines: 0 };
    }

    const content = await fs.readFile(sessionPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    const messages: SDKNativeMessage[] = [];
    let skippedLines = 0;

    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as SDKNativeMessage;
        messages.push(msg);
      } catch {
        skippedLines++;
      }
    }

    console.log('[Claudian] readSDKSession success:', { messagesCount: messages.length, skippedLines });
    return { messages, skippedLines };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn('[Claudian] readSDKSession error:', errorMsg);
    return { messages: [], skippedLines: 0, error: errorMsg };
  }
}
