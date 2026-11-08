/**
 * DEV ONLY. Read-only browser for our own tables, behind the same switch as the fixture upload
 * (ENABLE_FIXTURE_UPLOAD=1 in .env.local, never in production) and refusing non-loopback callers.
 */

import { fixtureUploadEnabled } from './dev-fixtures.mjs';
import { MAX_PAGE_SIZE, listViews, readView } from '../store/dev-db.mjs';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

const ok = (data) => ({ success: true, data, error: null });
const fail = (error) => ({ success: false, data: null, error });

const viewQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: MAX_PAGE_SIZE, default: 50 },
    offset: { type: 'integer', minimum: 0, default: 0 },
  },
};

export default async function devDbRoutes(fastify) {
  if (!fixtureUploadEnabled()) return;

  fastify.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/dev/db') && !LOOPBACK.has(request.ip)) {
      return reply.code(403).send(fail('Loopback only.'));
    }
  });

  fastify.get('/api/dev/db', async () => ok(await listViews()));

  fastify.get('/api/dev/db/:view', { schema: { querystring: viewQuery } }, async (request, reply) => {
    const { limit, offset } = request.query;
    const page = await readView(request.params.view, limit, offset);
    return page ? ok(page) : reply.code(404).send(fail('Unknown view.'));
  });
}
