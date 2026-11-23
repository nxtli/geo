import type { GeoPageMetadata } from "./types";
import { logError } from "./logger";
import { extractPageFacts, htmlToOutlineText, type PageFacts } from "./facts/page";
import { analyzeRobots, type RobotsReport } from "./facts/robots";

/**
 * Best-effort homepage fetch + real technical signals for the GEO check.
 * Never throws. Crucially distinguishes "absent" (a definitive non-200, e.g.
 * 404 for /llms.txt) from "unknown" (a network error/timeout) — they mean
 * very different things in the report.
 */
export interface ScrapeResult {
  text: string | null;
  metadata: GeoPageMetadata;
  /** /robots.txt: contents if served, "" if definitively absent, null if unreachable. */
  robotsTxt: string | null;
  /** /llms.txt: true = present, false = absent (e.g. 404), undefined = not checked. */
  llmsTxtPresent?: boolean;
  /** Gemeten feiten uit HTML en headers. null als de pagina niet is opgehaald. */
  facts: PageFacts | null;
  /** Toegang per AI-bot volgens robots.txt. */
  robots: RobotsReport;
  /**
   * Only set by a guarded fetch: the URL the page was finally read from after
   * the redirects it followed (equal to the requested URL when there were none).
   */
  finalUrl?: string;
  /**
   * Only set by a guarded fetch that stopped before reading the page:
   * "url_not_allowed" when the guard refused a hop, "too_many_redirects" when
   * the chain ran past MAX_REDIRECTS.
   */
  fetchError?: "url_not_allowed" | "too_many_redirects";
}

/** Decides whether a URL may be fetched; called on every hop of a guarded fetch. */
export type UrlGuard = (url: string) => boolean | Promise<boolean>;

export interface FetchPageOptions {
  /**
   * When set, redirects are followed by hand (at most MAX_REDIRECTS) and every
   * hop, the first one included, must pass this guard. robots.txt and llms.txt
   * are then read from the final page URL's origin, under the same guard.
   * Without it the fetch behaves as it always has (redirect: "follow").
   */
  guard?: UrlGuard;
}

/** Redirects a guarded fetch follows before giving up. */
export const MAX_REDIRECTS = 5;

const MAX_CHARS = 16_000;
const PAGE_TIMEOUT_MS = 7_000;
const SIGNAL_TIMEOUT_MS = 5_000;

interface Probe {
  status: number | null; // null = network error / timeout (truly unknown)
  text: string | null;
  xRobotsTag?: string | null;
}

/**
 * Fetches any page URL (homepage or deep page) plus the origin's robots.txt
 * and llms.txt. robots.txt is evaluated against this URL's own path. Never throws.
 * See {@link FetchPageOptions} for the guarded mode.
 */
export async function fetchPage(url: string, options: FetchPageOptions = {}): Promise<ScrapeResult> {
  if (options.guard) return fetchPageGuarded(url, options.guard);

  let origin: string | null = null;
  try {
    origin = new URL(url).origin;
  } catch {
    origin = null;
  }

  const [page, robots, llms] = await Promise.all([
    probe(url, PAGE_TIMEOUT_MS, true),
    origin ? probe(`${origin}/robots.txt`, SIGNAL_TIMEOUT_MS) : noProbe(),
    origin ? probe(`${origin}/llms.txt`, SIGNAL_TIMEOUT_MS) : noProbe(),
  ]);
  return buildResult(url, page, robots, llms);
}

/**
 * Guarded mode: the page first (its redirects followed by hand under the
 * guard), then robots.txt and llms.txt from the final URL's origin. A refused
 * or failed signal file counts as unreachable (robots unknown, llms unknown).
 */
async function fetchPageGuarded(url: string, guard: UrlGuard): Promise<ScrapeResult> {
  const page = await guardedProbe(url, PAGE_TIMEOUT_MS, guard, true);
  if (page.kind !== "response") {
    return {
      text: null,
      metadata: { fetched: false, status: null },
      robotsTxt: null,
      facts: null,
      robots: analyzeRobots(null, url),
      fetchError: page.kind === "refused" ? "url_not_allowed" : "too_many_redirects",
    };
  }
  const finalUrl = page.url;
  const origin = originOf(finalUrl);
  const signal = async (path: string): Promise<Probe> => {
    if (!origin) return { status: null, text: null };
    const result = await guardedProbe(`${origin}${path}`, SIGNAL_TIMEOUT_MS, guard);
    return result.kind === "response" ? result.probe : { status: null, text: null };
  };
  const [robots, llms] = await Promise.all([signal("/robots.txt"), signal("/llms.txt")]);
  return { ...buildResult(finalUrl, page.probe, robots, llms), finalUrl };
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Assembles the result from the three probes; facts and robots are read against `url`. */
function buildResult(url: string, page: Probe, robots: Probe, llms: Probe): ScrapeResult {

  // robots.txt: served → contents; definitive non-2xx (no file) → "" (allowed);
  // network error → null (unknown).
  const robotsTxt =
    robots.status === null
      ? null
      : isOk(robots.status) && robots.text
        ? robots.text.slice(0, 4_000)
        : "";

  // llms.txt: present / absent / unknown (see interface).
  const llmsTxtPresent =
    llms.status === null
      ? undefined
      : isOk(llms.status) && !!llms.text && llms.text.trim().length > 0 && !looksLikeHtml(llms.text)
        ? true
        : false;

  const robotsReport = analyzeRobots(robotsTxt, url);

  if (page.status === null || !isOk(page.status) || !page.text) {
    return {
      text: null,
      metadata: { fetched: false, status: page.status ?? null },
      robotsTxt,
      llmsTxtPresent,
      facts: null,
      robots: robotsReport,
    };
  }

  const html = page.text;
  // Extract real technical signals from the RAW html (before stripping).
  const metaRobots =
    extractAttr(html, /<meta[^>]+name=["']robots["'][^>]*>/i) ?? null;
  const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);
  const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;
  const headingCount = (html.match(/<h[1-3][\s>]/gi) ?? []).length;

  const title = extractTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    extractAttr(html, /<meta[^>]+name=["']description["'][^>]*>/i) ??
    extractAttr(html, /<meta[^>]+property=["']og:description["'][^>]*>/i);
  const facts = extractPageFacts(html, url, { xRobotsTag: page.xRobotsTag ?? null });
  // Tekst mét herkenbare koppen, zodat het model de structuur ziet.
  const text = htmlToOutlineText(html).slice(0, MAX_CHARS);

  return {
    text: text || null,
    metadata: {
      fetched: true,
      status: page.status,
      title: title ?? null,
      description: description ?? null,
      word_count: facts.wordCount,
      meta_robots: metaRobots,
      has_json_ld: hasJsonLd,
      h1_count: h1Count,
      heading_count: headingCount,
    },
    robotsTxt,
    llmsTxtPresent,
    facts,
    robots: robotsReport,
  };
}

function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}

function looksLikeHtml(s: string): boolean {
  return /<!doctype html|<html|<body/i.test(s.slice(0, 600));
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type GuardedProbe =
  | { kind: "response"; url: string; probe: Probe }
  | { kind: "refused" }
  | { kind: "too_many_redirects" };

/** A guard that throws counts as a refusal. */
async function allowed(guard: UrlGuard, url: string): Promise<boolean> {
  try {
    return (await guard(url)) === true;
  } catch {
    return false;
  }
}

/**
 * Fetches `target` with redirect: "manual", following up to MAX_REDIRECTS
 * hops by hand. Each Location is resolved against the current URL and every
 * hop, the first included, must pass the guard. One timeout covers the whole
 * chain. A network error or timeout is a response with status null; a
 * redirect without a usable Location is returned as that 3xx response.
 */
async function guardedProbe(target: string, timeoutMs: number, guard: UrlGuard, html = false): Promise<GuardedProbe> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let current = target;
  try {
    for (let hop = 0; ; hop++) {
      if (!(await allowed(guard, current))) return { kind: "refused" };
      let res: Response;
      try {
        res = await fetch(current, {
          signal: controller.signal,
          redirect: "manual",
          headers: {
            "User-Agent": "NXTLI-GEO-Scan/1.0 (+https://geo.nxtli.com)",
            ...(html ? { Accept: "text/html,application/xhtml+xml" } : {}),
          },
        });
      } catch (error) {
        if (html) logError("scrape.fetchPage", error);
        return { kind: "response", url: current, probe: { status: null, text: null } };
      }
      const location = REDIRECT_STATUSES.has(res.status) ? res.headers.get("location") : null;
      const next = location ? resolveLocation(location, current) : null;
      if (next) {
        await res.body?.cancel().catch(() => {});
        if (hop >= MAX_REDIRECTS) return { kind: "too_many_redirects" };
        current = next;
        continue;
      }
      let text: string | null = null;
      try {
        text = await res.text();
      } catch {
        text = null;
      }
      return { kind: "response", url: current, probe: { status: res.status, text, xRobotsTag: res.headers.get("x-robots-tag") } };
    }
  } finally {
    clearTimeout(timeout);
  }
}

/** A Location header resolved against the URL it came from, or null when it does not parse. */
function resolveLocation(location: string, base: string): string | null {
  try {
    return new URL(location, base).href;
  } catch {
    return null;
  }
}

function noProbe(): Promise<Probe> {
  return Promise.resolve({ status: null, text: null });
}

async function probe(target: string, timeoutMs: number, html = false): Promise<Probe> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(target, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "NXTLI-GEO-Scan/1.0 (+https://geo.nxtli.com)",
        ...(html ? { Accept: "text/html,application/xhtml+xml" } : {}),
      },
    });
    let text: string | null = null;
    try {
      text = await res.text();
    } catch {
      text = null;
    }
    return { status: res.status, text, xRobotsTag: res.headers.get("x-robots-tag") };
  } catch (error) {
    if (html) logError("scrape.fetchPage", error);
    return { status: null, text: null };
  } finally {
    clearTimeout(timeout);
  }
}

function extractTag(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

function extractAttr(html: string, tagRe: RegExp): string | null {
  const tag = html.match(tagRe)?.[0];
  if (!tag) return null;
  const m = tag.match(/content=["']([^"']*)["']/i);
  return m ? m[1].trim() : null;
}

/** Previous name of {@link fetchPage}; kept so existing callers keep working. */
export const fetchHomepage = fetchPage;
