import { createMockEl } from '@test/helpers/mockElement';
import { setIcon } from 'obsidian';

import type { ToolCallInfo } from '@/core/types';
import {
  renderStoredToolCall,
  renderToolCall,
  updateToolCallResult,
} from '@/features/chat/rendering/ToolCallRenderer';

// Mock obsidian
jest.mock('obsidian', () => ({
  setIcon: jest.fn(),
}));

// Helper to create a basic tool call
function createToolCall(overrides: Partial<ToolCallInfo> = {}): ToolCallInfo {
  return {
    id: 'tool-123',
    name: 'Read',
    input: { file_path: '/test/file.md' },
    status: 'running',
    ...overrides,
  };
}

describe('ToolCallRenderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('renderToolCall', () => {
    it('should start collapsed by default', () => {
      const parentEl = createMockEl();
      const toolCall = createToolCall();
      const toolCallElements = new Map<string, HTMLElement>();

      const toolEl = renderToolCall(parentEl, toolCall, toolCallElements);

      expect(toolEl.hasClass('expanded')).toBe(false);
      expect(toolCall.isExpanded).toBe(false);
    });

    it('should set aria-expanded to false by default', () => {
      const parentEl = createMockEl();
      const toolCall = createToolCall();
      const toolCallElements = new Map<string, HTMLElement>();

      const toolEl = renderToolCall(parentEl, toolCall, toolCallElements);

      const header = (toolEl as any)._children[0];
      expect(header.getAttribute('aria-expanded')).toBe('false');
    });

    it('should hide content by default', () => {
      const parentEl = createMockEl();
      const toolCall = createToolCall();
      const toolCallElements = new Map<string, HTMLElement>();

      const toolEl = renderToolCall(parentEl, toolCall, toolCallElements);

      const content = (toolEl as any)._children[1];
      expect(content.style.display).toBe('none');
    });

    it('should set correct ARIA attributes for accessibility', () => {
      const parentEl = createMockEl();
      const toolCall = createToolCall();
      const toolCallElements = new Map<string, HTMLElement>();

      const toolEl = renderToolCall(parentEl, toolCall, toolCallElements);

      const header = (toolEl as any)._children[0];
      expect(header.getAttribute('role')).toBe('button');
      expect(header.getAttribute('tabindex')).toBe('0');
      expect(header.getAttribute('aria-expanded')).toBe('false');
    });

    it('should toggle expand/collapse on header click', () => {
      const parentEl = createMockEl();
      const toolCall = createToolCall();
      const toolCallElements = new Map<string, HTMLElement>();

      const toolEl = renderToolCall(parentEl, toolCall, toolCallElements);
      const header = (toolEl as any)._children[0];
      const content = (toolEl as any)._children[1];

      // Initially collapsed
      expect(toolEl.hasClass('expanded')).toBe(false);
      expect(content.style.display).toBe('none');
      expect(toolCall.isExpanded).toBe(false);

      // Trigger click
      const clickHandlers = header._eventListeners.get('click') || [];
      expect(clickHandlers.length).toBeGreaterThan(0);
      clickHandlers[0]();

      // Should be expanded
      expect(toolEl.hasClass('expanded')).toBe(true);
      expect(content.style.display).toBe('block');
      expect(toolCall.isExpanded).toBe(true);

      // Click again to collapse
      clickHandlers[0]();
      expect(toolEl.hasClass('expanded')).toBe(false);
      expect(content.style.display).toBe('none');
      expect(toolCall.isExpanded).toBe(false);
    });

    it('should update aria-expanded on toggle', () => {
      const parentEl = createMockEl();
      const toolCall = createToolCall();
      const toolCallElements = new Map<string, HTMLElement>();

      const toolEl = renderToolCall(parentEl, toolCall, toolCallElements);
      const header = (toolEl as any)._children[0];

      // Initially collapsed
      expect(header.getAttribute('aria-expanded')).toBe('false');

      // Expand
      const clickHandlers = header._eventListeners.get('click') || [];
      clickHandlers[0]();
      expect(header.getAttribute('aria-expanded')).toBe('true');

      // Collapse
      clickHandlers[0]();
      expect(header.getAttribute('aria-expanded')).toBe('false');
    });

    it('should store element in toolCallElements map', () => {
      const parentEl = createMockEl();
      const toolCall = createToolCall({ id: 'test-id' });
      const toolCallElements = new Map<string, HTMLElement>();

      const toolEl = renderToolCall(parentEl, toolCall, toolCallElements);

      expect(toolCallElements.get('test-id')).toBe(toolEl);
    });

    it('should set data-tool-id on element', () => {
      const parentEl = createMockEl();
      const toolCall = createToolCall({ id: 'my-tool-id' });
      const toolCallElements = new Map<string, HTMLElement>();

      const toolEl = renderToolCall(parentEl, toolCall, toolCallElements);

      expect(toolEl.dataset.toolId).toBe('my-tool-id');
    });
  });

  describe('renderStoredToolCall', () => {
    it('should start collapsed by default', () => {
      const parentEl = createMockEl();
      const toolCall = createToolCall({ status: 'completed' });

      const toolEl = renderStoredToolCall(parentEl, toolCall);

      expect(toolEl.hasClass('expanded')).toBe(false);
    });

    it('should set aria-expanded to false by default', () => {
      const parentEl = createMockEl();
      const toolCall = createToolCall({ status: 'completed' });

      const toolEl = renderStoredToolCall(parentEl, toolCall);

      const header = (toolEl as any)._children[0];
      expect(header.getAttribute('aria-expanded')).toBe('false');
    });

    it('should hide content by default', () => {
      const parentEl = createMockEl();
      const toolCall = createToolCall({ status: 'completed' });

      const toolEl = renderStoredToolCall(parentEl, toolCall);

      const content = (toolEl as any)._children[1];
      expect(content.style.display).toBe('none');
    });

    it('should toggle expand/collapse on click', () => {
      const parentEl = createMockEl();
      const toolCall = createToolCall({ status: 'completed' });

      const toolEl = renderStoredToolCall(parentEl, toolCall);
      const header = (toolEl as any)._children[0];
      const content = (toolEl as any)._children[1];

      // Initially collapsed
      expect(toolEl.hasClass('expanded')).toBe(false);
      expect(content.style.display).toBe('none');

      // Click to expand
      const clickHandlers = header._eventListeners.get('click') || [];
      clickHandlers[0]();

      expect(toolEl.hasClass('expanded')).toBe(true);
      expect(content.style.display).toBe('block');
      expect(header.getAttribute('aria-expanded')).toBe('true');

      // Click to collapse
      clickHandlers[0]();
      expect(toolEl.hasClass('expanded')).toBe(false);
      expect(content.style.display).toBe('none');
      expect(header.getAttribute('aria-expanded')).toBe('false');
    });

    it('should show completed status icon', () => {
      const parentEl = createMockEl();
      const toolCall = createToolCall({ status: 'completed' });

      renderStoredToolCall(parentEl, toolCall);

      expect(setIcon).toHaveBeenCalledWith(expect.anything(), 'check');
    });

    it('should show error status icon', () => {
      const parentEl = createMockEl();
      const toolCall = createToolCall({ status: 'error' });

      renderStoredToolCall(parentEl, toolCall);

      expect(setIcon).toHaveBeenCalledWith(expect.anything(), 'x');
    });
  });

  describe('updateToolCallResult', () => {
    it('should update status indicator', () => {
      const parentEl = createMockEl();
      const toolCall = createToolCall({ id: 'tool-1' });
      const toolCallElements = new Map<string, HTMLElement>();

      const toolEl = renderToolCall(parentEl, toolCall, toolCallElements);

      // Update with completed result
      toolCall.status = 'completed';
      toolCall.result = 'Success';
      updateToolCallResult('tool-1', toolCall, toolCallElements);

      const statusEl = toolEl.querySelector('.claudian-tool-status');
      expect(statusEl?.hasClass('status-completed')).toBe(true);
    });
  });

  describe('keyboard navigation', () => {
    it('should support keyboard navigation (Enter/Space) on renderToolCall', () => {
      const parentEl = createMockEl();
      const toolCall = createToolCall();
      const toolCallElements = new Map<string, HTMLElement>();

      const toolEl = renderToolCall(parentEl, toolCall, toolCallElements);
      const header = (toolEl as any)._children[0];

      const keydownHandlers = header._eventListeners.get('keydown') || [];
      expect(keydownHandlers.length).toBeGreaterThan(0);

      // Simulate Enter key
      const enterEvent = { key: 'Enter', preventDefault: jest.fn() };
      keydownHandlers[0](enterEvent);

      expect(enterEvent.preventDefault).toHaveBeenCalled();
      expect(toolEl.hasClass('expanded')).toBe(true);

      // Simulate Space key to collapse
      const spaceEvent = { key: ' ', preventDefault: jest.fn() };
      keydownHandlers[0](spaceEvent);

      expect(spaceEvent.preventDefault).toHaveBeenCalled();
      expect(toolEl.hasClass('expanded')).toBe(false);
    });

    it('should support keyboard navigation (Enter/Space) on renderStoredToolCall', () => {
      const parentEl = createMockEl();
      const toolCall = createToolCall({ status: 'completed' });

      const toolEl = renderStoredToolCall(parentEl, toolCall);
      const header = (toolEl as any)._children[0];

      const keydownHandlers = header._eventListeners.get('keydown') || [];
      expect(keydownHandlers.length).toBeGreaterThan(0);

      // Simulate Enter key
      const enterEvent = { key: 'Enter', preventDefault: jest.fn() };
      keydownHandlers[0](enterEvent);

      expect(enterEvent.preventDefault).toHaveBeenCalled();
      expect(toolEl.hasClass('expanded')).toBe(true);
    });

    it('should ignore other keys', () => {
      const parentEl = createMockEl();
      const toolCall = createToolCall();
      const toolCallElements = new Map<string, HTMLElement>();

      const toolEl = renderToolCall(parentEl, toolCall, toolCallElements);
      const header = (toolEl as any)._children[0];

      const keydownHandlers = header._eventListeners.get('keydown') || [];

      // Simulate Tab key (should not toggle)
      const tabEvent = { key: 'Tab', preventDefault: jest.fn() };
      keydownHandlers[0](tabEvent);

      expect(tabEvent.preventDefault).not.toHaveBeenCalled();
      expect(toolEl.hasClass('expanded')).toBe(false);
    });
  });
});
