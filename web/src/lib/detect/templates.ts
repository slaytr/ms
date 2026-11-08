import { EMPTY_TEMPLATES, type Bitmap, type FontName, type GlyphSet, type Templates } from './types.ts';

const FONT_NAMES: readonly FontName[] = ['exp', 'meso', 'level', 'text', 'map'];

const isBitmap = (value: unknown): value is Bitmap =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((row) => typeof row === 'string' && /^[#.]+$/.test(row) && row.length === value[0].length);

/** Validates untrusted JSON (the shipped templates file) into Templates; throws on any malformed entry. */
export function parseTemplates(input: unknown): Templates {
  if (typeof input !== 'object' || input === null) throw new Error('templates: expected an object');
  const raw = input as { version?: unknown; anchors?: Record<string, unknown>; fonts?: Record<string, unknown> };
  if (raw.version !== 1) throw new Error(`templates: unsupported version ${String(raw.version)}`);

  const anchors: Record<string, Bitmap> = {};
  for (const [name, bitmap] of Object.entries(raw.anchors ?? {})) {
    if (!isBitmap(bitmap)) throw new Error(`templates: bad anchor "${name}"`);
    anchors[name] = bitmap;
  }

  const fonts: Record<string, GlyphSet> = {};
  for (const font of FONT_NAMES) {
    const set: Record<string, Bitmap[]> = {};
    for (const [char, variants] of Object.entries((raw.fonts?.[font] ?? {}) as Record<string, unknown>)) {
      if (!Array.isArray(variants) || !variants.every(isBitmap)) throw new Error(`templates: bad glyph ${font}/${char}`);
      set[char] = variants;
    }
    fonts[font] = set;
  }

  return { version: 1, anchors, fonts: fonts as Templates['fonts'] } satisfies Templates;
}

export { EMPTY_TEMPLATES };
