/** The few fields of a saved session the list needs to describe it. */
export interface SessionBrief {
  readonly label: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly lastReadingAt: string | null;
  readonly startLevel: number | null;
  readonly endLevel: number | null;
}

/** The session's name: the map it was named after, else a plain fallback. */
export function sessionTitle(session: Pick<SessionBrief, 'label'>): string {
  return session.label.trim() || 'Untitled session';
}

/**
 * How long the session ran. A tab closed without Stop never sets `endedAt`, so the last reading
 * stands in. Null when neither is known.
 */
export function sessionDurationMs(session: Pick<SessionBrief, 'startedAt' | 'endedAt' | 'lastReadingAt'>): number | null {
  const end = session.endedAt ?? session.lastReadingAt;
  if (!end) return null;
  const ms = Date.parse(end) - Date.parse(session.startedAt);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/** "Lv 49" when the level held, "Lv 49 to 50" when the session levelled up, null when unknown. */
export function levelRange(session: Pick<SessionBrief, 'startLevel' | 'endLevel'>): string | null {
  const { startLevel, endLevel } = session;
  if (startLevel === null) return endLevel === null ? null : `Lv ${endLevel}`;
  return endLevel === null || endLevel === startLevel ? `Lv ${startLevel}` : `Lv ${startLevel} to ${endLevel}`;
}
