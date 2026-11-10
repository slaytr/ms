import { getIdentity } from '../store/identities.mjs';
import { listCharacters } from '../store/characters.mjs';

export default async function characterRoutes(fastify) {
  fastify.get('/api/characters', async () => ({ success: true, data: await listCharacters(), error: null }));

  // The name and spec we hold for a fingerprint, so a browser that has never seen this character need not ask again.
  fastify.get(
    '/api/identity',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['fingerprint'],
          additionalProperties: false,
          properties: { fingerprint: { type: 'string', pattern: '^[a-z0-9]{1,24}$', maxLength: 24 } },
        },
      },
    },
    async (request) => ({ success: true, data: { identity: await getIdentity(request.query.fingerprint) }, error: null }),
  );
}
