import { listMapSessions } from '../store/maps.mjs';

export default async function mapRoutes(fastify) {
  fastify.get('/api/maps/sessions', async () => ({ success: true, data: await listMapSessions(), error: null }));
}
