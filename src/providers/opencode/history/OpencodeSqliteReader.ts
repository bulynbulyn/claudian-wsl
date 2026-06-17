import { spawnSync as defaultSpawnSync } from 'node:child_process';

import { findNodeExecutable } from '../../../utils/env';

export type StoredRow = Record<string, unknown>;

export interface StoredSessionRows {
  messageRows: StoredRow[];
  partRows: StoredRow[];
}

interface SqliteModule {
  DatabaseSync: new (location: string, options?: Record<string, unknown>) => {
    close(): void;
    prepare(sql: string): {
      all(...params: unknown[]): StoredRow[];
    };
  };
}

export interface OpencodeSqliteReaderDependencies {
  findNodeExecutable?: () => string | null;
  requireSqliteModule?: () => SqliteModule | null;
  spawnSync?: typeof defaultSpawnSync;
}

export const OPENCODE_SQLITE_QUERY_MAX_BUFFER = 100 * 1024 * 1024;
export const OPENCODE_MESSAGE_ROW_SQL = buildOpencodeMessageRowsSql('?');

const OPENCODE_PART_ROW_SQL = buildOpencodePartRowsSql('?');
const OPENCODE_SQLITE_CHILD_SCRIPT = `
const { DatabaseSync } = require('node:sqlite');
const [databasePath, sessionId, messageSql, partSql] = process.argv.slice(1);
let db;
try {
  db = new DatabaseSync(databasePath, { readonly: true });
  const messageRows = db.prepare(messageSql).all(sessionId);
  const partRows = db.prepare(partSql).all(sessionId);
  process.stdout.write(JSON.stringify({ messageRows, partRows }));
} finally {
  if (db) db.close();
}
`.trim();

export async function loadOpencodeSessionRows(
  databasePath: string,
  sessionId: string,
  dependencies: OpencodeSqliteReaderDependencies = {},
): Promise<StoredSessionRows | null> {
  const resolvedDependencies = resolveDependencies(dependencies);

  const viaCurrentProcess = loadSessionRowsWithCurrentProcessSqlite(
    databasePath,
    sessionId,
    resolvedDependencies.requireSqliteModule,
  );
  if (viaCurrentProcess) {
    return viaCurrentProcess;
  }

  const viaNodeProcess = loadSessionRowsWithNodeProcess(
    databasePath,
    sessionId,
    resolvedDependencies.findNodeExecutable,
    resolvedDependencies.spawnSync,
  );
  if (viaNodeProcess) {
    return viaNodeProcess;
  }

  return loadSessionRowsWithSqliteCli(
    databasePath,
    sessionId,
    resolvedDependencies.spawnSync,
  );
}

function resolveDependencies(
  dependencies: OpencodeSqliteReaderDependencies,
): Required<OpencodeSqliteReaderDependencies> {
  return {
    findNodeExecutable,
    requireSqliteModule,
    spawnSync: defaultSpawnSync,
    ...dependencies,
  };
}

function requireSqliteModule(): SqliteModule | null {
  try {
    if (typeof module === 'undefined' || typeof module.require !== 'function') {
      return null;
    }

    const sqlite = module.require('node:sqlite') as unknown;
    return isSqliteModule(sqlite) ? sqlite : null;
  } catch {
    return null;
  }
}

function isSqliteModule(value: unknown): value is SqliteModule {
  return (
    isPlainObject(value)
    && typeof value.DatabaseSync === 'function'
  );
}

function loadSessionRowsWithCurrentProcessSqlite(
  databasePath: string,
  sessionId: string,
  requireSqlite: () => SqliteModule | null,
): StoredSessionRows | null {
  const sqlite = requireSqlite();
  if (!sqlite) {
    return null;
  }

  let db: InstanceType<SqliteModule['DatabaseSync']> | null = null;
  try {
    db = new sqlite.DatabaseSync(databasePath, { readonly: true });
    const messageRows = db.prepare(OPENCODE_MESSAGE_ROW_SQL).all(sessionId);
    const partRows = db.prepare(OPENCODE_PART_ROW_SQL).all(sessionId);
    return { messageRows, partRows };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

function loadSessionRowsWithNodeProcess(
  databasePath: string,
  sessionId: string,
  findNode: () => string | null,
  spawnSync: typeof defaultSpawnSync,
): StoredSessionRows | null {
  const nodePath = findNode();
  if (!nodePath) {
    return null;
  }

  const result = spawnSync(
    nodePath,
    [
      '-e',
      OPENCODE_SQLITE_CHILD_SCRIPT,
      databasePath,
      sessionId,
      OPENCODE_MESSAGE_ROW_SQL,
      OPENCODE_PART_ROW_SQL,
    ],
    {
      encoding: 'utf8',
      maxBuffer: OPENCODE_SQLITE_QUERY_MAX_BUFFER,
      windowsHide: true,
    },
  );

  if (result.error || result.status !== 0) {
    return null;
  }

  return parseStoredSessionRows(getSpawnStdout(result.stdout));
}

function loadSessionRowsWithSqliteCli(
  databasePath: string,
  sessionId: string,
  spawnSync: typeof defaultSpawnSync,
): StoredSessionRows | null {
  const escapedSessionId = escapeSqlLiteral(sessionId);
  const messageRows = runSqlite3JsonQuery(
    databasePath,
    buildOpencodeMessageRowsSql(`'${escapedSessionId}'`),
    spawnSync,
  );
  const partRows = runSqlite3JsonQuery(
    databasePath,
    buildOpencodePartRowsSql(`'${escapedSessionId}'`),
    spawnSync,
  );

  if (!messageRows || !partRows) {
    return null;
  }

  return { messageRows, partRows };
}

function runSqlite3JsonQuery(
  databasePath: string,
  sql: string,
  spawnSync: typeof defaultSpawnSync,
): StoredRow[] | null {
  // Check if database path is a WSL UNC path (starts with \\wsl$ or \\wsl.localhost)
  const isWslPath = databasePath.startsWith('\\\\wsl$') || databasePath.startsWith('\\\\wsl.localhost');

  if (isWslPath) {
    // Convert UNC path back to Linux path and run via wsl.exe
    return runSqlite3ViaWsl(databasePath, sql, spawnSync);
  }

  // Try native sqlite3 for Windows paths
  const result = spawnSync(
    'sqlite3',
    ['-json', databasePath, sql],
    {
      encoding: 'utf8',
      maxBuffer: OPENCODE_SQLITE_QUERY_MAX_BUFFER,
      windowsHide: true,
    },
  );

  if (result.error || result.status !== 0) {
    return null;
  }

  return parseStoredRows(getSpawnStdout(result.stdout));
}

function runSqlite3ViaWsl(
  windowsPath: string,
  sql: string,
  spawnSync: typeof defaultSpawnSync,
): StoredRow[] | null {
  // Convert \\wsl$\Ubuntu\path to /path
  const linuxPath = convertWslUncToLinux(windowsPath);
  if (!linuxPath) {
    return null;
  }

  // Extract distro name from UNC path (use double backslash for UNC paths)
  const distroMatch = windowsPath.match(/\\\\wsl\$\\\\([^\\\\]+)/i) || windowsPath.match(/\\\\wsl\.localhost\\\\([^\\\\]+)/i);
  const distro = distroMatch?.[1] || 'Ubuntu';

  // Use double quotes for SQL - single quotes inside double quotes are literal and don't need escaping
  // Escape double quotes and backslashes in the SQL string
  const escapedSql = sql.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const wslCommand = `sqlite3 -json '${linuxPath}' "${escapedSql}"`;

  const result = spawnSync(
    'wsl.exe',
    ['-d', distro, '--', 'bash', '-c', wslCommand],
    {
      encoding: 'utf8',
      maxBuffer: OPENCODE_SQLITE_QUERY_MAX_BUFFER,
    },
  );

  if (result.error || result.status !== 0) {
    return null;
  }

  return parseStoredRows(getSpawnStdout(result.stdout));
}

function convertWslUncToLinux(windowsPath: string): string | null {
  // Handle \\wsl$\Ubuntu\path format (UNC path with double backslash)
  const wslDollarMatch = windowsPath.match(/^\\\\wsl\$\\([^\\]+)\\(.*)$/i);
  if (wslDollarMatch) {
    return '/' + wslDollarMatch[2].replace(/\\/g, '/');
  }

  // Handle \\wsl.localhost\Ubuntu\path format
  const wslLocalhostMatch = windowsPath.match(/^\\\\wsl\.localhost\\([^\\]+)\\(.*)$/i);
  if (wslLocalhostMatch) {
    return '/' + wslLocalhostMatch[2].replace(/\\/g, '/');
  }

  return null;
}

function parseStoredSessionRows(value: string): StoredSessionRows | null {
  try {
    const parsed = JSON.parse(value || '{}') as unknown;
    if (!isPlainObject(parsed)) {
      return null;
    }

    const messageRows = parseStoredRowsValue(parsed.messageRows);
    const partRows = parseStoredRowsValue(parsed.partRows);
    return messageRows && partRows ? { messageRows, partRows } : null;
  } catch {
    return null;
  }
}

function parseStoredRows(value: string): StoredRow[] | null {
  try {
    return parseStoredRowsValue(JSON.parse(value || '[]') as unknown);
  } catch {
    return null;
  }
}

function parseStoredRowsValue(value: unknown): StoredRow[] | null {
  return Array.isArray(value)
    ? value.filter((row): row is StoredRow => isPlainObject(row))
    : null;
}

function getSpawnStdout(stdout: string | Buffer | null | undefined): string {
  return typeof stdout === 'string'
    ? stdout
    : stdout?.toString('utf8') ?? '';
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll('\'', '\'\'');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function buildOpencodeMessageRowsSql(sessionIdExpression: string): string {
  return `
with message_json as (
  select
    id,
    time_created,
    data,
    json_valid(data) as data_valid
  from message
  where session_id = ${sessionIdExpression}
)
select
  id,
  time_created,
  data_valid,
  case when data_valid then json_extract(data, '$.role') end as role,
  case when data_valid then json_extract(data, '$.time.created') end as data_time_created,
  case when data_valid then json_extract(data, '$.time.completed') end as data_time_completed
from message_json
order by time_created asc, id asc;`.trim();
}

function buildOpencodePartRowsSql(sessionIdExpression: string): string {
  return `
select id, message_id, data
from part
where session_id = ${sessionIdExpression}
order by message_id asc, id asc;`.trim();
}
