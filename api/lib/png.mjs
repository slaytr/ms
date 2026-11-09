const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Reads the pixel size from a PNG's header, or returns null if the bytes are not a PNG. Checks the
 * signature and that the first chunk is IHDR, so a file only gets through if it really starts like one.
 */
export function readPngSize(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  if (!buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) return null;
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
