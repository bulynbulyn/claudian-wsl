import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';

import { extractResolvedAnswersFromResultText } from '../../../core/tools/toolInput';
import { isWriteEditTool, TOOL_ASK_USER_QUESTION } from '../../../core/tools/toolNames';
import type { ChatMessage, ContentBlock, ToolCallInfo } from '../../../core/types';
import { extractUserQuery } from '../../../utils/context';
import { extractDiffData } from '../../../utils/diff';
import {
  normalizeOpencodeToolInput,
  normalizeOpencodeToolName,
  normalizeOpencodeToolUseResult,
} from '../normalization/opencodeToolNormalization';
import { resolveExistingOpencodeDatabasePath } from '../runtime/OpencodePaths';
import type { OpencodeProviderState } from '../types';

type StoredRow = Record<string, unknown>;

interface StoredMessage {
  info: StoredRow;
  parts: StoredRow[];
}

interface SqliteModule {
  DatabaseSync: new (location: string, options?: Record<string, unknown>) => {
    close(): void;
    prepare(sql: string): {
      all(...params: unknown[]): StoredRow[];
    };
  };
}

export async function loadOpencodeSessionMessages(
  sessionId: string,
  providerState?: OpencodeProviderState,
): Promise<ChatMessage[]> {
  console.log('[OpenCode History] Loading session:', sessionId);
  console.log('[OpenCode History] Provider state:', providerState);

  const databasePath = resolveExistingOpencodeDatabasePath(providerState?.databasePath);
  console.log('[OpenCode History] Resolved database path:', databasePath);
  console.log('[OpenCode History] Platform:', process.platform);

  if (!databasePath) {
    console.log('[OpenCode History] No database path resolved, returning empty');
    return [];
  }

  if (databasePath === ':memory:') {
    console.log('[OpenCode History] In-memory database, returning empty');
    return [];
  }

  const exists = fs.existsSync(databasePath);
  console.log('[OpenCode History] Database exists:', exists, 'Path:', databasePath);

  if (!exists) {
    console.log('[OpenCode History] Database file not found, returning empty');
    return [];
  }

  console.log('[OpenCode History] Loading rows from database...');
  const rows = await loadOpencodeSessionRows(databasePath, sessionId);
  if (!rows) {
    console.log('[OpenCode History] No rows loaded, returning empty');
    return [];
  }

  console.log('[OpenCode History] Loaded message rows:', rows.messageRows.length);
  console.log('[OpenCode History] Loaded part rows:', rows.partRows.length);

  const messages = mapOpencodeMessages(
    hydrateStoredMessages(rows.messageRows, rows.partRows),
  );
  console.log('[OpenCode History] Mapped messages:', messages.length);

  return messages;
}

export function mapOpencodeMessages(messages: StoredMessage[]): ChatMessage[] {
  return mergeAdjacentAssistantMessages(messages
    .map((message) => mapStoredMessage(message))
    .filter((message): message is ChatMessage => message !== null));
}

function hydrateStoredMessages(
  messageRows: StoredRow[],
  partRows: StoredRow[],
): StoredMessage[] {
  const partsByMessage = new Map<string, StoredRow[]>();

  for (const row of partRows) {
    const messageId = getString(row.message_id);
    const id = getString(row.id);
    const data = parseJsonObject(row.data);
    if (!messageId || !id || !data) {
      continue;
    }

    const parts = partsByMessage.get(messageId) ?? [];
    parts.push({ ...data, id });
    partsByMessage.set(messageId, parts);
  }

  return messageRows.flatMap((row) => {
    const id = getString(row.id);
    const data = parseJsonObject(row.data);
    if (!id || !data) {
      return [];
    }

    return [{
      info: { ...data, id, time_created: row.time_created },
      parts: partsByMessage.get(id) ?? [],
    }];
  });
}

function mapStoredMessage(message: StoredMessage): ChatMessage | null {
  const role = getString(message.info.role);
  const id = getString(message.info.id);
  if (!id || (role !== 'user' && role !== 'assistant')) {
    return null;
  }

  const createdAt = getNestedNumber(message.info, ['time', 'created'])
    ?? getNumber(message.info.time_created)
    ?? Date.now();

  if (role === 'user') {
    const promptText = extractUserQuery(getJoinedTextParts(message.parts));
    return {
      assistantMessageId: undefined,
      content: promptText,
      id,
      role: 'user',
      timestamp: createdAt,
      userMessageId: id,
    };
  }

  const contentBlocks = buildAssistantContentBlocks(message.parts);
  const toolCalls = buildAssistantToolCalls(message.parts);
  const completedAt = getNestedNumber(message.info, ['time', 'completed']);
  const durationSeconds = completedAt && completedAt >= createdAt
    ? Math.max(0, (completedAt - createdAt) / 1_000)
    : undefined;

  return {
    assistantMessageId: id,
    content: contentBlocks
      .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
      .map((block) => block.content)
      .join(''),
    contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
    durationSeconds,
    id,
    role: 'assistant',
    timestamp: createdAt,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

function mergeAdjacentAssistantMessages(messages: ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = [];

  for (const message of messages) {
    const previous = merged[merged.length - 1];
    if (
      message.role === 'assistant'
      && previous?.role === 'assistant'
      && !message.isInterrupt
      && !previous.isInterrupt
    ) {
      previous.content += message.content;
      previous.assistantMessageId = message.assistantMessageId ?? previous.assistantMessageId;
      previous.durationFlavorWord = message.durationFlavorWord ?? previous.durationFlavorWord;
      previous.durationSeconds = mergeAssistantDurationSeconds(previous, message);
      previous.toolCalls = mergeOptionalArrays(previous.toolCalls, message.toolCalls);
      previous.contentBlocks = mergeOptionalArrays(previous.contentBlocks, message.contentBlocks);
      continue;
    }

    merged.push(message);
  }

  return merged;
}

function mergeOptionalArrays<T>(left?: T[], right?: T[]): T[] | undefined {
  if (!left?.length && !right?.length) {
    return undefined;
  }

  return [
    ...(left ?? []),
    ...(right ?? []),
  ];
}

function mergeAssistantDurationSeconds(
  first: ChatMessage,
  next: ChatMessage,
): number | undefined {
  const firstEnd = getMessageCompletionTime(first);
  const nextEnd = getMessageCompletionTime(next);
  if (firstEnd === null && nextEnd === null) {
    return undefined;
  }

  const end = Math.max(firstEnd ?? first.timestamp, nextEnd ?? next.timestamp);
  return Math.max(0, (end - first.timestamp) / 1_000);
}

function getMessageCompletionTime(message: ChatMessage): number | null {
  if (typeof message.durationSeconds !== 'number') {
    return null;
  }

  return message.timestamp + (message.durationSeconds * 1_000);
}

function buildAssistantContentBlocks(parts: StoredRow[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  for (const part of parts) {
    switch (getString(part.type)) {
      case 'reasoning': {
        const text = getString(part.text)?.trim();
        if (!text) {
          break;
        }
        blocks.push({
          content: text,
          durationSeconds: getDurationSeconds(part),
          type: 'thinking',
        });
        break;
      }
      case 'text': {
        const text = getString(part.text);
        if (!text || getBoolean(part.ignored)) {
          break;
        }
        blocks.push({
          content: text,
          type: 'text',
        });
        break;
      }
      case 'tool': {
        const toolId = getString(part.callID);
        if (!toolId) {
          break;
        }
        blocks.push({
          toolId,
          type: 'tool_use',
        });
        break;
      }
    }
  }

  return blocks;
}

function buildAssistantToolCalls(parts: StoredRow[]): ToolCallInfo[] {
  return parts.flatMap((part) => {
    if (getString(part.type) !== 'tool') {
      return [];
    }

    const id = getString(part.callID);
    const rawName = getString(part.tool);
    const state = getObject(part.state);
    const status = mapToolStatus(getString(state?.status));
    if (!id || !rawName || !status) {
      return [];
    }

    const input = normalizeOpencodeToolInput(rawName, getObject(state?.input) ?? {});
    const name = normalizeOpencodeToolName(rawName);
    const result = getString(state?.output) ?? getString(state?.error) ?? undefined;
    const toolUseResult = normalizeOpencodeToolUseResult(rawName, input, {
      ...(result ? { output: result } : {}),
      ...(getObject(state?.metadata) ? { metadata: getObject(state?.metadata) } : {}),
    });

    const toolCall: ToolCallInfo = {
      id,
      input,
      name,
      result,
      status,
    };

    if (name === TOOL_ASK_USER_QUESTION) {
      toolCall.resolvedAnswers = toolUseResult?.answers as ToolCallInfo['resolvedAnswers']
        ?? extractResolvedAnswersFromResultText(result);
    }

    if (status === 'completed' && isWriteEditTool(name)) {
      const diffData = extractDiffData(toolUseResult, toolCall);
      if (diffData) {
        toolCall.diffData = diffData;
      }
    }

    return [toolCall];
  });
}

function getJoinedTextParts(parts: StoredRow[]): string {
  return parts
    .filter((part) => getString(part.type) === 'text' && !getBoolean(part.ignored))
    .map((part) => getString(part.text) ?? '')
    .join('');
}

function getDurationSeconds(part: StoredRow): number | undefined {
  const start = getNestedNumber(part, ['time', 'start']);
  const end = getNestedNumber(part, ['time', 'end']);
  if (start === null || end === null || end < start) {
    return undefined;
  }

  return Math.max(0, (end - start) / 1_000);
}

function mapToolStatus(status: string | null): ToolCallInfo['status'] | null {
  switch (status) {
    case 'pending':
    case 'running':
      return 'running';
    case 'completed':
      return 'completed';
    case 'error':
      return 'error';
    default:
      return null;
  }
}

function parseJsonObject(value: unknown): StoredRow | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getBoolean(value: unknown): boolean {
  return value === true;
}

function getObject(value: unknown): StoredRow | null {
  return isPlainObject(value) ? value : null;
}

function getString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function getNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function getNestedNumber(
  value: StoredRow,
  keys: string[],
): number | null {
  let current: unknown = value;
  for (const key of keys) {
    if (!isPlainObject(current)) {
      return null;
    }
    current = current[key];
  }
  return getNumber(current);
}

async function loadSqliteModule(): Promise<SqliteModule | null> {
  try {
    return await import('node:sqlite') as SqliteModule;
  } catch {
    return null;
  }
}

interface StoredSessionRows {
  messageRows: StoredRow[];
  partRows: StoredRow[];
}

async function loadOpencodeSessionRows(
  databasePath: string,
  sessionId: string,
): Promise<StoredSessionRows | null> {
  console.log('[OpenCode History] Attempting node:sqlite...');
  const viaNodeSqlite = await loadSessionRowsWithNodeSqlite(databasePath, sessionId);
  if (viaNodeSqlite) {
    console.log('[OpenCode History] node:sqlite succeeded');
    return viaNodeSqlite;
  }
  console.log('[OpenCode History] node:sqlite failed, falling back to sqlite3 CLI');

  const viaCli = loadSessionRowsWithSqliteCli(databasePath, sessionId);
  console.log('[OpenCode History] sqlite3 CLI result:', viaCli ? 'success' : 'failed');
  return viaCli;
}

async function loadSessionRowsWithNodeSqlite(
  databasePath: string,
  sessionId: string,
): Promise<StoredSessionRows | null> {
  const sqlite = await loadSqliteModule();
  if (!sqlite) {
    return null;
  }

  let db: InstanceType<SqliteModule['DatabaseSync']> | null = null;
  try {
    db = new sqlite.DatabaseSync(databasePath, { readonly: true });
    const messageRows = db.prepare(
      'select id, time_created, data from message where session_id = ? order by time_created asc, id asc',
    ).all(sessionId);
    const partRows = db.prepare(
      'select id, message_id, data from part where session_id = ? order by message_id asc, id asc',
    ).all(sessionId);
    return { messageRows, partRows };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

function loadSessionRowsWithSqliteCli(
  databasePath: string,
  sessionId: string,
): StoredSessionRows | null {
  console.log('[OpenCode History CLI] databasePath:', databasePath);
  console.log('[OpenCode History CLI] sessionId:', sessionId);

  const escapedSessionId = escapeSqlLiteral(sessionId);
  const messageSql = `select id, time_created, data from message where session_id = '${escapedSessionId}' order by time_created asc, id asc;`;
  const partSql = `select id, message_id, data from part where session_id = '${escapedSessionId}' order by message_id asc, id asc;`;

  console.log('[OpenCode History CLI] Running message query...');
  const messageRows = runSqlite3JsonQuery(databasePath, messageSql);
  console.log('[OpenCode History CLI] Message rows result:', messageRows?.length ?? 'null');

  console.log('[OpenCode History CLI] Running part query...');
  const partRows = runSqlite3JsonQuery(databasePath, partSql);
  console.log('[OpenCode History CLI] Part rows result:', partRows?.length ?? 'null');

  if (!messageRows || !partRows) {
    return null;
  }

  return { messageRows, partRows };
}

function runSqlite3JsonQuery(
  databasePath: string,
  sql: string,
): StoredRow[] | null {
  console.log('[OpenCode History CLI] runSqlite3JsonQuery - databasePath:', databasePath);
  console.log('[OpenCode History CLI] runSqlite3JsonQuery - sql:', sql.substring(0, 100));
  console.log('[OpenCode History CLI] runSqlite3JsonQuery - startsWith \\wsl$:', databasePath.startsWith('\\wsl$'));
  console.log('[OpenCode History CLI] runSqlite3JsonQuery - startsWith \\wsl.localhost:', databasePath.startsWith('\\wsl.localhost'));

  // Check if database path is a WSL UNC path (starts with \\wsl$ or \\wsl.localhost)
  const isWslPath = databasePath.startsWith('\\\\wsl$') || databasePath.startsWith('\\\\wsl.localhost');
  console.log('[OpenCode History CLI] runSqlite3JsonQuery - isWslPath:', isWslPath);

  if (isWslPath) {
    // Convert UNC path back to Linux path and run via wsl.exe
    console.log('[OpenCode History CLI] WSL path detected, using wsl.exe');
    return runSqlite3ViaWsl(databasePath, sql);
  }

  // Try native sqlite3 for Windows paths
  const result = spawnSync(
    'sqlite3',
    ['-json', databasePath, sql],
    {
      encoding: 'utf8',
    },
  );

  console.log('[OpenCode History CLI] spawnSync result - error:', result.error);
  console.log('[OpenCode History CLI] spawnSync result - status:', result.status);
  console.log('[OpenCode History CLI] spawnSync result - stderr:', result.stderr?.substring(0, 200));
  console.log('[OpenCode History CLI] spawnSync result - stdout length:', result.stdout?.length);

  if (result.error || result.status !== 0) {
    console.log('[OpenCode History CLI] spawnSync failed');
    return null;
  }

  try {
    const parsed = JSON.parse(result.stdout || '[]') as unknown;
    console.log('[OpenCode History CLI] JSON parsed, rows:', Array.isArray(parsed) ? parsed.length : 'not array');
    return Array.isArray(parsed)
      ? parsed.filter((row): row is StoredRow => isPlainObject(row))
      : null;
  } catch (parseError) {
    console.log('[OpenCode History CLI] JSON parse error:', parseError);
    return null;
  }
}

function runSqlite3ViaWsl(windowsPath: string, sql: string): StoredRow[] | null {
  // Convert \\wsl$\Ubuntu\path to /path
  const linuxPath = convertWslUncToLinux(windowsPath);
  if (!linuxPath) {
    console.log('[OpenCode History CLI WSL] Failed to convert UNC to Linux path');
    return null;
  }

  console.log('[OpenCode History CLI WSL] Linux path:', linuxPath);
  console.log('[OpenCode History CLI WSL] SQL:', sql.substring(0, 100));

  // Extract distro name from UNC path (use double backslash for UNC paths)
  const distroMatch = windowsPath.match(/\\\\wsl\$\\\\([^\\\\]+)/i) || windowsPath.match(/\\\\wsl\.localhost\\\\([^\\\\]+)/i);
  const distro = distroMatch?.[1] || 'Ubuntu';

  // Use double quotes for SQL - single quotes inside double quotes are literal and don't need escaping
  // Escape double quotes and backslashes in the SQL string
  const escapedSql = sql.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const wslCommand = `sqlite3 -json '${linuxPath}' "${escapedSql}"`;

  console.log('[OpenCode History CLI WSL] Running via wsl.exe:', wslCommand.substring(0, 150));

  const result = spawnSync(
    'wsl.exe',
    ['-d', distro, '--', 'bash', '-c', wslCommand],
    {
      encoding: 'utf8',
    },
  );

  console.log('[OpenCode History CLI WSL] Result - error:', result.error);
  console.log('[OpenCode History CLI WSL] Result - status:', result.status);
  console.log('[OpenCode History CLI WSL] Result - stderr:', result.stderr?.substring(0, 200));
  console.log('[OpenCode History CLI WSL] Result - stdout length:', result.stdout?.length);

  if (result.error || result.status !== 0) {
    console.log('[OpenCode History CLI WSL] Failed');
    return null;
  }

  try {
    const parsed = JSON.parse(result.stdout || '[]') as unknown;
    console.log('[OpenCode History CLI WSL] JSON parsed, rows:', Array.isArray(parsed) ? parsed.length : 'not array');
    return Array.isArray(parsed)
      ? parsed.filter((row): row is StoredRow => isPlainObject(row))
      : null;
  } catch (parseError) {
    console.log('[OpenCode History CLI WSL] JSON parse error:', parseError);
    return null;
  }
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

function escapeSqlLiteral(value: string): string {
  return value.replaceAll('\'', '\'\'');
}
