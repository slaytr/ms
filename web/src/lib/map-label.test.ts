import { describe, expect, it } from 'vitest';

import { MAX_LABEL_LENGTH, mapLabel } from './map-label';

describe('mapLabel', () => {
  it('joins the street and the map the way the game shows them', () => {
    expect(mapLabel({ street: 'Victoria Road', name: 'The Forest North of Ellinia' })).toBe('Victoria Road: The Forest North of Ellinia');
    expect(mapLabel({ street: 'Kerning City Subway', name: 'Line 1 <Area 1>' })).toBe('Kerning City Subway: Line 1 <Area 1>');
  });

  it('uses the one line it could read when the other has an unknown letter', () => {
    expect(mapLabel({ street: 'Victoria Road', name: null })).toBe('Victoria Road');
    expect(mapLabel({ street: null, name: 'Tree Dungeon, Forest Up North VIII' })).toBe('Tree Dungeon, Forest Up North VIII');
  });

  it('gives no name at all, rather than a guess, when nothing was readable', () => {
    expect(mapLabel({ street: null, name: null })).toBeNull();
    expect(mapLabel({ street: '', name: '' })).toBeNull();
  });

  it('never exceeds the length the API accepts', () => {
    const long = mapLabel({ street: 'S'.repeat(50), name: 'M'.repeat(50) });
    expect(long).toHaveLength(MAX_LABEL_LENGTH);
  });
});
