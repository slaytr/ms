/** Page numbers for list endpoints: 1-based, validated at the boundary, clamped to what exists. */

/** Upper bound on a page number, so a silly value can't make a huge offset. */
const MAX_PAGE = 100_000;

/** The page asked for (`undefined` means the first), or an error message for something that isn't a whole page number. */
export function parsePage(raw) {
  if (raw === undefined || raw === '') return { page: 1 };
  if (!/^\d+$/.test(String(raw))) return { error: 'page must be a whole number of 1 or more.' };
  const page = Number(raw);
  if (page < 1 || page > MAX_PAGE) return { error: 'page must be a whole number of 1 or more.' };
  return { page };
}

/** How many pages `total` rows make; an empty list still has one (empty) page. */
export function pageCount(total, pageSize) {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** `page` limited to the pages that exist, so asking past the end (the list shrank) shows the last page. */
export function clampPage(page, pages) {
  return Math.min(Math.max(1, page), pages);
}
