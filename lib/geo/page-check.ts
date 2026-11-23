import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { CHECK_IDS, runChecks, type CheckId, type CheckResult } from "./checks";
import { fetchPage as defaultFetchPage, type FetchPageOptions, type ScrapeResult, type UrlGuard } from "./scrape";
import type { SpeedMeasurement } from "./speed";
import {
  brandOf,
  hostOf,
  runBrandProbe,
  runSearch,
  type BrandProbe,
  type BrandProbeOutcome,
  type ExternalSources,
  type SearchOutcome,
  type SearchProvider,
} from "./external";
import { isPublicHttpUrl, resolvesToPublicAddress, type LookupAll } from "./url-safety";

/**
 * Logic behind POST /api/geo/page-check: fetch each page and run the pure
 * check registry over it. Nothing else happens here: no lead form, mail,
 * CRM, database write or model call.
 */

export const MAX_URLS = 10;
export const MAX_URL_LENGTH = 2048;
export const FETCH_CONCURRENCY = 3;

export const pageCheckBodySchema = z.object({
  urls: z.array(z.string().min(1).max(MAX_URL_LENGTH)).min(1).max(MAX_URLS),
  checks: z.array(z.enum(CHECK_IDS)).optional(),
});

export type PageCheckBody = z.infer<typeof pageCheckBodySchema>;

export type MachineAuthResult = "not_found" | "unauthorized" | "ok";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Bearer-token check for machine callers. An unset (or empty) expected token
 * hides the endpoint ("not_found"); a missing, malformed or wrong header is
 * "unauthorized".
 */
export function checkMachineAuth(
  authorizationHeader: string | null | undefined,
  expectedToken: string | null | undefined,
): MachineAuthResult {
  if (!expectedToken) return "not_found";
  const match = authorizationHeader?.match(/^Bearer\s+(\S+)\s*$/i);
  if (!match) return "unauthorized";
  return safeEqual(match[1], expectedToken) ? "ok" : "unauthorized";
}

/**
 * The full result shape. A page that could not be loaded (network error,
 * timeout, or a 4xx/5xx answer) also comes back in this shape, with
 * `fetched: false`, its `status` (null on a network error or timeout) and its
 * checks as unknown or n/a.
 */
export interface PageCheckFetched {
  url: string;
  /** Where the redirects ended; only present when that differs from `url`. */
  final_url?: string;
  /** Whether the page itself came back with a 2xx and HTML. */
  fetched: boolean;
  /** HTTP status of the page, null on a network error or timeout. */
  status: number | null;
  title: string | null;
  checks: CheckResult[];
  robots: { known: boolean; blocked_search: string[] };
  /** true = present, false = definitively absent, null = could not tell. */
  llms_txt: boolean | null;
}

/**
 * The short shape, only for a URL that was never measured: `url_not_allowed`
 * when the URL or a redirect hop was refused by the guard, `fetch_failed` when
 * the redirect chain ran past MAX_REDIRECTS or the fetch threw unexpectedly.
 * A page that merely failed to load is NOT reported this way (see
 * PageCheckFetched).
 */
export interface PageCheckFailed {
  url: string;
  fetched: false;
  error: "url_not_allowed" | "fetch_failed";
}

export type PageCheckResult = PageCheckFetched | PageCheckFailed;

export interface PageCheckResponse {
  ok: true;
  checked_at: string;
  results: PageCheckResult[];
}

export interface PageCheckDeps {
  fetchPage?: (url: string, options?: FetchPageOptions) => Promise<ScrapeResult>;
  /** DNS lookup behind the guard; defaults to `dns.promises.lookup`. */
  lookup?: LookupAll;
  now?: () => Date;
  /**
   * Takes one PageSpeed Insights measurement of a page URL. Without it speed
   * is never measured and the speed check is n/a; the route wires the real
   * one (lib/geo/speed.ts) with the API key from the environment.
   */
  measureSpeed?: (url: string) => Promise<SpeedMeasurement>;
  /**
   * Off-page search for brand mentions, for the external check. Off when
   * absent (none ships yet). Asked once per hostname per request, with a
   * SEARCH_TIMEOUT_MS cap; a throw or timeout is reported, never fatal.
   */
  searchProvider?: SearchProvider;
  /**
   * LLM brand probe, for the external check's `llm_probe` fact. Off when
   * absent. Asked at most once per request (for the first fetched page's
   * brand), never per page.
   */
  brandProbe?: BrandProbe;
}

/**
 * The guard for every hop of a page-check fetch: a public http(s) URL whose
 * host resolves only to public addresses. The DNS-rebinding gap described at
 * `resolvesToPublicAddress` remains.
 */
export function pageCheckGuard(lookup?: LookupAll): UrlGuard {
  return async (url) => isPublicHttpUrl(url) && resolvesToPublicAddress(new URL(url).hostname, lookup);
}

/** Trims and removes exact duplicates, keeping the first occurrence's position. */
export function dedupeUrls(urls: string[]): string[] {
  return [...new Set(urls.map((u) => u.trim()))];
}

/** Runs `worker` over `items` with at most `limit` in flight; results keep input order. */
async function mapWithLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

/** A measurer that breaks its never-throws promise counts as a network failure, not a failed page. */
async function measureSafely(measure: (url: string) => Promise<SpeedMeasurement>, url: string): Promise<SpeedMeasurement> {
  try {
    return await measure(url);
  } catch {
    return { ok: false, reason: "network" };
  }
}

function toResult(url: string, scrape: ScrapeResult, checks: CheckResult[]): PageCheckFetched {
  return {
    url,
    ...(scrape.finalUrl && scrape.finalUrl !== url ? { final_url: scrape.finalUrl } : {}),
    fetched: scrape.metadata.fetched,
    status: scrape.metadata.status ?? null,
    title: scrape.facts?.title ?? scrape.metadata.title ?? null,
    checks,
    robots: {
      known: scrape.robots.known,
      blocked_search: scrape.robots.blockedSearch.map((bot) => bot.token),
    },
    llms_txt: scrape.llmsTxtPresent ?? null,
  };
}

/**
 * Checks up to MAX_URLS pages. Never throws: a URL that is not public becomes
 * `url_not_allowed` without being fetched, and a fetch (or check) that throws
 * becomes `fetch_failed`; the other URLs still run. Each fetch runs under
 * `pageCheckGuard`: a hop it refuses (redirect or DNS) is `url_not_allowed`,
 * a chain past the redirect limit is `fetch_failed`. A page that was reached
 * but did not load (network error, 4xx/5xx) is a full result with
 * `fetched: false`. Checks run against the final URL.
 *
 * Speed is measured only when the `speed` check is requested (or no checks
 * are named), `measureSpeed` is given and the page was fetched, on the final
 * URL, inside the same lane as its fetch, so at most FETCH_CONCURRENCY pages
 * are fetched or measured at once.
 *
 * The external check's optional sources (`searchProvider`, `brandProbe`) run
 * only when that check is requested and the page loaded, next to the speed
 * measurement; the search once per hostname, the probe once per request.
 */
export async function runPageCheck(body: PageCheckBody, deps: PageCheckDeps = {}): Promise<PageCheckResponse> {
  const fetchPage = deps.fetchPage ?? defaultFetchPage;
  const now = (deps.now ?? (() => new Date()))();
  const ids: CheckId[] | undefined = body.checks;
  const wantsSpeed = !ids || ids.length === 0 || ids.includes("speed");
  const measure = wantsSpeed ? deps.measureSpeed : undefined;
  const urls = dedupeUrls(body.urls).slice(0, MAX_URLS);
  const guard = pageCheckGuard(deps.lookup);
  const wantsExternal = !ids || ids.length === 0 || ids.includes("external");
  const searchProvider = wantsExternal ? deps.searchProvider : undefined;
  const brandProbe = wantsExternal ? deps.brandProbe : undefined;
  const searches = new Map<string, Promise<SearchOutcome>>();
  let probeOnce: Promise<BrandProbeOutcome> | null = null;

  /** The off-page sources for one fetched page; null when both are off. Shares one search per hostname and one probe per request. */
  const gatherExternal = async (scrape: ScrapeResult, finalUrl: string): Promise<ExternalSources | null> => {
    if (!searchProvider && !brandProbe) return null;
    const hostname = hostOf(finalUrl) ?? "";
    const brand = brandOf(scrape.facts, hostname);
    let search = searches.get(hostname);
    if (!search) {
      search = runSearch(searchProvider, brand, hostname);
      searches.set(hostname, search);
    }
    if (!probeOnce) probeOnce = runBrandProbe(brandProbe, brand, hostname);
    const [searchOutcome, llmProbe] = await Promise.all([search, probeOnce]);
    return { search: searchOutcome, llmProbe };
  };

  const results = await mapWithLimit(urls, FETCH_CONCURRENCY, async (url): Promise<PageCheckResult> => {
    if (!isPublicHttpUrl(url)) return { url, fetched: false, error: "url_not_allowed" };
    try {
      const scrape = await fetchPage(url, { guard });
      if (scrape.fetchError === "url_not_allowed") return { url, fetched: false, error: "url_not_allowed" };
      if (scrape.fetchError) return { url, fetched: false, error: "fetch_failed" };
      const finalUrl = scrape.finalUrl ?? url;
      const loaded = scrape.metadata.fetched && !!scrape.facts;
      const [speed, external] = await Promise.all([
        measure && scrape.metadata.fetched ? measureSafely(measure, finalUrl) : null,
        loaded ? gatherExternal(scrape, finalUrl) : null,
      ]);
      return toResult(url, scrape, runChecks(scrape, finalUrl, ids, now, speed, external));
    } catch {
      return { url, fetched: false, error: "fetch_failed" };
    }
  });

  return { ok: true, checked_at: now.toISOString(), results };
}
