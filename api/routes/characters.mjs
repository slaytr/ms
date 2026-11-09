import { listCharacters } from '../store/characters.mjs';

export default async function characterRoutes(fastify) {
  fastify.get('/api/characters', async () => ({ success: true, data: await listCharacters(), error: null }));
}
