/** A one-value cache that remembers what a loader returned for a while. */
export interface TtlCache<T> {
  /** The saved value if it is still fresh, otherwise the result of `load` (saved for next time). */
  get(load: () => Promise<T>): Promise<T>;
  /** Forgets the saved value, so the next `get` loads again. */
  clear(): void;
}

/**
 * Remembers the last successful result of a loader for `ttlMs`, counted from when it arrived. Callers
 * that ask while a request is already running share it instead of starting another. A failed load is
 * never kept, so the next call simply tries again. `now` is injectable for tests.
 */
export function createTtlCache<T>(ttlMs: number, now: () => number = Date.now): TtlCache<T> {
  let saved: { readonly value: T; readonly at: number } | null = null;
  let inFlight: Promise<T> | null = null;

  return {
    get(load) {
      if (saved !== null && now() - saved.at < ttlMs) return Promise.resolve(saved.value);
      if (inFlight !== null) return inFlight;

      const request = load().then(
        (value) => {
          saved = { value, at: now() };
          inFlight = null;
          return value;
        },
        (error: unknown) => {
          inFlight = null;
          throw error;
        },
      );
      inFlight = request;
      return request;
    },
    clear() {
      saved = null;
    },
  };
}

/** Several `TtlCache`s sharing one TTL, told apart by a key (e.g. one per page of a list). */
export interface KeyedTtlCache<T> {
  /** The saved value for `key` if it is still fresh, otherwise the result of `load` (saved under that key). */
  get(key: string, load: () => Promise<T>): Promise<T>;
  /** Forgets every key. */
  clear(): void;
}

export function createKeyedTtlCache<T>(ttlMs: number, now: () => number = Date.now): KeyedTtlCache<T> {
  const caches = new Map<string, TtlCache<T>>();
  return {
    get(key, load) {
      const cache = caches.get(key) ?? createTtlCache<T>(ttlMs, now);
      caches.set(key, cache);
      return cache.get(load);
    },
    clear() {
      caches.forEach((cache) => cache.clear());
    },
  };
}
