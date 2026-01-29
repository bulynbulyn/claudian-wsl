import { createMockEl } from '@test/helpers/mockElement';
import { Notice } from 'obsidian';

import type { ImageAttachment } from '@/core/types';
import { ImageContextManager } from '@/features/chat/ui/ImageContext';

jest.mock('obsidian', () => ({
  Notice: jest.fn(),
}));

// Mock document.createElementNS for SVG elements created in setupDragAndDrop
const mockSvgElement = () => {
  const el = createMockEl('svg');
  el.appendChild = jest.fn();
  return el;
};

beforeAll(() => {
  if (typeof globalThis.document === 'undefined') {
    (globalThis as any).document = {};
  }
  (globalThis.document as any).createElementNS = jest.fn(() => mockSvgElement());
});

function createMockCallbacks() {
  return {
    onImagesChanged: jest.fn(),
  };
}

function createContainerWithInputWrapper(): { container: any; inputWrapper: any } {
  const container = createMockEl();
  const inputWrapper = container.createDiv({ cls: 'claudian-input-wrapper' });
  return { container, inputWrapper };
}

function createMockTextArea(): any {
  const el = createMockEl('textarea');
  el.value = '';
  return el;
}

function createImageAttachment(overrides: Partial<ImageAttachment> = {}): ImageAttachment {
  return {
    id: 'img-test-1',
    name: 'test.png',
    mediaType: 'image/png',
    data: 'dGVzdA==',
    size: 1024,
    source: 'paste',
    ...overrides,
  };
}

describe('ImageContextManager', () => {
  let container: any;
  let inputEl: any;
  let callbacks: ReturnType<typeof createMockCallbacks>;
  let manager: ImageContextManager;

  beforeEach(() => {
    jest.clearAllMocks();
    const { container: c } = createContainerWithInputWrapper();
    container = c;
    inputEl = createMockTextArea();
    callbacks = createMockCallbacks();
    manager = new ImageContextManager(container, inputEl, callbacks);
  });

  describe('initial state', () => {
    it('should start with no images', () => {
      expect(manager.hasImages()).toBe(false);
      expect(manager.getAttachedImages()).toEqual([]);
    });
  });

  describe('getAttachedImages', () => {
    it('should return empty array when no images attached', () => {
      expect(manager.getAttachedImages()).toEqual([]);
    });

    it('should return all attached images after setImages', () => {
      const images = [
        createImageAttachment({ id: 'img-1', name: 'a.png' }),
        createImageAttachment({ id: 'img-2', name: 'b.jpg' }),
      ];
      manager.setImages(images);

      const result = manager.getAttachedImages();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('img-1');
      expect(result[1].id).toBe('img-2');
    });
  });

  describe('hasImages', () => {
    it('should return false when no images', () => {
      expect(manager.hasImages()).toBe(false);
    });

    it('should return true after setting images', () => {
      manager.setImages([createImageAttachment()]);
      expect(manager.hasImages()).toBe(true);
    });

    it('should return false after clearing images', () => {
      manager.setImages([createImageAttachment()]);
      manager.clearImages();
      expect(manager.hasImages()).toBe(false);
    });
  });

  describe('clearImages', () => {
    it('should remove all images', () => {
      manager.setImages([
        createImageAttachment({ id: 'img-1' }),
        createImageAttachment({ id: 'img-2' }),
      ]);
      expect(manager.hasImages()).toBe(true);

      manager.clearImages();
      expect(manager.hasImages()).toBe(false);
      expect(manager.getAttachedImages()).toEqual([]);
    });

    it('should invoke onImagesChanged callback', () => {
      manager.setImages([createImageAttachment()]);
      callbacks.onImagesChanged.mockClear();

      manager.clearImages();
      expect(callbacks.onImagesChanged).toHaveBeenCalledTimes(1);
    });
  });

  describe('setImages', () => {
    it('should replace existing images', () => {
      manager.setImages([createImageAttachment({ id: 'old' })]);

      const newImages = [
        createImageAttachment({ id: 'new-1', name: 'new1.png' }),
        createImageAttachment({ id: 'new-2', name: 'new2.jpg' }),
      ];
      manager.setImages(newImages);

      const result = manager.getAttachedImages();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('new-1');
      expect(result[1].id).toBe('new-2');
    });

    it('should invoke onImagesChanged callback', () => {
      manager.setImages([createImageAttachment()]);
      expect(callbacks.onImagesChanged).toHaveBeenCalledTimes(1);
    });

    it('should handle empty array', () => {
      manager.setImages([createImageAttachment()]);
      manager.setImages([]);

      expect(manager.hasImages()).toBe(false);
      expect(manager.getAttachedImages()).toEqual([]);
    });

    it('should deduplicate by id (last wins)', () => {
      const images = [
        createImageAttachment({ id: 'same', name: 'first.png' }),
        createImageAttachment({ id: 'same', name: 'second.png' }),
      ];
      manager.setImages(images);

      const result = manager.getAttachedImages();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('second.png');
    });
  });

  describe('constructor with previewContainerEl', () => {
    it('should use previewContainerEl when provided', () => {
      const previewContainer = createMockEl();
      const { container: c } = createContainerWithInputWrapper();
      const input = createMockTextArea();
      const cb = createMockCallbacks();

      const mgr = new ImageContextManager(c, input, cb, previewContainer);
      // Should not throw and should create image preview in previewContainer
      expect(mgr).toBeDefined();
      // previewContainer should have a child with 'claudian-image-preview' class
      const previewEl = previewContainer.querySelector('.claudian-image-preview');
      expect(previewEl).not.toBeNull();
    });

    it('should insert image preview before file indicator if present', () => {
      const previewContainer = createMockEl();
      const fileIndicator = previewContainer.createDiv({ cls: 'claudian-file-indicator' });
      // Patch parentElement to match check in constructor
      Object.defineProperty(fileIndicator, 'parentElement', { get: () => previewContainer });

      const { container: c } = createContainerWithInputWrapper();
      const input = createMockTextArea();
      const cb = createMockCallbacks();

      new ImageContextManager(c, input, cb, previewContainer);
      // The image preview should have been inserted before the file indicator
      const children = previewContainer.children;
      const fileIndicatorIdx = children.indexOf(fileIndicator);
      const previewIdx = children.findIndex((el: any) => el.hasClass?.('claudian-image-preview'));
      expect(previewIdx).toBeLessThan(fileIndicatorIdx);
    });
  });
});

// Test private helper methods via their observable effects.
// We access privates through any cast, matching the project's pattern.
describe('ImageContextManager - Private Helpers', () => {
  let manager: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const { container } = createContainerWithInputWrapper();
    const inputEl = createMockTextArea();
    const callbacks = createMockCallbacks();
    manager = new ImageContextManager(container, inputEl, callbacks);
  });

  describe('truncateName', () => {
    it('should return name unchanged when short enough', () => {
      expect(manager['truncateName']('test.png', 20)).toBe('test.png');
    });

    it('should truncate long names preserving extension', () => {
      const longName = 'this-is-a-very-long-filename.png';
      const result = manager['truncateName'](longName, 20);
      expect(result.endsWith('.png')).toBe(true);
      expect(result).toContain('...');
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it('should handle name exactly at max length', () => {
      const name = '12345678901234567890'; // 20 chars, no extension
      expect(manager['truncateName'](name, 20)).toBe(name);
    });
  });

  describe('formatSize', () => {
    it('should format bytes', () => {
      expect(manager['formatSize'](500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
      expect(manager['formatSize'](2048)).toBe('2.0 KB');
    });

    it('should format megabytes', () => {
      expect(manager['formatSize'](5 * 1024 * 1024)).toBe('5.0 MB');
    });

    it('should format fractional KB', () => {
      expect(manager['formatSize'](1536)).toBe('1.5 KB');
    });

    it('should format 0 bytes', () => {
      expect(manager['formatSize'](0)).toBe('0 B');
    });
  });

  describe('getMediaType', () => {
    it('should return correct media type for .jpg', () => {
      expect(manager['getMediaType']('photo.jpg')).toBe('image/jpeg');
    });

    it('should return correct media type for .jpeg', () => {
      expect(manager['getMediaType']('photo.jpeg')).toBe('image/jpeg');
    });

    it('should return correct media type for .png', () => {
      expect(manager['getMediaType']('image.png')).toBe('image/png');
    });

    it('should return correct media type for .gif', () => {
      expect(manager['getMediaType']('animation.gif')).toBe('image/gif');
    });

    it('should return correct media type for .webp', () => {
      expect(manager['getMediaType']('photo.webp')).toBe('image/webp');
    });

    it('should return null for unsupported extension', () => {
      expect(manager['getMediaType']('document.pdf')).toBeNull();
    });

    it('should return null for no extension', () => {
      expect(manager['getMediaType']('noextension')).toBeNull();
    });

    it('should handle uppercase extensions', () => {
      expect(manager['getMediaType']('PHOTO.JPG')).toBe('image/jpeg');
    });

    it('should handle mixed case extensions', () => {
      expect(manager['getMediaType']('image.Png')).toBe('image/png');
    });
  });

  describe('isImageFile', () => {
    it('should return true for valid image file', () => {
      const file = { type: 'image/png', name: 'test.png' } as File;
      expect(manager['isImageFile'](file)).toBe(true);
    });

    it('should return false for non-image file', () => {
      const file = { type: 'application/pdf', name: 'doc.pdf' } as File;
      expect(manager['isImageFile'](file)).toBe(false);
    });

    it('should return false for image type but unsupported extension', () => {
      const file = { type: 'image/bmp', name: 'test.bmp' } as File;
      expect(manager['isImageFile'](file)).toBe(false);
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = manager['generateId']();
      const id2 = manager['generateId']();
      expect(id1).not.toBe(id2);
    });

    it('should start with img- prefix', () => {
      const id = manager['generateId']();
      expect(id.startsWith('img-')).toBe(true);
    });
  });

  describe('notifyImageError', () => {
    it('should create a Notice with the message', () => {
      manager['notifyImageError']('Test error');
      expect(Notice).toHaveBeenCalledWith('Test error');
    });

    it('should append file not found for ENOENT error', () => {
      const error = new Error('ENOENT: no such file or directory');
      manager['notifyImageError']('Failed to load image.', error);
      expect(Notice).toHaveBeenCalledWith('Failed to load image. (File not found)');
    });

    it('should append permission denied for EACCES error', () => {
      const error = new Error('EACCES: permission denied');
      manager['notifyImageError']('Failed to load image.', error);
      expect(Notice).toHaveBeenCalledWith('Failed to load image. (Permission denied)');
    });

    it('should use original message for non-Error objects', () => {
      manager['notifyImageError']('Test error', 'not an error object');
      expect(Notice).toHaveBeenCalledWith('Test error');
    });

    it('should use original message for errors without recognized patterns', () => {
      const error = new Error('Some other error');
      manager['notifyImageError']('Test error', error);
      expect(Notice).toHaveBeenCalledWith('Test error');
    });
  });

  describe('addImageFromFile', () => {
    it('should reject files exceeding size limit', async () => {
      const file = {
        name: 'huge.png',
        type: 'image/png',
        size: 6 * 1024 * 1024, // 6MB > 5MB limit
        arrayBuffer: jest.fn(),
      } as unknown as File;

      const result = await manager['addImageFromFile'](file, 'paste');
      expect(result).toBe(false);
      expect(Notice).toHaveBeenCalledWith(expect.stringContaining('limit'));
    });

    it('should reject files with unsupported media type', async () => {
      const file = {
        name: 'test.bmp',
        type: '',
        size: 1024,
        arrayBuffer: jest.fn(),
      } as unknown as File;

      const result = await manager['addImageFromFile'](file, 'drop');
      expect(result).toBe(false);
      expect(Notice).toHaveBeenCalledWith('Unsupported image type.');
    });

    it('should add valid image file and invoke callback', async () => {
      const mockBuffer = new ArrayBuffer(4);
      const file = {
        name: 'test.png',
        type: 'image/png',
        size: 1024,
        arrayBuffer: jest.fn().mockResolvedValue(mockBuffer),
      } as unknown as File;

      const callbacks = createMockCallbacks();
      const { container } = createContainerWithInputWrapper();
      const inputEl = createMockTextArea();
      const mgr: any = new ImageContextManager(container, inputEl, callbacks);

      const result = await mgr['addImageFromFile'](file, 'paste');
      expect(result).toBe(true);
      expect(mgr.hasImages()).toBe(true);
      expect(callbacks.onImagesChanged).toHaveBeenCalled();

      const images = mgr.getAttachedImages();
      expect(images).toHaveLength(1);
      expect(images[0].name).toBe('test.png');
      expect(images[0].mediaType).toBe('image/png');
      expect(images[0].size).toBe(1024);
      expect(images[0].source).toBe('paste');
    });

    it('should handle arrayBuffer failure gracefully', async () => {
      const file = {
        name: 'test.png',
        type: 'image/png',
        size: 1024,
        arrayBuffer: jest.fn().mockRejectedValue(new Error('Read failed')),
      } as unknown as File;

      const result = await manager['addImageFromFile'](file, 'drop');
      expect(result).toBe(false);
      expect(Notice).toHaveBeenCalledWith('Failed to attach image.');
    });

    it('should generate default name when file has no name', async () => {
      const mockBuffer = new ArrayBuffer(4);
      const file = {
        name: '',
        type: 'image/png',
        size: 512,
        arrayBuffer: jest.fn().mockResolvedValue(mockBuffer),
      } as unknown as File;

      const callbacks = createMockCallbacks();
      const { container } = createContainerWithInputWrapper();
      const inputEl = createMockTextArea();
      const mgr: any = new ImageContextManager(container, inputEl, callbacks);

      await mgr['addImageFromFile'](file, 'paste');
      const images = mgr.getAttachedImages();
      expect(images[0].name).toMatch(/^image-\d+\.png$/);
    });

    it('should use file.type as fallback media type when getMediaType returns null', async () => {
      const mockBuffer = new ArrayBuffer(4);
      // File with .svg extension (not in IMAGE_EXTENSIONS), but valid image/* type
      const file = {
        name: 'icon.svg',
        type: 'image/svg+xml',
        size: 512,
        arrayBuffer: jest.fn().mockResolvedValue(mockBuffer),
      } as unknown as File;

      // The getMediaType for .svg returns null, so file.type is used as fallback
      const callbacks = createMockCallbacks();
      const { container } = createContainerWithInputWrapper();
      const inputEl = createMockTextArea();
      const mgr: any = new ImageContextManager(container, inputEl, callbacks);

      const result = await mgr['addImageFromFile'](file, 'paste');
      expect(result).toBe(true);

      const images = mgr.getAttachedImages();
      expect(images[0].mediaType).toBe('image/svg+xml');
    });
  });

  describe('fileToBase64', () => {
    it('should convert file to base64 string', async () => {
      const textEncoder = new TextEncoder();
      const bytes = textEncoder.encode('hello');
      const mockBuffer = bytes.buffer;
      const file = {
        arrayBuffer: jest.fn().mockResolvedValue(mockBuffer),
      } as unknown as File;

      const result = await manager['fileToBase64'](file);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      // Verify it's valid base64
      const decoded = Buffer.from(result, 'base64').toString();
      expect(decoded).toBe('hello');
    });
  });
});
