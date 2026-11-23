import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { CHECK_IDS, runChecks, type CheckId, type CheckResult } from "./checks";
import { fetchPage as defaultFetchPage, type FetchPageOptions, type ScrapeResult, type UrlGuard } from "./scrape";
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
 * a chain past the redirect limit is `fetch_failed`. Checks run against the
 * final URL.
 */
export async function runPageCheck(body: PageCheckBody, deps: PageCheckDeps = {}): Promise<PageCheckResponse> {
  const fetchPage = deps.fetchPage ?? defaultFetchPage;
  const now = (deps.now ?? (() => new Date()))();
  const ids: CheckId[] | undefined = body.checks;
  const urls = dedupeUrls(body.urls).slice(0, MAX_URLS);
  const guard = pageCheckGuard(deps.lookup);

  const results = await mapWithLimit(urls, FETCH_CONCURRENCY, async (url): Promise<PageCheckResult> => {
    if (!isPublicHttpUrl(url)) return { url, fetched: false, error: "url_not_allowed" };
    try {
      const scrape = await fetchPage(url, { guard });
      if (scrape.fetchError === "url_not_allowed") return { url, fetched: false, error: "url_not_allowed" };
      if (scrape.fetchError) return { url, fetched: false, error: "fetch_failed" };
      return toResult(url, scrape, runChecks(scrape, scrape.finalUrl ?? url, ids, now));
    } catch {
      return { url, fetched: false, error: "fetch_failed" };
    }
  });

  return { ok: true, checked_at: now.toISOString(), results };
}
