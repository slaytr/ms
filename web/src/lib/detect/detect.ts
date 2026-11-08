import { findAnchor } from './anchor.ts';
import { ANCHOR_SOURCES, ANCHOR_TOLERANCE, EXP, LEVEL, MESO, SEARCH } from './layout.ts';
import { toLuma } from './mask.ts';
import {
  expGlyphs,
  levelTiles,
  mapGlyphs,
  mesoGlyphs,
  readExp,
  readLevel,
  readMapLine,
  readMeso,
  readTextLine,
  textFingerprint,
  textGlyphs,
} from './readers.ts';
import type { AnchorName, Frame, Point, Polarity, Templates } from './types.ts';

/** Where each anchor was last seen; passed back in so steady-state ticks skip the full-frame search. */
export type DetectState = Readonly<Record<AnchorName, Point | null>>;

export const INITIAL_STATE: DetectState = { exp: null, level: null, mesos: null, minimap: null };

export interface CharacterPlate {
  /** Exact-pixel hash of the name; identifies the character even when its letters can't be read yet. */
  readonly fingerprint: string | null;
  /** Null until every letter of the name has a template. */
  readonly name: string | null;
  readonly job: string | null;
}

/** The minimap's title: the street above the map, as the game words them. Each is null until fully readable. */
export interface MapPlate {
  /** e.g. "Victoria Road". */
  readonly street: string | null;
  /** e.g. "Tree Dungeon, Forest Up North VIII". */
  readonly name: string | null;
}

export interface Detection {
  readonly meso: number | null;
  /** Raw EXP points (an integer), e.g. 17691. Far more precise than expPct. */
  readonly exp: number | null;
  readonly expPct: number | null;
  readonly level: number | null;
  /** True when `level` was worked out from EXP and EXP% because its digits couldn't be read. */
  readonly levelInferred?: boolean;
  /** Which UI elements were located at all (separate from whether their digits could be read). */
  readonly found: Readonly<Record<AnchorName | 'character', boolean>>;
  readonly character: CharacterPlate;
  readonly map: MapPlate;
  readonly state: DetectState;
}

const POLARITY: Readonly<Record<AnchorName, Polarity>> = {
  exp: EXP.anchorPolarity,
  level: LEVEL.anchorPolarity,
  mesos: MESO.anchorPolarity,
  minimap: ANCHOR_SOURCES.minimap.polarity,
};

/**
 * Reads meso, EXP% and level from one full frame of the Classic client. Any
 * field that is not on screen, or not readable with certainty, is null; the
 * detector never guesses a digit.
 */
export function detectFrame(frame: Frame, templates: Templates, previous: DetectState = INITIAL_STATE): Detection {
  const luma = toLuma(frame);
  const { width, height } = frame;

  const locate = (name: AnchorName): Point | null => {
    const bitmap = templates.anchors[name];
    if (!bitmap) return null;
    const options = { polarity: POLARITY[name], tolerance: ANCHOR_TOLERANCE };
    return findAnchor(luma, width, height, bitmap, SEARCH[name](width, height), options, previous[name]);
  };

  const exp = locate('exp');
  const level = locate('level');
  const mesos = locate('mesos');
  const minimap = locate('minimap');

  const mapFont = templates.fonts.map;
  const mapLine = (line: 'street' | 'map') =>
    minimap ? readMapLine(mapGlyphs(luma, width, height, minimap, line), mapFont) : null;

  const nameGlyphs = level ? textGlyphs(luma, width, height, level, 'name') : [];
  const jobGlyphs = level ? textGlyphs(luma, width, height, level, 'job') : [];
  const fingerprint = textFingerprint(nameGlyphs);
  const expReading = exp ? readExp(expGlyphs(luma, width, height, exp), templates.fonts.exp) : null;

  return {
    exp: expReading?.exp ?? null,
    expPct: expReading?.pct ?? null,
    level: level ? readLevel(levelTiles(luma, width, height, level), templates.fonts.level) : null,
    meso: mesos ? readMeso(mesoGlyphs(luma, width, height, mesos), templates.fonts.meso) : null,
    character: {
      fingerprint,
      name: readTextLine(nameGlyphs, templates.fonts.text),
      job: readTextLine(jobGlyphs, templates.fonts.text),
    },
    map: { street: mapLine('street'), name: mapLine('map') },
    found: {
      exp: exp !== null,
      level: level !== null,
      mesos: mesos !== null,
      minimap: minimap !== null,
      character: fingerprint !== null,
    },
    state: { exp, level, mesos, minimap },
  };
}
