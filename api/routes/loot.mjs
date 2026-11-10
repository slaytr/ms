import { BAG_SIZE } from '../lib/loot.mjs';
import { buyCrates, getLoot, moveLootSlot, openCratesFor } from '../store/loot.mjs';

const ok = (data) => ({ success: true, data, error: null });
const fail = (error) => ({ success: false, data: null, error });

const fingerprint = { type: 'string', pattern: '^[a-z0-9]{1,24}$', maxLength: 24 };

const stateQuery = {
  type: 'object',
  required: ['fingerprint'],
  additionalProperties: false,
  properties: { fingerprint },
};

const buyBody = {
  type: 'object',
  required: ['fingerprint', 'count'],
  additionalProperties: false,
  properties: { fingerprint, count: { type: 'integer', enum: [1, 11] } },
};

const openBody = {
  type: 'object',
  required: ['fingerprint', 'indexes'],
  additionalProperties: false,
  properties: {
    fingerprint,
    indexes: { type: 'array', minItems: 1, maxItems: BAG_SIZE, items: { type: 'integer', minimum: 0, maximum: BAG_SIZE - 1 } },
  },
};

const slot = { type: 'integer', minimum: 0, maximum: BAG_SIZE - 1 };

const moveBody = {
  type: 'object',
  required: ['fingerprint', 'from', 'to'],
  additionalProperties: false,
  properties: { fingerprint, from: slot, to: slot },
};

/** Sends a store result: the new state, or the error with its status. */
function respond(reply, result) {
  return result.error ? reply.code(result.error.status).send(fail(result.error.message)) : ok(result.view);
}

export default async function lootRoutes(fastify) {
  fastify.get('/api/loot', { schema: { querystring: stateQuery } }, async (request, reply) =>
    respond(reply, await getLoot(request.query.fingerprint)),
  );

  fastify.post('/api/loot/buy', { schema: { body: buyBody } }, async (request, reply) =>
    respond(reply, await buyCrates(request.body.fingerprint, request.body.count)),
  );

  // Dragging an item to another slot: the position is saved so the bag looks the same next time.
  fastify.post('/api/loot/move', { schema: { body: moveBody } }, async (request, reply) =>
    respond(reply, await moveLootSlot(request.body.fingerprint, request.body.from, request.body.to)),
  );

  fastify.post('/api/loot/open', { schema: { body: openBody } }, async (request, reply) =>
    respond(reply, await openCratesFor(request.body.fingerprint, request.body.indexes)),
  );
}
