/**
 * One page of the Maps page's ranking, kept pure (no database) so it can be tested. The ranking rules live
 * in web/src (the same code the page's tests cover), which Node runs directly through type stripping.
 */

import { MAPS_PAGE_SIZE, rankMaps, sortRanks } from '../../web/src/lib/maps.ts';
import { clampPage, pageCount } from './paging.mjs';

/** The columns the ranking can be ordered by. The first is the default. */
export const RANK_SORTS = ['expPerHour', 'mesoPerHour', 'seconds'];

/** A valid sort for the ranking, or an error message. `undefined` means the default. */
export function parseRankSort(raw) {
  if (raw === undefined || raw === '') return { sort: RANK_SORTS[0] };
  if (RANK_SORTS.includes(raw)) return { sort: raw };
  return { error: `sort must be one of ${RANK_SORTS.join(', ')}.` };
}

/**
 * Ranks the maps of `sessions` (the qualifying ones), orders them by `sort` and returns page `page` of them.
 * `bestExpPerHour` is the best EXP/h over ALL maps, so the bar lengths mean the same on every page.
 */
export function rankingPage(sessions, { sort, page }) {
  const ranks = rankMaps(sessions);
  const sorted = sortRanks(ranks, sort);
  const totalPages = pageCount(sorted.length, MAPS_PAGE_SIZE);
  const current = clampPage(page, totalPages);
  const start = (current - 1) * MAPS_PAGE_SIZE;
  return {
    maps: sorted.slice(start, start + MAPS_PAGE_SIZE),
    page: current,
    pageSize: MAPS_PAGE_SIZE,
    totalMaps: sorted.length,
    totalPages,
    bestExpPerHour: ranks.reduce((best, rank) => Math.max(best, rank.expPerHour), 0),
  };
}
