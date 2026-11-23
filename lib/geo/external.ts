import type { PageFacts } from "./facts/page";

/**
 * Building blocks for the `external` check: which outside hosts count as a
 * review site or a profile, and the optional off-page sources (a search
 * provider and an LLM brand probe). The matching here is pure; the sources
 * are only types and timeouts, and are run by lib/geo/page-check.ts.
 */

/**
 * Review sites, by registrable domain. A `*` TLD (e.g. "tripadvisor.*") means
 * any country domain ("tripadvisor.nl", "tripadvisor.co.uk"). Google Maps is
 * matched separately, by path (see `reviewSiteOf`).
 */
export const REVIEW_SITE_HOSTS = [
  "trustpilot.com",
  "kiyoh.com",
  "klantenvertellen.nl",
  "g.page",
  "maps.app.goo.gl",
  "tripadvisor.*",
  "feedbackcompany.com",
  "trustedshops.*",
  "capterra.*",
  "g2.com",
  "yelp.*",
] as const;

/** Social and reference profiles. They support a brand's identity but are not reviews. */
export const PROFILE_HOSTS = [
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "tiktok.com",
  "wikipedia.org",
  "wikidata.org",
] as const;

/** How long a search provider may take before it counts as an error. */
export const SEARCH_TIMEOUT_MS = 10_000;
/** How long the LLM brand probe may take; its engines are time-boxed at 18 s each. */
export const BRAND_PROBE_TIMEOUT_MS = 30_000;

/** Second-level labels that form a country suffix together with the TLD, as in "co.uk" or "com.au". */
const COUNTRY_SECOND_LEVELS = new Set(["co", "com", "org", "net", "ac", "gov"]);

/** Lower-cased hostname without a leading "www."; null for anything that is not an http(s) URL. */
export function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return null;
  }
}

/** True when `host` is `domain` or a subdomain of it ("nl.trustpilot.com" for "trustpilot.com"). Never a substring match. */
export function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * For a "name.*" pattern: the registrable domain when `host` is "name.<tld>"
 * or "name.<co|com|…>.<tld>", optionally under subdomains; otherwise null.
 * "tripadvisor.evil.example" does not match.
 */
function anyTldMatch(host: string, name: string): string | null {
  const labels = host.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    if (labels[i] !== name) continue;
    const tail = labels.slice(i + 1);
    if (tail.length === 1 || (tail.length === 2 && COUNTRY_SECOND_LEVELS.has(tail[0]))) return [name, ...tail].join(".");
  }
  return null;
}

/** The domain a host matches in `pattern` (a plain domain or "name.*"), or null. */
function matchPattern(host: string, pattern: string): string | null {
  if (pattern.endsWith(".*")) return anyTldMatch(host, pattern.slice(0, -2));
  return hostMatches(host, pattern) ? pattern : null;
}

/**
 * The review site a URL points to, as reported in `review_sites`: the listed
 * domain ("trustpilot.com"), the country domain for a "name.*" entry
 * ("tripadvisor.nl"), or "google.<tld>/maps" for a Google Maps place
 * (maps.google.<tld>, or google.<tld>/maps). Null when it is none of them.
 */
export function reviewSiteOf(url: string): string | null {
  const host = hostOf(url);
  if (!host) return null;
  for (const pattern of REVIEW_SITE_HOSTS) {
    const match = matchPattern(host, pattern);
    if (match) return match;
  }
  const google = anyTldMatch(host, "google");
  if (!google) return null;
  const onMapsHost = host.startsWith("maps.");
  let onMapsPath = false;
  try {
    onMapsPath = /^\/maps(\/|$)/.test(new URL(url).pathname);
  } catch {
    /* hostOf already parsed it */
  }
  return onMapsHost || onMapsPath ? `${google}/maps` : null;
}

/** The profile host a URL points to ("linkedin.com" for nl.linkedin.com/company/x), or null. */
export function profileHostOf(url: string): string | null {
  const host = hostOf(url);
  if (!host) return null;
  return PROFILE_HOSTS.find((domain) => hostMatches(host, domain)) ?? null;
}

/**
 * The brand name to ask about: the site name the page states (og:site_name or
 * the JSON-LD organization), else the first label of the hostname
 * ("voorbeeld" for voorbeeld.example).
 */
export function brandOf(facts: Pick<PageFacts, "siteName" | "jsonLd"> | null, hostname: string): string {
  const stated = facts?.siteName?.trim() || facts?.jsonLd.orgName?.trim();
  return stated || hostname.split(".")[0] || hostname;
}

/** One brand mention a search provider found. */
export interface SearchMention {
  url: string;
  title: string;
}

/**
 * An off-page search source for brand mentions. None ships; see
 * `selectSearchProvider`. Injected through `runPageCheck` deps.
 */
export interface SearchProvider {
  name: string;
  search(query: { brand: string; hostname: string }): Promise<{ mentions: SearchMention[] }>;
}

/**
 * Asks LLMs whether they know the brand. Supporting only: it never changes the
 * external grade. Injected through `runPageCheck` deps; the route wires it
 * only when GEO_EXTERNAL_LLM_PROBE is "1".
 */
export type BrandProbe = (brand: string, hostname: string) => Promise<{ mentioned: boolean; detail: string }>;

export type SearchOutcome = { status: "off" } | { status: "error" } | { status: "ok"; mentions: SearchMention[] };

export type BrandProbeOutcome = { status: "off" } | { status: "error" } | { status: "mentioned" | "not_mentioned"; detail: string };

/** What the off-page sources returned for a page, handed to the external check on the context. */
export interface ExternalSources {
  search: SearchOutcome;
  llmProbe: BrandProbeOutcome;
}

export const EXTERNAL_SOURCES_OFF: ExternalSources = { search: { status: "off" }, llmProbe: { status: "off" } };

/**
 * The selection point for GEO_EXTERNAL_SEARCH_PROVIDER. No provider ships
 * yet, so every value is off: unset and "none" by design, anything else
 * because nothing answers to it. A future provider is added as a case here.
 */
export function selectSearchProvider(name: string | undefined): SearchProvider | undefined {
  switch ((name ?? "none").trim().toLowerCase()) {
    case "":
    case "none":
      return undefined;
    // case "<provider>": return <provider>SearchProvider(...);
    default:
      return undefined;
  }
}

/** Rejects after `ms`; the timer is cleared as soon as `promise` settles. */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs a search provider; a throw or a timeout is "error", never a failed page. */
export async function runSearch(provider: SearchProvider | undefined, brand: string, hostname: string): Promise<SearchOutcome> {
  if (!provider) return { status: "off" };
  try {
    const { mentions } = await withTimeout(provider.search({ brand, hostname }), SEARCH_TIMEOUT_MS);
    return { status: "ok", mentions: Array.isArray(mentions) ? mentions : [] };
  } catch {
    return { status: "error" };
  }
}

/** Runs the brand probe; a throw or a timeout is "error". */
export async function runBrandProbe(probe: BrandProbe | undefined, brand: string, hostname: string): Promise<BrandProbeOutcome> {
  if (!probe) return { status: "off" };
  try {
    const { mentioned, detail } = await withTimeout(probe(brand, hostname), BRAND_PROBE_TIMEOUT_MS);
    return { status: mentioned ? "mentioned" : "not_mentioned", detail };
  } catch {
    return { status: "error" };
  }
}
