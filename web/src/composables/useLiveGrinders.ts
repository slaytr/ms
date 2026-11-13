import { onBeforeUnmount, onMounted, ref } from 'vue';

import { listLiveGrinders, type LiveGrinder } from '../lib/api';

/** How often the list is refreshed, so everyone sees each other's EXP move. */
export const LIVE_REFRESH_MS = 3 * 60 * 1000;

/**
 * Who is grinding right now, refreshed every few minutes while the page is open. A failed refresh
 * keeps the last list (it is a nicety, not worth an error); the first failure leaves it empty.
 */
export function useLiveGrinders() {
  const grinders = ref<readonly LiveGrinder[]>([]);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh(): Promise<void> {
    try {
      grinders.value = await listLiveGrinders();
    } catch {
      // Keep whatever we last showed; the next refresh tries again.
    }
  }

  onMounted(() => {
    void refresh();
    timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, LIVE_REFRESH_MS);
  });
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
  });

  return { grinders, refresh };
}
