import type {
  McpServerConfig,
  PermissionMode as SDKPermissionMode,
  Query,
} from '@anthropic-ai/claude-agent-sdk';

import type { McpServerManager } from '../../../core/mcp/McpServerManager';
import type {
  ChatRuntimeQueryOptions,
} from '../../../core/runtime/types';
import type { ClaudianSettings, PermissionMode } from '../../../core/types/settings';
import {
  resolveAdaptiveEffortLevel,
  resolveThinkingTokens,
} from '../types/models';
import { createClaudePathMapper, mapMcpServersForWsl } from './ClaudePathMapper';
import type {
  ClaudeEnsureReadyOptions,
  ClosePersistentQueryOptions,
  PersistentQueryConfig,
} from './types';

export interface ClaudeDynamicUpdateDeps {
  getPersistentQuery: () => Query | null;
  getCurrentConfig: () => PersistentQueryConfig | null;
  mutateCurrentConfig: (mutate: (config: PersistentQueryConfig) => void) => void;
  getVaultPath: () => string | null;
  getCliPath: () => string | null;
  getScopedSettings: () => ClaudianSettings;
  getPermissionMode: () => PermissionMode;
  resolveSDKPermissionMode: (mode: PermissionMode) => SDKPermissionMode;
  mcpManager: McpServerManager;
  buildPersistentQueryConfig: (
    vaultPath: string,
    cliPath: string,
    externalContextPaths?: string[],
  ) => PersistentQueryConfig;
  needsRestart: (newConfig: PersistentQueryConfig) => boolean;
  ensureReady: (options: ClaudeEnsureReadyOptions) => Promise<boolean>;
  setCurrentExternalContextPaths: (paths: string[]) => void;
  notifyFailure: (message: string) => void;
}

export async function applyClaudeDynamicUpdates(
  deps: ClaudeDynamicUpdateDeps,
  queryOptions?: ChatRuntimeQueryOptions,
  restartOptions?: ClosePersistentQueryOptions,
  allowRestart = true,
): Promise<void> {
  const persistentQuery = deps.getPersistentQuery();
  if (!persistentQuery) {
    return;
  }

  const vaultPath = deps.getVaultPath();
  if (!vaultPath) {
    return;
  }

  const cliPath = deps.getCliPath();
  if (!cliPath) {
    return;
  }

  const settings = deps.getScopedSettings();
  const selectedModel = queryOptions?.model || settings.model;
  const permissionMode = deps.getPermissionMode();

  const currentConfig = deps.getCurrentConfig();
  if (currentConfig && selectedModel !== currentConfig.model) {
    try {
      await persistentQuery.setModel(selectedModel);
      deps.mutateCurrentConfig(config => {
        config.model = selectedModel;
      });
    } catch {
      deps.notifyFailure('Failed to update model');
    }
  }

  const thinkingTokens = resolveThinkingTokens(selectedModel, settings.thinkingBudget);
  const currentThinking = deps.getCurrentConfig()?.thinkingTokens ?? null;
  if (thinkingTokens !== currentThinking) {
    try {
      await persistentQuery.setMaxThinkingTokens(thinkingTokens);
      deps.mutateCurrentConfig(config => {
        config.thinkingTokens = thinkingTokens;
      });
    } catch {
      deps.notifyFailure('Failed to update thinking budget');
    }
  } else {
    deps.mutateCurrentConfig(config => {
      config.thinkingTokens = thinkingTokens;
    });
  }

  const effortLevel = resolveAdaptiveEffortLevel(selectedModel, settings.effortLevel);
  if (effortLevel !== null) {
    const currentEffort = deps.getCurrentConfig()?.effortLevel ?? null;
    if (effortLevel !== currentEffort) {
      try {
        // SDK runtime accepts `max`, but the current type definition for
        // Settings.effortLevel has not caught up yet.
        await persistentQuery.applyFlagSettings({ effortLevel } as unknown as Parameters<Query['applyFlagSettings']>[0]);
        deps.mutateCurrentConfig(config => {
          config.effortLevel = effortLevel;
        });
      } catch {
        deps.notifyFailure('Failed to update effort level');
      }
    }
  } else {
    deps.mutateCurrentConfig(config => {
      config.effortLevel = null;
    });
  }

  const configBeforePermissionUpdate = deps.getCurrentConfig();
  if (configBeforePermissionUpdate) {
    const sdkMode = deps.resolveSDKPermissionMode(permissionMode);
    const currentSdkMode = configBeforePermissionUpdate.sdkPermissionMode ?? null;

    // Check if auto mode restart is needed (auto mode requires CLI flag at launch)
    const requiresAutoModeRestart = sdkMode === 'auto' && !configBeforePermissionUpdate.enableAutoMode;

    // Check if bypassPermissions restart is needed in WSL mode
    // (YOLO mode requires CLI flag at launch in WSL, but can be switched dynamically in native mode)
    const isWslMode = configBeforePermissionUpdate.installationMethod === 'wsl' && process.platform === 'win32';
    const requiresBypassRestart = isWslMode && (sdkMode === 'bypassPermissions' || currentSdkMode === 'bypassPermissions');

    if (requiresAutoModeRestart || requiresBypassRestart) {
      // The Claude Code auto-mode/YOLO opt-in is a startup flag. The restart path below
      // will rebuild the query with that capability before it becomes active.
    } else if (sdkMode !== currentSdkMode) {
      try {
        await persistentQuery.setPermissionMode(sdkMode);
        deps.mutateCurrentConfig(config => {
          config.permissionMode = permissionMode;
          config.sdkPermissionMode = sdkMode;
        });
      } catch {
        deps.notifyFailure('Failed to update permission mode');
      }
    } else {
      deps.mutateCurrentConfig(config => {
        config.permissionMode = permissionMode;
        config.sdkPermissionMode = sdkMode;
      });
    }
  }

  const mcpMentions = queryOptions?.mcpMentions || new Set<string>();
  const uiEnabledServers = queryOptions?.enabledMcpServers || new Set<string>();
  const combinedMentions = new Set([...mcpMentions, ...uiEnabledServers]);
  const mcpServers = deps.mcpManager.getActiveServers(combinedMentions);
  const mcpServersKey = JSON.stringify(mcpServers);

  if (deps.getCurrentConfig() && mcpServersKey !== deps.getCurrentConfig()!.mcpServersKey) {
    const currentConfig = deps.getCurrentConfig()!;
    const serverConfigs: Record<string, McpServerConfig> = {};

    // Map MCP server paths for WSL execution if needed
    const isWslMode = currentConfig.installationMethod === 'wsl' && process.platform === 'win32';
    const pathMapper = isWslMode
      ? createClaudePathMapper({
        method: 'wsl',
        platformFamily: 'unix',
        platformOs: 'linux',
        distroName: currentConfig.wslDistroOverride || undefined,
      })
      : null;

    for (const [name, config] of Object.entries(mcpServers)) {
      const mappedConfig = pathMapper
        ? (mapMcpServersForWsl({ [name]: config }, pathMapper)[name] as McpServerConfig)
        : (config as McpServerConfig);
      serverConfigs[name] = mappedConfig;
    }

    try {
      await persistentQuery.setMcpServers(serverConfigs);
      deps.mutateCurrentConfig(config => {
        config.mcpServersKey = mcpServersKey;
      });
    } catch {
      deps.notifyFailure('Failed to update MCP servers');
    }
  }

  const newExternalContextPaths = queryOptions?.externalContextPaths || [];
  deps.setCurrentExternalContextPaths(newExternalContextPaths);

  if (!allowRestart) {
    return;
  }

  const newConfig = deps.buildPersistentQueryConfig(vaultPath, cliPath, newExternalContextPaths);
  const restartNeeded = deps.needsRestart(newConfig);

  if (!restartNeeded) {
    return;
  }

  const restarted = await deps.ensureReady({
    externalContextPaths: newExternalContextPaths,
    preserveHandlers: restartOptions?.preserveHandlers,
    force: true,
  });

  if (restarted && deps.getPersistentQuery()) {
    await applyClaudeDynamicUpdates(deps, queryOptions, restartOptions, false);
  }
}