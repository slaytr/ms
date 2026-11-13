import { onBeforeUnmount, onMounted, ref } from 'vue';

import { listLiveGrinders, type LiveGrinder } from '../lib/api';

/** Safety net: even if the live stream is down, the list is refetched this often. */
export const LIVE_REFRESH_MS = 3 * 60 * 1000;

/**
 * Who is grinding right now. The server pushes the list over a stream whenever it changes (a session
 * starts, gains EXP or stops), so it updates without a refresh. A slow poll covers a stream that
 * can't connect. A failed fetch keeps the last list (it is a nicety, not worth an error).
 */
export function useLiveGrinders() {
  const grinders = ref<readonly LiveGrinder[]>([]);
  let timer: ReturnType<typeof setInterval> | null = null;
  let stream: EventSource | null = null;

  async function refresh(): Promise<void> {
    try {
      grinders.value = await listLiveGrinders();
    } catch {
      // Keep whatever we last showed; the next refresh tries again.
    }
  }

  function listen(): void {
    if (typeof EventSource === 'undefined') return;
    stream = new EventSource('/api/live/stream');
    stream.onmessage = (event: MessageEvent<string>) => {
      try {
        grinders.value = JSON.parse(event.data) as LiveGrinder[];
      } catch {
        // A garbled message is ignored; the next one replaces it.
      }
    };
    // On an error the browser reconnects by itself, and the poll below fills any gap.
  }

  onMounted(() => {
    void refresh();
    listen();
    timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, LIVE_REFRESH_MS);
  });
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
    stream?.close();
  });

  return { grinders, refresh };
}
