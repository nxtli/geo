/**
 * Publieke-webfetcher voor de prospect-research.
 *
 * Haalt de bedrijfswebsite op plus een handvol relevante subpagina's
 * (over-ons, vacatures, nieuws, vestigingen…), zodat de AI-laag op ECHTE tekst
 * werkt in plaats van op aannames.
 *
 * Nette-bezoeker-regels, bewust ingebouwd:
 *  - **robots.txt wordt gerespecteerd.** Een Disallow-pad wordt niet opgehaald.
 *  - **Eigen User-Agent** met verwijzing, zodat een beheerder ons kan herkennen.
 *  - **Krap budget**: maximaal MAX_PAGES pagina's, harde timeouts, en alleen
 *    same-origin links. Dit is geen crawler.
 *  - **Alleen HTML/tekst**; geen media, geen uitvoeren van scripts.
 *
 * LinkedIn wordt hier NOOIT opgehaald: linkedin.com staat op de blocklist, ook
 * als een website ernaartoe linkt.
 */

import type { CompanyWebData, FetchedSource } from "../types";
import { logError } from "../../geo/logger";
import { canonicalUrl, normalizeWebsite, originOf } from "../validation";

const USER_AGENT =
  "AdverterenOpDeRadio-ProspectResearch/1.0 (+https://nxtli.com; intern prospect-onderzoek)";

/** Maximaal aantal pagina's per bedrijf (homepage inbegrepen). */
const MAX_PAGES = 6;
/** Tekens per pagina die we aan de AI meegeven. */
const MAX_CHARS_PER_PAGE = 6_000;
const PAGE_TIMEOUT_MS = 8_000;
const ROBOTS_TIMEOUT_MS = 4_000;
/** Harde wandklok voor de hele fetch, zodat een trage site niets ophoudt. */
const TOTAL_BUDGET_MS = 25_000;

/** Domeinen die we nooit ophalen, ongeacht wat een pagina linkt. */
const BLOCKED_HOSTS = [
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "youtube.com",
];

/**
 * Padfragmenten die interessante subpagina's aanduiden, met hun gewicht.
 * Hoger = eerder ophalen. Nederlands én Engels, want beide komen voor.
 */
const PATH_HINTS: ReadonlyArray<{ pattern: RegExp; weight: number }> = [
  { pattern: /vacature|werken-bij|jobs?|careers?|solliciteer/, weight: 10 },
  { pattern: /nieuws|news|pers|press|blog|actueel/, weight: 9 },
  { pattern: /vestiging|filial|winkels?|locaties?|stores?|locations?/, weight: 8 },
  { pattern: /over-?ons|about|wie-zijn-wij|ons-verhaal|organisatie/, weight: 7 },
  { pattern: /acties?|aanbieding|sale|campagne|kortingen/, weight: 6 },
  { pattern: /contact/, weight: 3 },
];

interface RobotsRules {
  /** Disallow-paden die op ons van toepassing zijn. */
  disallow: string[];
  /** True als robots.txt onbereikbaar was (dan gaan we voorzichtig door). */
  unknown: boolean;
}

/**
 * Minimale robots.txt-parser: pakt de groep voor `*` (en voor onze UA als die
 * expliciet genoemd wordt) en verzamelt de Disallow-paden.
 */
export function parseRobots(text: string, userAgent = USER_AGENT): RobotsRules {
  const disallow: string[] = [];
  const uaLower = userAgent.toLowerCase();
  let applies = false;
  let sawAnyGroup = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const match = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();

    if (field === "user-agent") {
      const agent = value.toLowerCase();
      // Een nieuwe user-agent-groep begint; bepaal of die op ons van toepassing is.
      applies = agent === "*" || uaLower.includes(agent) || agent.includes("prospectresearch");
      sawAnyGroup = true;
      continue;
    }
    if (!sawAnyGroup || !applies) continue;
    if (field === "disallow" && value) disallow.push(value);
  }

  return { disallow, unknown: false };
}

/** Is dit pad toegestaan volgens de robots-regels? */
export function isPathAllowed(path: string, rules: RobotsRules): boolean {
  if (rules.unknown) return true; // geen robots.txt gevonden → toegestaan
  for (const rule of rules.disallow) {
    // "Disallow: /" blokkeert alles.
    if (rule === "/") return false;
    // Simpele prefix-match; wildcards behandelen we als hun letterlijke prefix.
    const prefix = rule.split("*")[0];
    if (prefix && path.startsWith(prefix)) return false;
  }
  return true;
}

function isBlockedHost(host: string): boolean {
  const lower = host.toLowerCase();
  return BLOCKED_HOSTS.some((b) => lower === b || lower.endsWith(`.${b}`));
}

interface FetchOutcome {
  status: number | null;
  html: string | null;
  finalUrl: string;
}

async function fetchPage(url: string, timeoutMs: number): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,text/plain",
        "Accept-Language": "nl,en;q=0.8",
      },
    });
    const contentType = response.headers.get("content-type") ?? "";
    // Alleen tekstuele documenten; een PDF of afbeelding levert niets bruikbaars.
    if (contentType && !/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
      return { status: response.status, html: null, finalUrl: response.url || url };
    }
    let html: string | null = null;
    try {
      html = await response.text();
    } catch {
      html = null;
    }
    return { status: response.status, html, finalUrl: response.url || url };
  } catch {
    return { status: null, html: null, finalUrl: url };
  } finally {
    clearTimeout(timer);
  }
}

/** Strip HTML naar leesbare tekst. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, " ").trim() || null : null;
}

/** Same-origin links uit een pagina, gescoord op relevantie. */
export function rankCandidateLinks(html: string, baseUrl: string): string[] {
  const origin = originOf(baseUrl);
  if (!origin) return [];

  const scores = new Map<string, number>();
  const hrefRegex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1].trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;

    let resolved: URL;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (resolved.origin !== origin) continue;
    if (isBlockedHost(resolved.hostname)) continue;

    resolved.hash = "";
    resolved.search = "";
    const path = resolved.pathname.toLowerCase();
    if (path === "/" || path === "") continue;
    // Geen bestanden.
    if (/\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?|mp4|mp3)$/i.test(path)) continue;

    let weight = 0;
    for (const hint of PATH_HINTS) {
      if (hint.pattern.test(path)) {
        weight = Math.max(weight, hint.weight);
      }
    }
    if (weight === 0) continue;

    // Kortere paden zijn meestal de hoofdpagina van een sectie ("/vacatures"
    // boven "/vacatures/senior-monteur-eindhoven").
    const depthPenalty = (path.split("/").filter(Boolean).length - 1) * 0.5;
    const url = resolved.toString();
    const score = weight - depthPenalty;
    const existing = scores.get(url);
    if (existing === undefined || score > existing) scores.set(url, score);
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url);
}

/**
 * Haal publieke bedrijfsdata op.
 *
 * Faalt nooit hard: wat niet lukt komt in `failed_urls` terecht, zodat de
 * research-laag kan zien dat er iets ontbreekt in plaats van het te verzinnen.
 */
export async function fetchCompanyWebData(website: string | null): Promise<CompanyWebData> {
  const root = normalizeWebsite(website);
  if (!root) {
    return { root_url: null, sources: [], failed_urls: [] };
  }

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const sources: FetchedSource[] = [];
  const failed: string[] = [];
  const seen = new Set<string>();

  const origin = originOf(root);
  if (!origin || isBlockedHost(new URL(root).hostname)) {
    return { root_url: root, sources: [], failed_urls: [root] };
  }

  // 1. robots.txt — bepaalt wat we mogen ophalen.
  let rules: RobotsRules = { disallow: [], unknown: true };
  const robots = await fetchPage(`${origin}/robots.txt`, ROBOTS_TIMEOUT_MS);
  if (robots.status && robots.status >= 200 && robots.status < 300 && robots.html) {
    rules = parseRobots(robots.html);
  }

  const tryFetch = async (url: string): Promise<boolean> => {
    if (Date.now() > deadline) return false;
    const key = canonicalUrl(url);
    if (!key || seen.has(key)) return false;
    seen.add(key);

    let path = "/";
    try {
      path = new URL(url).pathname;
    } catch {
      return false;
    }
    if (!isPathAllowed(path, rules)) return false;

    const remaining = Math.min(PAGE_TIMEOUT_MS, Math.max(1_000, deadline - Date.now()));
    const result = await fetchPage(url, remaining);
    if (!result.status || result.status < 200 || result.status >= 300 || !result.html) {
      failed.push(url);
      return false;
    }
    const text = htmlToText(result.html);
    if (!text) {
      failed.push(url);
      return false;
    }
    sources.push({
      // Bewaar de URL waar we ECHT uitkwamen (na redirects) — dat is de URL die
      // als bewijs geldig is.
      url: result.finalUrl,
      title: extractTitle(result.html),
      text: text.slice(0, MAX_CHARS_PER_PAGE),
      status: result.status,
    });
    return true;
  };

  // 2. Homepage.
  const homepage = await fetchPage(root, PAGE_TIMEOUT_MS);
  if (!homepage.status || homepage.status < 200 || homepage.status >= 300 || !homepage.html) {
    failed.push(root);
    return { root_url: root, sources, failed_urls: failed };
  }
  seen.add(canonicalUrl(homepage.finalUrl) ?? root);
  const homepageText = htmlToText(homepage.html);
  sources.push({
    url: homepage.finalUrl,
    title: extractTitle(homepage.html),
    text: homepageText.slice(0, MAX_CHARS_PER_PAGE),
    status: homepage.status,
  });

  // 3. Relevante subpagina's, in volgorde van relevantie.
  const candidates = rankCandidateLinks(homepage.html, homepage.finalUrl);
  for (const candidate of candidates) {
    if (sources.length >= MAX_PAGES) break;
    if (Date.now() > deadline) break;
    try {
      await tryFetch(candidate);
    } catch (error) {
      logError("radio.fetch", error);
      failed.push(candidate);
    }
  }

  return { root_url: root, sources, failed_urls: failed };
}

/** Alle URL's die we daadwerkelijk hebben opgehaald — de toegestane bronnen. */
export function fetchedUrls(web: CompanyWebData): string[] {
  return web.sources.map((s) => s.url);
}

export { USER_AGENT, MAX_PAGES };
