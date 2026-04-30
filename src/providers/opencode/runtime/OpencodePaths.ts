import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const OPENCODE_APP_NAME = 'opencode';
const DEFAULT_DATABASE_NAME = 'opencode.db';
const DATABASE_NAME_PATTERN = /^opencode(?:-[a-z0-9._-]+)?\.db$/i;

export function resolveOpencodeDataDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const xdgDataHome = env.XDG_DATA_HOME?.trim();
  if (xdgDataHome) {
    return path.join(xdgDataHome, OPENCODE_APP_NAME);
  }

  const home = env.HOME || os.homedir();
  if (process.platform === 'win32') {
    const appData = env.APPDATA || env.LOCALAPPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, OPENCODE_APP_NAME);
  }

  return path.join(home, '.local', 'share', OPENCODE_APP_NAME);
}

export function resolveOpencodeDatabasePath(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const override = env.OPENCODE_DB?.trim();
  if (override) {
    if (override === ':memory:' || path.isAbsolute(override)) {
      return override;
    }
    return path.join(resolveOpencodeDataDir(env), override);
  }

  const candidates = getOpencodeDatabasePathCandidates(env);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? null;
}

/**
 * Resolve database path for WSL environment.
 * Forces Linux-style path calculation regardless of host platform.
 */
export function resolveOpencodeDatabasePathForWsl(
  wslHomePath: string,
  wslXdgDataHome?: string,
): string {
  // Always use Linux-style paths for WSL
  const dataDir = wslXdgDataHome?.trim()
    ? path.posix.join(wslXdgDataHome, OPENCODE_APP_NAME)
    : path.posix.join(wslHomePath, '.local', 'share', OPENCODE_APP_NAME);

  return path.posix.join(dataDir, DEFAULT_DATABASE_NAME);
}

export function resolveExistingOpencodeDatabasePath(
  preferredPath?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  console.log('[OpenCode Paths] Resolving database path');
  console.log('[OpenCode Paths] Preferred path:', preferredPath);
  console.log('[OpenCode Paths] Platform:', process.platform);

  const preferred = preferredPath?.trim();
  if (preferred) {
    if (preferred === ':memory:') {
      console.log('[OpenCode Paths] Preferred path is :memory:');
      return preferred;
    }

    // WSL path conversion: if running on Windows with a Linux path, convert to UNC
    const isLinuxPath = preferred.startsWith('/');
    console.log('[OpenCode Paths] Preferred is Linux path:', isLinuxPath);

    const convertedPath = process.platform === 'win32' && isLinuxPath
      ? maybeConvertWslPath(preferred)
      : preferred;

    console.log('[OpenCode Paths] Converted path:', convertedPath);

    if (fs.existsSync(convertedPath)) {
      console.log('[OpenCode Paths] Converted path exists, returning:', convertedPath);
      return convertedPath;
    }

    // If original path exists (non-WSL case), return it
    if (convertedPath !== preferred && fs.existsSync(preferred)) {
      console.log('[OpenCode Paths] Original path exists, returning:', preferred);
      return preferred;
    }

    console.log('[OpenCode Paths] Neither converted nor original path exists');
  }

  console.log('[OpenCode Paths] Trying to resolve default database path');
  const resolved = resolveOpencodeDatabasePath(env);
  console.log('[OpenCode Paths] Resolved default path:', resolved);

  if (resolved && (resolved === ':memory:' || fs.existsSync(resolved))) {
    console.log('[OpenCode Paths] Default path exists or is :memory:');
    return resolved;
  }

  // Try WSL conversion for resolved path as well
  if (resolved && resolved.startsWith('/') && process.platform === 'win32') {
    console.log('[OpenCode Paths] Trying WSL conversion for resolved path');
    const convertedResolved = maybeConvertWslPath(resolved);
    console.log('[OpenCode Paths] Converted resolved path:', convertedResolved);

    if (fs.existsSync(convertedResolved)) {
      console.log('[OpenCode Paths] Converted resolved path exists');
      return convertedResolved;
    }
  }

  console.log('[OpenCode Paths] Returning fallback:', preferred ?? resolved);
  return preferred ?? resolved;
}

function maybeConvertWslPath(linuxPath: string): string {
  console.log('[OpenCode WSL] Converting Linux path:', linuxPath);

  // Try common WSL distro names in order of popularity
  const distroCandidates = [
    'Ubuntu',
    'ubuntu',
    'Ubuntu-20.04',
    'Ubuntu-22.04',
    'Ubuntu-24.04',
    'Debian',
    'kali-linux',
  ];

  for (const distro of distroCandidates) {
    const uncPath = convertLinuxToWslUnc(linuxPath, distro);
    console.log('[OpenCode WSL] Trying distro:', distro, 'UNC path:', uncPath);

    if (uncPath && fs.existsSync(uncPath)) {
      console.log('[OpenCode WSL] Found existing path for distro:', distro);
      return uncPath;
    }
  }

  // Fallback: use \\wsl.localhost\ which works with default distro
  // This format is supported on newer Windows versions
  const wslLocalhostPath = `\\\\wsl.localhost\\${linuxPath.slice(1).replace(/\//g, '\\')}`;
  console.log('[OpenCode WSL] Trying wsl.localhost path:', wslLocalhostPath);

  if (fs.existsSync(wslLocalhostPath)) {
    console.log('[OpenCode WSL] wsl.localhost path exists');
    return wslLocalhostPath;
  }

  // Last resort: return original Linux path (will fail fs.existsSync check)
  console.log('[OpenCode WSL] No WSL conversion found, returning original Linux path');
  return linuxPath;
}

function convertLinuxToWslUnc(linuxPath: string, distroName: string): string | null {
  if (!linuxPath.startsWith('/')) {
    return null;
  }

  const normalized = path.posix.normalize(linuxPath);
  const tail = normalized === '/' ? '' : normalized.slice(1).replace(/\//g, '\\');

  return tail ? `\\\\wsl$\\${distroName}\\${tail}` : `\\\\wsl$\\${distroName}`;
}

function getOpencodeDatabasePathCandidates(
  env: NodeJS.ProcessEnv,
): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const home = env.HOME || os.homedir();
  const dataDirs = [
    resolveOpencodeDataDir(env),
    path.join(home, 'Library', 'Application Support', OPENCODE_APP_NAME),
  ];

  for (const dataDir of dataDirs) {
    pushCandidate(candidates, seen, path.join(dataDir, DEFAULT_DATABASE_NAME));
    try {
      const matches = fs.readdirSync(dataDir)
        .filter((entry) => DATABASE_NAME_PATTERN.test(entry))
        .sort((left, right) => {
          if (left === DEFAULT_DATABASE_NAME) return -1;
          if (right === DEFAULT_DATABASE_NAME) return 1;
          return left.localeCompare(right);
        });

      for (const entry of matches) {
        pushCandidate(candidates, seen, path.join(dataDir, entry));
      }
    } catch {
      // Ignore missing dirs and unreadable locations.
    }
  }

  return candidates;
}

function pushCandidate(
  candidates: string[],
  seen: Set<string>,
  candidate: string,
): void {
  if (seen.has(candidate)) {
    return;
  }

  seen.add(candidate);
  candidates.push(candidate);
}
