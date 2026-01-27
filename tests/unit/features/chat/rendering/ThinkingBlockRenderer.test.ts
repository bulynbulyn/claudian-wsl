import { createMockEl } from '@test/helpers/mockElement';

import {
  createThinkingBlock,
  finalizeThinkingBlock,
  renderStoredThinkingBlock,
} from '@/features/chat/rendering/ThinkingBlockRenderer';

// Mock renderContent function
const mockRenderContent = jest.fn().mockResolvedValue(undefined);

describe('ThinkingBlockRenderer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('createThinkingBlock', () => {
    it('should start collapsed by default', () => {
      const parentEl = createMockEl();

      const state = createThinkingBlock(parentEl, mockRenderContent);

      expect(state.wrapperEl.hasClass('expanded')).toBe(false);
      expect(state.contentEl.style.display).toBe('none');
    });

    it('should set aria-expanded to false by default', () => {
      const parentEl = createMockEl();

      const state = createThinkingBlock(parentEl, mockRenderContent);

      const header = (state.wrapperEl as any)._children[0];
      expect(header.getAttribute('aria-expanded')).toBe('false');
    });

    it('should set correct ARIA attributes for accessibility', () => {
      const parentEl = createMockEl();

      const state = createThinkingBlock(parentEl, mockRenderContent);

      const header = (state.wrapperEl as any)._children[0];
      expect(header.getAttribute('role')).toBe('button');
      expect(header.getAttribute('tabindex')).toBe('0');
      expect(header.getAttribute('aria-expanded')).toBe('false');
      expect(header.getAttribute('aria-label')).toContain('click to expand');
    });

    it('should toggle expand/collapse on header click', () => {
      const parentEl = createMockEl();

      const state = createThinkingBlock(parentEl, mockRenderContent);

      // Initially collapsed
      expect((state.wrapperEl as any).hasClass('expanded')).toBe(false);
      expect((state.contentEl as any).style.display).toBe('none');

      // Trigger click
      const header = (state.wrapperEl as any)._children[0];
      const clickHandlers = header._eventListeners.get('click') || [];
      expect(clickHandlers.length).toBeGreaterThan(0);
      clickHandlers[0]();

      // Should be expanded
      expect((state.wrapperEl as any).hasClass('expanded')).toBe(true);
      expect((state.contentEl as any).style.display).toBe('block');

      // Click again to collapse
      clickHandlers[0]();
      expect((state.wrapperEl as any).hasClass('expanded')).toBe(false);
      expect((state.contentEl as any).style.display).toBe('none');
    });

    it('should update aria-expanded on toggle', () => {
      const parentEl = createMockEl();

      const state = createThinkingBlock(parentEl, mockRenderContent);
      const header = (state.wrapperEl as any)._children[0];

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

    it('should show timer label', () => {
      const parentEl = createMockEl();

      const state = createThinkingBlock(parentEl, mockRenderContent);

      expect(state.labelEl.textContent).toContain('Thinking');
    });

    it('should clean up timer on finalize', () => {
      const parentEl = createMockEl();

      const state = createThinkingBlock(parentEl, mockRenderContent);

      expect(state.timerInterval).not.toBeNull();

      finalizeThinkingBlock(state);

      expect(state.timerInterval).toBeNull();
    });
  });

  describe('finalizeThinkingBlock', () => {
    it('should collapse the block when finalized', () => {
      const parentEl = createMockEl();

      const state = createThinkingBlock(parentEl, mockRenderContent);

      // Manually expand first
      state.wrapperEl.addClass('expanded');
      state.contentEl.style.display = 'block';

      finalizeThinkingBlock(state);

      expect(state.wrapperEl.hasClass('expanded')).toBe(false);
      expect(state.contentEl.style.display).toBe('none');
    });

    it('should update label with final duration', () => {
      const parentEl = createMockEl();

      const state = createThinkingBlock(parentEl, mockRenderContent);

      // Advance time by 5 seconds
      jest.advanceTimersByTime(5000);

      const duration = finalizeThinkingBlock(state);

      expect(duration).toBeGreaterThanOrEqual(5);
      expect(state.labelEl.textContent).toContain('Thought for');
    });

    it('should sync isExpanded state so toggle works correctly after finalize', () => {
      const parentEl = createMockEl();

      const state = createThinkingBlock(parentEl, mockRenderContent);
      const header = (state.wrapperEl as any)._children[0];

      // Expand the block
      const clickHandlers = header._eventListeners.get('click') || [];
      clickHandlers[0]();
      expect(state.isExpanded).toBe(true);
      expect((state.wrapperEl as any).hasClass('expanded')).toBe(true);

      // Finalize (which collapses)
      finalizeThinkingBlock(state);
      expect(state.isExpanded).toBe(false);
      expect((state.wrapperEl as any).hasClass('expanded')).toBe(false);

      // Now click once - should expand (not require two clicks)
      clickHandlers[0]();
      expect(state.isExpanded).toBe(true);
      expect((state.wrapperEl as any).hasClass('expanded')).toBe(true);
      expect((state.contentEl as any).style.display).toBe('block');
    });

    it('should update aria-expanded on finalize', () => {
      const parentEl = createMockEl();

      const state = createThinkingBlock(parentEl, mockRenderContent);
      const header = (state.wrapperEl as any)._children[0];

      // Expand first
      const clickHandlers = header._eventListeners.get('click') || [];
      clickHandlers[0]();
      expect(header.getAttribute('aria-expanded')).toBe('true');

      // Finalize
      finalizeThinkingBlock(state);
      expect(header.getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('renderStoredThinkingBlock', () => {
    it('should start collapsed by default', () => {
      const parentEl = createMockEl();

      const wrapperEl = renderStoredThinkingBlock(parentEl, 'thinking content', 10, mockRenderContent);

      expect((wrapperEl as any).hasClass('expanded')).toBe(false);
    });

    it('should set aria-expanded to false by default', () => {
      const parentEl = createMockEl();

      const wrapperEl = renderStoredThinkingBlock(parentEl, 'thinking content', 10, mockRenderContent);

      const header = (wrapperEl as any)._children[0];
      expect(header.getAttribute('aria-expanded')).toBe('false');
    });

    it('should hide content by default', () => {
      const parentEl = createMockEl();

      const wrapperEl = renderStoredThinkingBlock(parentEl, 'thinking content', 10, mockRenderContent);

      const content = (wrapperEl as any)._children[1];
      expect(content.style.display).toBe('none');
    });

    it('should toggle expand/collapse on click', () => {
      const parentEl = createMockEl();

      const wrapperEl = renderStoredThinkingBlock(parentEl, 'thinking content', 10, mockRenderContent);
      const header = (wrapperEl as any)._children[0];
      const content = (wrapperEl as any)._children[1];

      // Initially collapsed
      expect((wrapperEl as any).hasClass('expanded')).toBe(false);
      expect(content.style.display).toBe('none');

      // Click to expand
      const clickHandlers = header._eventListeners.get('click') || [];
      clickHandlers[0]();

      expect((wrapperEl as any).hasClass('expanded')).toBe(true);
      expect(content.style.display).toBe('block');
      expect(header.getAttribute('aria-expanded')).toBe('true');
    });

    it('should support keyboard navigation (Enter/Space)', () => {
      const parentEl = createMockEl();

      const wrapperEl = renderStoredThinkingBlock(parentEl, 'thinking content', 10, mockRenderContent);
      const header = (wrapperEl as any)._children[0];

      const keydownHandlers = header._eventListeners.get('keydown') || [];
      expect(keydownHandlers.length).toBeGreaterThan(0);

      // Simulate Enter key
      const enterEvent = { key: 'Enter', preventDefault: jest.fn() };
      keydownHandlers[0](enterEvent);

      expect(enterEvent.preventDefault).toHaveBeenCalled();
      expect((wrapperEl as any).hasClass('expanded')).toBe(true);

      // Simulate Space key to collapse
      const spaceEvent = { key: ' ', preventDefault: jest.fn() };
      keydownHandlers[0](spaceEvent);

      expect(spaceEvent.preventDefault).toHaveBeenCalled();
      expect((wrapperEl as any).hasClass('expanded')).toBe(false);
    });
  });

  describe('createThinkingBlock keyboard navigation', () => {
    it('should support keyboard navigation (Enter/Space)', () => {
      const parentEl = createMockEl();

      const state = createThinkingBlock(parentEl, mockRenderContent);
      const header = (state.wrapperEl as any)._children[0];

      const keydownHandlers = header._eventListeners.get('keydown') || [];
      expect(keydownHandlers.length).toBeGreaterThan(0);

      // Simulate Enter key
      const enterEvent = { key: 'Enter', preventDefault: jest.fn() };
      keydownHandlers[0](enterEvent);

      expect(enterEvent.preventDefault).toHaveBeenCalled();
      expect((state.wrapperEl as any).hasClass('expanded')).toBe(true);
      expect((state.contentEl as any).style.display).toBe('block');

      // Simulate Space key to collapse
      const spaceEvent = { key: ' ', preventDefault: jest.fn() };
      keydownHandlers[0](spaceEvent);

      expect(spaceEvent.preventDefault).toHaveBeenCalled();
      expect((state.wrapperEl as any).hasClass('expanded')).toBe(false);
      expect((state.contentEl as any).style.display).toBe('none');
    });

    it('should ignore other keys', () => {
      const parentEl = createMockEl();

      const state = createThinkingBlock(parentEl, mockRenderContent);
      const header = (state.wrapperEl as any)._children[0];

      const keydownHandlers = header._eventListeners.get('keydown') || [];

      // Simulate Tab key (should not toggle)
      const tabEvent = { key: 'Tab', preventDefault: jest.fn() };
      keydownHandlers[0](tabEvent);

      expect(tabEvent.preventDefault).not.toHaveBeenCalled();
      expect((state.wrapperEl as any).hasClass('expanded')).toBe(false);
    });
  });
});
