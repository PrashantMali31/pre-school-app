/** Shared ?page=&limit= pagination helper (canonical usage: students list routes). */
export function parsePaging(query: Record<string, unknown>): {
  page: number;
  limit: number;
  offset: number;
} {
  const pageRaw = Number(query.page);
  const limitRaw = Number(query.limit);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  let limit = Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.floor(limitRaw) : 100;
  if (limit > 200) limit = 200;
  return { page, limit, offset: (page - 1) * limit };
}

export function pageResult<T>(rows: T[], total: number, page: number, limit: number) {
  return { data: rows, total, page, limit };
}
