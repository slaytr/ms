import { describe, expect, it } from 'vitest';

import { MAX_LABEL_LENGTH, mapLabel, splitMapLabel } from './map-label';

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

describe('splitMapLabel', () => {
  it('separates the street from the map', () => {
    expect(splitMapLabel('Victoria Road: Ant Tunnel I')).toEqual({ street: 'Victoria Road', name: 'Ant Tunnel I' });
  });

  it('keeps a name with no street whole', () => {
    expect(splitMapLabel('boss run')).toEqual({ street: null, name: 'boss run' });
    expect(splitMapLabel('farming 1:2')).toEqual({ street: null, name: 'farming 1:2' });
  });

  it('splits only at the first separator', () => {
    expect(splitMapLabel('A: B: C')).toEqual({ street: 'A', name: 'B: C' });
  });
});
