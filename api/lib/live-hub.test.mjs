import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLiveHub } from './live-hub.mjs';

describe('createLiveHub', () => {
  let list;
  let load;

  beforeEach(() => {
    vi.useFakeTimers();
    list = [{ id: 'a' }];
    load = vi.fn(async () => list);
  });
  afterEach(() => vi.useRealTimers());

  const hubWith = () => createLiveHub({ load, now: () => Date.now() });

  it('sends the current list to a new subscriber', async () => {
    const hub = hubWith();
    const sent = [];
    await hub.subscribe((text) => sent.push(text));
    expect(sent).toEqual([`data: ${JSON.stringify([{ id: 'a' }])}\n\n`]);
  });

  it('gives a second subscriber the saved list without loading again', async () => {
    const hub = hubWith();
    await hub.subscribe(() => {});
    const sent = [];
    await hub.subscribe((text) => sent.push(text));
    expect(load).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);
  });

  it('pushes a change shortly after activity, and only when the list changed', async () => {
    const hub = hubWith();
    const sent = [];
    await hub.subscribe((text) => sent.push(text));

    hub.poke();
    await vi.advanceTimersByTimeAsync(400);
    expect(sent).toHaveLength(1); // nothing changed: nothing sent

    list = [{ id: 'a' }, { id: 'b' }];
    hub.poke();
    await vi.advanceTimersByTimeAsync(10_500);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toContain('"b"');
  });

  it('turns a burst of activity into one refresh', async () => {
    const hub = hubWith();
    await hub.subscribe(() => {});
    load.mockClear();
    await vi.advanceTimersByTimeAsync(11_000);
    load.mockClear();
    for (let i = 0; i < 20; i++) hub.poke();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('rechecks on its own so a stale session drops off', async () => {
    const hub = hubWith();
    const sent = [];
    await hub.subscribe((text) => sent.push(text));
    list = [];
    await vi.advanceTimersByTimeAsync(61_000);
    expect(sent.at(-1)).toBe('data: []\n\n');
  });

  it('stops everything when the last subscriber leaves', async () => {
    const hub = hubWith();
    const stop = await hub.subscribe(() => {});
    stop();
    load.mockClear();
    hub.poke();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(load).not.toHaveBeenCalled();
    expect(hub.size()).toBe(0);
  });

  it('keeps going when a refresh fails', async () => {
    const errors = [];
    const hub = createLiveHub({ load, now: () => Date.now(), onError: (e) => errors.push(e) });
    const sent = [];
    await hub.subscribe((text) => sent.push(text));
    load.mockRejectedValueOnce(new Error('db down'));
    await vi.advanceTimersByTimeAsync(61_000);
    expect(errors).toHaveLength(1);
    list = [{ id: 'z' }];
    await vi.advanceTimersByTimeAsync(61_000);
    expect(sent.at(-1)).toContain('"z"');
  });
});
