export interface ScheduledAnimationFrame {
  kind: 'raf' | 'timeout';
  id: number | ReturnType<typeof setTimeout>;
}

export function scheduleAnimationFrame(callback: () => void): ScheduledAnimationFrame {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    return {
      kind: 'raf',
      id: globalThis.requestAnimationFrame(() => callback()),
    };
  }

  return {
    kind: 'timeout',
    id: globalThis.setTimeout(callback, 16),
  };
}

export function cancelScheduledAnimationFrame(frame: ScheduledAnimationFrame): void {
  if (frame.kind === 'raf' && typeof globalThis.cancelAnimationFrame === 'function') {
    globalThis.cancelAnimationFrame(frame.id as number);
    return;
  }

  globalThis.clearTimeout(frame.id as ReturnType<typeof setTimeout>);
}
