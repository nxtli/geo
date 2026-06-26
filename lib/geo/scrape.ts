import type { GeoPageMetadata } from "./types";
import { logError } from "./logger";

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
}

const MAX_CHARS = 12_000;
const PAGE_TIMEOUT_MS = 7_000;
const SIGNAL_TIMEOUT_MS = 5_000;

interface Probe {
  status: number | null; // null = network error / timeout (truly unknown)
  text: string | null;
}

export async function fetchHomepage(url: string): Promise<ScrapeResult> {
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

  if (page.status === null || !isOk(page.status) || !page.text) {
    return {
      text: null,
      metadata: { fetched: false, status: page.status ?? null },
      robotsTxt,
      llmsTxtPresent,
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
  const text = htmlToText(html).slice(0, MAX_CHARS);

  return {
    text: text || null,
    metadata: {
      fetched: true,
      status: page.status,
      title: title ?? null,
      description: description ?? null,
      word_count: text ? text.split(/\s+/).length : 0,
      meta_robots: metaRobots,
      has_json_ld: hasJsonLd,
      h1_count: h1Count,
      heading_count: headingCount,
    },
    robotsTxt,
    llmsTxtPresent,
  };
}

function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}

function looksLikeHtml(s: string): boolean {
  return /<!doctype html|<html|<body/i.test(s.slice(0, 600));
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
    return { status: res.status, text };
  } catch (error) {
    if (html) logError("scrape.fetchHomepage", error);
    return { status: null, text: null };
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
