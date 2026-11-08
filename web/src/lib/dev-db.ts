/** Client for the dev-only database browser (/api/dev/db). Only exists when the API runs with ENABLE_FIXTURE_UPLOAD=1. */

export interface DbColumn {
  readonly key: string;
  readonly label: string;
  readonly type?: 'text' | 'number' | 'time' | 'id';
}

export type DbRow = Readonly<Record<string, string | number | null>>;

export interface DbViewSummary {
  readonly name: string;
  readonly label: string;
  readonly total: number;
}

export interface DbPage {
  readonly name: string;
  readonly label: string;
  readonly columns: readonly DbColumn[];
  readonly rows: readonly DbRow[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const body = (await response.json().catch(() => null)) as { success: boolean; data: T | null; error: string | null } | null;
  if (!response.ok || !body?.success || body.data === null) throw new Error(body?.error ?? `Request failed (${response.status})`);
  return body.data;
}

/** True only when the API is a dev one with the browser switched on; any failure means "no". */
export async function isDbBrowserEnabled(): Promise<boolean> {
  try {
    const config = await get<{ dbBrowser?: boolean }>('/api/dev/config');
    return config.dbBrowser === true;
  } catch {
    return false;
  }
}

export const listDbViews = () => get<DbViewSummary[]>('/api/dev/db');

export const readDbView = (name: string, limit: number, offset: number) =>
  get<DbPage>(`/api/dev/db/${encodeURIComponent(name)}?limit=${limit}&offset=${offset}`);

/** What a cell shows: dashes for null, thousands separators for numbers, local time for timestamps, short ids. */
export function formatCell(value: string | number | null | undefined, type: DbColumn['type'] = 'text'): string {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'number') return typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(value);
  if (type === 'time') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }
  if (type === 'id') return String(value).slice(0, 8);
  return String(value);
}
