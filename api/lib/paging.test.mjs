import { describe, expect, it } from 'vitest';

import { clampPage, pageCount, parsePage } from './paging.mjs';

describe('parsePage', () => {
  it('defaults to the first page', () => {
    expect(parsePage(undefined)).toEqual({ page: 1 });
    expect(parsePage('')).toEqual({ page: 1 });
  });

  it('reads a whole number', () => {
    expect(parsePage('3')).toEqual({ page: 3 });
  });

  it.each(['0', '-1', '1.5', 'abc', '2e3', '100001', ' 2'])('refuses %j', (raw) => {
    expect(parsePage(raw)).toHaveProperty('error');
  });
});

describe('pageCount', () => {
  it('rounds up and never goes below one page', () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(20, 20)).toBe(1);
    expect(pageCount(21, 20)).toBe(2);
    expect(pageCount(100, 20)).toBe(5);
  });
});

describe('clampPage', () => {
  it('keeps a page that exists and pulls others back in range', () => {
    expect(clampPage(2, 5)).toBe(2);
    expect(clampPage(9, 5)).toBe(5);
    expect(clampPage(0, 5)).toBe(1);
  });
});
