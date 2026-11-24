import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  CHECK_IDS,
  outOfTime,
  runChecks,
  selectedCheckIds,
  type CheckId,
  type CheckResult,
  type ClarityOutcome,
  type Unreachable,
} from "./checks";
import { firstScreenOf, type ClarityJudge } from "./clarity-judge";
import { fetchPage as defaultFetchPage, type FetchPageOptions, type ScrapeResult, type UrlGuard } from "./scrape";
import type { SpeedMeasurement } from "./speed";
import {
  brandOf,
  hostOf,
  runBrandProbe,
  runSearch,
  sendableBrand,
  EXTERNAL_SOURCES_OFF,
  type BrandProbe,
  type ExternalSources,
  type SearchProvider,
} from "./external";
import { DNS_LOOKUP_TIMEOUT_MS, hasOnlyIpv6Addresses, isPublicHttpUrl, resolvesToPublicAddress, type LookupAll } from "./url-safety";

/**
 * Logic behind POST /api/geo/page-check: fetch each page and run the pure
 * check registry over it. Nothing else happens here: no lead form, mail, CRM
 * or database write. The only model calls are the optional ones injected
 * through the deps (the clarity judge and the brand probe).
 */

export const MAX_URLS = 10;
export const MAX_URL_LENGTH = 2048;
export const FETCH_CONCURRENCY = 3;

/**
 * Hard time budget for one request, well inside the routes' maxDuration
 * (120 s). A page whose fetch has not started or finished by then comes back
 * with every check n/a ("time budget"); a speed measurement or clarity
 * verdict or off-page source still running is cut off at the budget. The
 * batch itself never fails on time. The cut-off work is not aborted; each
 * of those calls has its own timeout (fetch, SPEED_TIMEOUT_MS,
 * CLARITY_TIMEOUT_MS).
 */
export const PAGE_CHECK_BUDGET_MS = 90_000;

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
  /** How the page was reached when that was unusual, e.g. the www host failed and the address without www answered. */
  fetch_note?: string;
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
   * absent. Asked once per hostname per request, like the search, never per
   * page.
   */
  brandProbe?: BrandProbe;
  /**
   * The model verdict for the clarity check. Off when absent (the check is
   * then structure only). Asked once per loaded page that is not a JS shell,
   * only when clarity is requested; a throw is "no verdict", never fatal.
   */
  judgeClarity?: ClarityJudge;
  /** The request's time budget in ms; defaults to PAGE_CHECK_BUDGET_MS. */
  budgetMs?: number;
  /** Milliseconds clock for the budget; defaults to Date.now. Injected in tests. */
  clock?: () => number;
}

const OUT_OF_TIME: unique symbol = Symbol("out_of_time");

/** `work`, or OUT_OF_TIME when it has not settled within `ms` (the work itself keeps running). */
async function withinTime<T>(work: Promise<T>, ms: number): Promise<T | typeof OUT_OF_TIME> {
  if (ms <= 0) return OUT_OF_TIME;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<typeof OUT_OF_TIME>((resolve) => {
    timer = setTimeout(() => resolve(OUT_OF_TIME), ms);
  });
  try {
    return await Promise.race([work, expiry]);
  } finally {
    clearTimeout(timer);
  }
}

/** A page the budget ran out on before it was measured: the full shape, every check n/a. */
function outOfTimeResult(url: string, ids: CheckId[] | undefined): PageCheckFetched {
  return {
    url,
    fetched: false,
    status: null,
    title: null,
    checks: selectedCheckIds(ids).map(outOfTime),
    robots: { known: false, blocked_search: [] },
    llms_txt: null,
  };
}

/** A judge that throws gives no verdict; it never fails the page. */
async function judgeSafely(judge: ClarityJudge, scrape: ScrapeResult, url: string): Promise<ClarityOutcome | null> {
  const screen = firstScreenOf(scrape, url);
  if (!screen) return null;
  try {
    const { verdict, reason } = await judge(screen);
    return { ok: true, verdict, reason };
  } catch {
    return { ok: false, reason: "error" };
  }
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

/**
 * Why the requested address could not be reached: "ipv6_only" when its host
 * has only IPv6 addresses (one more lookup, within the time left), else
 * "unreachable". Only for a chain in which no hop answered at all.
 */
async function unreachableReason(url: string, lookup: LookupAll | undefined, msLeft: number): Promise<Unreachable> {
  const plain: Unreachable = { reason: "unreachable" };
  // The host as asked, www included (hostOf drops it).
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return plain;
  }
  if (!host || msLeft <= 0) return plain;
  const ipv6Only = await hasOnlyIpv6Addresses(host, lookup, Math.min(msLeft, DNS_LOOKUP_TIMEOUT_MS));
  return ipv6Only ? { reason: "ipv6_only", host } : plain;
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
    ...(scrape.fetchNote ? { fetch_note: scrape.fetchNote } : {}),
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
 * measurement, each once per hostname of the final URL, so a page only shows
 * the result for its own site. The brand asked about is that of the first URL
 * in input order whose page loaded on that hostname (see `brandFor`); a brand
 * that is empty or over MAX_BRAND_LENGTH turns both sources off for the host.
 *
 * The clarity judge, when given and clarity is requested, runs next to the
 * speed measurement for every loaded page that is not a JS shell.
 *
 * Everything runs under one time budget (`budgetMs`, PAGE_CHECK_BUDGET_MS by
 * default): a page not fetched by then is returned with every check n/a and
 * reason "time_budget" (see `outOfTimeResult`); a speed measurement still
 * running counts as a timeout, a clarity verdict as none and an off-page
 * source as an error.
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
  const sourcesByHost = new Map<string, Promise<ExternalSources>>();
  const wantsClarity = !ids || ids.length === 0 || ids.includes("clarity");
  const judge = wantsClarity ? deps.judgeClarity : undefined;
  const clock = deps.clock ?? Date.now;
  const deadline = clock() + (deps.budgetMs ?? PAGE_CHECK_BUDGET_MS);
  const left = () => deadline - clock();
  /** The off-page sources that were on but had not answered by the deadline count as failed. */
  const externalOutOfTime: ExternalSources = {
    search: searchProvider ? { status: "error" } : { status: "off" },
    llmProbe: brandProbe ? { status: "error" } : { status: "off" },
  };

  /**
   * Per input index: settles once that URL's fetch is over, with the
   * hostname and brand when its page loaded, else null. Settled right after
   * the fetch (before speed or the external sources), and a fetch never waits
   * on another URL, so waiting on earlier indexes cannot deadlock the lanes.
   */
  const settles: Array<(loaded: { hostname: string; brand: string } | null) => void> = [];
  const loadedPages = urls.map(
    () => new Promise<{ hostname: string; brand: string } | null>((resolve) => settles.push(resolve)),
  );

  /**
   * The brand for `hostname`, deterministic per request: that of the first
   * URL in input order (up to and including `index`) whose page loaded on
   * this hostname. Lanes take URLs in input order, so the earlier ones are
   * already fetching or done.
   */
  const brandFor = async (index: number, hostname: string, own: string): Promise<string> => {
    const earlier = await Promise.all(loadedPages.slice(0, index));
    return earlier.find((page) => page?.hostname === hostname)?.brand ?? own;
  };

  /** The off-page sources for one loaded page; null when both are off. One search and one probe per hostname. */
  const gatherExternal = async (index: number, hostname: string, own: string): Promise<ExternalSources | null> => {
    if (!searchProvider && !brandProbe) return null;
    let sources = sourcesByHost.get(hostname);
    if (!sources) {
      sources = brandFor(index, hostname, own).then(async (raw): Promise<ExternalSources> => {
        const brand = sendableBrand(raw);
        if (!brand) return EXTERNAL_SOURCES_OFF;
        const [search, llmProbe] = await Promise.all([runSearch(searchProvider, brand, hostname), runBrandProbe(brandProbe, brand, hostname)]);
        return { search, llmProbe };
      });
      sourcesByHost.set(hostname, sources);
    }
    return sources;
  };

  const results = await mapWithLimit(urls.map((url, index) => ({ url, index })), FETCH_CONCURRENCY, async ({ url, index }): Promise<PageCheckResult> => {
    let settled = false;
    const settle = (loaded: { hostname: string; brand: string } | null) => {
      if (!settled) settles[index](loaded);
      settled = true;
    };
    try {
      if (!isPublicHttpUrl(url)) return { url, fetched: false, error: "url_not_allowed" };
      if (left() <= 0) return outOfTimeResult(url, ids);
      const fetched = await withinTime(fetchPage(url, { guard }), left());
      if (fetched === OUT_OF_TIME) return outOfTimeResult(url, ids);
      const scrape = fetched;
      if (scrape.fetchError === "url_not_allowed") return { url, fetched: false, error: "url_not_allowed" };
      if (scrape.fetchError && scrape.fetchError !== "unreachable") return { url, fetched: false, error: "fetch_failed" };
      if (scrape.fetchError === "unreachable") {
        // A page nobody could connect to: the full shape with status null, as before, but each unmeasured check says why.
        // After a redirect answered, a later host failed: no claim about the address asked for.
        const unreachable = scrape.failedAfterRedirect
          ? ({ reason: "unreachable" } as const)
          : await unreachableReason(url, deps.lookup, left());
        const checks = runChecks(scrape, scrape.finalUrl ?? url, ids, now, null, null, null, unreachable);
        settle(null);
        return toResult(url, scrape, checks);
      }
      const finalUrl = scrape.finalUrl ?? url;
      const hostname = hostOf(finalUrl) ?? "";
      const loaded = scrape.metadata.fetched && !!scrape.facts;
      const brand = brandOf(scrape.facts, hostname);
      settle(loaded ? { hostname, brand } : null);
      const [speed, external, clarity] = await Promise.all([
        measure && scrape.metadata.fetched
          ? withinTime(measureSafely(measure, finalUrl), left()).then(
              (measured): SpeedMeasurement => (measured === OUT_OF_TIME ? { ok: false, reason: "timeout" } : measured),
            )
          : null,
        loaded
          ? withinTime(gatherExternal(index, hostname, brand), left()).then((gathered) =>
              gathered === OUT_OF_TIME ? externalOutOfTime : gathered,
            )
          : null,
        judge && loaded && !scrape.facts!.jsShell
          ? withinTime(judgeSafely(judge, scrape, finalUrl), left()).then(
              (judged): ClarityOutcome | null => (judged === OUT_OF_TIME ? { ok: false, reason: "timeout" } : judged),
            )
          : null,
      ]);
      return toResult(url, scrape, runChecks(scrape, finalUrl, ids, now, speed, external, clarity));
    } catch {
      return { url, fetched: false, error: "fetch_failed" };
    } finally {
      settle(null);
    }
  });

  return { ok: true, checked_at: now.toISOString(), results };
}
