import * as fs from 'fs';
import { Setting } from 'obsidian';

import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import { renderEnvironmentSettingsSection } from '../../../features/settings/ui/EnvironmentSettingsSection';
import { McpSettingsManager } from '../../../features/settings/ui/McpSettingsManager';
import { t } from '../../../i18n/i18n';
import { getHostnameKey } from '../../../utils/env';
import { expandHomePath } from '../../../utils/path';
import { getClaudeWorkspaceServices } from '../app/ClaudeWorkspaceServices';
import { getClaudeProviderSettings, updateClaudeProviderSettings } from '../settings';
import { AgentSettings } from './AgentSettings';
import { PluginSettingsManager } from './PluginSettingsManager';
import { SlashCommandSettings } from './SlashCommandSettings';

export const claudeSettingsTabRenderer: ProviderSettingsTabRenderer = {
  render(container, context) {
    const claudeWorkspace = getClaudeWorkspaceServices();
    const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;
    const claudeSettings = getClaudeProviderSettings(settingsBag);

    // --- Setup ---

    new Setting(container).setName(t('settings.setup')).setHeading();

    // WSL Installation Method (Windows only)
    if (process.platform === 'win32') {
      let installationMethod = claudeSettings.installationMethod;
      let wslDistroInputEl: HTMLInputElement | null = null;
      let wslDistroSettingEl: HTMLElement | null = null;

      // Helper to toggle WSL-specific settings visibility
      const refreshInstallationMethodUI = (): void => {
        if (wslDistroInputEl) {
          wslDistroInputEl.disabled = installationMethod !== 'wsl';
        }
        if (wslDistroSettingEl) {
          wslDistroSettingEl.style.display = installationMethod === 'wsl' ? '' : 'none';
        }
      };

      new Setting(container)
        .setName('Installation method')
        .setDesc('How Claudian should launch Claude on Windows. Native Windows uses a Windows executable path. WSL launches the Linux CLI inside a selected distro.')
        .addDropdown((dropdown) => {
          dropdown
            .addOption('native-windows', 'Native Windows')
            .addOption('wsl', 'WSL')
            .setValue(installationMethod)
            .onChange(async (value) => {
              installationMethod = value === 'wsl' ? 'wsl' : 'native-windows';
              updateClaudeProviderSettings(settingsBag, { installationMethod });
              refreshInstallationMethodUI();
              await context.plugin.saveSettings();
            });
        });

      const wslDistroSetting = new Setting(container)
        .setName('WSL distro override')
        .setDesc('Optional advanced override. Leave empty to infer the distro from a \\\\wsl$ workspace path when possible, otherwise use the default WSL distro.');

      wslDistroSettingEl = wslDistroSetting.settingEl;

      wslDistroSetting.addText((text) => {
        text
          .setPlaceholder('Ubuntu')
          .setValue(claudeSettings.wslDistroOverride)
          .onChange(async (value) => {
            updateClaudeProviderSettings(settingsBag, { wslDistroOverride: value });
            await context.plugin.saveSettings();
          });

        text.inputEl.addClass('claudian-settings-cli-path-input');
        text.inputEl.style.width = '100%';
        text.inputEl.disabled = installationMethod !== 'wsl';
        wslDistroInputEl = text.inputEl;
      });

      // Initial state
      refreshInstallationMethodUI();
    }

    const hostnameKey = getHostnameKey();
    const platformDesc = process.platform === 'win32'
      ? t('settings.cliPath.descWindows')
      : t('settings.cliPath.descUnix');
    const cliPathDescription = `${t('settings.cliPath.desc')} ${platformDesc}`;

    const cliPathSetting = new Setting(container)
      .setName(`${t('settings.cliPath.name')} (${hostnameKey})`)
      .setDesc(cliPathDescription);

    const validationEl = container.createDiv({ cls: 'claudian-cli-path-validation' });
    validationEl.style.color = 'var(--text-error)';
    validationEl.style.fontSize = '0.85em';
    validationEl.style.marginTop = '-0.5em';
    validationEl.style.marginBottom = '0.5em';
    validationEl.style.display = 'none';

    const validatePath = (value: string): string | null => {
      const trimmed = value.trim();
      if (!trimmed) return null;

      // In WSL mode, the path is a Linux path that Windows cannot validate directly
      // Skip filesystem validation and just check format
      if (process.platform === 'win32' && claudeSettings.installationMethod === 'wsl') {
        // Basic Linux path validation: should start with / or be a command name
        if (!trimmed.startsWith('/') && !trimmed.match(/^[a-zA-Z0-9_-]+$/)) {
          return 'WSL mode expects a Linux absolute path (e.g., /usr/local/bin/claude) or a command name';
        }
        return null; // Accept the path without filesystem validation
      }

      const expandedPath = expandHomePath(trimmed);

      if (!fs.existsSync(expandedPath)) {
        return t('settings.cliPath.validation.notExist');
      }
      const stat = fs.statSync(expandedPath);
      if (!stat.isFile()) {
        return t('settings.cliPath.validation.isDirectory');
      }
      return null;
    };

    const updateCliPathValidation = (value: string, inputEl?: HTMLInputElement): boolean => {
      const error = validatePath(value);
      if (error) {
        validationEl.setText(error);
        validationEl.style.display = 'block';
        if (inputEl) {
          inputEl.style.borderColor = 'var(--text-error)';
        }
        return false;
      }

      validationEl.style.display = 'none';
      if (inputEl) {
        inputEl.style.borderColor = '';
      }
      return true;
    };

    const currentValue = claudeSettings.cliPathsByHost[hostnameKey] || '';
    const cliPathsByHost = { ...claudeSettings.cliPathsByHost };
    let cliPathInputEl: HTMLInputElement | null = null;

    const persistCliPath = async (value: string): Promise<boolean> => {
      const isValid = updateCliPathValidation(value, cliPathInputEl ?? undefined);
      if (!isValid) {
        return false;
      }

      const trimmed = value.trim();
      if (trimmed) {
        cliPathsByHost[hostnameKey] = trimmed;
      } else {
        delete cliPathsByHost[hostnameKey];
      }

      updateClaudeProviderSettings(settingsBag, { cliPathsByHost: { ...cliPathsByHost } });
      await context.plugin.saveSettings();
      claudeWorkspace.cliResolver.reset();
      const view = context.plugin.getView();
      await view?.getTabManager()?.broadcastToAllTabs(
        (service) => Promise.resolve(service.cleanup())
      );
      return true;
    };

    cliPathSetting.addText((text) => {
      const placeholder = process.platform === 'win32'
        ? 'D:\\nodejs\\node_global\\node_modules\\@anthropic-ai\\claude-code\\cli.js'
        : '/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js';

      text
        .setPlaceholder(placeholder)
        .setValue(currentValue)
        .onChange(async (value) => {
          await persistCliPath(value);
        });
      text.inputEl.addClass('claudian-settings-cli-path-input');
      text.inputEl.style.width = '100%';
      cliPathInputEl = text.inputEl;

      updateCliPathValidation(currentValue, text.inputEl);
    });

    // --- Safety ---

    new Setting(container).setName(t('settings.safety')).setHeading();

    new Setting(container)
      .setName(t('settings.claudeSafeMode.name'))
      .setDesc(t('settings.claudeSafeMode.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('acceptEdits', 'acceptEdits')
          .addOption('default', 'default')
          .setValue(claudeSettings.safeMode)
          .onChange(async (value) => {
            updateClaudeProviderSettings(
              settingsBag,
              { safeMode: value as 'acceptEdits' | 'default' },
            );
            await context.plugin.saveSettings();
          });
      });

    new Setting(container)
      .setName(t('settings.loadUserSettings.name'))
      .setDesc(t('settings.loadUserSettings.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(claudeSettings.loadUserSettings)
          .onChange(async (value) => {
            updateClaudeProviderSettings(settingsBag, { loadUserSettings: value });
            await context.plugin.saveSettings();
          })
      );

    // --- Models ---

    new Setting(container).setName(t('settings.models')).setHeading();

    new Setting(container)
      .setName(t('settings.enableOpus1M.name'))
      .setDesc(t('settings.enableOpus1M.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(claudeSettings.enableOpus1M)
          .onChange(async (value) => {
            updateClaudeProviderSettings(settingsBag, { enableOpus1M: value });
            context.plugin.normalizeModelVariantSettings();
            await context.plugin.saveSettings();
            context.refreshModelSelectors();
          })
      );

    new Setting(container)
      .setName(t('settings.enableSonnet1M.name'))
      .setDesc(t('settings.enableSonnet1M.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(claudeSettings.enableSonnet1M)
          .onChange(async (value) => {
            updateClaudeProviderSettings(settingsBag, { enableSonnet1M: value });
            context.plugin.normalizeModelVariantSettings();
            await context.plugin.saveSettings();
            context.refreshModelSelectors();
          })
      );

    // --- Slash Commands ---

    new Setting(container).setName(t('settings.slashCommands.name')).setHeading();

    const slashCommandsDesc = container.createDiv({ cls: 'claudian-sp-settings-desc' });
    const descP = slashCommandsDesc.createEl('p', { cls: 'setting-item-description' });
    descP.appendText(t('settings.slashCommands.desc') + ' ');
    descP.createEl('a', {
      text: 'Learn more',
      href: 'https://code.claude.com/docs/en/skills',
    });

    const slashCommandsContainer = container.createDiv({ cls: 'claudian-slash-commands-container' });
    new SlashCommandSettings(
      slashCommandsContainer,
      context.plugin.app,
      claudeWorkspace.commandCatalog,
    );

    context.renderHiddenProviderCommandSetting(container, 'claude', {
      name: t('settings.hiddenSlashCommands.name'),
      desc: t('settings.hiddenSlashCommands.desc'),
      placeholder: t('settings.hiddenSlashCommands.placeholder'),
    });

    // --- Subagents ---

    new Setting(container).setName(t('settings.subagents.name')).setHeading();

    const agentsDesc = container.createDiv({ cls: 'claudian-sp-settings-desc' });
    agentsDesc.createEl('p', {
      text: t('settings.subagents.desc'),
      cls: 'setting-item-description',
    });

    const agentsContainer = container.createDiv({ cls: 'claudian-agents-container' });
    new AgentSettings(agentsContainer, {
      app: context.plugin.app,
      agentManager: claudeWorkspace.agentManager,
      agentStorage: claudeWorkspace.agentStorage,
    });

    // --- MCP Servers ---

    new Setting(container).setName(t('settings.mcpServers.name')).setHeading();

    const mcpDesc = container.createDiv({ cls: 'claudian-mcp-settings-desc' });
    mcpDesc.createEl('p', {
      text: t('settings.mcpServers.desc'),
      cls: 'setting-item-description',
    });

    const mcpContainer = container.createDiv({ cls: 'claudian-mcp-container' });
    new McpSettingsManager(mcpContainer, {
      app: context.plugin.app,
      mcpStorage: claudeWorkspace.mcpStorage,
      broadcastMcpReload: async () => {
        for (const view of context.plugin.getAllViews()) {
          await view.getTabManager()?.broadcastToAllTabs(
            (service) => service.reloadMcpServers(),
          );
        }
      },
    });

    // --- Plugins ---

    new Setting(container).setName(t('settings.plugins.name')).setHeading();

    const pluginsDesc = container.createDiv({ cls: 'claudian-plugin-settings-desc' });
    pluginsDesc.createEl('p', {
      text: t('settings.plugins.desc'),
      cls: 'setting-item-description',
    });

    const pluginsContainer = container.createDiv({ cls: 'claudian-plugins-container' });
    new PluginSettingsManager(pluginsContainer, {
      pluginManager: claudeWorkspace.pluginManager,
      agentManager: claudeWorkspace.agentManager,
      restartTabs: async () => {
        const view = context.plugin.getView();
        const tabManager = view?.getTabManager();
        if (!tabManager) {
          return;
        }

        await tabManager.broadcastToAllTabs(
          async (service) => { await service.ensureReady({ force: true }); },
        );
      },
    });

    // --- Environment ---

    renderEnvironmentSettingsSection({
      container,
      plugin: context.plugin,
      scope: 'provider:claude',
      heading: t('settings.environment'),
      name: t('settings.customVariables.name'),
      desc: 'Claude-owned runtime variables only. Use this for ANTHROPIC_* and Claude-specific toggles.',
      placeholder: 'ANTHROPIC_API_KEY=your-key\nANTHROPIC_BASE_URL=https://api.example.com\nANTHROPIC_MODEL=custom-model\nCLAUDE_CODE_USE_BEDROCK=1',
      renderCustomContextLimits: (target) => context.renderCustomContextLimits(target, 'claude'),
    });

    // --- Experimental ---

    new Setting(container).setName(t('settings.experimental')).setHeading();

    new Setting(container)
      .setName(t('settings.enableChrome.name'))
      .setDesc(t('settings.enableChrome.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(claudeSettings.enableChrome)
          .onChange(async (value) => {
            updateClaudeProviderSettings(settingsBag, { enableChrome: value });
            await context.plugin.saveSettings();
          })
      );

    new Setting(container)
      .setName(t('settings.enableBangBash.name'))
      .setDesc(t('settings.enableBangBash.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(claudeSettings.enableBangBash)
          .onChange(async (value) => {
            bangBashValidationEl.style.display = 'none';
            if (value) {
              const { findNodeExecutable, getEnhancedPath } = await import('../../../utils/env');
              const nodePath = findNodeExecutable(getEnhancedPath());
              if (!nodePath) {
                bangBashValidationEl.setText(t('settings.enableBangBash.validation.noNode'));
                bangBashValidationEl.style.display = 'block';
                toggle.setValue(false);
                return;
              }
            }
            updateClaudeProviderSettings(settingsBag, { enableBangBash: value });
            await context.plugin.saveSettings();
          })
      );

    const bangBashValidationEl = container.createDiv({ cls: 'claudian-bang-bash-validation' });
    bangBashValidationEl.style.color = 'var(--text-error)';
    bangBashValidationEl.style.fontSize = '0.85em';
    bangBashValidationEl.style.marginTop = '-0.5em';
    bangBashValidationEl.style.marginBottom = '0.5em';
    bangBashValidationEl.style.display = 'none';
  },
};
