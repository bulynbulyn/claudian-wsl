/**
 * McpService - MCP service with @-mention detection.
 *
 * Wraps McpServerManager and adds @-mention validation utilities
 * for feature layers without introducing UI dependencies.
 */

import { extractMcpMentions, transformMcpMentions } from '../../utils/mcp';
import type { ClaudianMcpServer, McpServerConfig } from '../types';
import type { McpServerManager } from './McpServerManager';

export class McpService {
  private manager: McpServerManager;

  constructor(manager: McpServerManager) {
    this.manager = manager;
  }

  async loadServers(): Promise<void> {
    return this.manager.loadServers();
  }

  getServers(): ClaudianMcpServer[] {
    return this.manager.getServers();
  }

  getEnabledCount(): number {
    return this.manager.getEnabledCount();
  }

  getActiveServers(mentionedNames: Set<string>): Record<string, McpServerConfig> {
    return this.manager.getActiveServers(mentionedNames);
  }

  hasServers(): boolean {
    return this.manager.hasServers();
  }

  getServerNames(): string[] {
    return this.manager.getServers().map((s) => s.name);
  }

  getEnabledServerNames(): string[] {
    return this.manager.getServers().filter((s) => s.enabled).map((s) => s.name);
  }

  getContextSavingServers(): ClaudianMcpServer[] {
    return this.manager.getServers().filter((s) => s.enabled && s.contextSaving);
  }

  isValidMcpMention(name: string): boolean {
    return this.manager.getServers().some((s) => s.name === name && s.enabled && s.contextSaving);
  }

  /** Only matches against enabled servers with context-saving mode. */
  extractMentions(text: string): Set<string> {
    const validNames = new Set(
      this.manager.getServers().filter((s) => s.enabled && s.contextSaving).map((s) => s.name)
    );
    return extractMcpMentions(text, validNames);
  }

  hasContextSavingServers(): boolean {
    return this.manager.getServers().some((s) => s.enabled && s.contextSaving);
  }

  /**
   * Transform MCP mentions in text by appending " MCP" after each valid @mention.
   * This is applied to API requests only, not shown in UI.
   */
  transformMentions(text: string): string {
    const validNames = new Set(
      this.manager.getServers().filter((s) => s.enabled && s.contextSaving).map((s) => s.name)
    );
    return transformMcpMentions(text, validNames);
  }

  getManager(): McpServerManager {
    return this.manager;
  }
}
