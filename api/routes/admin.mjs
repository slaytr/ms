/**
 * Admin editor API. There are no accounts: the browser names its saved character in an
 * x-admin-user header and only PayYoBills passes. That name is client-supplied, so this is a
 * courtesy gate, not security (by choice).
 */

import { isAdminUser } from '../lib/admin-auth.mjs';
import {
  deleteAdminSession,
  deleteReadings,
  getAdminSession,
  listAdminCharacters,
  listAdminSessions,
  listMapLabels,
  renameMap,
  setCharacter,
  setReadingLevels,
  updateAdminSession,
  updateReading,
} from '../store/admin.mjs';

const ok = (data) => ({ success: true, data, error: null });
const fail = (error) => ({ success: false, data: null, error });

const UUID = { type: 'string', format: 'uuid' };
const sessionParams = { type: 'object', properties: { id: UUID } };
const fingerprint = { type: 'string', pattern: '^[a-z0-9]{1,24}$', maxLength: 24 };
const nullableNumber = (min, max) => ({ type: ['number', 'null'], minimum: min, maximum: max });
const nullableInt = (min, max) => ({ type: ['integer', 'null'], minimum: min, maximum: max });
const nullableText = (max) => ({ type: ['string', 'null'], maxLength: max });

/** Fields of a start/end snapshot an admin may change. Absent = untouched, null = cleared. */
const snapshotPatch = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: nullableText(40),
    job: nullableText(80),
    level: nullableInt(1, 300),
    exp: nullableInt(0, Number.MAX_SAFE_INTEGER),
    expPct: nullableNumber(0, 100),
    meso: nullableInt(0, Number.MAX_SAFE_INTEGER),
  },
};

const sessionPatch = {
  type: 'object',
  additionalProperties: false,
  properties: {
    label: { type: 'string', maxLength: 80 },
    character: { type: 'string', maxLength: 40 },
    fingerprint: { type: ['string', 'null'], pattern: '^[a-z0-9]{1,24}$', maxLength: 24 },
    start: snapshotPatch,
    end: snapshotPatch,
  },
};

const readingPatch = {
  type: 'object',
  additionalProperties: false,
  properties: {
    meso: nullableInt(0, Number.MAX_SAFE_INTEGER),
    exp: nullableInt(0, Number.MAX_SAFE_INTEGER),
    expPct: nullableNumber(0, 100),
    level: nullableInt(1, 300),
  },
};

const listQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    unnamed: { type: 'boolean', default: false },
    search: { type: 'string', maxLength: 80, default: '' },
    limit: { type: 'integer', minimum: 1, maximum: 500, default: 200 },
  },
};

/** Trims, collapses inner whitespace; null when empty or holding control characters. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
function cleanText(value, max) {
  if (typeof value !== 'string' || CONTROL_CHARS.test(value)) return null;
  const text = value.trim().replace(/\s+/g, ' ').slice(0, max);
  return text || null;
}

export default async function adminRoutes(fastify) {
  fastify.addHook('onRequest', async (request, reply) => {
    if (isAdminUser(request.headers['x-admin-user'])) return undefined;
    return reply.code(403).send(fail('Admin is only for PayYoBills.'));
  });

  fastify.get('/api/admin/check', async () => ok({ admin: true }));

  fastify.get('/api/admin/sessions', { schema: { querystring: listQuery } }, async (request) =>
    ok(await listAdminSessions(request.query)),
  );

  fastify.get('/api/admin/sessions/:id', { schema: { params: sessionParams } }, async (request, reply) => {
    const session = await getAdminSession(request.params.id);
    return session ? ok(session) : reply.code(404).send(fail('Session not found.'));
  });

  fastify.patch('/api/admin/sessions/:id', { schema: { params: sessionParams, body: sessionPatch } }, async (request, reply) => {
    const found = await updateAdminSession(request.params.id, request.body);
    return found ? ok({ saved: true }) : reply.code(404).send(fail('Session not found.'));
  });

  fastify.delete('/api/admin/sessions/:id', { schema: { params: sessionParams } }, async (request, reply) => {
    const removed = await deleteAdminSession(request.params.id);
    return removed ? ok({ deleted: true }) : reply.code(404).send(fail('Session not found.'));
  });

  fastify.patch(
    '/api/admin/sessions/:id/readings/:readingId',
    {
      schema: {
        params: { type: 'object', properties: { id: UUID, readingId: { type: 'integer', minimum: 1 } } },
        body: readingPatch,
      },
    },
    async (request, reply) => {
      const found = await updateReading(request.params.id, request.params.readingId, request.body);
      return found ? ok({ saved: true }) : reply.code(404).send(fail('Reading not found.'));
    },
  );

  fastify.post(
    '/api/admin/sessions/:id/readings/delete',
    {
      schema: {
        params: sessionParams,
        body: {
          type: 'object',
          required: ['ids'],
          additionalProperties: false,
          properties: { ids: { type: 'array', minItems: 1, maxItems: 5000, items: { type: 'integer', minimum: 1 } } },
        },
      },
    },
    async (request) => ok({ deleted: await deleteReadings(request.params.id, request.body.ids) }),
  );

  fastify.post(
    '/api/admin/sessions/:id/levels',
    {
      schema: {
        params: sessionParams,
        body: {
          type: 'object',
          required: ['level'],
          additionalProperties: false,
          properties: { level: { type: 'integer', minimum: 1, maximum: 300 }, onlyLevel: { type: 'integer', minimum: 1, maximum: 300 } },
        },
      },
    },
    async (request) => ok({ changed: await setReadingLevels(request.params.id, request.body.level, request.body.onlyLevel) }),
  );

  fastify.get('/api/admin/maps', async () => ok(await listMapLabels()));

  fastify.post(
    '/api/admin/maps/rename',
    {
      schema: {
        body: {
          type: 'object',
          required: ['from', 'to'],
          additionalProperties: false,
          properties: { from: { type: 'string', minLength: 1, maxLength: 80 }, to: { type: 'string', minLength: 1, maxLength: 80 } },
        },
      },
    },
    async (request, reply) => {
      const to = cleanText(request.body.to, 80);
      if (!to) return reply.code(400).send(fail('The new map name is empty or invalid.'));
      return ok({ changed: await renameMap(request.body.from, to) });
    },
  );

  fastify.get('/api/admin/characters', async () => ok(await listAdminCharacters()));

  fastify.put(
    '/api/admin/characters/:fingerprint',
    {
      schema: {
        params: { type: 'object', properties: { fingerprint } },
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 40 },
            job: { type: ['string', 'null'], maxLength: 80 },
            applyToSessions: { type: 'boolean', default: true },
          },
        },
      },
    },
    async (request, reply) => {
      const name = cleanText(request.body.name, 40);
      if (!name) return reply.code(400).send(fail('The name is empty or invalid.'));
      const job = request.body.job == null ? null : cleanText(request.body.job, 80);
      const sessions = await setCharacter(request.params.fingerprint, { name, job }, request.body.applyToSessions);
      return ok({ saved: true, sessions });
    },
  );
}
