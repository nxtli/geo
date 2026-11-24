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
   * Only set by a guarded fetch that did not read the page: "url_not_allowed"
   * when the guard refused a hop, "too_many_redirects" when the chain ran past
   * MAX_REDIRECTS, "unreachable" when the connection itself failed (a thrown
   * fetch that was not our own timeout). An unreachable page still carries
   * status null; robots.txt and llms.txt are then not asked for (robots
   * unknown, llms unknown), since their origin did not answer either.
   */
  fetchError?: "url_not_allowed" | "too_many_redirects" | "unreachable";
  /**
   * Only set with fetchError "unreachable": an earlier hop answered with a
   * redirect, so the connection that failed was to a later address (finalUrl),
   * not to the one asked for.
   */
  failedAfterRedirect?: true;
  /**
   * Only set by a guarded fetch that fell back from a "www." host to the same
   * address without "www." after the first connection failed.
   */
  fetchNote?: string;
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

/** fetchNote when the www host failed to connect and the address without www answered. */
export const WWW_FALLBACK_ANSWERED = "www address unreachable; the address without www answered";
/** fetchNote when neither the www host nor the address without www could be reached. */
export const WWW_FALLBACK_FAILED = "www address unreachable; the address without www did not answer either";

/** Redirects a guarded fetch follows before giving up. */
export const MAX_REDIRECTS = 5;

const MAX_CHARS = 16_000;
const PAGE_TIMEOUT_MS = 7_000;
const SIGNAL_TIMEOUT_MS = 5_000;

/** Guarded mode only: the most of a page body that is read; the rest is cancelled. */
export const PAGE_MAX_BYTES = 2 * 1024 * 1024;
/** Guarded mode only: the most of robots.txt or llms.txt that is read. */
export const SIGNAL_MAX_BYTES = 512 * 1024;

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
  const page = await guardedProbe(url, PAGE_TIMEOUT_MS, guard, PAGE_MAX_BYTES, true, true);
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
  // No HTTP response at the end of the chain: a connection failure or our timeout.
  const failed = page.probe.status === null;
  // When nothing after the fallback answered, the address asked for is what failed;
  // when a redirect answered first, the hop that failed is kept.
  const finalUrl = failed && page.fellBack && !page.redirected ? url : page.url;
  const origin = originOf(finalUrl);
  const none: Probe = { status: null, text: null };
  const signal = async (path: string): Promise<Probe> => {
    if (!origin) return none;
    const result = await guardedProbe(`${origin}${path}`, SIGNAL_TIMEOUT_MS, guard, SIGNAL_MAX_BYTES);
    return result.kind === "response" ? result.probe : none;
  };
  // An origin whose connection failed (or a www host that failed and a fallback that
  // gave no answer) is not asked for its signal files: same result as a failed probe.
  const deadOrigin = failed && (page.unreachable || page.fellBack);
  const [robots, llms] = deadOrigin ? [none, none] : await Promise.all([signal("/robots.txt"), signal("/llms.txt")]);
  return {
    ...buildResult(finalUrl, page.probe, robots, llms),
    finalUrl,
    ...(page.unreachable ? { fetchError: "unreachable" as const } : {}),
    ...(page.unreachable && page.redirected ? { failedAfterRedirect: true as const } : {}),
    ...(page.fellBack ? { fetchNote: failed ? WWW_FALLBACK_FAILED : WWW_FALLBACK_ANSWERED } : {}),
  };
}

/** The same URL without a leading "www." on its host, or null when there is none to drop. */
function withoutWww(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host.startsWith("www.") || !host.slice(4).includes(".")) return null;
    parsed.hostname = host.slice(4);
    return parsed.toString();
  } catch {
    return null;
  }
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
  | {
      kind: "response";
      url: string;
      probe: Probe;
      /** The last connection failed (a thrown fetch, not our timeout); probe.status is null. */
      unreachable?: boolean;
      /** The www host failed to connect and the address without www was tried. */
      fellBack?: boolean;
      /** With probe.status null: an earlier hop answered with a redirect before the chain failed. */
      redirected?: boolean;
    }
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
 * redirect without a usable Location is returned as that 3xx response. At
 * most `maxBytes` of the final body are read (see readCappedText).
 *
 * With `wwwFallback`, a first hop to a "www." host whose connection fails
 * (not a guard refusal, not an HTTP status, not our timeout) is tried once
 * more without "www." (some www hosts have only an IPv6 address, which an
 * IPv4-only network cannot reach). That retry is a hop like a redirect: it
 * passes the guard, counts towards MAX_REDIRECTS and shares the one timeout.
 */
async function guardedProbe(
  target: string,
  timeoutMs: number,
  guard: UrlGuard,
  maxBytes: number,
  html = false,
  wwwFallback = false,
): Promise<GuardedProbe> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let current = target;
  let fellBack = false;
  let redirected = false;
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
        const timedOut = controller.signal.aborted;
        const apex = wwwFallback && hop === 0 && !timedOut ? withoutWww(current) : null;
        if (apex) {
          fellBack = true;
          current = apex;
          continue;
        }
        return {
          kind: "response",
          url: current,
          probe: { status: null, text: null },
          ...(timedOut ? {} : { unreachable: true }),
          ...(fellBack ? { fellBack } : {}),
          ...(redirected ? { redirected } : {}),
        };
      }
      const location = REDIRECT_STATUSES.has(res.status) ? res.headers.get("location") : null;
      const next = location ? resolveLocation(location, current) : null;
      if (next) {
        await res.body?.cancel().catch(() => {});
        if (hop >= MAX_REDIRECTS) return { kind: "too_many_redirects" };
        redirected = true;
        current = next;
        continue;
      }
      let text: string | null = null;
      try {
        text = await readCappedText(res, maxBytes);
      } catch {
        text = null;
      }
      return {
        kind: "response",
        url: current,
        probe: { status: res.status, text, xRobotsTag: res.headers.get("x-robots-tag") },
        ...(fellBack ? { fellBack } : {}),
      };
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Reads at most `maxBytes` of the body as UTF-8 (what `res.text()` decodes
 * as), then cancels the stream so the rest is never downloaded. A body cut
 * inside a multi-byte character ends in a replacement character. A missing
 * body is "". Throws only when the stream itself errors.
 */
export async function readCappedText(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    const room = maxBytes - received;
    const chunk = value.byteLength > room ? value.subarray(0, room) : value;
    received += chunk.byteLength;
    text += decoder.decode(chunk, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return text + decoder.decode();
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
