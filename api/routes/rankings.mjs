import { listSessionStats } from '../store/maps.mjs';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default async function rankingRoutes(fastify) {
  /** Every session that started in the last 7 days, named or not; the page adds them up per player. */
  fastify.get('/api/rankings/week', async () => {
    const since = Date.now() - WEEK_MS;
    const sessions = await listSessionStats({ requireLabel: false, sinceMs: since });
    return { success: true, data: { since, sessions }, error: null };
  });
}
