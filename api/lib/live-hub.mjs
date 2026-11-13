/** Even with nobody poking, the list is rechecked this often: a session that stops posting drops off it. */
const RECHECK_MS = 60 * 1000;
/** Refreshes triggered by activity are spread at least this far apart, so a busy server isn't re-queried constantly. */
const MIN_GAP_MS = 10 * 1000;
/** A quick pause before the first refresh after a quiet spell, so several writes in a row become one query. */
const SETTLE_MS = 300;
/** A comment line sent now and then keeps proxies from closing an idle stream. */
const KEEPALIVE_MS = 25 * 1000;

/**
 * Pushes the "grinding now" list to everyone watching it. `load` returns the list; the hub calls it
 * once per refresh (not once per viewer) and sends the result to each subscriber only when it changed.
 * Activity (a session starting, readings arriving, a session ending) calls `poke()`, which schedules
 * a refresh; a slow timer also rechecks, so stale sessions disappear on their own.
 *
 * @param {{ load: () => Promise<unknown[]>, now?: () => number, onError?: (error: unknown) => void }} options
 */
export function createLiveHub({ load, now = Date.now, onError = () => {} }) {
  const subscribers = new Set();
  let snapshot = null; // the last JSON sent
  let pokeTimer = null;
  let recheckTimer = null;
  let keepAliveTimer = null;
  let lastRun = Number.NEGATIVE_INFINITY;

  async function refresh() {
    lastRun = now();
    try {
      const json = JSON.stringify(await load());
      if (json === snapshot) return;
      snapshot = json;
      for (const send of subscribers) send(`data: ${json}\n\n`);
    } catch (error) {
      onError(error);
    }
  }

  function poke() {
    if (subscribers.size === 0 || pokeTimer) return;
    const wait = Math.max(SETTLE_MS, lastRun + MIN_GAP_MS - now());
    pokeTimer = setTimeout(() => {
      pokeTimer = null;
      void refresh();
    }, wait);
    pokeTimer.unref?.();
  }

  function startTimers() {
    recheckTimer = setInterval(() => void refresh(), RECHECK_MS);
    keepAliveTimer = setInterval(() => {
      for (const send of subscribers) send(': keep-alive\n\n');
    }, KEEPALIVE_MS);
    recheckTimer.unref?.();
    keepAliveTimer.unref?.();
  }

  function stopTimers() {
    clearInterval(recheckTimer);
    clearInterval(keepAliveTimer);
    clearTimeout(pokeTimer);
    recheckTimer = keepAliveTimer = pokeTimer = null;
    snapshot = null;
  }

  /** Starts sending to `send` (called with ready-made SSE text); returns the function that stops it. */
  async function subscribe(send) {
    subscribers.add(send);
    if (subscribers.size === 1) startTimers();
    if (snapshot === null) await refresh();
    else send(`data: ${snapshot}\n\n`);
    return () => {
      subscribers.delete(send);
      if (subscribers.size === 0) stopTimers();
    };
  }

  return { subscribe, poke, refresh, size: () => subscribers.size };
}
