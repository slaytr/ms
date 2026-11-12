import { describe, expect, it } from 'vitest';

import { isAdminUser } from './admin-auth.mjs';

describe('isAdminUser', () => {
  it('accepts the admin character, ignoring case and spaces', () => {
    expect(isAdminUser('PayYoBills')).toBe(true);
    expect(isAdminUser(' payyobills ')).toBe(true);
  });

  it('rejects everyone else', () => {
    expect(isAdminUser('PayYoBill')).toBe(false);
    expect(isAdminUser('')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isAdminUser(undefined)).toBe(false);
    expect(isAdminUser(['PayYoBills'])).toBe(false);
  });
});
