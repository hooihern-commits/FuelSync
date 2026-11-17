// Opt-in keyset pagination for list endpoints.
//
//   GET /meals?limit=50                      newest 50
//   GET /meals?limit=50&before=<next_before> the 50 before that
//
// With no limit the endpoint returns every row, as it always has, so
// existing app builds keep working. New screens should pass a limit.
const MAX_LIMIT = 200;

/**
 * @returns {{ limit: number|null, before: string|null } | { error: string }}
 */
const parsePage = (query) => {
  let limit = null;
  if (query.limit !== undefined) {
    limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return { error: `limit must be a whole number from 1 to ${MAX_LIMIT}.` };
    }
  }
  let before = null;
  if (query.before !== undefined) {
    if (typeof query.before !== 'string' || Number.isNaN(Date.parse(query.before))) {
      return { error: 'before must be an ISO 8601 timestamp.' };
    }
    before = query.before;
  }
  return { limit, before };
};

/**
 * Cursor for the next page: the sort value of the last row, or null when
 * this page was not full (so there is nothing further).
 */
const nextBefore = (rows, limit, column) => {
  if (!limit || rows.length < limit) return null;
  const value = rows[rows.length - 1][column];
  return value instanceof Date ? value.toISOString() : value;
};

module.exports = { parsePage, nextBefore, MAX_LIMIT };
