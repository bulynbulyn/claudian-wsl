import type {
  CanUseTool,
  Options,
  PermissionMode as SDKPermissionMode,
} from '@anthropic-ai/claude-agent-sdk';

import type { McpServerManager } from '../../../core/mcp/McpServerManager';
import {
  buildSystemPrompt,
  computeSystemPromptKey,
  type SystemPromptSettings,
} from '../../../core/prompt/mainAgent';
import type { AppPluginManager } from '../../../core/providers/types';
import type { ClaudianSettings, PermissionMode } from '../../../core/types/settings';
import {
  type ClaudeSafeMode,
  getClaudeProviderSettings,
} from '../settings';
import {
  resolveAdaptiveEffortLevel,
  resolveThinkingTokens,
} from '../types/models';
import { buildClaudeLaunchSpec } from './ClaudeLaunchSpecBuilder';
import { createCustomSpawnFunction } from './customSpawn';
import {
  DISABLED_BUILTIN_SUBAGENTS,
  type PersistentQueryConfig,
  UNSUPPORTED_SDK_TOOLS,
} from './types';

export interface QueryOptionsContext {
  vaultPath: string;
  cliPath: string;
  settings: ClaudianSettings;
  customEnv: Record<string, string>;
  enhancedPath: string;
  mcpManager: McpServerManager;
  pluginManager: AppPluginManager;
}

export interface PersistentQueryContext extends QueryOptionsContext {
  abortController?: AbortController;
  resume?: {
    sessionId: string;
    sessionAt?: string;
    fork?: boolean;
  };
  canUseTool?: CanUseTool;
  hooks: Options['hooks'];
  externalContextPaths?: string[];
}

export interface ColdStartQueryContext extends QueryOptionsContext {
  abortController?: AbortController;
  sessionId?: string;
  modelOverride?: string;
  canUseTool?: CanUseTool;
  hooks: Options['hooks'];
  mcpMentions?: Set<string>;
  enabledMcpServers?: Set<string>;
  allowedTools?: string[];
  hasEditorContext: boolean;
  externalContextPaths?: string[];
}

export class QueryOptionsBuilder {
  static needsRestart(
    currentConfig: PersistentQueryConfig | null,
    newConfig: PersistentQueryConfig
  ): boolean {
    if (!currentConfig) return true;

    // These require restart (cannot be updated dynamically)
    if (currentConfig.systemPromptKey !== newConfig.systemPromptKey) return true;
    if (currentConfig.disallowedToolsKey !== newConfig.disallowedToolsKey) return true;
    if (currentConfig.pluginsKey !== newConfig.pluginsKey) return true;
    if (currentConfig.settingSources !== newConfig.settingSources) return true;
    if (currentConfig.claudeCliPath !== newConfig.claudeCliPath) return true;

    // Permission mode changes involving bypassPermissions require restart because
    // the SDK requires --permission-mode bypassPermissions at CLI launch time.
    // Other modes (default, acceptEdits, plan) can be updated dynamically.
    if (currentConfig.sdkPermissionMode !== newConfig.sdkPermissionMode) {
      if (currentConfig.sdkPermissionMode === 'bypassPermissions' || newConfig.sdkPermissionMode === 'bypassPermissions') {
        return true;
      }
    }

    if (currentConfig.enableChrome !== newConfig.enableChrome) return true;

    // External context paths require restart (additionalDirectories can't be updated dynamically)
    if (QueryOptionsBuilder.pathsChanged(currentConfig.externalContextPaths, newConfig.externalContextPaths)) {
      return true;
    }

    // WSL installation method change requires restart
    if (currentConfig.installationMethod !== newConfig.installationMethod) return true;
    if (currentConfig.wslDistroOverride !== newConfig.wslDistroOverride) return true;

    return false;
  }

  static buildPersistentQueryConfig(
    ctx: QueryOptionsContext,
    externalContextPaths?: string[]
  ): PersistentQueryConfig {
    const claudeSettings = getClaudeProviderSettings(ctx.settings as unknown as Record<string, unknown>);
    const systemPromptSettings: SystemPromptSettings = {
      mediaFolder: ctx.settings.mediaFolder,
      customPrompt: ctx.settings.systemPrompt,
      vaultPath: ctx.vaultPath,
      userName: ctx.settings.userName,
    };

    const sdkPermissionMode = QueryOptionsBuilder.resolveClaudeSdkPermissionMode(
      ctx.settings.permissionMode,
      claudeSettings.safeMode,
    );

    const disallowedToolsKey = ctx.mcpManager.getAllDisallowedMcpTools().join('|');
    const pluginsKey = ctx.pluginManager.getPluginsKey();

    return {
      model: ctx.settings.model,
      thinkingTokens: resolveThinkingTokens(ctx.settings.model, ctx.settings.thinkingBudget),
      effortLevel: resolveAdaptiveEffortLevel(ctx.settings.model, ctx.settings.effortLevel),
      permissionMode: ctx.settings.permissionMode,
      sdkPermissionMode,
      systemPromptKey: computeSystemPromptKey(systemPromptSettings),
      disallowedToolsKey,
      mcpServersKey: '', // Dynamic via setMcpServers, not tracked for restart
      pluginsKey,
      externalContextPaths: externalContextPaths || [],
      settingSources: claudeSettings.loadUserSettings ? 'user,project' : 'project',
      claudeCliPath: ctx.cliPath,
      enableChrome: claudeSettings.enableChrome,
      // WSL settings
      installationMethod: claudeSettings.installationMethod,
      wslDistroOverride: claudeSettings.wslDistroOverride,
    };
  }

  static buildPersistentQueryOptions(ctx: PersistentQueryContext): Options {
    const { options, claudeSettings } = QueryOptionsBuilder.buildBaseOptions(
      ctx,
      ctx.settings.model,
      ctx.abortController,
    );

    options.disallowedTools = [
      ...ctx.mcpManager.getAllDisallowedMcpTools(),
      ...UNSUPPORTED_SDK_TOOLS,
      ...DISABLED_BUILTIN_SUBAGENTS,
    ];

    QueryOptionsBuilder.applyPermissionMode(
      options,
      ctx.settings.permissionMode,
      claudeSettings.safeMode,
      ctx.canUseTool,
    );
    QueryOptionsBuilder.applyThinking(options, ctx.settings, ctx.settings.model);
    options.hooks = ctx.hooks;

    options.enableFileCheckpointing = true;

    if (ctx.resume) {
      options.resume = ctx.resume.sessionId;
      if (ctx.resume.sessionAt) {
        options.resumeSessionAt = ctx.resume.sessionAt;
      }
      if (ctx.resume.fork) {
        options.forkSession = true;
      }
    }

    if (ctx.externalContextPaths && ctx.externalContextPaths.length > 0) {
      options.additionalDirectories = ctx.externalContextPaths;
    }

    return options;
  }

  static buildColdStartQueryOptions(ctx: ColdStartQueryContext): Options {
    const selectedModel = ctx.modelOverride ?? ctx.settings.model;
    const { options, claudeSettings } = QueryOptionsBuilder.buildBaseOptions(
      ctx,
      selectedModel,
      ctx.abortController,
    );

    const mcpMentions = ctx.mcpMentions || new Set<string>();
    const uiEnabledServers = ctx.enabledMcpServers || new Set<string>();
    const combinedMentions = new Set([...mcpMentions, ...uiEnabledServers]);
    const mcpServers = ctx.mcpManager.getActiveServers(combinedMentions);

    if (Object.keys(mcpServers).length > 0) {
      options.mcpServers = mcpServers;
    }

    const disallowedMcpTools = ctx.mcpManager.getDisallowedMcpTools(combinedMentions);
    options.disallowedTools = [
      ...disallowedMcpTools,
      ...UNSUPPORTED_SDK_TOOLS,
      ...DISABLED_BUILTIN_SUBAGENTS,
    ];

    QueryOptionsBuilder.applyPermissionMode(
      options,
      ctx.settings.permissionMode,
      claudeSettings.safeMode,
      ctx.canUseTool,
    );
    options.hooks = ctx.hooks;
    QueryOptionsBuilder.applyThinking(options, ctx.settings, ctx.modelOverride ?? ctx.settings.model);

    if (ctx.allowedTools !== undefined && ctx.allowedTools.length > 0) {
      options.tools = ctx.allowedTools;
    }

    if (ctx.sessionId) {
      options.resume = ctx.sessionId;
    }

    if (ctx.externalContextPaths && ctx.externalContextPaths.length > 0) {
      options.additionalDirectories = ctx.externalContextPaths;
    }

    return options;
  }

  static resolveClaudeSdkPermissionMode(
    permissionMode: PermissionMode,
    claudeSafeMode: ClaudeSafeMode = 'acceptEdits',
  ): SDKPermissionMode {
    if (permissionMode === 'yolo') return 'bypassPermissions';
    if (permissionMode === 'plan') return 'plan';
    return claudeSafeMode;
  }

  private static applyPermissionMode(
    options: Options,
    permissionMode: PermissionMode,
    claudeSafeMode: ClaudeSafeMode,
    canUseTool?: CanUseTool
  ): void {
    options.allowDangerouslySkipPermissions = true;

    if (canUseTool) {
      options.canUseTool = canUseTool;
    }

    options.permissionMode = QueryOptionsBuilder.resolveClaudeSdkPermissionMode(
      permissionMode,
      claudeSafeMode,
    );
  }

  private static applyExtraArgs(options: Options, enableChrome: boolean): void {
    if (enableChrome) {
      options.extraArgs = { ...options.extraArgs, chrome: null };
    }
  }

  private static buildBaseOptions(
    ctx: QueryOptionsContext,
    model: string,
    abortController?: AbortController,
  ): { options: Options; claudeSettings: ReturnType<typeof getClaudeProviderSettings> } {
    const claudeSettings = getClaudeProviderSettings(ctx.settings as unknown as Record<string, unknown>);
    const systemPromptSettings: SystemPromptSettings = {
      mediaFolder: ctx.settings.mediaFolder,
      customPrompt: ctx.settings.systemPrompt,
      vaultPath: ctx.vaultPath,
      userName: ctx.settings.userName,
    };

    // Build WSL launch spec if needed
    const isWslMode = claudeSettings.installationMethod === 'wsl' && process.platform === 'win32';
    let launchSpec: ReturnType<typeof buildClaudeLaunchSpec> | undefined;

    if (isWslMode && ctx.vaultPath) {
      const filteredEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          filteredEnv[key] = value;
        }
      }
      launchSpec = buildClaudeLaunchSpec({
        settings: ctx.settings as unknown as Record<string, unknown>,
        resolvedCliCommand: ctx.cliPath || 'claude',
        hostVaultPath: ctx.vaultPath,
        env: {
          ...filteredEnv,
          ...ctx.customEnv,
        },
      });
    }

    const options: Options = {
      cwd: ctx.vaultPath,
      systemPrompt: buildSystemPrompt(systemPromptSettings),
      model,
      abortController,
      // In WSL mode, the actual CLI path is handled by spawnClaudeCodeProcess
      pathToClaudeCodeExecutable: isWslMode ? 'claude' : ctx.cliPath,
      settingSources: claudeSettings.loadUserSettings ? ['user', 'project'] : ['project'],
      env: {
        ...process.env,
        ...ctx.customEnv,
        PATH: ctx.enhancedPath,
      },
      includePartialMessages: true,
    };

    QueryOptionsBuilder.applyExtraArgs(options, claudeSettings.enableChrome);
    options.spawnClaudeCodeProcess = createCustomSpawnFunction(ctx.enhancedPath, launchSpec);

    return { options, claudeSettings };
  }

  private static applyThinking(
    options: Options,
    settings: ClaudianSettings,
    model: string
  ): void {
    const effortLevel = resolveAdaptiveEffortLevel(model, settings.effortLevel);
    if (effortLevel !== null) {
      options.thinking = { type: 'adaptive' };
      options.effort = effortLevel;
      return;
    }

    const thinkingTokens = resolveThinkingTokens(model, settings.thinkingBudget);
    if (thinkingTokens !== null) {
      options.maxThinkingTokens = thinkingTokens;
    }
  }

  private static pathsChanged(a?: string[], b?: string[]): boolean {
    const aKey = [...(a || [])].sort().join('|');
    const bKey = [...(b || [])].sort().join('|');
    return aKey !== bKey;
  }

}
