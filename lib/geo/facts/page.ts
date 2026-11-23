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
    dateModified: string | null;
    orgName: string | null;
    /** First JSON-LD `author` name (a string, an object with `name`, or the first of a list). */
    authorName: string | null;
    /** `ratingValue` of the first AggregateRating, at any depth (also an untyped `aggregateRating` object). */
    ratingValue: number | null;
    /** `reviewCount`, else `ratingCount`, of that same AggregateRating. */
    reviewCount: number | null;
    /** Number of nodes typed Review, at any depth. */
    reviewNodes: number;
    /** Distinct http(s) `sameAs` URLs, from every node (in practice the Organization, LocalBusiness or Person). */
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
  links: { internal: number; vagueAnchors: string[] };
  /** Distinct absolute http(s) links to other hosts, in page order, capped at MAX_EXTERNAL_LINKS. */
  externalLinks: string[];
}

/** Cap on `externalLinks`, so a link farm cannot grow the facts without bound. */
export const MAX_EXTERNAL_LINKS = 200;

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

/** A JSON-LD number that may be written as a string ("4,6" or "212"); null when it is not a finite number. */
function numberOf(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim().replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
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
    ratingSeen = true;
    out.ratingValue = numberOf(r.ratingValue);
    out.reviewCount = numberOf(r.reviewCount) ?? numberOf(r.ratingCount);
  };
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const types = new Set<string>();
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
      walk(JSON.parse(m[1].trim()));
    } catch {
      out.invalid++;
    }
  }
  out.types = [...types];
  out.sameAs = [...sameAs];
  return out;
}

/**
 * Adds `href` to `into` when it is an absolute (or protocol-relative) http(s)
 * link to another host than `pageHost`. Kept apart from the internal-link
 * count, which treats a protocol-relative link as internal.
 */
function collectExternal(href: string, pageHost: string, into: Set<string>): void {
  if (into.size >= MAX_EXTERNAL_LINKS) return;
  const absolute = /^https?:/i.test(href) ? href : href.startsWith("//") ? `https:${href}` : null;
  if (!absolute) return;
  try {
    const url = new URL(decode(absolute));
    if (url.hostname.replace(/^www\./, "") !== pageHost) into.add(url.href);
  } catch {
    /* not a usable URL */
  }
}

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
  const external = new Set<string>();
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
  }

  const imgs = body.match(/<img\b[^>]*>/gi) ?? [];
  const missingAlt = imgs.filter((t) => {
    const alt = attr(t, "alt");
    return alt === null;
  }).length;

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
    nosnippet: /\bnosnippet\b|max-snippet\s*:\s*0\b/.test(robotsAll),
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
    links: { internal, vagueAnchors: [...vague].slice(0, 8) },
    externalLinks: [...external],
  };
}
