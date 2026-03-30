/**
 * Claudian - WSL Path Utilities
 *
 * Path conversion and WSL detection utilities for WSL2 support.
 * Only supports WSL2 (not WSL1) due to better interoperability.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** WSL configuration parsed from wsl:// URI or settings. */
export interface WslConfig {
  /** WSL distribution name (e.g., 'Ubuntu', 'Debian') */
  distro: string;
  /** Path to Claude CLI inside WSL */
  cliPath: string;
  /** Optional user to run as */
  user?: string;
}

/** Information about a WSL distribution. */
export interface WslDistroInfo {
  /** Distribution name */
  name: string;
  /** Whether this is the default distribution */
  isDefault: boolean;
  /** WSL version (1 or 2) */
  version: 1 | 2;
  /** Current state */
  state: 'Running' | 'Stopped' | 'Installing' | 'Uninstalling';
}

/**
 * Detects available WSL distributions.
 * Uses `wsl -l -v` to get distribution list with versions.
 */
export async function detectWslDistros(): Promise<WslDistroInfo[]> {
  try {
    // Use wsl -l -v to get detailed info including version
    // Note: On Windows, the output is typically UTF-16 LE encoded
    const { stdout } = await execAsync('wsl -l -v', {
      encoding: 'buffer', // Get as buffer to handle encoding
      windowsHide: true,
    });

    // Try to decode - Windows wsl.exe outputs UTF-16 LE on many systems
    let output: string;

    // Check if the buffer looks like UTF-16 (every other byte is 0x00)
    const isUtf16 = stdout.length > 10 && stdout[1] === 0x00 && stdout[3] === 0x00;

    if (isUtf16) {
      // UTF-16 LE without BOM
      output = stdout.toString('utf16le');
    } else if (stdout.length >= 2 && stdout[0] === 0xFF && stdout[1] === 0xFE) {
      // UTF-16 LE with BOM
      output = stdout.slice(2).toString('utf16le');
    } else {
      // Try UTF-8
      output = stdout.toString('utf8');
    }

    // Remove any null characters that might remain
    // eslint-disable-next-line no-control-regex -- Need to match UTF-16 null bytes
    output = output.replace(/\x00/g, '');

    // Log for debugging (will show in Obsidian developer console)
    console.log('[Claudian WSL] wsl -l -v output:', output);

    const distros = parseWslListOutput(output);
    console.log('[Claudian WSL] Parsed distros:', distros);

    return distros;
  } catch (error) {
    // Log error for debugging
    console.error('[Claudian WSL] Failed to detect WSL distributions:', error);
    // WSL not installed or not available
    return [];
  }
}

/**
 * Parses the output of `wsl -l -v` command.
 *
 * Example output:
 *   NAME      STATE           VERSION
 * * Ubuntu    Running         2
 *   Debian    Stopped         1
 *
 * Note: Output may have various whitespace characters and encoding.
 */
function parseWslListOutput(output: string): WslDistroInfo[] {
  const lines = output.split(/\r?\n/).filter(line => line.trim());
  const distros: WslDistroInfo[] = [];

  console.log('[Claudian WSL] Lines to parse:', lines.length, lines);

  // Skip header line and empty lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Skip lines that don't look like distribution entries
    // Valid lines should have a name, state, and version
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('name') && lowerLine.includes('state')) {
      console.log('[Claudian WSL] Skipping header line:', line);
      continue; // This is a header line
    }

    // Parse: * Ubuntu    Running         2
    // or:     Debian     Stopped         1
    // The asterisk indicates default distribution
    const isDefault = line.startsWith('*') || line.startsWith('•') || line.startsWith('→');
    const cleanLine = isDefault ? line.slice(1).trim() : line;

    console.log('[Claudian WSL] Parsing line:', { original: line, isDefault, cleanLine });

    // Split by whitespace, but handle multiple spaces/tabs
    const parts = cleanLine.split(/\s+/).filter(p => p.length > 0);
    console.log('[Claudian WSL] Parts:', parts);

    if (parts.length >= 3) {
      const name = parts[0];
      const state = parts[1] as WslDistroInfo['state'];
      const versionNum = parseInt(parts[2], 10);

      console.log('[Claudian WSL] Extracted:', { name, state, versionNum });

      if (name && !isNaN(versionNum) && (versionNum === 1 || versionNum === 2)) {
        distros.push({
          name,
          isDefault,
          version: versionNum,
          state,
        });
        console.log('[Claudian WSL] Added distro:', name);
      } else {
        console.log('[Claudian WSL] Skipped invalid entry');
      }
    } else {
      console.log('[Claudian WSL] Not enough parts, skipping');
    }
  }

  console.log('[Claudian WSL] Final distros:', distros);
  return distros;
}

/**
 * Gets only WSL2 distributions.
 */
export async function getWsl2Distros(): Promise<WslDistroInfo[]> {
  const allDistros = await detectWslDistros();
  return allDistros.filter(d => d.version === 2);
}

/**
 * Checks if a specific distribution is WSL2.
 */
export async function isWsl2Distro(distroName: string): Promise<boolean> {
  const distros = await detectWslDistros();
  const distro = distros.find(d => d.name.toLowerCase() === distroName.toLowerCase());
  return distro?.version === 2;
}

/**
 * Checks if WSL is available on this system.
 */
export async function isWslAvailable(): Promise<boolean> {
  try {
    await execAsync('wsl --status', { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses a wsl:// URI into a WslConfig object.
 *
 * Format: wsl://DistroName/path/to/cli
 * Example: wsl://Ubuntu/home/user/.local/bin/claude
 */
export function parseWslUri(uri: string): WslConfig | null {
  if (!uri.startsWith('wsl://')) {
    return null;
  }

  // Remove wsl:// prefix
  const rest = uri.slice(6);

  // Find the first slash to separate distro name from path
  const slashIndex = rest.indexOf('/');
  if (slashIndex === -1) {
    return null;
  }

  const distro = rest.slice(0, slashIndex);
  const cliPath = rest.slice(slashIndex);

  if (!distro || !cliPath) {
    return null;
  }

  return { distro, cliPath };
}

/**
 * Checks if a CLI path is a WSL path.
 */
export function isWslCliPath(cliPath: string): boolean {
  return cliPath.startsWith('wsl://');
}

/**
 * Converts a Windows path to a WSL path.
 *
 * Examples:
 *   D:\Obsidian\vault → /mnt/d/Obsidian/vault
 *   C:\Users\name → /mnt/c/Users/name
 */
export function windowsToWslPath(winPath: string): string {
  // Normalize backslashes to forward slashes
  const normalized = winPath.replace(/\\/g, '/');

  // Handle drive letter (D:/... -> /mnt/d/...)
  const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (driveMatch) {
    const driveLetter = driveMatch[1].toLowerCase();
    const rest = driveMatch[2];
    return `/mnt/${driveLetter}/${rest}`;
  }

  // Handle UNC paths (\\server\share -> /mnt/wsl/server/share not supported directly)
  if (normalized.startsWith('//')) {
    // UNC paths are not directly accessible in WSL
    // Return as-is and let the caller handle the error
    return normalized;
  }

  return normalized;
}

/**
 * Converts a WSL path to a Windows path.
 *
 * Examples:
 *   /mnt/d/Obsidian/vault → D:\Obsidian\vault
 *   /home/user/project → \\wsl$\DistroName\home\user\project
 */
export function wslToWindowsPath(wslPath: string, distro?: string): string {
  // Handle /mnt/x/ paths (mounted Windows drives)
  const mntMatch = wslPath.match(/^\/mnt\/([a-z])\/(.*)$/);
  if (mntMatch) {
    const driveLetter = mntMatch[1].toUpperCase();
    const rest = mntMatch[2].replace(/\//g, '\\');
    return `${driveLetter}:\\${rest}`;
  }

  // For WSL internal paths, use UNC path format
  if (distro && wslPath.startsWith('/')) {
    const rest = wslPath.slice(1).replace(/\//g, '\\');
    return `\\\\wsl$\\${distro}\\${rest}`;
  }

  return wslPath;
}

/**
 * Uses wslpath command for accurate path conversion.
 * This is more reliable than manual conversion but requires WSL to be running.
 */
export async function wslPathConvert(
  wslPathOrWinPath: string,
  direction: 'win-to-wsl' | 'wsl-to-win',
  distro: string
): Promise<string> {
  const args = direction === 'win-to-wsl' ? ['-u'] : ['-w'];

  try {
    const { stdout } = await execAsync(
      `wsl -d ${distro} wslpath ${args[0]} "${wslPathOrWinPath}"`,
      { encoding: 'utf8', windowsHide: true }
    );
    return stdout.trim();
  } catch {
    // Fallback to manual conversion
    if (direction === 'win-to-wsl') {
      return windowsToWslPath(wslPathOrWinPath);
    }
    return wslToWindowsPath(wslPathOrWinPath, distro);
  }
}

/**
 * Tests if Claude CLI is accessible in the specified WSL distribution.
 */
export async function testWslClaudeCli(distro: string, cliPath: string): Promise<{
  success: boolean;
  version?: string;
  error?: string;
}> {
  try {
    console.log(`[Claudian WSL] Testing CLI: wsl -d ${distro} ${cliPath} --version`);

    const { stdout, stderr } = await execAsync(
      `wsl -d ${distro} "${cliPath}" --version`,
      { encoding: 'utf8', windowsHide: true, timeout: 15000 }
    );

    console.log('[Claudian WSL] Test stdout:', stdout);
    console.log('[Claudian WSL] Test stderr:', stderr);

    if (stderr && !stdout) {
      return {
        success: false,
        error: stderr.trim() || 'Unknown error',
      };
    }

    return {
      success: true,
      version: stdout.trim(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Claudian WSL] Test failed:', error);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Gets the WSL-specific PATH environment variable.
 * Merges common Linux binary locations with any custom paths.
 */
export function getWslPathEnv(): string {
  // Common WSL binary locations
  return [
    '/usr/local/sbin',
    '/usr/local/bin',
    '/usr/sbin',
    '/usr/bin',
    '/sbin',
    '/bin',
    '/snap/bin',
    '~/.local/bin',
  ].join(':');
}

/**
 * Builds the wsl.exe arguments for executing a command.
 */
export function buildWslArgs(
  distro: string,
  command: string,
  args: string[],
  options?: {
    user?: string;
    cwd?: string;
  }
): string[] {
  const wslArgs: string[] = ['-d', distro];

  if (options?.user) {
    wslArgs.push('-u', options.user);
  }

  // Set working directory if provided (must be WSL path)
  if (options?.cwd) {
    wslArgs.push('--cd', options.cwd);
  }

  // End of wsl options
  wslArgs.push('--');

  // Add the command and its arguments
  wslArgs.push(command, ...args);

  return wslArgs;
}