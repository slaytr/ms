import { query, withTransaction } from '../db.mjs';

/** Frames kept in total. The oldest are dropped past this, so the table can't grow without bound. */
export const MAX_FRAMES = 100;
/** Frames kept per signature (same missing fields, level, map and window size): enough to train on, no more. */
export const MAX_PER_SIGNATURE = 3;

/**
 * Stores one frame unless this kind of miss is already well covered. Returns `{ stored, reason? }`.
 * The signature check and the insert share a transaction, then the table is trimmed to MAX_FRAMES.
 */
export async function insertMissFrame({ sessionId, width, height, missing, signature, detection, userAgent, png }) {
  return withTransaction(async (client) => {
    const { rows } = await query('select count(*)::int as n from ms_miss_frames where signature = $1', [signature], client);
    if (rows[0].n >= MAX_PER_SIGNATURE) return { stored: false, reason: 'duplicate' };

    await query(
      `insert into ms_miss_frames (session_id, width, height, missing, signature, detection, user_agent, png)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [sessionId ?? null, width, height, missing, signature, JSON.stringify(detection), userAgent ?? null, png],
      client,
    );
    await query(
      'delete from ms_miss_frames where id in (select id from ms_miss_frames order by id desc offset $1)',
      [MAX_FRAMES],
      client,
    );
    return { stored: true };
  });
}

/** Frames stored in the last `minutes`, for the overall upload cap. */
export async function countRecentMissFrames(minutes) {
  const { rows } = await query(
    `select count(*)::int as n from ms_miss_frames where created_at > now() - make_interval(mins => $1)`,
    [minutes],
  );
  return rows[0].n;
}

/** Frames newer than `afterId`, oldest first, with the image as base64 (for scripts/pull-misses.mjs). */
export async function listMissFrames({ afterId = 0, limit = 10 }) {
  const { rows } = await query(
    `select id, created_at as "createdAt", session_id as "sessionId", width, height, missing, detection,
            encode(png, 'base64') as png
       from ms_miss_frames where id > $1 order by id limit $2`,
    [afterId, limit],
  );
  return rows;
}

/** Removes frames by id (after they have been pulled). Returns how many were deleted. */
export async function deleteMissFrames(ids) {
  const { rowCount } = await query('delete from ms_miss_frames where id = any($1::bigint[])', [ids]);
  return rowCount;
}
