import { describe, expect, it } from 'vitest';

import { formatCell } from './dev-db';

describe('formatCell', () => {
  it('shows a dash for missing values', () => {
    expect(formatCell(null)).toBe('—');
    expect(formatCell('')).toBe('—');
  });

  it('groups numbers and leaves text alone', () => {
    expect(formatCell(1234567, 'number')).toBe((1234567).toLocaleString(undefined, { maximumFractionDigits: 2 }));
    expect(formatCell('Victoria Road')).toBe('Victoria Road');
  });

  it('shortens ids to the first 8 characters', () => {
    expect(formatCell('1431ea96-205a-4aea-abd9-5a391e75f7cd', 'id')).toBe('1431ea96');
  });

  it('formats timestamps, and passes through anything that is not a date', () => {
    expect(formatCell('2026-11-09T10:58:00.000Z', 'time')).toBe(new Date('2026-11-09T10:58:00.000Z').toLocaleString());
    expect(formatCell('not a date', 'time')).toBe('not a date');
  });
});
