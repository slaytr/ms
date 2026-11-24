import { describe, expect, it } from 'vitest';

import { noSwitch, observeFingerprint, SWITCH_AFTER_TICKS } from './character-switch';

const feed = (session: string | null, seen: readonly (string | null)[]) =>
  seen.reduce(
    (acc, fp) => {
      const step = observeFingerprint(acc.state, session, fp);
      return { state: step.state, switched: acc.switched || step.switched, last: step };
    },
    { state: noSwitch, switched: false, last: null as ReturnType<typeof observeFingerprint> | null },
  );

describe('observeFingerprint', () => {
  it('never switches while the session has no fingerprint yet', () => {
    expect(feed(null, ['b', 'b', 'b', 'b']).switched).toBe(false);
  });

  it('ignores the session own character and unreadable names', () => {
    expect(feed('a', ['a', null, 'a', null, null, null, null]).switched).toBe(false);
  });

  it('switches once another fingerprint is read several ticks in a row', () => {
    const seen = Array.from({ length: SWITCH_AFTER_TICKS }, () => 'b');
    const result = feed('a', seen);
    expect(result.switched).toBe(true);
    expect(result.last?.fingerprint).toBe('b');
  });

  it('does not switch on a single stray read', () => {
    expect(feed('a', ['b', 'a', 'b', 'a', 'b', 'a']).switched).toBe(false);
  });

  it('an unreadable tick between reads of the new character does not reset the count', () => {
    const seen = ['b', null, ...Array.from({ length: SWITCH_AFTER_TICKS - 1 }, () => 'b')];
    expect(feed('a', seen).switched).toBe(true);
  });

  it('switching to a third character restarts the count', () => {
    const seen = ['b', 'b', 'c', 'c'];
    expect(feed('a', seen).switched).toBe(false);
  });

  it('reports the new fingerprint only on the tick it switches', () => {
    const seen = Array.from({ length: SWITCH_AFTER_TICKS }, () => 'b');
    const done = feed('a', seen);
    const next = observeFingerprint(done.state, 'b', 'b');
    expect(next.switched).toBe(false);
  });
});
