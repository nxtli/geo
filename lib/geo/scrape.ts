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
const TIMEOUT_MS = 8_000;

export async function fetchHomepage(url: string): Promise<ScrapeResult> {
  // Site-wide technical signals first (cheap, best-effort).
  const { robotsTxt, llmsTxtPresent } = await fetchSiteSignals(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "NXTLI-GEO-Scan/1.0 (+https://geo.nxtli.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    const status = res.status;
    if (!res.ok) {
      return { text: null, metadata: { fetched: false, status }, robotsTxt, llmsTxtPresent };
    }

    const html = await res.text();
    const title = extractTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description =
      extractAttr(html, /<meta[^>]+name=["']description["'][^>]*>/i) ??
      extractAttr(html, /<meta[^>]+property=["']og:description["'][^>]*>/i);

    const text = htmlToText(html).slice(0, MAX_CHARS);

    return {
      text: text || null,
      metadata: {
        fetched: true,
        status,
        title: title ?? null,
        description: description ?? null,
        word_count: text ? text.split(/\s+/).length : 0,
      },
      robotsTxt,
      llmsTxtPresent,
    };
  } catch (error) {
    logError("scrape.fetchHomepage", error);
    return { text: null, metadata: { fetched: false }, robotsTxt, llmsTxtPresent };
  } finally {
    clearTimeout(timeout);
  }
}

/** Best-effort /robots.txt + /llms.txt fetch for the GEO technical layer. */
async function fetchSiteSignals(
  url: string,
): Promise<{ robotsTxt: string | null; llmsTxtPresent?: boolean }> {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return { robotsTxt: null };
  }

  const robotsTxt = await getText(`${origin}/robots.txt`);
  const llms = await getText(`${origin}/llms.txt`);
  return {
    robotsTxt: robotsTxt ? robotsTxt.slice(0, 4_000) : null,
    llmsTxtPresent: llms === null ? undefined : llms.trim().length > 0,
  };
}

async function getText(target: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(target, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "NXTLI-GEO-Scan/1.0 (+https://geo.nxtli.com)" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
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
