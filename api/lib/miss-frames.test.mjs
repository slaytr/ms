import { describe, expect, it } from 'vitest';

import { readPngSize } from './png.mjs';
import { createLimiter } from './rate-limit.mjs';
import { missSignature } from './signature.mjs';

/** The first 24 bytes of a PNG: signature, then an IHDR chunk header carrying width and height. */
function pngHeader(width, height) {
  const header = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

describe('readPngSize', () => {
  it('reads the size from a real PNG header', () => {
    expect(readPngSize(pngHeader(1368, 800))).toEqual({ width: 1368, height: 800 });
  });

  it('rejects anything that is not a PNG, or is too short to be one', () => {
    expect(readPngSize(Buffer.from('not a png, just text that is long enough'))).toBeNull();
    expect(readPngSize(pngHeader(1, 1).subarray(0, 10))).toBeNull();
    expect(readPngSize('a string')).toBeNull();
  });

  it('rejects a PNG signature whose first chunk is not IHDR', () => {
    const header = pngHeader(10, 10);
    header.write('IDAT', 12, 'ascii');
    expect(readPngSize(header)).toBeNull();
  });
});

describe('createLimiter', () => {
  it('allows up to the limit within the window, then refuses', () => {
    let now = 0;
    const limiter = createLimiter({ limit: 2, windowMs: 1000, now: () => now });
    expect([limiter.allow('a'), limiter.allow('a'), limiter.allow('a')]).toEqual([true, true, false]);
  });

  it('frees a slot once the oldest hit leaves the window, and counts each key separately', () => {
    let now = 0;
    const limiter = createLimiter({ limit: 1, windowMs: 1000, now: () => now });
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('b')).toBe(true);
    expect(limiter.allow('a')).toBe(false);
    now = 1001;
    expect(limiter.allow('a')).toBe(true);
  });
});

describe('missSignature', () => {
  const detection = { level: 50, map: { street: 'Victoria Road', name: null } };

  it('is the same whatever order the fields arrive in, and differs by level, map and window size', () => {
    const base = missSignature({ missing: ['map', 'level'], detection, width: 1368, height: 800 });
    expect(missSignature({ missing: ['level', 'map'], detection, width: 1368, height: 800 })).toBe(base);
    expect(missSignature({ missing: ['level', 'map'], detection: { ...detection, level: 51 }, width: 1368, height: 800 })).not.toBe(base);
    expect(missSignature({ missing: ['level', 'map'], detection, width: 1922, height: 1232 })).not.toBe(base);
  });

  it('copes with a detection that has no map or level', () => {
    expect(missSignature({ missing: ['exp'], detection: {}, width: 1, height: 1 })).toBe('exp|L-|||1x1');
  });

  it('is capped in length', () => {
    const long = { level: 1, map: { street: 'x'.repeat(500), name: null } };
    expect(missSignature({ missing: ['map'], detection: long, width: 1, height: 1 }).length).toBe(300);
  });
});
