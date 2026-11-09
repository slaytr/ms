/** Same-looking misses share this, so the store can cap duplicates. Built on the server, never taken from the client. */
export function missSignature({ missing, detection, width, height }) {
  const map = detection.map ?? {};
  return [[...missing].sort().join(','), `L${detection.level ?? '-'}`, map.street ?? '', map.name ?? '', `${width}x${height}`]
    .join('|')
    .slice(0, 300);
}
