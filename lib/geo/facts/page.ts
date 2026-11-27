import { listedSameAsOf, profileHostOf, reviewSiteOf } from "../external";

/**
 * Feiten uit de ruwe HTML en de HTTP-headers van een pagina. Alles hier is
 * gemeten, niets is een oordeel. Het taalmodel krijgt deze feiten mee en mag
 * ze niet tegenspreken.
 */
export interface Heading {
  level: number;
  text: string;
}
export interface PageFacts {
  title: string | null;
  description: string | null;
  canonical: string | null;
  /** Merknaam die de pagina zelf opgeeft (og:site_name of schema). */
  siteName: string | null;
  lang: string | null;
  metaRobots: string | null;
  xRobotsTag: string | null;
  noindex: boolean;
  nosnippet: boolean;
  /** Waarde van `max-snippet:N` in de robots-instructies; null als die ontbreekt. -1 betekent geen limiet. */
  maxSnippet: number | null;
  /** Tekst binnen elementen met `data-nosnippet`: aantal woorden en het aandeel van alle woorden (0 tot 1). */
  dataNosnippet: { words: number; share: number };
  /** De HTML bevat een `<link rel="icon">` (of shortcut icon / apple-touch-icon). */
  faviconLink: boolean;
  wordCount: number;
  /** Lege JavaScript-shell: vrijwel geen tekst en een app-container in de HTML. */
  jsShell: boolean;
  h1Count: number;
  headings: Heading[];
  skippedHeadingLevel: boolean;
  jsonLd: {
    blocks: number;
    invalid: number;
    types: string[];
    /**
     * Types declared on a block's top-level node(s) or on the members of a
     * top-level `@graph`, not on nodes nested inside another node. Used for
     * the per-page-type expectation; `types` keeps every type at any depth.
     */
    topLevelTypes: string[];
    dateModified: string | null;
    orgName: string | null;
    /** First JSON-LD `author` name (a string, an object with `name`, or the first of a list). */
    authorName: string | null;
    /** `ratingValue` of the first AggregateRating with a usable ratingValue, at any depth (also an untyped `aggregateRating` object). */
    ratingValue: number | null;
    /** `reviewCount`, else `ratingCount`, of that same AggregateRating; null when empty or not a number. */
    reviewCount: number | null;
    /** Number of nodes typed Review, at any depth. */
    reviewNodes: number;
    /**
     * Distinct http(s) `sameAs` URLs, from every node (in practice the
     * Organization, LocalBusiness or Person); at most MAX_SAME_AS, URLs on a
     * listed profile or review-site host first.
     */
    sameAs: string[];
  };
  /** `<meta name="author">`, as the page states it. */
  metaAuthor: string | null;
  /** Datum die een bezoeker op de pagina ziet, met jaartal. */
  visibleDate: string | null;
  metaModified: string | null;
  /** `<meta property="og:type">`, lower-cased (e.g. "website", "article", "product"). */
  ogType: string | null;
  /** `<meta property="article:published_time">`, as the page states it. */
  articlePublishedTime: string | null;
  hasPrice: boolean;
  priceSamples: string[];
  images: { total: number; missingAlt: number };
  links: {
    internal: number;
    vagueAnchors: string[];
    /** Interne links naar een auteurs-, team- of Over ons-pagina, in paginavolgorde, hooguit 5. */
    about: string[];
  };
  /** Distinct absolute http(s) links to other hosts, in page order, capped at MAX_EXTERNAL_LINKS. */
  externalLinks: string[];
  /** The external links that point to a review site (`reviewSiteOf`), in page order, at most MAX_CLASSIFIED_LINKS; kept even past the externalLinks cap. */
  reviewLinks: string[];
  /** The external links that are a profile link (`profileHostOf`), in page order, at most MAX_CLASSIFIED_LINKS; kept even past the externalLinks cap. */
  profileLinks: string[];
}

/** Cap on `externalLinks`, so a link farm cannot grow the facts without bound. */
export const MAX_EXTERNAL_LINKS = 200;
/** Cap on `reviewLinks` and on `profileLinks`, each. */
export const MAX_CLASSIFIED_LINKS = 50;
/** Cap on `jsonLd.sameAs`. */
export const MAX_SAME_AS = 50;

const VAGUE = /^(lees (meer|verder)|meer (lezen|info|informatie|weten)|klik hier|hier|bekijk|read more|learn more|click here|more)\.?$/i;
const MONTHS =
  "januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|january|february|march|may|june|july|august|october";

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3] ?? "").trim() : null;
}
function metaContent(html: string, key: "name" | "property", value: string): string | null {
  const re = new RegExp(`<meta\\b[^>]*\\b${key}\\s*=\\s*["']${value}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag ? attr(tag, "content") : null;
}
function decode(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&euro;/gi, "€")
    .replace(/&#8364;/g, "€")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'");
}
function strip(html: string): string {
  return decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
function withoutCode(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

/**
 * Zichtbare tekst waarin de koppen herkenbaar blijven (als "## Kop"), zodat het
 * taalmodel de structuur ziet die het moet beoordelen.
 */
export function htmlToOutlineText(html: string): string {
  return decode(
    withoutCode(html)
      .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, l: string, inner: string) => {
        const text = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        return text ? `\n${"#".repeat(Number(l))} ${text}\n` : " ";
      })
      .replace(/<(p|li|div|section|article|br|tr)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** A JSON-LD `author` value as a name: a string, an object's `name`, or the first usable entry of a list. */
function authorNameOf(author: unknown): string | null {
  if (typeof author === "string") return author.trim() || null;
  if (Array.isArray(author)) {
    for (const entry of author) {
      const name = authorNameOf(entry);
      if (name) return name;
    }
    return null;
  }
  if (author && typeof author === "object") {
    const name = (author as Record<string, unknown>).name;
    return typeof name === "string" ? name.trim() || null : null;
  }
  return null;
}

/** A JSON-LD number that may be written as a string ("4,6" or "212"); null when it is empty, not numeric or not finite. */
function numberOf(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim().replace(",", ".");
  return /^[+-]?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
}

/** The `@type` value as a list of strings. */
function typesOf(node: unknown): string[] {
  if (!node || typeof node !== "object" || Array.isArray(node)) return [];
  const t = (node as Record<string, unknown>)["@type"];
  return typeof t === "string" ? [t] : Array.isArray(t) ? t.filter((x): x is string => typeof x === "string") : [];
}

/** A property value as a list of objects (an object, or the objects in a list); anything else is dropped. */
function objectsOf(value: unknown): unknown[] {
  const list = Array.isArray(value) ? value : [value];
  return list.filter((v) => !!v && typeof v === "object" && !Array.isArray(v));
}

/**
 * The top-level nodes of a parsed block: the node itself (or each entry of a
 * top-level list), the members of a top-level `@graph`, and, one level down
 * only, the `mainEntity` / `mainEntityOfPage` objects of those nodes (so
 * WebPage → mainEntity: Product counts). Other nested nodes (publisher,
 * author, itemReviewed, …) are not top-level.
 */
function topLevelNodesOf(parsed: unknown): unknown[] {
  const roots = Array.isArray(parsed) ? parsed : [parsed];
  const nodes: unknown[] = [];
  for (const root of roots) {
    nodes.push(root);
    const graph = root && typeof root === "object" ? (root as Record<string, unknown>)["@graph"] : undefined;
    nodes.push(...objectsOf(graph));
  }
  const entities = nodes.flatMap((node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return [];
    const o = node as Record<string, unknown>;
    return [...objectsOf(o.mainEntity), ...objectsOf(o.mainEntityOfPage)];
  });
  return [...nodes, ...entities];
}

/** `sameAs` as a list of http(s) URLs (a string or a list of strings). */
function sameAsOf(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value];
  return list.filter((v): v is string => typeof v === "string" && /^https?:\/\//i.test(v.trim())).map((v) => v.trim());
}

function collectJsonLd(html: string) {
  const out = {
    blocks: 0,
    invalid: 0,
    types: [] as string[],
    topLevelTypes: [] as string[],
    dateModified: null as string | null,
    orgName: null as string | null,
    authorName: null as string | null,
    ratingValue: null as number | null,
    reviewCount: null as number | null,
    reviewNodes: 0,
    sameAs: [] as string[],
  };
  let ratingSeen = false;
  const sameAs = new Set<string>();
  const readRating = (rating: unknown) => {
    if (ratingSeen || !rating || typeof rating !== "object" || Array.isArray(rating)) return;
    const r = rating as Record<string, unknown>;
    const value = numberOf(r.ratingValue);
    if (value === null) return; // no usable rating here: a later real one may still count
    ratingSeen = true;
    out.ratingValue = value;
    out.reviewCount = numberOf(r.reviewCount) ?? numberOf(r.ratingCount);
  };
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const types = new Set<string>();
  const topLevelTypes = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const t = o["@type"];
    if (typeof t === "string") types.add(t);
    else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.add(x));
    if (typeof o.dateModified === "string" && !out.dateModified) out.dateModified = o.dateModified;
    const ts = typeof t === "string" ? [t] : Array.isArray(t) ? t : [];
    if (!out.orgName && typeof o.name === "string" && ts.some((x) => /^(Organization|WebSite|LocalBusiness|Corporation|Brand)$/.test(String(x)))) out.orgName = o.name.trim();
    if (!out.authorName) out.authorName = authorNameOf(o.author);
    if (ts.includes("AggregateRating")) readRating(o);
    readRating(o.aggregateRating);
    if (ts.includes("Review")) out.reviewNodes++;
    sameAsOf(o.sameAs).forEach((url) => sameAs.add(url));
    Object.values(o).forEach(walk);
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.blocks++;
    try {
      const parsed: unknown = JSON.parse(m[1].trim());
      topLevelNodesOf(parsed).forEach((node) => typesOf(node).forEach((t) => topLevelTypes.add(t)));
      walk(parsed);
    } catch {
      out.invalid++;
    }
  }
  out.types = [...types];
  out.topLevelTypes = [...topLevelTypes];
  const listed = [...sameAs].filter((url) => listedSameAsOf(url, null) !== null);
  const rest = [...sameAs].filter((url) => listedSameAsOf(url, null) === null);
  out.sameAs = [...listed, ...rest].slice(0, MAX_SAME_AS);
  return out;
}

interface ExternalCollector {
  all: Set<string>;
  reviews: Set<string>;
  profiles: Set<string>;
}

/** Adds `url` to `into` unless it is full. */
function addCapped(into: Set<string>, url: string, cap: number): void {
  if (into.size < cap) into.add(url);
}

/**
 * Records `href` when it is an absolute (or protocol-relative) http(s) link
 * to another host than `pageHost`. It is classified before any cap applies:
 * a review-site or profile link goes into its own list (each capped at
 * MAX_CLASSIFIED_LINKS) even when `all` is already full at
 * MAX_EXTERNAL_LINKS, so unrelated outbound links cannot push them out. Kept
 * apart from the internal-link count, which treats a protocol-relative link
 * as internal.
 */
function collectExternal(href: string, pageHost: string, into: ExternalCollector): void {
  const absolute = /^https?:/i.test(href) ? href : href.startsWith("//") ? `https:${href}` : null;
  if (!absolute) return;
  let url: URL;
  try {
    url = new URL(decode(absolute));
  } catch {
    return; // not a usable URL
  }
  if (url.hostname.replace(/^www\./, "") === pageHost) return;
  if (reviewSiteOf(url.href)) addCapped(into.reviews, url.href, MAX_CLASSIFIED_LINKS);
  if (profileHostOf(url.href)) addCapped(into.profiles, url.href, MAX_CLASSIFIED_LINKS);
  addCapped(into.all, url.href, MAX_EXTERNAL_LINKS);
}

/** Elementen waarop Google `data-nosnippet` erkent. */
const NOSNIPPET_TAGS = "span|div|section";

/**
 * Telt de woorden binnen elementen met het attribuut `data-nosnippet`.
 * Geneste elementen van hetzelfde type tellen mee tot de bijbehorende
 * sluit-tag; een niet-afgesloten element loopt tot het einde van de tekst.
 */
export function wordsInDataNosnippet(body: string): number {
  const open = new RegExp(`<(${NOSNIPPET_TAGS})\\b[^>]*\\sdata-nosnippet(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]*))?[^>]*>`, "gi");
  let total = 0;
  let from = 0;
  let m: RegExpExecArray | null;
  while ((m = open.exec(body))) {
    if (m.index < from) continue; // ligt binnen een al getelde regio
    const tag = m[1].toLowerCase();
    const walker = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
    walker.lastIndex = open.lastIndex;
    let depth = 1;
    let end = body.length;
    let w: RegExpExecArray | null;
    while ((w = walker.exec(body))) {
      depth += w[1] ? -1 : 1;
      if (depth === 0) {
        end = w.index;
        break;
      }
    }
    const inner = strip(body.slice(open.lastIndex, end));
    if (inner) total += inner.split(/\s+/).length;
    from = end;
    open.lastIndex = Math.max(open.lastIndex, end);
  }
  return total;
}

/** Herkent een interne link naar een auteurs-, team- of Over ons-pagina aan het adres of de ankertekst. */
const ABOUT_HREF = /(?:^|\/)(?:over(?:-ons|-mij|-ons-team)?|about(?:-us|-me)?|wie-zijn-wij|wie-we-zijn|ons-team|team|auteurs?|authors?|redactie|colofon)(?:\/|$|[?#.])/i;
const ABOUT_ANCHOR = /^(?:over ons|over mij|over [a-z0-9 .&-]{2,30}|about(?: us| me)?|wie zijn wij|ons team|het team|team|de auteur|auteurs?|redactie|colofon)$/i;

export function extractPageFacts(
  html: string,
  pageUrl: string,
  headers?: { xRobotsTag?: string | null },
): PageFacts {
  const body = withoutCode(html);
  const text = strip(body);
  const words = text ? text.split(/\s+/).length : 0;

  const headings: Heading[] = [];
  const hre = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let hm: RegExpExecArray | null;
  while ((hm = hre.exec(body)) && headings.length < 60) {
    const t = strip(hm[2]);
    if (t) headings.push({ level: Number(hm[1]), text: t.slice(0, 140) });
  }
  let skipped = false;
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level - headings[i - 1].level > 1) skipped = true;
  }

  const metaRobots = metaContent(html, "name", "robots");
  const xRobotsTag = headers?.xRobotsTag ?? null;
  const robotsAll = `${metaRobots ?? ""},${xRobotsTag ?? ""}`.toLowerCase();

  const canonicalTag = html.match(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i)?.[0];
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0];

  // Prijs: een eurobedrag in de zichtbare tekst.
  const priceRe = /(?:€\s?\d[\d.,]*(?:,-)?|\bEUR\s?\d[\d.,]*|\d[\d.,]*\s?(?:euro|EUR)\b)/g;
  const priceSamples = [...new Set(text.match(priceRe) ?? [])].slice(0, 5);

  // Zichtbare datum met jaartal, bij voorkeur bij een woord als "bijgewerkt".
  const dateRe = new RegExp(
    `(?:\\b\\d{1,2}\\s(?:${MONTHS})\\s20\\d{2}\\b|\\b\\d{1,2}[-/]\\d{1,2}[-/]20\\d{2}\\b|\\b20\\d{2}-\\d{2}-\\d{2}\\b)`,
    "i",
  );
  const labelled = text.match(
    new RegExp(`(?:bijgewerkt|gewijzigd|ge[uü]pdatet|updated|last modified|gepubliceerd)[^.]{0,40}?(${dateRe.source})`, "i"),
  );
  const timeTag = body.match(/<time\b[^>]*datetime\s*=\s*["']([^"']+)["']/i);
  const visibleDate = labelled?.[1] ?? (timeTag ? timeTag[1] : null);

  let host = "";
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    /* ignore */
  }
  let internal = 0;
  const vague = new Set<string>();
  const about = new Set<string>();
  const external: ExternalCollector = { all: new Set(), reviews: new Set(), profiles: new Set() };
  const are = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let am: RegExpExecArray | null;
  while ((am = are.exec(body))) {
    const href = attr(`<a ${am[1]}>`, "href") ?? "";
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    collectExternal(href, host, external);
    let isInternal = href.startsWith("/") || !/^https?:/i.test(href);
    if (!isInternal) {
      try {
        isInternal = new URL(href).hostname.replace(/^www\./, "") === host;
      } catch {
        /* ignore */
      }
    }
    if (!isInternal) continue;
    internal++;
    const anchor = strip(am[2]);
    if (VAGUE.test(anchor)) vague.add(anchor.toLowerCase());
    let path = href;
    try {
      path = new URL(href, pageUrl).pathname;
    } catch {
      /* ignore */
    }
    if (about.size < 5 && (ABOUT_HREF.test(path) || ABOUT_ANCHOR.test(anchor.trim()))) about.add(href);
  }

  const imgs = body.match(/<img\b[^>]*>/gi) ?? [];
  const missingAlt = imgs.filter((t) => {
    const alt = attr(t, "alt");
    return alt === null;
  }).length;

  const nosnippetWords = wordsInDataNosnippet(body);
  const maxSnippetMatch = robotsAll.match(/max-snippet\s*:\s*(-?\d+)/);
  const faviconLink = /<link\b[^>]*\brel\s*=\s*["'][^"']*\b(?:icon|apple-touch-icon)\b[^"']*["'][^>]*>/i.test(html);

  const appContainer = /<div\b[^>]*id\s*=\s*["'](root|app|__next|__nuxt)["']/i.test(html);
  const jsonLd = collectJsonLd(html);

  return {
    title: (() => {
      const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      return m ? strip(m[1]) || null : null;
    })(),
    description: metaContent(html, "name", "description") ?? metaContent(html, "property", "og:description"),
    canonical: canonicalTag ? attr(canonicalTag, "href") : null,
    siteName: (metaContent(html, "property", "og:site_name") || jsonLd.orgName || "").trim() || null,
    lang: htmlTag ? attr(htmlTag, "lang") : null,
    metaRobots,
    xRobotsTag,
    noindex: /\bnoindex\b|\bnone\b/.test(robotsAll),
    nosnippet: /(?<![\w-])nosnippet\b|max-snippet\s*:\s*0\b/.test(robotsAll),
    maxSnippet: maxSnippetMatch ? Number(maxSnippetMatch[1]) : null,
    dataNosnippet: { words: nosnippetWords, share: words ? Math.min(1, nosnippetWords / words) : 0 },
    faviconLink,
    wordCount: words,
    jsShell: words < 60 && (appContainer || /enable javascript|javascript (is )?(required|nodig)/i.test(html)),
    h1Count: headings.filter((h) => h.level === 1).length,
    headings,
    skippedHeadingLevel: skipped,
    jsonLd,
    visibleDate,
    metaModified: metaContent(html, "property", "article:modified_time"),
    ogType: metaContent(html, "property", "og:type")?.toLowerCase() || null,
    articlePublishedTime: metaContent(html, "property", "article:published_time") || null,
    metaAuthor: metaContent(html, "name", "author") || null,
    hasPrice: priceSamples.length > 0,
    priceSamples,
    images: { total: imgs.length, missingAlt },
    links: { internal, vagueAnchors: [...vague].slice(0, 8), about: [...about] },
    externalLinks: [...external.all],
    reviewLinks: [...external.reviews],
    profileLinks: [...external.profiles],
  };
}
