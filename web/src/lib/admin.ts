/** Pure helpers for the /admin editor: who may see it, and turning form text into API patches. */

/** The one character whose browser is offered the admin page (the API still needs the admin token). */
export const ADMIN_CHARACTER = 'PayYoBills';

export function isAdminProfile(profile: { readonly name: string | null } | null): boolean {
  return profile?.name?.trim().toLowerCase() === ADMIN_CHARACTER.toLowerCase();
}

export interface AdminSnapshot {
  readonly name: string | null;
  readonly job: string | null;
  readonly level: number | null;
  readonly exp: number | null;
  readonly expPct: number | null;
  readonly meso: number | null;
}

/** The snapshot fields as the text boxes hold them. */
export interface SnapshotForm {
  name: string;
  job: string;
  level: string;
  exp: string;
  expPct: string;
  meso: string;
}

export type SnapshotPatch = Partial<AdminSnapshot>;

const NUMBER_FIELDS = {
  level: { label: 'Level', integer: true, min: 1, max: 300 },
  exp: { label: 'EXP', integer: true, min: 0, max: Number.MAX_SAFE_INTEGER },
  expPct: { label: 'EXP %', integer: false, min: 0, max: 100 },
  meso: { label: 'Meso', integer: true, min: 0, max: Number.MAX_SAFE_INTEGER },
} as const;

export type NumberField = keyof typeof NUMBER_FIELDS;

const show = (value: string | number | null | undefined): string => (value === null || value === undefined ? '' : String(value));

export function snapshotForm(snapshot: AdminSnapshot | null): SnapshotForm {
  return {
    name: show(snapshot?.name),
    job: show(snapshot?.job),
    level: show(snapshot?.level),
    exp: show(snapshot?.exp),
    expPct: show(snapshot?.expPct),
    meso: show(snapshot?.meso),
  };
}

export interface ParsedNumber {
  readonly value: number | null;
  readonly error: string | null;
}

/** Blank clears the field (null). Anything that isn't a number in range is an error, never a guess. */
export function parseNumberField(field: NumberField, text: string): ParsedNumber {
  const { label, integer, min, max } = NUMBER_FIELDS[field];
  const trimmed = text.replace(/[,\s]/g, '');
  if (trimmed === '') return { value: null, error: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { value: null, error: `${label} must be a number.` };
  if (integer && !Number.isInteger(value)) return { value: null, error: `${label} must be a whole number.` };
  if (value < min || value > max) return { value: null, error: `${label} must be between ${min} and ${max}.` };
  return { value, error: null };
}

export interface PatchResult {
  readonly patch: SnapshotPatch;
  readonly errors: readonly string[];
}

/** Only the fields whose text differs from the saved snapshot, ready to PATCH. */
export function snapshotPatch(original: AdminSnapshot | null, form: SnapshotForm): PatchResult {
  const patch: Record<string, string | number | null> = {};
  const errors: string[] = [];

  for (const field of ['name', 'job'] as const) {
    const text = form[field].trim().replace(/\s+/g, ' ');
    const before = original?.[field] ?? null;
    const next = text === '' ? null : text;
    if (next !== before) patch[field] = next;
  }
  for (const field of Object.keys(NUMBER_FIELDS) as NumberField[]) {
    const { value, error } = parseNumberField(field, form[field]);
    if (error) errors.push(error);
    else if (value !== (original?.[field] ?? null)) patch[field] = value;
  }
  return { patch: patch as SnapshotPatch, errors };
}

/** Sessions with no player name anywhere are the ones the admin has to name by hand. */
export function isUnnamed(session: { readonly player: string | null }): boolean {
  return !session.player;
}

/** "Mushroom Hill: 2 sessions", for the maps list. */
export function sessionCount(count: number): string {
  return `${count} session${count === 1 ? '' : 's'}`;
}
