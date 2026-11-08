/**
 * DEV ONLY. Lets the browser save full-resolution screenshot frames into
 * ./fixtures so detection templates and tests can be built from real game
 * frames. Registered only when ENABLE_FIXTURE_UPLOAD=1 (set in .env.local,
 * never in production) and additionally refuses non-loopback callers.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
const MAX_BYTES = 20 * 1024 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

const querystring = {
  type: 'object',
  required: ['label', 'w', 'h'],
  additionalProperties: false,
  properties: {
    label: { type: 'string', pattern: '^[a-z0-9-]{1,40}$' },
    w: { type: 'integer', minimum: 1, maximum: 16384 },
    h: { type: 'integer', minimum: 1, maximum: 16384 },
  },
};

export const fixtureUploadEnabled = () => process.env.ENABLE_FIXTURE_UPLOAD === '1';

export default async function devFixtureRoutes(fastify) {
  fastify.get('/api/dev/config', async () => ({ success: true, data: { fixtureUpload: fixtureUploadEnabled(), dbBrowser: fixtureUploadEnabled() }, error: null }));

  if (!fixtureUploadEnabled()) return;

  fastify.addContentTypeParser('image/png', { parseAs: 'buffer', bodyLimit: MAX_BYTES }, (_request, body, done) => done(null, body));

  fastify.post('/api/dev/fixtures', { schema: { querystring } }, async (request, reply) => {
    if (!LOOPBACK.has(request.ip)) {
      return reply.code(403).send({ success: false, data: null, error: 'Loopback only.' });
    }
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length < PNG_MAGIC.length || !body.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
      return reply.code(400).send({ success: false, data: null, error: 'Body is not a PNG.' });
    }

    const { label, w, h } = request.query;
    const file = `${label}_${w}x${h}_${Date.now()}.png`;
    await mkdir(FIXTURES_DIR, { recursive: true });
    await writeFile(join(FIXTURES_DIR, file), body);
    return { success: true, data: { file, bytes: body.length }, error: null };
  });
}
