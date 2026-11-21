// Names whose in-game spelling differs from what the detector or the player typed.
const DISPLAY_OVERRIDES: Readonly<Record<string, string>> = {
  brydit: 'brydit',
}

/** The name as it should be shown, e.g. `Brydit` -> `brydit`. */
export function displayName(name: string | null | undefined): string | null {
  if (!name) return null
  return DISPLAY_OVERRIDES[name.trim().toLowerCase()] ?? name
}
