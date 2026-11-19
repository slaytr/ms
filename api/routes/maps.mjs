import { parseRankSort } from '../lib/map-ranking.mjs';
import { parsePage } from '../lib/paging.mjs';
import { getMapHistory, getMapPlayers, getMapRanking } from '../store/maps.mjs';

const MAX_MAP_NAME_LENGTH = 200;

const ok = (data) => ({ success: true, data, error: null });
const bad = (reply, error) => reply.code(400).send({ success: false, data: null, error });

/** A map name from the query string: required for `players`, optional (all maps) for `history`. */
function parseMap(raw, { required }) {
  if (raw === undefined || raw === '') return required ? { error: 'map is required.' } : { map: null };
  if (typeof raw !== 'string' || raw.length > MAX_MAP_NAME_LENGTH) return { error: 'map is not a valid map name.' };
  return { map: raw };
}

export default async function mapRoutes(fastify) {
  /** One page (20) of maps, best first by `sort` (expPerHour, mesoPerHour or seconds). */
  fastify.get('/api/maps/ranking', async (request, reply) => {
    const sort = parseRankSort(request.query.sort);
    const page = parsePage(request.query.page);
    const error = sort.error ?? page.error;
    if (error) return bad(reply, error);
    return ok(await getMapRanking({ sort: sort.sort, page: page.page }));
  });

  /** One page (20) of qualifying sessions, newest first; `map` limits it to one map. */
  fastify.get('/api/maps/history', async (request, reply) => {
    const map = parseMap(request.query.map, { required: false });
    const page = parsePage(request.query.page);
    const error = map.error ?? page.error;
    if (error) return bad(reply, error);
    return ok(await getMapHistory({ map: map.map, page: page.page }));
  });

  /** The fastest players on one map, fetched when its row is opened. */
  fastify.get('/api/maps/players', async (request, reply) => {
    const map = parseMap(request.query.map, { required: true });
    if (map.error) return bad(reply, map.error);
    return ok({ players: await getMapPlayers(map.map) });
  });
}
