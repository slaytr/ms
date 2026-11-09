import { findAnchor } from './anchor.ts';
import {
  ANCHOR_SOURCES,
  ANCHOR_TOLERANCE,
  EXP,
  GLYPH_TOLERANCE,
  LEVEL,
  MESO,
  SCALED_ANCHOR_TOLERANCE,
  SCALED_GLYPH_TOLERANCE,
  SEARCH,
} from './layout.ts';
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
import type { UseTab } from './inventory.ts';
import type { QuickSlots } from './quickslots.ts';
import { fitView, unscaleView, viewFits, type View } from './view.ts';

/**
 * Where each anchor was last seen; passed back in so steady-state ticks skip the full-frame search.
 * For a frame from a scaled-up window it also carries the fitted `view`, so the (slow) fit happens once.
 */
export type DetectState = Readonly<Record<AnchorName, Point | null>> & {
  readonly view?: View | null;
  /** After a failed fit, ticks to wait before trying again (the fit is slow and a hidden game would repeat it forever). */
  readonly refitIn?: number;
};

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
  /** The Use tab of the inventory (items and counts), when that tab is open in a native-size window; null otherwise. */
  readonly useTab?: UseTab;
  /** The quick-slot bar (hotkeyed items and their totals), in a native-size window; null when it can't be read. */
  readonly quickSlots?: QuickSlots | null;
  readonly state: DetectState;
}

const POLARITY: Readonly<Record<AnchorName, Polarity>> = {
  exp: EXP.anchorPolarity,
  level: LEVEL.anchorPolarity,
  mesos: MESO.anchorPolarity,
  minimap: ANCHOR_SOURCES.minimap.polarity,
};

interface Tolerance {
  readonly anchor: number;
  readonly glyph: number;
}

const EXACT: Tolerance = { anchor: ANCHOR_TOLERANCE, glyph: GLYPH_TOLERANCE };
const SCALED: Tolerance = { anchor: SCALED_ANCHOR_TOLERANCE, glyph: SCALED_GLYPH_TOLERANCE };

/** Ticks to wait before fitting a scaled window again after a fit failed (the fit takes a moment). */
const REFIT_AFTER_TICKS = 5;

/** The status bar was found, so this really is the game (as opposed to some other window). */
const sawGame = (detection: Detection): boolean => detection.found.exp || detection.found.level;

/**
 * Cheap check for the status bar alone (the bottom rows, not the whole-frame inventory search), used to
 * decide whether a frame is a native-size game window before paying for the full detection.
 */
function statusBarVisible(luma: Uint8Array, width: number, height: number, templates: Templates, previous: DetectState): boolean {
  return (['exp', 'level'] as const).some((name) => {
    const bitmap = templates.anchors[name];
    if (!bitmap) return false;
    const options = { polarity: POLARITY[name], tolerance: EXACT.anchor };
    return findAnchor(luma, width, height, bitmap, SEARCH[name](width, height), options, previous[name]) !== null;
  });
}

/** Detection over one luma plane already at native client resolution (or a native-size window). */
function detectLuma(
  luma: Uint8Array,
  width: number,
  height: number,
  templates: Templates,
  previous: DetectState,
  tolerance: Tolerance,
): Detection {
  const locate = (name: AnchorName): Point | null => {
    const bitmap = templates.anchors[name];
    if (!bitmap) return null;
    const options = { polarity: POLARITY[name], tolerance: tolerance.anchor };
    return findAnchor(luma, width, height, bitmap, SEARCH[name](width, height), options, previous[name]);
  };

  const exp = locate('exp');
  const level = locate('level');
  const mesos = locate('mesos');
  const minimap = locate('minimap');

  const mapFont = templates.fonts.map;
  const mapLine = (line: 'street' | 'map') =>
    minimap ? readMapLine(mapGlyphs(luma, width, height, minimap, line), mapFont, tolerance.glyph) : null;

  const nameGlyphs = level ? textGlyphs(luma, width, height, level, 'name') : [];
  const jobGlyphs = level ? textGlyphs(luma, width, height, level, 'job') : [];
  const fingerprint = textFingerprint(nameGlyphs);
  const expReading = exp ? readExp(expGlyphs(luma, width, height, exp), templates.fonts.exp, tolerance.glyph) : null;

  return {
    exp: expReading?.exp ?? null,
    expPct: expReading?.pct ?? null,
    level: level ? readLevel(levelTiles(luma, width, height, level), templates.fonts.level, tolerance.glyph) : null,
    meso: mesos ? readMeso(mesoGlyphs(luma, width, height, mesos), templates.fonts.meso, tolerance.glyph) : null,
    character: {
      fingerprint,
      name: readTextLine(nameGlyphs, templates.fonts.text, tolerance.glyph),
      job: readTextLine(jobGlyphs, templates.fonts.text, tolerance.glyph),
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

/** Detection on a frame's luma sampled down to native resolution through the fitted view. */
function detectScaled(luma: Uint8Array, width: number, height: number, view: View, templates: Templates, previous: DetectState): Detection {
  const native = unscaleView(luma, width, view);
  const detection = detectLuma(native, view.width, view.height, templates, previous, SCALED);
  return { ...detection, state: { ...detection.state, view } };
}

/**
 * Reads meso, EXP%, level, the character plate and the map from one full frame of the Classic client.
 * Any field that is not on screen, or not readable with certainty, is null; the detector never
 * guesses a digit.
 *
 * A window at the client's native size is read exactly. A taller window has its UI scaled up, so the
 * frame is first fitted to the native client and the scaling undone (see view.ts), then read with the
 * same templates. The fit is remembered in the returned state.
 */
export function detectFrame(frame: Frame, templates: Templates, previous: DetectState = INITIAL_STATE): Detection {
  const luma = toLuma(frame);
  const { width, height } = frame;
  const exact = () => detectLuma(luma, width, height, templates, previous, EXACT);

  const known = previous.view && viewFits(previous.view, width, height) ? previous.view : null;
  if (known) {
    const scaled = detectScaled(luma, width, height, known, templates, previous);
    if (sawGame(scaled)) return scaled;
  }

  if (statusBarVisible(luma, width, height, templates, previous)) return exact();

  // Not a native-size game window. Maybe a scaled one, but the fit is slow, so don't repeat a failed one every tick.
  const wait = previous.refitIn ?? 0;
  if (wait > 0) {
    const nothing = exact();
    return { ...nothing, state: { ...nothing.state, refitIn: wait - 1 } };
  }
  const view = fitView(luma, width, height, templates);
  if (view) {
    const scaled = detectScaled(luma, width, height, view, templates, previous);
    if (sawGame(scaled)) return scaled;
  }
  const nothing = exact();
  return { ...nothing, state: { ...nothing.state, refitIn: REFIT_AFTER_TICKS } };
}
