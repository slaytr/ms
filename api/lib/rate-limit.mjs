/**
 * A small in-memory sliding-window limiter: at most `limit` hits per `windowMs` for each key.
 * State lives in this process only, which is fine for a single service; it resets on restart.
 */
export function createLimiter({ limit, windowMs, now = Date.now }) {
  const hits = new Map();
  return {
    /** Records a hit and returns true, or returns false (without recording) when the key is over its limit. */
    allow(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((at) => t - at < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      hits.set(key, [...recent, t]);
      return true;
    },
  };
}
