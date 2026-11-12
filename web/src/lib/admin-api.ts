import type { AdminSnapshot, SnapshotPatch } from './admin';

/** Client for /api/admin/*. Every call carries the admin token the API checks (kept in this browser only). */

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

const TOKEN_KEY = 'maple-metrics:admin-token';

export function loadAdminToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return ''; // storage blocked: the token just has to be typed each visit
  }
}

export function saveAdminToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Not persisted.
  }
}

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'x-admin-token': token };
  // Fastify rejects an empty body that claims to be JSON, so the header goes only with a body.
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`/api/admin${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const parsed = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (!response.ok || !parsed?.success || parsed.data === null) {
    throw new Error(parsed?.error ?? `Request failed (${response.status})`);
  }
  return parsed.data;
}

export interface AdminSessionRow {
  id: string;
  label: string;
  character: string;
  fingerprint: string | null;
  startedAt: string;
  endedAt: string | null;
  readingCount: number;
  player: string | null;
  job: string | null;
  startLevel: number | null;
  endLevel: number | null;
}

export interface AdminReading {
  id: number;
  takenAt: number;
  meso: number | null;
  exp: number | null;
  expPct: number | null;
  level: number | null;
}

export interface AdminSession {
  id: string;
  label: string;
  character: string;
  fingerprint: string | null;
  startedAt: string;
  endedAt: string | null;
  readings: AdminReading[];
  snapshots: { start: AdminSnapshot | null; end: AdminSnapshot | null };
  identity: { name: string | null; job: string | null } | null;
}

export interface AdminCharacter {
  fingerprint: string;
  name: string | null;
  job: string | null;
  sessions: number;
}

export interface AdminMapLabel {
  label: string;
  sessions: number;
}

export interface SessionPatch {
  label?: string;
  character?: string;
  fingerprint?: string | null;
  start?: SnapshotPatch;
  end?: SnapshotPatch;
}

export type ReadingPatch = Partial<Pick<AdminReading, 'meso' | 'exp' | 'expPct' | 'level'>>;

export const adminApi = {
  check: (token: string) => call<{ admin: true }>(token, 'GET', '/check'),
  listSessions: (token: string, opts: { unnamed: boolean; search: string }) =>
    call<AdminSessionRow[]>(token, 'GET', `/sessions?unnamed=${opts.unnamed}&search=${encodeURIComponent(opts.search)}`),
  getSession: (token: string, id: string) => call<AdminSession>(token, 'GET', `/sessions/${id}`),
  patchSession: (token: string, id: string, patch: SessionPatch) => call<{ saved: true }>(token, 'PATCH', `/sessions/${id}`, patch),
  deleteSession: (token: string, id: string) => call<{ deleted: true }>(token, 'DELETE', `/sessions/${id}`),
  patchReading: (token: string, id: string, readingId: number, patch: ReadingPatch) =>
    call<{ saved: true }>(token, 'PATCH', `/sessions/${id}/readings/${readingId}`, patch),
  deleteReadings: (token: string, id: string, ids: readonly number[]) =>
    call<{ deleted: number }>(token, 'POST', `/sessions/${id}/readings/delete`, { ids }),
  setLevels: (token: string, id: string, level: number, onlyLevel?: number) =>
    call<{ changed: number }>(token, 'POST', `/sessions/${id}/levels`, onlyLevel === undefined ? { level } : { level, onlyLevel }),
  listMaps: (token: string) => call<AdminMapLabel[]>(token, 'GET', '/maps'),
  renameMap: (token: string, from: string, to: string) => call<{ changed: number }>(token, 'POST', '/maps/rename', { from, to }),
  listCharacters: (token: string) => call<AdminCharacter[]>(token, 'GET', '/characters'),
  saveCharacter: (token: string, fingerprint: string, body: { name: string; job: string | null; applyToSessions: boolean }) =>
    call<{ saved: true; sessions: number }>(token, 'PUT', `/characters/${fingerprint}`, body),
};
