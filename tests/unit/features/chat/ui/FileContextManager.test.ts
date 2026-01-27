import { createMockEl, type MockElement } from '@test/helpers/mockElement';
import type { TFile } from 'obsidian';

import type { FileContextCallbacks } from '@/features/chat/ui/FileContext';
import { FileContextManager } from '@/features/chat/ui/FileContext';
import type { ExternalContextFile } from '@/utils/externalContextScanner';

jest.mock('obsidian', () => ({
  setIcon: jest.fn(),
  Notice: jest.fn(),
}));

function createMockTFile(path: string): TFile {
  return {
    path,
    name: path.split('/').pop() || path,
    stat: { mtime: Date.now(), ctime: Date.now(), size: 0 },
  } as TFile;
}

let mockVaultPath = '/vault';
jest.mock('@/utils/path', () => {
  const actual = jest.requireActual('@/utils/path');
  return {
    ...actual,
    getVaultPath: jest.fn(() => mockVaultPath),
    isPathWithinVault: jest.fn((candidatePath: string, vaultPath: string) => {
      if (!candidatePath) return false;
      if (!candidatePath.startsWith('/')) return true;
      return candidatePath.startsWith(vaultPath);
    }),
  };
});

const mockScanPaths = jest.fn<ExternalContextFile[], [string[]]>(() => []);
jest.mock('@/utils/externalContextScanner', () => ({
  externalContextScanner: {
    scanPaths: (paths: string[]) => mockScanPaths(paths),
  },
}));


function findByClass(root: MockElement, className: string): MockElement | undefined {
  if (root.hasClass(className)) return root;
  for (const child of root.children) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return undefined;
}

function findAllByClass(root: MockElement, className: string): MockElement[] {
  const results: MockElement[] = [];
  const walk = (node: MockElement) => {
    if (node.hasClass(className)) {
      results.push(node);
    }
    node.children.forEach(walk);
  };
  walk(root);
  return results;
}

function createMockApp(options: {
  files?: string[];
  activeFilePath?: string | null;
  fileCacheByPath?: Map<string, any>;
} = {}) {
  const { files = [], activeFilePath = null, fileCacheByPath = new Map() } = options;
  const fileMap = new Map<string, TFile>();
  files.forEach((filePath) => {
    fileMap.set(filePath, createMockTFile(filePath));
  });

  return {
    vault: {
      on: jest.fn(() => ({ id: 'event-ref' })),
      offref: jest.fn(),
      getAbstractFileByPath: jest.fn((filePath: string) => fileMap.get(filePath) || null),
      getMarkdownFiles: jest.fn(() => Array.from(fileMap.values())),
    },
    workspace: {
      getActiveFile: jest.fn(() => {
        if (!activeFilePath) return null;
        return fileMap.get(activeFilePath) || createMockTFile(activeFilePath);
      }),
      getLeaf: jest.fn(() => ({
        openFile: jest.fn().mockResolvedValue(undefined),
      })),
    },
    metadataCache: {
      getFileCache: jest.fn((file: TFile) => fileCacheByPath.get(file.path) || null),
    },
  } as any;
}

function createMockCallbacks(options: {
  externalContexts?: string[];
  excludedTags?: string[];
} = {}): FileContextCallbacks {
  const { externalContexts = [], excludedTags = [] } = options;
  return {
    getExcludedTags: jest.fn(() => excludedTags),
    getExternalContexts: jest.fn(() => externalContexts),
  };
}

describe('FileContextManager', () => {
  let containerEl: MockElement;
  let inputEl: HTMLTextAreaElement;

  beforeEach(() => {
    jest.clearAllMocks();
    mockVaultPath = '/vault';
    mockScanPaths.mockReturnValue([]);
    containerEl = createMockEl();
    inputEl = {
      value: '',
      selectionStart: 0,
      selectionEnd: 0,
      focus: jest.fn(),
    } as unknown as HTMLTextAreaElement;
  });

  it('tracks current note send state per session', () => {
    const app = createMockApp();
    const manager = new FileContextManager(
      app,
      containerEl as any,
      inputEl,
      createMockCallbacks()
    );

    manager.setCurrentNote('notes/alpha.md');
    expect(manager.shouldSendCurrentNote()).toBe(true);
    manager.markCurrentNoteSent();
    expect(manager.shouldSendCurrentNote()).toBe(false);

    manager.resetForLoadedConversation(true);
    manager.setCurrentNote('notes/alpha.md');
    expect(manager.shouldSendCurrentNote()).toBe(false);

    manager.resetForLoadedConversation(false);
    manager.setCurrentNote('notes/beta.md');
    expect(manager.shouldSendCurrentNote()).toBe(true);

    manager.destroy();
  });

  it('should NOT resend current note when loading conversation with existing messages', () => {
    const app = createMockApp();
    const manager = new FileContextManager(
      app,
      containerEl as any,
      inputEl,
      createMockCallbacks()
    );

    // When loading a conversation that already has messages, the current note
    // should be marked as already sent to avoid re-sending context
    manager.resetForLoadedConversation(true);
    manager.setCurrentNote('notes/restored.md');
    expect(manager.shouldSendCurrentNote()).toBe(false);

    manager.destroy();
  });

  it('should send current note when loading empty conversation', () => {
    const app = createMockApp();
    const manager = new FileContextManager(
      app,
      containerEl as any,
      inputEl,
      createMockCallbacks()
    );

    // When loading a conversation with no messages, the current note
    // should be sent with the first message
    manager.resetForLoadedConversation(false);
    manager.setCurrentNote('notes/new.md');
    expect(manager.shouldSendCurrentNote()).toBe(true);

    manager.destroy();
  });

  it('renders current note chip and removes on click', () => {
    const app = createMockApp();
    const manager = new FileContextManager(
      app,
      containerEl as any,
      inputEl,
      createMockCallbacks()
    );

    manager.setCurrentNote('notes/chip.md');

    const indicator = findByClass(containerEl, 'claudian-file-indicator');
    expect(indicator).toBeDefined();
    expect(indicator?.style.display).toBe('flex');

    const removeEl = findByClass(containerEl, 'claudian-file-chip-remove');
    expect(removeEl).toBeDefined();

    removeEl!.click();

    expect(manager.getCurrentNotePath()).toBeNull();
    expect(indicator?.style.display).toBe('none');

    manager.destroy();
  });

  it('auto-attaches active file unless excluded by tag', () => {
    const fileCacheByPath = new Map<string, any>([
      ['notes/private.md', { frontmatter: { tags: ['private'] } }],
    ]);
    const app = createMockApp({
      files: ['notes/private.md', 'notes/public.md'],
      activeFilePath: 'notes/private.md',
      fileCacheByPath,
    });

    const manager = new FileContextManager(
      app,
      containerEl as any,
      inputEl,
      createMockCallbacks({ excludedTags: ['private'] })
    );

    manager.autoAttachActiveFile();
    expect(manager.getCurrentNotePath()).toBeNull();

    app.workspace.getActiveFile = jest.fn(() => createMockTFile('notes/public.md'));
    manager.autoAttachActiveFile();
    expect(manager.getCurrentNotePath()).toBe('notes/public.md');

    manager.destroy();
  });

  it('shows vault-relative path in @ dropdown and inserts full path on selection', () => {
    const app = createMockApp({
      files: ['clipping/file.md'],
    });
    const manager = new FileContextManager(
      app,
      containerEl as any,
      inputEl,
      createMockCallbacks()
    );

    inputEl.value = '@file';
    inputEl.selectionStart = 5;
    inputEl.selectionEnd = 5;
    manager.handleInputChange();

    const pathEl = findByClass(containerEl, 'claudian-mention-path');
    expect(pathEl?.textContent).toBe('clipping/file.md');

    manager.handleMentionKeydown({ key: 'Enter', preventDefault: jest.fn() } as any);

    // Now inserts full vault-relative path (WYSIWYG)
    expect(inputEl.value).toBe('@clipping/file.md ');
    const attached = manager.getAttachedFiles();
    expect(attached.has('clipping/file.md')).toBe(true);

    manager.destroy();
  });

  it('filters context files and attaches absolute path', () => {
    const app = createMockApp();
    const manager = new FileContextManager(
      app,
      containerEl as any,
      inputEl,
      createMockCallbacks({ externalContexts: ['/external'] })
    );

    const contextFiles: ExternalContextFile[] = [
      {
        path: '/external/src/app.md',
        name: 'app.md',
        relativePath: 'src/app.md',
        contextRoot: '/external',
        mtime: 1000,
      },
    ];
    mockScanPaths.mockReturnValue(contextFiles);

    inputEl.value = '@external/app';
    inputEl.selectionStart = 13;
    inputEl.selectionEnd = 13;
    manager.handleInputChange();

    const nameEls = findAllByClass(containerEl, 'claudian-mention-name-context');
    expect(nameEls[0]?.textContent).toBe('src/app.md');

    manager.handleMentionKeydown({ key: 'Enter', preventDefault: jest.fn() } as any);

    // Display shows friendly name, but state stores mapping to absolute path
    expect(inputEl.value).toBe('@external/src/app.md ');
    const attached = manager.getAttachedFiles();
    expect(attached.has('/external/src/app.md')).toBe(true);
    // Check transformation works
    const transformed = manager.transformContextMentions('@external/src/app.md');
    expect(transformed).toBe('/external/src/app.md');

    manager.destroy();
  });
});
