import { ref } from 'vue';

import { getSession } from '../lib/api';
import { expGainSeries, type ExpGainPoint } from '../lib/metrics';

/**
 * One session's EXP-over-time series, fetched when it is opened and kept so reopening is instant.
 * Only one session is open at a time; opening the open one closes it.
 */
export function useSessionSeries() {
  const openId = ref<string | null>(null);
  const series = ref<Readonly<Record<string, readonly ExpGainPoint[]>>>({});
  const loadingId = ref<string | null>(null);
  const error = ref<string | null>(null);

  async function toggle(id: string): Promise<void> {
    error.value = null;
    if (openId.value === id) {
      openId.value = null;
      return;
    }
    openId.value = id;
    if (series.value[id]) return;
    loadingId.value = id;
    try {
      const detail = await getSession(id);
      series.value = { ...series.value, [id]: expGainSeries(detail.readings) };
    } catch (cause) {
      if (openId.value === id) error.value = (cause as Error).message;
    } finally {
      if (loadingId.value === id) loadingId.value = null;
    }
  }

  return { openId, series, loadingId, error, toggle };
}
