import { query } from '../db.mjs';

/** Our saved sprite for a character, or null. `name` is matched case-insensitively. */
export async function getAvatar(name) {
  const { rows } = await query(
    'select name, png, fetched_at as "fetchedAt" from ms_character_avatars where name_key = $1',
    [name.toLowerCase()],
  );
  return rows[0] ?? null;
}

/** Inserts or replaces the saved sprite and stamps it as fetched now. */
export async function saveAvatar(name, png) {
  await query(
    `insert into ms_character_avatars (name_key, name, png, fetched_at)
     values ($1, $2, $3, now())
     on conflict (name_key) do update set name = excluded.name, png = excluded.png, fetched_at = now()`,
    [name.toLowerCase(), name, png],
  );
}
