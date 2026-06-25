import type { GeoPageMetadata } from "./types";
import { logError } from "./logger";

/**
 * Best-effort homepage fetch. Used to give the AI real page content to judge.
 * Never throws — on any failure it returns `{ fetched: false }` and the
 * analysis proceeds on the visitor's answers alone.
 *
 * Note: in restricted network environments the target site may be unreachable;
 * the scan is designed to degrade gracefully in that case.
 */
export interface ScrapeResult {
  text: string | null;
  metadata: GeoPageMetadata;
  /** /robots.txt contents (best-effort; null if unreachable). */
  robotsTxt: string | null;
  /** Whether /llms.txt exists (undefined if not checked). */
  llmsTxtPresent?: boolean;
}

const MAX_CHARS = 12_000;
const PAGE_TIMEOUT_MS = 7_000;
const SIGNAL_TIMEOUT_MS = 5_000;

export async function fetchHomepage(url: string): Promise<ScrapeResult> {
  let origin: string | null = null;
  try {
    origin = new URL(url).origin;
  } catch {
    origin = null;
  }

  // Fetch the page + robots.txt + llms.txt CONCURRENTLY so the technical
  // signals never add latency on top of the page fetch.
  const [pageRes, robotsRaw, llmsRaw] = await Promise.all([
    getText(url, PAGE_TIMEOUT_MS, true),
    origin ? getText(`${origin}/robots.txt`, SIGNAL_TIMEOUT_MS) : Promise.resolve(null),
    origin ? getText(`${origin}/llms.txt`, SIGNAL_TIMEOUT_MS) : Promise.resolve(null),
  ]);

  const robotsTxt = robotsRaw ? robotsRaw.slice(0, 4_000) : null;
  const llmsTxtPresent = llmsRaw === null ? undefined : llmsRaw.trim().length > 0;

  if (!pageRes) {
    return { text: null, metadata: { fetched: false }, robotsTxt, llmsTxtPresent };
  }

  const html = pageRes;
  const title = extractTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    extractAttr(html, /<meta[^>]+name=["']description["'][^>]*>/i) ??
    extractAttr(html, /<meta[^>]+property=["']og:description["'][^>]*>/i);
  const text = htmlToText(html).slice(0, MAX_CHARS);

  return {
    text: text || null,
    metadata: {
      fetched: true,
      title: title ?? null,
      description: description ?? null,
      word_count: text ? text.split(/\s+/).length : 0,
    },
    robotsTxt,
    llmsTxtPresent,
  };
}

async function getText(
  target: string,
  timeoutMs: number,
  html = false,
): Promise<string | null> {
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
    if (!res.ok) return null;
    return await res.text();
  } catch (error) {
    if (html) logError("scrape.fetchHomepage", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
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
