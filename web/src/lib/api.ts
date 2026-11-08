import type { MapSession } from './maps';
import type { Reading } from './metrics';
import type { PlayerSnapshot } from './snapshot';

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export interface CreatedSession {
  id: string;
  ownerToken: string;
  startedAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (!response.ok || !body?.success || body.data === null) {
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  return body.data;
}

export interface NewSession {
  readonly label: string;
  readonly character: string;
  readonly fingerprint: string | null;
  /** Where the player stands as the session begins; saved with the session. */
  readonly start: PlayerSnapshot | null;
}

export function createSession(input: NewSession): Promise<CreatedSession> {
  const { start, ...rest } = input;
  return request('/api/sessions', { method: 'POST', body: JSON.stringify(start ? { ...rest, start } : rest) });
}

export function postReadings(sessionId: string, ownerToken: string, readings: readonly Reading[]): Promise<{ inserted: number }> {
  return request(`/api/sessions/${sessionId}/readings`, {
    method: 'POST',
    headers: { 'x-owner-token': ownerToken },
    body: JSON.stringify({ readings }),
  });
}

export function labelSession(sessionId: string, ownerToken: string, label: string): Promise<{ labelled: boolean }> {
  return request(`/api/sessions/${sessionId}/label`, {
    method: 'POST',
    headers: { 'x-owner-token': ownerToken },
    body: JSON.stringify({ label }),
  });
}

export function endSession(sessionId: string, ownerToken: string, end: PlayerSnapshot | null): Promise<{ ended: boolean }> {
  // Always a JSON body: Fastify rejects a POST that claims application/json but sends nothing.
  return request(`/api/sessions/${sessionId}/end`, {
    method: 'POST',
    headers: { 'x-owner-token': ownerToken },
    body: JSON.stringify(end ? { end } : {}),
  });
}

export interface SessionSummary {
  id: string;
  label: string;
  character: string;
  startedAt: string;
  endedAt: string | null;
  readingCount: number;
}

export interface SessionDetail extends Omit<SessionSummary, 'readingCount'> {
  readings: Reading[];
  snapshots: { start: PlayerSnapshot | null; end: PlayerSnapshot | null };
}

export function listSessions(): Promise<SessionSummary[]> {
  return request('/api/sessions');
}

export function listMapSessions(): Promise<MapSession[]> {
  return request('/api/maps/sessions');
}

export function getSession(id: string): Promise<SessionDetail> {
  return request(`/api/sessions/${id}`);
}
