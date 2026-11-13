import { createLiveHub } from '../lib/live-hub.mjs';
import { listLiveSessions } from '../store/live.mjs';

/** Shared with server.mjs, which pokes it whenever a session is created, fed or ended. */
export const liveHub = createLiveHub({
  load: listLiveSessions,
  onError: (error) => console.error('live refresh failed', error),
});

export default async function liveRoutes(fastify) {
  /** Who is grinding right now. Public, like the rankings: names come from the players' own screens. */
  fastify.get('/api/live', async () => ({ success: true, data: await listLiveSessions(), error: null }));

  /**
   * The same list as a Server-Sent Events stream: one message with the list on connect, then another
   * each time it changes, so pages update without polling. The page falls back to /api/live if it breaks.
   */
  fastify.get('/api/live/stream', (request, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 5000\n\n');

    let closed = false;
    let unsubscribe = null;
    request.raw.on('close', () => {
      closed = true;
      unsubscribe?.();
    });
    liveHub
      .subscribe((text) => {
        if (!closed) res.write(text);
      })
      .then((stop) => {
        if (closed) stop();
        else unsubscribe = stop;
      });
  });
}
