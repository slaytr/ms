export type Theme = 'light' | 'dark';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

const STORAGE_KEY = 'maple-metrics:theme';

/** The saved choice, else the system preference. Storage that throws (private mode) counts as empty. */
export function resolveTheme(store: KeyValueStore | null, systemPrefersDark: boolean): Theme {
  try {
    const saved = store?.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // fall through to the system preference
  }
  return systemPrefersDark ? 'dark' : 'light';
}

export function saveTheme(store: KeyValueStore | null, theme: Theme): void {
  try {
    store?.setItem(STORAGE_KEY, theme);
  } catch {
    // the choice just won't survive a reload
  }
}

export function otherTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}
