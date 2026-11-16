import { readonly, ref } from 'vue';

import { otherTheme, resolveTheme, saveTheme, type Theme } from '../lib/theme.ts';

const store = typeof localStorage === 'undefined' ? null : localStorage;
const prefersDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

const current = ref<Theme>(resolveTheme(store, prefersDark));

/** Marks a document (the page, or the pop-out window) with the theme the CSS keys off. */
export function applyTheme(doc: Document, theme: Theme): void {
  doc.documentElement.dataset.theme = theme;
}

applyTheme(document, current.value);

export function useTheme() {
  const toggle = (): void => {
    current.value = otherTheme(current.value);
    saveTheme(store, current.value);
    applyTheme(document, current.value);
  };
  return { theme: readonly(current), toggle };
}
