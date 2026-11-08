import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';

/** Chrome/Edge's Document Picture-in-Picture: a small always-on-top window that can hold real HTML. */
interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

/**
 * Initial size of the pop-out. The overlay needs about 416px of height at this width in its tallest
 * state (map name showing, still calculating, with the "open your inventory" note), so 450 leaves
 * headroom for font differences and avoids a scrollbar. The player can still resize it.
 */
const DEFAULT_SIZE = { width: 300, height: 450 };

/** Copies the page's styles into the pop-out, which starts as an empty document. */
function copyStyles(target: Window): void {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('');
      const style = target.document.createElement('style');
      style.textContent = css;
      target.document.head.appendChild(style);
    } catch {
      // Cross-origin sheets (Google Fonts) can't be read; link them instead.
      if (!sheet.href) continue;
      const link = target.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      target.document.head.appendChild(link);
    }
  }
}

/**
 * Opens a pop-out window and exposes an element inside it to `<Teleport>` into, so one Vue app
 * (and one set of reactive state) drives both the page and the overlay. Prefers the always-on-top
 * Picture-in-Picture window; falls back to a plain popup where that isn't available.
 */
export function usePopOut(title: string) {
  const target = shallowRef<HTMLElement | null>(null);
  const popWindow = shallowRef<Window | null>(null);
  const error = ref<string | null>(null);

  const staysOnTop = typeof window !== 'undefined' && window.documentPictureInPicture !== undefined;
  const isOpen = computed(() => popWindow.value !== null);

  function release(): void {
    popWindow.value = null;
    target.value = null;
  }

  /** Must be called straight from a click: browsers only allow opening a window from a user gesture. */
  async function open(size: { width: number; height: number } = DEFAULT_SIZE): Promise<void> {
    if (popWindow.value) return;
    error.value = null;
    try {
      const win = window.documentPictureInPicture
        ? await window.documentPictureInPicture.requestWindow(size)
        : window.open('', 'maple-tracker', `popup=yes,width=${size.width},height=${size.height}`);
      if (!win) {
        error.value = 'Your browser blocked the pop-out. Allow pop-ups for this site and try again.';
        return;
      }
      copyStyles(win);
      win.document.title = title;
      win.document.body.style.margin = '0';
      const mount = win.document.createElement('div');
      win.document.body.appendChild(mount);
      win.addEventListener('pagehide', release);
      popWindow.value = win;
      target.value = mount;
    } catch (cause) {
      error.value = `Could not open the pop-out: ${(cause as Error).message}`;
    }
  }

  function close(): void {
    const win = popWindow.value;
    release();
    win?.close();
  }

  onBeforeUnmount(close);

  return { target, isOpen, staysOnTop, error, open, close };
}
