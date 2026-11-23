import type { PageFacts } from "./facts/page";

/**
 * Building blocks for the `external` check: which outside hosts count as a
 * review site or a profile, and the optional off-page sources (a search
 * provider and an LLM brand probe). The matching here is pure; the sources
 * are only types and timeouts, and are run by lib/geo/page-check.ts.
 */

/**
 * Review sites, by registrable domain. A `*` TLD (e.g. "tripadvisor.*") means
 * one of the country suffixes in ALLOWED_TLDS ("tripadvisor.nl",
 * "tripadvisor.co.uk"), not any TLD. Google Maps is matched separately, by
 * place path (see `reviewSiteOf`).
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

/** The suffixes a "name.*" pattern (and Google) may end in. Anything else, e.g. "tripadvisor.example", does not match. */
export const ALLOWED_TLDS = [
  "com", "nl", "be", "de", "fr", "co.uk", "es", "it", "at", "ch", "eu", "ie", "se", "dk", "no", "pl", "pt", "ca", "com.au",
] as const;
const ALLOWED_TLD_SET = new Set<string>(ALLOWED_TLDS);

/** Longest brand string sent to a search provider or a model; a longer one is not sent at all. */
export const MAX_BRAND_LENGTH = 80;

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
 * For a "name.*" pattern: the registrable domain when `host` is
 * "name.<suffix>" with a suffix from ALLOWED_TLDS, optionally under
 * subdomains; otherwise null. "tripadvisor.evil.example" and
 * "tripadvisor.xyz" do not match.
 */
function allowedTldMatch(host: string, name: string): string | null {
  const labels = host.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    if (labels[i] !== name) continue;
    const tail = labels.slice(i + 1).join(".");
    if (ALLOWED_TLD_SET.has(tail)) return `${name}.${tail}`;
  }
  return null;
}

/** The domain a host matches in `pattern` (a plain domain or "name.*"), or null. */
function matchPattern(host: string, pattern: string): string | null {
  if (pattern.endsWith(".*")) return allowedTldMatch(host, pattern.slice(0, -2));
  return hostMatches(host, pattern) ? pattern : null;
}

/** The URL's path, or "" when it does not parse. */
function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

/**
 * The review site a URL points to, as reported in `review_sites`: the listed
 * domain ("trustpilot.com", "g.page"), the country domain for a "name.*"
 * entry ("tripadvisor.nl"), or "google.<tld>/maps" for a Google Maps place
 * (google.<tld>/maps/place/… or maps.google.<tld>/maps/place/…). Any other
 * Google or Maps URL (a route, a search, "?cid=") is not a review site. Null
 * when it is none of them.
 */
export function reviewSiteOf(url: string): string | null {
  const host = hostOf(url);
  if (!host) return null;
  for (const pattern of REVIEW_SITE_HOSTS) {
    const match = matchPattern(host, pattern);
    if (match) return match;
  }
  const google = allowedTldMatch(host, "google");
  if (!google || !(host === google || host === `maps.${google}`)) return null;
  return /^\/maps\/place(\/|$)/i.test(pathnameOf(url)) ? `${google}/maps` : null;
}

/** Share, intent and single-video endpoints per profile host: links there are not a profile of the brand. */
const NON_PROFILE_PATHS: Record<string, RegExp> = {
  "x.com": /^\/(intent|share)(\/|$)/i,
  "twitter.com": /^\/(intent|share)(\/|$)/i,
  "facebook.com": /^\/(sharer|share\.php|dialog\/)/i,
  "linkedin.com": /^\/(shareArticle|sharing\/)/i,
  "youtube.com": /^\/(watch|embed|shorts)(\/|$)/i,
};

/** The listed profile domain a host belongs to, by host alone (no path rule). */
function profileDomainOf(host: string): string | null {
  return PROFILE_HOSTS.find((domain) => hostMatches(host, domain)) ?? null;
}

/**
 * The profile host a link points to ("linkedin.com" for
 * nl.linkedin.com/company/x), or null. A profile link needs a path other
 * than "/" that is not a share, intent or single-video endpoint
 * (NON_PROFILE_PATHS); youtu.be links are videos and never a profile.
 */
export function profileHostOf(url: string): string | null {
  const host = hostOf(url);
  if (!host) return null;
  const domain = profileDomainOf(host);
  if (!domain) return null;
  const path = pathnameOf(url);
  if (path === "" || path === "/") return null;
  return NON_PROFILE_PATHS[domain]?.test(path) ? null : domain;
}

/**
 * Whether a JSON-LD `sameAs` URL counts as a profile: its host is a listed
 * profile host or review site (by host, so a bare "linkedin.com/company/x"
 * and a review-site page both count) and is not the page's own host or a
 * parent or subdomain of it. The listed domain or review site, or null.
 */
export function listedSameAsOf(url: string, pageHost: string | null): string | null {
  const host = hostOf(url);
  if (!host) return null;
  if (pageHost && (hostMatches(host, pageHost) || hostMatches(pageHost, host))) return null;
  return profileDomainOf(host) ?? reviewSiteOf(url);
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

/**
 * The brand as it may be sent out: whitespace collapsed to single spaces on
 * one line and trimmed. Null when that is empty or longer than
 * MAX_BRAND_LENGTH; the caller then skips the search and the probe instead
 * of sending a truncated or oversized string.
 */
export function sendableBrand(brand: string): string | null {
  const line = brand.replace(/\s+/g, " ").trim();
  return line && line.length <= MAX_BRAND_LENGTH ? line : null;
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

/** A mention element with a string `url`; anything else (null, a string, a number) is dropped. */
function isMention(value: unknown): value is SearchMention {
  return !!value && typeof value === "object" && typeof (value as { url?: unknown }).url === "string";
}

/**
 * Runs a search provider; a throw, a timeout or a malformed result (not an
 * object, or `mentions` not a list) is "error", never a failed page. Mention
 * elements without a string `url` are dropped.
 */
export async function runSearch(provider: SearchProvider | undefined, brand: string, hostname: string): Promise<SearchOutcome> {
  if (!provider) return { status: "off" };
  try {
    const result: unknown = await withTimeout(provider.search({ brand, hostname }), SEARCH_TIMEOUT_MS);
    const mentions = result && typeof result === "object" ? (result as { mentions?: unknown }).mentions : undefined;
    if (!Array.isArray(mentions)) return { status: "error" };
    return {
      status: "ok",
      mentions: mentions.filter(isMention).map((m) => ({ url: m.url, title: typeof m.title === "string" ? m.title : "" })),
    };
  } catch {
    return { status: "error" };
  }
}

/** Runs the brand probe; a throw or a timeout is "error". */
export async function runBrandProbe(probe: BrandProbe | undefined, brand: string, hostname: string): Promise<BrandProbeOutcome> {
  if (!probe) return { status: "off" };
  try {
    const { mentioned, detail } = await withTimeout(probe(brand, hostname), BRAND_PROBE_TIMEOUT_MS);
    return { status: mentioned ? "mentioned" : "not_mentioned", detail: typeof detail === "string" ? detail : "" };
  } catch {
    return { status: "error" };
  }
}
