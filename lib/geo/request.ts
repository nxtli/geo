/**
 * Hulpjes voor openbare eindpunten: alleen verzoeken van de eigen site, een
 * rem per sleutel en het adres van de site voor links.
 */
const buckets = new Map<string, Map<string, number[]>>();

/** Rem per sleutel. Geldt per serverinstantie, dus een rem en geen slot. */
export function allow(bucket: string, key: string, max: number, windowMs: number): boolean {
  const hits = buckets.get(bucket) ?? new Map<string, number[]>();
  buckets.set(bucket, hits);
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function clientIp(request: Request): string {
  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "onbekend";
}

/** Het adres van de site, voor volledige links in mail en CRM. */
export function requestBaseUrl(request: Request): string | null {
  const env = process.env.NEXT_PUBLIC_SITE_URL || process.env.GEO_PUBLIC_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return host ? `${proto}://${host}` : null;
}
