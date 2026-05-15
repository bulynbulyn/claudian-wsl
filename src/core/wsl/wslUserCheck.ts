import { execSync } from 'child_process';

/**
 * Check if the current user in a WSL distro is root.
 * Claude Code CLI rejects --dangerously-skip-permissions when run as root.
 *
 * @param distroName - WSL distro name (optional, uses default if not specified)
 * @returns true if user is root, false otherwise
 */
export function isWslUserRoot(distroName?: string): boolean {
  try {
    const wslArgs = distroName
      ? `--distribution ${distroName}`
      : '';

    const result = execSync(
      `wsl.exe ${wslArgs} -- whoami`,
      {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
      }
    ).trim();

    return result === 'root';
  } catch {
    // If we can't determine, assume non-root (safe fallback)
    return false;
  }
}