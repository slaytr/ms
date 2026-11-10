import { describe, expect, it } from 'vitest';

import { createTtlCache } from './ttl-cache';

/** A loader that counts how often it was really called, and a clock the test moves by hand. */
function setup(ttlMs = 60_000) {
  let clock = 1_000;
  let calls = 0;
  const cache = createTtlCache<string>(ttlMs, () => clock);
  const load = async () => `value ${++calls}`;
  return { cache, load, advance: (ms: number) => (clock += ms), calls: () => calls };
}

describe('createTtlCache', () => {
  it('loads once, then serves the saved value until the TTL passes', async () => {
    const { cache, load, advance, calls } = setup();
    expect(await cache.get(load)).toBe('value 1');
    advance(59_999);
    expect(await cache.get(load)).toBe('value 1');
    expect(calls()).toBe(1);
  });

  it('loads again once the TTL has passed', async () => {
    const { cache, load, advance, calls } = setup();
    await cache.get(load);
    advance(60_000);
    expect(await cache.get(load)).toBe('value 2');
    expect(calls()).toBe(2);
  });

  it('shares one request between callers that arrive while it is in flight', async () => {
    const { cache, calls } = setup();
    let release: (value: string) => void = () => undefined;
    const slow = () => new Promise<string>((resolve) => (release = resolve));
    const first = cache.get(slow);
    const second = cache.get(async () => `value ${calls() + 99}`);
    release('shared');
    expect(await first).toBe('shared');
    expect(await second).toBe('shared');
  });

  it('does not keep a failure: the next call tries again', async () => {
    const { cache, load, calls } = setup();
    await expect(cache.get(async () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    expect(await cache.get(load)).toBe('value 1');
    expect(calls()).toBe(1);
  });

  it('counts the TTL from when the data arrived, not when it was asked for', async () => {
    let clock = 0;
    const cache = createTtlCache<string>(1_000, () => clock);
    await cache.get(async () => {
      clock += 800; // the request itself takes 800ms
      return 'slow';
    });
    clock += 900; // 900ms after it arrived, 1,700ms after it was asked for
    expect(await cache.get(async () => 'fresh')).toBe('slow');
  });

  it('clear() forces a reload', async () => {
    const { cache, load } = setup();
    await cache.get(load);
    cache.clear();
    expect(await cache.get(load)).toBe('value 2');
  });
});
