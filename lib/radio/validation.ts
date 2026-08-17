/**
 * Validatie en normalisatie van invoer.
 *
 * De LinkedIn-regels staan hier bewust centraal: een LinkedIn-URL mag ALLEEN
 * uit handmatige invoer, CSV-import of een andere legitieme databron komen.
 * Deze module accepteert een URL alleen als die echt naar een LinkedIn-profiel
 * of -bedrijfspagina wijst, en er wordt nergens in deze codebase een
 * LinkedIn-URL geconstrueerd of gescraped.
 */

/** Maak van gebruikersinvoer een normale https-URL, of null. */
export function normalizeWebsite(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Een hostname zonder punt (bijv. "localhost" of een typefout) is geen
    // bedrijfswebsite.
    if (!url.hostname.includes(".")) return null;
    // Strip tracking-query en fragment: het gaat om de pagina, niet de campagne.
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Origin van een URL (https://host), of null. */
export function originOf(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    return new URL(input).origin;
  } catch {
    return null;
  }
}

/**
 * Accepteer een LinkedIn-URL alleen als die er echt een is.
 *
 * Toegestaan: /in/<slug> (persoon) en /company/<slug> (bedrijf), op een
 * linkedin.com-domein. Al het andere wordt geweigerd — liever leeg dan fout,
 * want een verkeerde URL kost Eric een mislukte Waalaxy-import.
 */
export function sanitizeLinkedInUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const isLinkedIn = host === "linkedin.com" || host.endsWith(".linkedin.com");
  if (!isLinkedIn) return null;

  const path = url.pathname.replace(/\/+$/, "");
  const match = path.match(/^\/(in|company|school|showcase)\/([^/]+)/i);
  if (!match) return null;

  // Canoniek, zonder tracking-parameters.
  return `https://www.linkedin.com/${match[1].toLowerCase()}/${match[2]}`;
}

/** True als deze URL een LinkedIn-persoonsprofiel is (nodig voor Waalaxy). */
export function isLinkedInProfileUrl(input: string | null | undefined): boolean {
  const clean = sanitizeLinkedInUrl(input);
  return Boolean(clean && /\/in\//.test(clean));
}

/**
 * Normaliseer een URL voor vergelijking: lowercase host, zonder www,
 * zonder trailing slash, zonder query/fragment.
 */
export function canonicalUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const url = new URL(input.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return null;
  }
}

/** Vroegste datum die we als plausibel beschouwen voor een bedrijfssignaal. */
const MIN_YEAR = 1990;
/**
 * Hoe ver een datum in de toekomst mag liggen. Een aangekondigde opening of
 * festival mag in de toekomst liggen, maar `Date.parse` is heel tolerant en kan
 * van rommel een absurde datum maken. Omdat de recency-factor een toekomstdatum
 * als "nu" behandelt, zou zo'n misparse de Trigger Score opblazen.
 */
const MAX_FUTURE_DAYS = 730;

/**
 * ISO-datum (YYYY-MM-DD) uit een losse datumwaarde, of null.
 *
 * Leunt op `Date.parse`, dat verrassend veel aankan (ook "15 juli 2026" — V8
 * matcht de eerste drie letters van de maandnaam). Onwaarschijnlijke uitkomsten
 * worden geweigerd in plaats van doorgelaten.
 */
export function normalizeDate(
  input: string | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  // Al in ISO-vorm: neem de datumkop over.
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  const parsed = isoMatch ? Date.parse(isoMatch[1]) : Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;

  const date = new Date(parsed);
  if (date.getUTCFullYear() < MIN_YEAR) return null;
  if (parsed > now + MAX_FUTURE_DAYS * 86_400_000) return null;

  return date.toISOString().slice(0, 10);
}

/** Kap een string af op een maximale lengte, zonder midden in een woord. */
export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  const cut = input.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

/** Clamp een getal binnen een bereik; null bij onbruikbare invoer. */
export function clampNumber(
  value: unknown,
  min: number,
  max: number,
): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}
