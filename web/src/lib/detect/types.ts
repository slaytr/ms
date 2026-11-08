/** A decoded RGBA frame (ImageData in the browser, a pngjs buffer in Node/tests). */
export interface Frame {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray | Uint8Array;
}

/** A 1-bit image as rows of '#' (foreground) and '.' (background). All rows share a width. */
export type Bitmap = readonly string[];

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** What counts as foreground: luma above (light) or below (dark) a threshold. */
export interface Polarity {
  readonly light: boolean;
  readonly threshold: number;
}

/** Known renderings per character. More than one is allowed, but a clean font should have exactly one. */
export type GlyphSet = Readonly<Record<string, readonly Bitmap[]>>;

export type AnchorName = 'exp' | 'level' | 'mesos' | 'minimap';
export type FontName = 'exp' | 'meso' | 'level' | 'text' | 'map';

export interface Templates {
  readonly version: 1;
  readonly anchors: Readonly<Partial<Record<AnchorName, Bitmap>>>;
  readonly fonts: Readonly<Record<FontName, GlyphSet>>;
}

export const EMPTY_TEMPLATES: Templates = {
  version: 1,
  anchors: {},
  fonts: { exp: {}, meso: {}, level: {}, text: {}, map: {} },
};
