#!/usr/bin/env node
/**
 * The web service: serves the built Vue SPA (web/dist) and /api/* from the
 * same origin.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';

import avatarRoutes from './routes/avatar.mjs';
import characterRoutes from './routes/characters.mjs';
import devDbRoutes from './routes/dev-db.mjs';
import devFixtureRoutes from './routes/dev-fixtures.mjs';
import lootRoutes from './routes/loot.mjs';
import mapRoutes from './routes/maps.mjs';
import missFrameRoutes from './routes/miss-frames.mjs';
import rankingRoutes from './routes/rankings.mjs';
import sessionRoutes from './routes/sessions.mjs';
import { runMigrations } from './migrate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'web', 'dist');
const PORT = Number(process.env.PORT ?? 4174);
const IMAGE_FILE = /.(png|webp|jpe?g|gif|svg|ico)$/i;
const IMAGE_MAX_AGE_SECONDS = 24 * 60 * 60;

export async function buildServer() {
  const fastify = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  const hasDist = existsSync(join(DIST, 'index.html'));

  if (hasDist) {
    await fastify.register(fastifyStatic, {
      root: DIST,
      prefix: '/',
      // Pictures (item icons, logo, favicon) are kept by browsers for a day. Pages and code still revalidate
      // (the plugin's own header would override ours, so it is switched off and every file is set here).
      cacheControl: false,
      setHeaders(reply, path) {
        reply.header('Cache-Control', IMAGE_FILE.test(path) ? `public, max-age=${IMAGE_MAX_AGE_SECONDS}` : 'public, max-age=0');
      },
    });
  } else {
    fastify.log.warn('web/dist is missing. Run `npm run build`, or use `npm run web:dev` for the UI.');
  }

  await fastify.register(avatarRoutes);
  await fastify.register(sessionRoutes);
  await fastify.register(mapRoutes);
  await fastify.register(characterRoutes);
  await fastify.register(rankingRoutes);
  await fastify.register(lootRoutes);
  await fastify.register(missFrameRoutes);
  await fastify.register(devFixtureRoutes);
  await fastify.register(devDbRoutes);
  fastify.get('/healthz', async () => ({ ok: true }));

  fastify.setNotFoundHandler((request, reply) => {
    if (hasDist && request.method === 'GET' && !request.url.startsWith('/api')) {
      // Always revalidated, so a deploy is picked up (the page points at hashed assets that change).
      return reply.header('Cache-Control', 'public, max-age=0').type('text/html').sendFile('index.html', DIST);
    }
    return reply.code(404).send({ success: false, data: null, error: 'Not found.' });
  });

  return fastify;
}

async function main() {
  await runMigrations();
  const fastify = await buildServer();
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
