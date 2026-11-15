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
 * Initial size of the pop-out. With no header bar and the stats in two rows of three, the overlay
 * needs roughly 320px of height at this width in its tallest state (map name showing, still
 * calculating, with the "open your inventory" note), so 350 leaves headroom for font differences and
 * avoids a scrollbar. The player can still resize it.
 */
const DEFAULT_SIZE = { width: 300, height: 350 };

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
 * Keeps the pop-out exactly as tall as its contents: the overlay stops stretching to the window
 * (`--pip-min-height`), and the window follows the content whenever it grows or shrinks (a note
 * appearing, the map name showing, a narrower window wrapping text). Returns a function that stops it.
 * Browsers may refuse a resize (minimum window size, or no user gesture), in which case the window
 * just stays as it is.
 */
function fitHeightToContent(win: Window, mount: HTMLElement): () => void {
  win.document.documentElement.style.setProperty('--pip-min-height', '0px');
  win.document.body.style.background = '#fff6dc';
  let lastHeight = 0;
  const fit = (): void => {
    const height = Math.ceil(mount.getBoundingClientRect().height);
    if (height <= 0 || height === lastHeight) return;
    lastHeight = height;
    try {
      win.resizeTo(win.outerWidth, height + (win.outerHeight - win.innerHeight));
    } catch {
      // Resizing is a nicety; the pop-out works at whatever size the browser allowed.
    }
  };
  const Observer = (win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  if (!Observer) return () => undefined;
  const observer = new Observer(fit);
  observer.observe(mount);
  return () => observer.disconnect();
}

/**
 * Opens a pop-out window and exposes an element inside it to `<Teleport>` into, so one Vue app
 * (and one set of reactive state) drives both the page and the overlay. Prefers the always-on-top
 * Picture-in-Picture window; falls back to a plain popup where that isn't available.
 */
export function usePopOut(title: string, options: { fitHeight?: boolean } = {}) {
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
      // Ask again for the size: the browser may have opened the window larger than requested. It can
      // still refuse (there is a minimum window size), in which case the window just stays as it is.
      try {
        win.resizeTo(
          size.width + (win.outerWidth - win.innerWidth),
          size.height + (win.outerHeight - win.innerHeight),
        );
      } catch {
        // Resizing is a nicety; the pop-out works at whatever size the browser allowed.
      }
      const stopFitting = options.fitHeight ? fitHeightToContent(win, mount) : () => undefined;
      win.addEventListener('pagehide', () => {
        stopFitting();
        release();
      });
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
