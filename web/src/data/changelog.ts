/**
 * The home page's change log. Add an entry here and it shows up in the box under the weekly top 3
 * (newest date first, so order in this file doesn't matter).
 *
 *   { date: '2026-11-10', text: 'Potion graphs under the EXP chart.' },
 */
export interface ChangeLogEntry {
  /** ISO day, YYYY-MM-DD. */
  readonly date: string;
  readonly text: string;
}

export const CHANGELOG: readonly ChangeLogEntry[] = [
  { date: '2026-11-10', text: 'Meso amounts on the rich list are hidden by default; use the eye icon in its header to show them.' },
  { date: '2026-11-10', text: 'Added a rich list under Top by job: the 3 richest characters by their latest meso count.' },
  { date: '2026-11-10', text: 'New players now enter their character name and pick their spec by hand, since name detection was unreliable.' },
  { date: '2026-11-10', text: 'Updated some of the text on the home page.' },
];
