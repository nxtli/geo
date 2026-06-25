/**
 * Ephemeral in-memory report cache.
 *
 * Lets the report download link work immediately after a scan even when
 * Supabase is not configured (or before the row is queried back). It is
 * process-local and capped — it is NOT a durable store. The durable source of
 * truth is the `geo_scan_reports` table; the report route checks Supabase
 * first and uses this only as a fallback for the current instance.
 */
const MAX_ENTRIES = 200;
const cache = new Map<string, string>();

export function putReportHtml(id: string, html: string): void {
  if (cache.has(id)) cache.delete(id);
  cache.set(id, html);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function getReportHtml(id: string): string | null {
  return cache.get(id) ?? null;
}
