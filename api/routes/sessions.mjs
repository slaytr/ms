import { refreshAvatar } from './avatar.mjs';
import {
  MAX_READINGS_PER_BATCH,
  appendReadings,
  createSession,
  endSession,
  getSession,
  isOwner,
  labelSession,
  listRecentSessions,
  listSessionsByFingerprint,
} from '../store/sessions.mjs';

const ok = (data) => ({ success: true, data, error: null });
const fail = (error) => ({ success: false, data: null, error });

const UUID = { type: 'string', format: 'uuid' };
const nullableNumber = (min, max) => ({ type: ['number', 'null'], minimum: min, maximum: max });

const fingerprint = { type: ['string', 'null'], pattern: '^[a-z0-9]{1,24}$', maxLength: 24 };

/** Where the player stood at one moment. Every value is optional: any read can fail. */
const snapshot = {
  type: 'object',
  additionalProperties: false,
  properties: {
    takenAt: { type: 'number', minimum: 0 },
    fingerprint,
    name: { type: ['string', 'null'], maxLength: 40 },
    job: { type: ['string', 'null'], maxLength: 80 },
    level: nullableNumber(1, 300),
    exp: nullableNumber(0, Number.MAX_SAFE_INTEGER),
    expPct: nullableNumber(0, 100),
    meso: nullableNumber(0, Number.MAX_SAFE_INTEGER),
  },
};

const createBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    label: { type: 'string', maxLength: 80, default: '' },
    character: { type: 'string', maxLength: 40, default: '' },
    fingerprint,
    start: snapshot,
  },
};

const labelBody = {
  type: 'object',
  required: ['label'],
  additionalProperties: false,
  properties: { label: { type: 'string', minLength: 1, maxLength: 80 } },
};

const listQuery = {
  type: 'object',
  additionalProperties: false,
  properties: { fingerprint: { type: 'string', pattern: '^[a-z0-9]{1,24}$', maxLength: 24 } },
};

const endBody = {
  type: 'object',
  additionalProperties: false,
  properties: { end: snapshot },
};

const readingsBody = {
  type: 'object',
  required: ['readings'],
  additionalProperties: false,
  properties: {
    readings: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_READINGS_PER_BATCH,
      items: {
        type: 'object',
        required: ['takenAt'],
        additionalProperties: false,
        properties: {
          takenAt: { type: 'number', minimum: 0 },
          meso: nullableNumber(0, Number.MAX_SAFE_INTEGER),
          exp: nullableNumber(0, Number.MAX_SAFE_INTEGER),
          expPct: nullableNumber(0, 100),
          level: nullableNumber(1, 300),
        },
      },
    },
  },
};

export default async function sessionRoutes(fastify) {
  // With ?fingerprint= this is one character's own history (the home page's "Your sessions").
  fastify.get('/api/sessions', { schema: { querystring: listQuery } }, async (request) => {
    const { fingerprint: who } = request.query;
    return ok(who ? await listSessionsByFingerprint(who) : await listRecentSessions());
  });

  fastify.post('/api/sessions', { schema: { body: createBody } }, async (request, reply) => {
    const { label = '', character = '', fingerprint = null, start } = request.body ?? {};
    const session = await createSession({ label, character, fingerprint, start });
    // Refresh our saved sprite in the background; it never delays or fails the session.
    refreshAvatar(character, request.log).catch((error) => request.log.error({ err: error }, 'avatar refresh crashed'));
    return reply.code(201).send(ok(session));
  });

  fastify.get('/api/sessions/:id', { schema: { params: { type: 'object', properties: { id: UUID } } } }, async (request, reply) => {
    const session = await getSession(request.params.id);
    return session ? ok(session) : reply.code(404).send(fail('Session not found.'));
  });

  const ownerRoute = { schema: { params: { type: 'object', properties: { id: UUID } } } };

  async function requireOwner(request, reply) {
    const token = request.headers['x-owner-token'];
    const valid = typeof token === 'string' && /^[0-9a-f-]{36}$/i.test(token) && (await isOwner(request.params.id, token));
    if (!valid) reply.code(403).send(fail('Invalid owner token.'));
  }

  fastify.post(
    '/api/sessions/:id/readings',
    { schema: { ...ownerRoute.schema, body: readingsBody }, preHandler: requireOwner },
    async (request) => ok({ inserted: await appendReadings(request.params.id, request.body.readings) }),
  );

  fastify.post('/api/sessions/:id/label', { schema: { ...ownerRoute.schema, body: labelBody }, preHandler: requireOwner }, async (request) => {
    await labelSession(request.params.id, request.body.label);
    return ok({ labelled: true });
  });

  fastify.post('/api/sessions/:id/end', { schema: { ...ownerRoute.schema, body: endBody }, preHandler: requireOwner }, async (request) => {
    await endSession(request.params.id, request.body?.end);
    return ok({ ended: true });
  });
}
