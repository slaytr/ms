import { readPngSize } from '../lib/png.mjs';
import { createLimiter } from '../lib/rate-limit.mjs';
import { missSignature } from '../lib/signature.mjs';
import { countRecentMissFrames, insertMissFrame } from '../store/miss-frames.mjs';

const MAX_PNG_BYTES = 8 * 1024 * 1024;
/** base64 is 4/3 the size, plus the JSON around it. */
const BODY_LIMIT = Math.ceil((MAX_PNG_BYTES * 4) / 3) + 64 * 1024;
const PER_CLIENT_PER_HOUR = 20;
const ALL_CLIENTS_PER_HOUR = 60;
const HOUR_MINUTES = 60;

const FIELDS = ['character', 'level', 'exp', 'meso', 'minimap', 'map'];
const nullableNumber = { type: ['number', 'null'] };
const nullableText = { type: ['string', 'null'], maxLength: 80 };
const bool = { type: 'boolean' };

const body = {
  type: 'object',
  required: ['width', 'height', 'missing', 'detection', 'png'],
  additionalProperties: false,
  properties: {
    width: { type: 'integer', minimum: 1, maximum: 16384 },
    height: { type: 'integer', minimum: 1, maximum: 16384 },
    missing: { type: 'array', minItems: 1, maxItems: FIELDS.length, uniqueItems: true, items: { enum: FIELDS } },
    sessionId: { type: 'string', format: 'uuid' },
    detection: {
      type: 'object',
      additionalProperties: false,
      properties: {
        meso: nullableNumber,
        exp: nullableNumber,
        expPct: nullableNumber,
        level: nullableNumber,
        levelInferred: bool,
        found: {
          type: 'object',
          additionalProperties: false,
          properties: { character: bool, level: bool, exp: bool, mesos: bool, minimap: bool },
        },
        character: {
          type: 'object',
          additionalProperties: false,
          properties: { fingerprint: nullableText, name: nullableText, job: nullableText },
        },
        map: { type: 'object', additionalProperties: false, properties: { street: nullableText, name: nullableText } },
      },
    },
    png: { type: 'string', minLength: 1, maxLength: BODY_LIMIT },
  },
};

const ok = (data) => ({ success: true, data, error: null });
const fail = (error) => ({ success: false, data: null, error });

/**
 * POST /api/miss-frames: the browser sends a screenshot (base64 PNG) when the detector could not read
 * some piece of data, so it can be pulled from production later and trained on. Anonymous, because it
 * must work before any session exists, so it is bounded hard: PNG-checked, size-capped, rate-limited
 * per client and overall, and capped per kind of miss. Nothing here is ever served back over HTTP.
 */
export default async function missFrameRoutes(fastify) {
  const perClient = createLimiter({ limit: PER_CLIENT_PER_HOUR, windowMs: HOUR_MINUTES * 60_000 });

  fastify.post('/api/miss-frames', { schema: { body }, bodyLimit: BODY_LIMIT }, async (request, reply) => {
    const forwarded = request.headers['x-forwarded-for'];
    const client = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') || request.ip;
    if (!perClient.allow(client)) return reply.code(429).send(fail('Too many screenshots from this client. Try again later.'));

    const { width, height, missing, detection, sessionId, png: encoded } = request.body;
    const png = Buffer.from(encoded, 'base64');
    if (png.length > MAX_PNG_BYTES) return reply.code(413).send(fail('Screenshot is too large.'));

    const size = readPngSize(png);
    if (!size) return reply.code(400).send(fail('Not a PNG.'));
    if (size.width !== width || size.height !== height) return reply.code(400).send(fail('PNG size does not match width/height.'));

    if ((await countRecentMissFrames(HOUR_MINUTES)) >= ALL_CLIENTS_PER_HOUR) {
      return reply.code(429).send(fail('Screenshot intake is full for now.'));
    }

    const result = await insertMissFrame({
      sessionId,
      width,
      height,
      missing,
      signature: missSignature({ missing, detection, width, height }),
      detection,
      userAgent: String(request.headers['user-agent'] ?? '').slice(0, 300),
      png,
    });
    return ok(result);
  });
}
