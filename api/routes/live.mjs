import { listLiveSessions } from '../store/live.mjs';

export default async function liveRoutes(fastify) {
  /** Who is grinding right now. Public, like the rankings: names come from the players' own screens. */
  fastify.get('/api/live', async () => ({ success: true, data: await listLiveSessions(), error: null }));
}
