/**
 * Character sprites. We keep our own copy in Postgres and serve that.
 *
 * Source: ClassicRank's public API,
 *   GET https://classicrank.com/api/v1/characters/{name}/photo -> 302 to a 96x96 PNG, 404 if none.
 *
 * - When a session starts, `refreshAvatar` re-fetches the sprite if our copy is older than 3 hours.
 * - GET /api/avatar/:name serves our copy; if we have none yet, it fetches once and saves it.
 * - Upstream calls are serialised and at least 1s apart (their public limit is 30/min per IP).
 *   Not-found results are remembered in memory for 10 minutes so a bad name isn't re-asked.
 */

import { getAvatar, saveAvatar } from '../store/avatars.mjs';

const UPSTREAM = 'https://classicrank.com/api/v1/characters';
const USER_AGENT = 'ms-app-data-collector (personal project)';
export const REFRESH_AFTER_MS = 3 * 60 * 60 * 1000;
const MISS_TTL_MS = 10 * 60 * 1000;
/** Browsers keep a sprite for a day: it changes rarely and is refreshed here every 3 hours anyway. */
const IMAGE_MAX_AGE_SECONDS = 24 * 60 * 60;
const MIN_GAP_MS = 1000;
const MAX_MISS_ENTRIES = 200;
const NAME_PATTERN = /^[A-Za-z0-9]{2,20}$/;

const misses = new Map();
let queue = Promise.resolve();
let lastCallAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const isValidName = (name) => typeof name === 'string' && NAME_PATTERN.test(name);
export const isStale = (fetchedAt, now = Date.now()) => now - new Date(fetchedAt).getTime() >= REFRESH_AFTER_MS;

/** Runs upstream calls one at a time, at least MIN_GAP_MS apart. */
function throttled(task) {
  const run = queue.then(async () => {
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

async function fetchPhoto(name) {
  const response = await fetch(`${UPSTREAM}/${encodeURIComponent(name)}/photo`, {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'follow',
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`ClassicRank returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function rememberMiss(key) {
  if (misses.size >= MAX_MISS_ENTRIES) misses.delete(misses.keys().next().value);
  misses.set(key, Date.now() + MISS_TTL_MS);
}

/**
 * Makes sure we hold a sprite newer than 3 hours for `name`. Resolves to true if we have one
 * afterwards. If ClassicRank fails or has no sprite, any older copy is kept.
 */
export async function refreshAvatar(name, log) {
  if (!isValidName(name)) return false;
  const key = name.toLowerCase();

  const existing = await getAvatar(name);
  if (existing && !isStale(existing.fetchedAt)) return true;
  if ((misses.get(key) ?? 0) > Date.now()) return existing !== null;

  try {
    const png = await throttled(() => fetchPhoto(name));
    if (!png) {
      rememberMiss(key);
      return existing !== null;
    }
    await saveAvatar(name, png);
    return true;
  } catch (error) {
    log?.error({ err: error, name }, 'avatar refresh failed');
    return existing !== null;
  }
}

export default async function avatarRoutes(fastify) {
  fastify.get(
    '/api/avatar/:name',
    {
      schema: {
        params: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string', minLength: 2, maxLength: 20, pattern: '^[A-Za-z0-9]+$' } },
        },
      },
    },
    async (request, reply) => {
      const { name } = request.params;
      let avatar = await getAvatar(name);

      if (!avatar) {
        await refreshAvatar(name, request.log);
        avatar = await getAvatar(name);
      }

      if (!avatar) return reply.code(404).send({ success: false, data: null, error: 'No sprite found for that character.' });
      return reply.type('image/png').header('Cache-Control', `public, max-age=${IMAGE_MAX_AGE_SECONDS}`).send(avatar.png);
    },
  );
}
