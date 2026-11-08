import type { MapPlate } from './detect/detect.ts';

/** The API accepts labels up to this long. */
export const MAX_LABEL_LENGTH = 80;

/**
 * The session name for what the minimap says: "Street: Map" ("Victoria Road: The Forest
 * North of Ellinia"). Whatever line could be read is used on its own if the other couldn't;
 * null when neither could, so the session simply stays unnamed instead of getting a guess.
 */
export function mapLabel(map: MapPlate): string | null {
  const parts = [map.street, map.name].filter((part): part is string => part !== null && part.length > 0);
  if (parts.length === 0) return null;
  return parts.join(': ').slice(0, MAX_LABEL_LENGTH);
}
