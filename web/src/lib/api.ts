import type { StoredSlot } from './bag';
import type { CharacterEntry } from './characters';
import type { WeeklySessions } from './rankings';
import type { MapSession } from './maps';
import type { Reading } from './metrics';
import type { NxStatus } from './nx-economy';
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

/** Keeps the player's typed name and spec against this session's character, for every browser and past session. */
export function saveSessionIdentity(sessionId: string, ownerToken: string, name: string, job: string): Promise<{ saved: boolean }> {
  return request(`/api/sessions/${sessionId}/identity`, {
    method: 'POST',
    headers: { 'x-owner-token': ownerToken },
    body: JSON.stringify({ name, job }),
  });
}

/** The name and spec saved for a character, or null when none is known. */
export async function getSavedIdentity(fingerprint: string): Promise<{ name: string; job: string } | null> {
  const { identity } = await request<{ identity: { name: string; job: string } | null }>(
    `/api/identity?fingerprint=${encodeURIComponent(fingerprint)}`,
  );
  return identity;
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

/** One of a character's past sessions, as listed on the home page. */
export interface CharacterSession extends SessionSummary {
  lastReadingAt: string | null;
  startLevel: number | null;
  endLevel: number | null;
}

export function listCharacterSessions(fingerprint: string): Promise<CharacterSession[]> {
  return request(`/api/sessions?fingerprint=${encodeURIComponent(fingerprint)}`);
}

/** A character's loot box state as the server keeps it: NX, the bag in stored form, and the last opening. */
export interface LootState {
  readonly nx: NxStatus;
  readonly bag: readonly StoredSlot[];
  readonly opened: number;
  /** Item ids from the most recent opening. */
  readonly lastOpen: readonly number[];
}

export function getLoot(fingerprint: string): Promise<LootState> {
  return request(`/api/loot?fingerprint=${encodeURIComponent(fingerprint)}`);
}

/** Buys 1 or 11 crates with the character's NX. The server checks the balance and the bag room. */
export function buyLootCrates(fingerprint: string, count: 1 | 11): Promise<LootState> {
  return request('/api/loot/buy', { method: 'POST', body: JSON.stringify({ fingerprint, count }) });
}

/** Moves what is in one bag slot to another (swapping if it is filled), and remembers it. */
export function moveLootSlot(fingerprint: string, from: number, to: number): Promise<LootState> {
  return request('/api/loot/move', { method: 'POST', body: JSON.stringify({ fingerprint, from, to }) });
}

/** Opens the crates in the given bag slots. The server rolls the items. */
export function openLootCrates(fingerprint: string, indexes: readonly number[]): Promise<LootState> {
  return request('/api/loot/open', { method: 'POST', body: JSON.stringify({ fingerprint, indexes }) });
}

export function listMapSessions(): Promise<MapSession[]> {
  return request('/api/maps/sessions');
}

export function listCharacters(): Promise<CharacterEntry[]> {
  return request('/api/characters');
}

export function getWeeklySessions(): Promise<WeeklySessions> {
  return request('/api/rankings/week');
}

export function getSession(id: string): Promise<SessionDetail> {
  return request(`/api/sessions/${id}`);
}

export interface MissFrameUpload {
  readonly width: number;
  readonly height: number;
  readonly missing: readonly string[];
  readonly detection: object;
  readonly sessionId?: string;
  readonly png: Blob;
}

/** A PNG as base64 text, in chunks so a multi-megabyte frame doesn't overflow the call stack. */
async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const CHUNK = 0x8000;
  let binary = '';
  for (let at = 0; at < bytes.length; at += CHUNK) binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  return btoa(binary);
}

/** Sends a screenshot the detector couldn't fully read, so it can be pulled later and trained on. */
export async function postMissFrame({ png, sessionId, ...rest }: MissFrameUpload): Promise<{ stored: boolean; reason?: string }> {
  return request('/api/miss-frames', {
    method: 'POST',
    body: JSON.stringify({ ...rest, ...(sessionId ? { sessionId } : {}), png: await toBase64(png) }),
  });
}
