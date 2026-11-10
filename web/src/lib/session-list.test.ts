import { describe, expect, it } from 'vitest';

import { levelRange, sessionDurationMs, sessionTitle } from './session-list';

const base = { startedAt: '2026-11-10T10:00:00Z', endedAt: null, lastReadingAt: null };

describe('sessionTitle', () => {
  it('uses the label, or a fallback when it is blank', () => {
    expect(sessionTitle({ label: ' Victoria Road: Tree Dungeon ' })).toBe('Victoria Road: Tree Dungeon');
    expect(sessionTitle({ label: '   ' })).toBe('Untitled session');
  });
});

describe('sessionDurationMs', () => {
  it('measures to the end time when the session was stopped', () => {
    expect(sessionDurationMs({ ...base, endedAt: '2026-11-10T11:00:00Z', lastReadingAt: '2026-11-10T10:30:00Z' })).toBe(3_600_000);
  });

  it('falls back to the last reading when the tab was closed without Stop', () => {
    expect(sessionDurationMs({ ...base, lastReadingAt: '2026-11-10T10:30:00Z' })).toBe(1_800_000);
  });

  it('is null when nothing says when it ended, or the times make no sense', () => {
    expect(sessionDurationMs(base)).toBeNull();
    expect(sessionDurationMs({ ...base, endedAt: '2026-11-10T09:00:00Z' })).toBeNull();
  });
});

describe('levelRange', () => {
  it('shows one level, a range, or nothing', () => {
    expect(levelRange({ startLevel: 49, endLevel: 49 })).toBe('Lv 49');
    expect(levelRange({ startLevel: 49, endLevel: null })).toBe('Lv 49');
    expect(levelRange({ startLevel: 49, endLevel: 50 })).toBe('Lv 49 to 50');
    expect(levelRange({ startLevel: null, endLevel: 50 })).toBe('Lv 50');
    expect(levelRange({ startLevel: null, endLevel: null })).toBeNull();
  });
});
