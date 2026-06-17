import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';

import type { ProviderConversationHistoryService } from '../../../core/providers/types';
import type { Conversation } from '../../../core/types';
import { wslPathToWindowsUNC } from '../../../core/wsl';
import { getPiProviderSettings } from '../settings';
import { buildPersistedPiState, getPiState } from '../types';
import { findPiSessionFile, parsePiSessionContent } from './PiHistoryStore';

interface PiWslContext {
  installationMethod: 'wsl';
  wslDistroOverride?: string;
  wslHomePath?: string;
}

function getWslContext(settings?: Record<string, unknown>): PiWslContext | undefined {
  if (!settings) return undefined;
  const piSettings = getPiProviderSettings(settings);
  if (piSettings.installationMethod !== 'wsl') return undefined;
  return {
    installationMethod: 'wsl',
    wslDistroOverride: piSettings.wslDistroOverride,
    wslHomePath: piSettings.wslHomePath,
  };
}

function convertWslUncToLinux(windowsPath: string): string | null {
  const wslDollarMatch = windowsPath.match(/^\\\\wsl\$\\([^\\]+)\\(.*)$/i);
  if (wslDollarMatch) return '/' + wslDollarMatch[2].replace(/\\/g, '/');
  const wslLocalhostMatch = windowsPath.match(/^\\\\wsl\.localhost\\([^\\]+)\\(.*)$/i);
  if (wslLocalhostMatch) return '/' + wslLocalhostMatch[2].replace(/\\/g, '/');
  if (windowsPath.startsWith('/')) return windowsPath;
  return null;
}

async function readPiSessionFile(
  filePath: string,
  wslContext?: PiWslContext,
): Promise<string | null> {
  if (!wslContext) {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  const linuxPath = convertWslUncToLinux(filePath);
  if (!linuxPath) {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  const distroMatch = filePath.match(/^\\\\wsl\$\\([^\\]+)/i)
    ?? filePath.match(/^\\\\wsl\.localhost\\([^\\]+)/i);
  const distro = distroMatch?.[1] || wslContext.wslDistroOverride || 'Ubuntu';
  const escapedPath = linuxPath.replace(/'/g, "'\\''");
  const result = spawnSync(
    'wsl.exe',
    ['-d', distro, '--', 'bash', '-c', `cat '${escapedPath}'`],
    { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0) {
    return null;
  }
  return typeof result.stdout === 'string' ? result.stdout : null;
}

function findPiSessionFileWithWsl(
  sessionId: string,
  vaultPath: string | null,
  wslContext?: PiWslContext,
): string | null {
  // First try the standard search (works for native mode and any local paths)
  const localResult = findPiSessionFile(
    sessionId,
    vaultPath,
    undefined,
    wslContext ? {
      wslDistroOverride: wslContext.wslDistroOverride,
      wslHomePath: wslContext.wslHomePath,
    } : undefined,
  );
  if (localResult) return localResult;

  // WSL fallback: list session files via wsl.exe and search
  if (!wslContext?.wslHomePath) return null;
  const distro = wslContext.wslDistroOverride || 'Ubuntu';
  const sessionsDir = `${wslContext.wslHomePath}/.pi/agent/sessions`;
  const result = spawnSync(
    'wsl.exe',
    ['-d', distro, '--', 'bash', '-c', `find '${sessionsDir}' -name '*${sessionId}*.jsonl' 2>/dev/null | head -1`],
    { encoding: 'utf-8' },
  );
  if (result.error || result.status !== 0 || !result.stdout) return null;
  const linuxPath = result.stdout.trim();
  if (!linuxPath) return null;
  return wslPathToWindowsUNC(linuxPath, distro) ?? linuxPath;
}

export class PiConversationHistoryService implements ProviderConversationHistoryService {
  private hydratedKeys = new Map<string, string>();

  async hydrateConversationHistory(
    conversation: Conversation,
    vaultPath: string | null,
    settings?: Record<string, unknown>,
  ): Promise<void> {
    const wslContext = getWslContext(settings);
    const state = getPiState(conversation.providerState);
    if (this.isPendingForkConversation(conversation)) {
      if (conversation.messages.length > 0) {
        return;
      }

      const sourceSessionFile = state.forkSourceSessionFile
        ?? findPiSessionFileWithWsl(state.forkSource!.sessionId, vaultPath, wslContext);
      if (!sourceSessionFile) {
        this.hydratedKeys.delete(conversation.id);
        return;
      }

      const content = await readPiSessionFile(sourceSessionFile, wslContext);
      if (content === null) {
        this.hydratedKeys.delete(conversation.id);
        return;
      }
      const messages = parsePiSessionContent(content, {
        leafEntryId: state.forkSource!.resumeAt,
        requireLeafEntryId: true,
      });
      if (messages.length === 0) {
        this.hydratedKeys.delete(conversation.id);
        return;
      }

      conversation.messages = messages;
      this.hydratedKeys.set(conversation.id, `fork::${sourceSessionFile}::${state.forkSource!.resumeAt}`);
      return;
    }

    const sessionTarget = state.sessionFile ?? state.sessionId ?? conversation.sessionId;
    if (!sessionTarget) {
      this.hydratedKeys.delete(conversation.id);
      return;
    }

    const sessionFile = state.sessionFile
      ?? findPiSessionFileWithWsl(sessionTarget, vaultPath, wslContext);
    if (!sessionFile) {
      this.hydratedKeys.delete(conversation.id);
      return;
    }

    const hydrationKey = `${sessionFile}::${state.leafEntryId ?? ''}`;
    if (
      conversation.messages.length > 0
      && this.hydratedKeys.get(conversation.id) === hydrationKey
    ) {
      return;
    }

    const content = await readPiSessionFile(sessionFile, wslContext);
    if (content === null) {
      this.hydratedKeys.delete(conversation.id);
      return;
    }
    const messages = parsePiSessionContent(content, {
      leafEntryId: state.leafEntryId,
    });
    if (messages.length === 0) {
      this.hydratedKeys.delete(conversation.id);
      return;
    }

    conversation.messages = messages;
    this.hydratedKeys.set(conversation.id, hydrationKey);
  }

  async deleteConversationSession(
    _conversation: Conversation,
    _vaultPath: string | null,
  ): Promise<void> {
    // Never mutate Pi native history.
  }

  resolveSessionIdForConversation(conversation: Conversation | null): string | null {
    const state = getPiState(conversation?.providerState);
    return state.sessionFile
      ?? state.sessionId
      ?? conversation?.sessionId
      ?? state.forkSource?.sessionId
      ?? null;
  }

  isPendingForkConversation(_conversation: Conversation): boolean {
    const state = getPiState(_conversation.providerState);
    return !!state.forkSource && !state.sessionId && !state.sessionFile && !_conversation.sessionId;
  }

  buildForkProviderState(
    sourceSessionId: string,
    resumeAt: string,
    sourceProviderState?: Record<string, unknown>,
  ): Record<string, unknown> {
    const sourceState = getPiState(sourceProviderState);
    const sourceSessionFile = sourceState.sessionFile ?? sourceState.forkSourceSessionFile;
    return buildPersistedPiState({
      forkSource: { sessionId: sourceSessionId, resumeAt },
      ...(sourceSessionFile ? { forkSourceSessionFile: sourceSessionFile } : {}),
    }) as Record<string, unknown>;
  }

  buildPersistedProviderState(
    conversation: Conversation,
  ): Record<string, unknown> | undefined {
    return buildPersistedPiState(getPiState(conversation.providerState)) as Record<string, unknown> | undefined;
  }
}
