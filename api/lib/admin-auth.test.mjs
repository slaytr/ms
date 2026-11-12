import { describe, expect, it } from 'vitest';

import { isAdminToken } from './admin-auth.mjs';

describe('isAdminToken', () => {
  it('accepts only the exact token', () => {
    expect(isAdminToken('s3cret', 's3cret')).toBe(true);
    expect(isAdminToken('s3cret ', 's3cret')).toBe(false);
    expect(isAdminToken('S3CRET', 's3cret')).toBe(false);
    expect(isAdminToken('', 's3cret')).toBe(false);
  });

  it('stays off when no token is configured', () => {
    expect(isAdminToken('', '')).toBe(false);
    expect(isAdminToken('anything', undefined)).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isAdminToken(undefined, 's3cret')).toBe(false);
    expect(isAdminToken(['s3cret'], 's3cret')).toBe(false);
  });
});
