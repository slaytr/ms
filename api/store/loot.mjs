import { query, withTransaction } from '../db.mjs';
import { applyBuy, applyMove, applyOpen, freshState, lootView, stateFromRow } from '../lib/loot.mjs';

/**
 * Total EXP a character has gained across every one of their sessions. The CASE mirrors the per-session
 * EXP gain in store/maps.mjs (a failed read is skipped, a drop counts as zero, and the single gap that
 * crosses a level-up contributes nothing: a slight undercount, never an invention).
 */
const EXP_GAINED_SQL = `
with e as (
  select r.session_id, r.taken_at, r.exp, r.level, r.exp_pct,
         lag(r.exp) over w as p_exp, lag(r.level) over w as p_level, lag(r.exp_pct) over w as p_pct,
         lag(r.taken_at) over w as p_at
    from ms_readings r
    join ms_capture_sessions s on s.id = r.session_id
   where s.fingerprint = $1 and r.exp is not null
  window w as (partition by r.session_id order by r.taken_at)
)
select coalesce(sum(case
         when p_exp is null then 0
         when exp_pct is not null and p_pct is not null and exp_pct - p_pct < -50 then 0
         when level is not null and p_level is not null and level > p_level
              and not (taken_at - p_at <= interval '30 seconds' and exp >= p_exp) then 0
         else greatest(0, exp - p_exp)
       end), 0)::bigint as gained
  from e`;

const SELECT_STATE = `select bag, nx_spent as spent, crates_opened as opened, last_open as "lastOpen"
                        from ms_loot_state where fingerprint = $1`;

const unknown = { error: { status: 404, message: 'Track a session with this character first.' } };

async function characterExists(fingerprint, client) {
  const { rows } = await query('select 1 from ms_capture_sessions where fingerprint = $1 limit 1', [fingerprint], client);
  return rows.length > 0;
}

async function expGainedFor(fingerprint, client) {
  const { rows } = await query(EXP_GAINED_SQL, [fingerprint], client);
  return Number(rows[0]?.gained ?? 0);
}

/** The character's loot state and NX, or an error when they have never been tracked. */
export async function getLoot(fingerprint) {
  if (!(await characterExists(fingerprint))) return unknown;
  const { rows } = await query(SELECT_STATE, [fingerprint]);
  const state = rows[0] ? stateFromRow(rows[0]) : freshState();
  return { view: lootView(state, await expGainedFor(fingerprint)) };
}

/**
 * Runs `apply(state, expGained)` against the character's saved state in one transaction, with the row
 * locked so two tabs can't both spend the same NX. Saves the result when `apply` succeeds.
 */
async function change(fingerprint, apply) {
  return withTransaction(async (client) => {
    if (!(await characterExists(fingerprint, client))) return unknown;
    await query('insert into ms_loot_state (fingerprint) values ($1) on conflict (fingerprint) do nothing', [fingerprint], client);
    const { rows } = await query(`${SELECT_STATE} for update`, [fingerprint], client);
    const expGained = await expGainedFor(fingerprint, client);
    const result = apply(stateFromRow(rows[0]), expGained);
    if (result.error) return result;

    const view = lootView(result.state, expGained);
    await query(
      `update ms_loot_state
          set bag = $2::jsonb, nx_spent = $3, crates_opened = $4, last_open = $5::jsonb, updated_at = now()
        where fingerprint = $1`,
      [fingerprint, JSON.stringify(view.bag), result.state.spent, result.state.opened, JSON.stringify(view.lastOpen)],
      client,
    );
    return { view };
  });
}

export const buyCrates = (fingerprint, count) => change(fingerprint, (state, exp) => applyBuy(state, count, exp));

export const moveLootSlot = (fingerprint, from, to) => change(fingerprint, (state) => applyMove(state, from, to));

export const openCratesFor = (fingerprint, indexes) => change(fingerprint, (state) => applyOpen(state, indexes));
