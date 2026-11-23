import { describe, it, expect } from "vitest";
import { extractPageFacts } from "../facts/page";
import { analyzeRobots } from "../facts/robots";
import type { ScrapeResult } from "../scrape";
import { CHECK_IDS, CHECK_REGISTRY, ageInDays, parsePageDate, runChecks, type CheckId } from "../checks";

const PAGE_URL = "https://voorbeeld.example/diensten/lease";
const NOW = new Date("2026-11-23T12:00:00Z");
const DAY_MS = 86_400_000;
const WORDS = Array.from({ length: 200 }, () => "woord").join(" ");

/** A page that should pass every measurable check. */
const GOOD_HTML = `<html lang="nl"><head>
<title>Zakelijk leasen</title>
<meta name="description" content="Lease een auto voor je bedrijf.">
<meta name="author" content="Meta Auteur">
<script type="application/ld+json">{"@type":"Organization","name":"Voorbeeld BV"}</script>
<script type="application/ld+json">{"@type":"Article","author":{"@type":"Person","name":"Jan Jansen"},"dateModified":"2026-11-01"}</script>
</head><body>
<h1>Zakelijk leasen</h1><h2>Hoe het werkt</h2>
<p>Bijgewerkt op 3 oktober 2026. ${WORDS}</p>
</body></html>`;

/** A thin page with no signals at all. */
const BARE_HTML = `<html><body><h1>Een</h1><h3>Drie</h3><p>Kort stukje tekst.</p></body></html>`;

const JS_SHELL_HTML = `<html><head><title>App</title></head><body><div id="__next"></div><noscript>Enable JavaScript to run this app.</noscript></body></html>`;

function scrapeOf(html: string, url = PAGE_URL): ScrapeResult {
  return {
    text: null,
    metadata: { fetched: true, status: 200 },
    robotsTxt: "",
    llmsTxtPresent: false,
    facts: extractPageFacts(html, url),
    robots: analyzeRobots("", url),
  };
}

function notFetchedScrape(url = PAGE_URL): ScrapeResult {
  return { text: null, metadata: { fetched: false, status: 404 }, robotsTxt: null, facts: null, robots: analyzeRobots(null, url) };
}

function check(id: CheckId, scrape: ScrapeResult, now = NOW) {
  const [result] = runChecks(scrape, PAGE_URL, [id], now);
  return result;
}

function withMetaModified(iso: string): string {
  return `<html><head><meta property="article:modified_time" content="${iso}"></head><body><p>tekst</p></body></html>`;
}

describe("extractPageFacts author facts", () => {
  it("reads the JSON-LD author name from an object, a string or a list", () => {
    expect(extractPageFacts(GOOD_HTML, PAGE_URL).jsonLd.authorName).toBe("Jan Jansen");
    const asString = `<script type="application/ld+json">{"@type":"Article","author":"Piet"}</script>`;
    expect(extractPageFacts(asString, PAGE_URL).jsonLd.authorName).toBe("Piet");
    const asList = `<script type="application/ld+json">{"@type":"Article","author":[{"name":""},{"name":"Klaas"}]}</script>`;
    expect(extractPageFacts(asList, PAGE_URL).jsonLd.authorName).toBe("Klaas");
  });

  it("reads meta name=author and leaves both null when absent", () => {
    expect(extractPageFacts(GOOD_HTML, PAGE_URL).metaAuthor).toBe("Meta Auteur");
    const bare = extractPageFacts(BARE_HTML, PAGE_URL);
    expect(bare.metaAuthor).toBeNull();
    expect(bare.jsonLd.authorName).toBeNull();
  });
});

describe("check registry", () => {
  it("lists every check id once, in CHECK_IDS order", () => {
    expect(CHECK_REGISTRY.map((c) => c.id)).toEqual([...CHECK_IDS]);
  });

  it("runs all checks when no ids are given", () => {
    expect(runChecks(scrapeOf(GOOD_HTML), PAGE_URL, undefined, NOW).map((r) => r.id)).toEqual([...CHECK_IDS]);
  });

  it("runs only the requested checks, in registry order", () => {
    const ids = runChecks(scrapeOf(GOOD_HTML), PAGE_URL, ["clarity", "author_publisher"], NOW).map((r) => r.id);
    expect(ids).toEqual(["author_publisher", "clarity"]);
  });

  it("reports unknown for every measurable check when the page was not fetched", () => {
    const results = runChecks(notFetchedScrape(), PAGE_URL, undefined, NOW);
    const byId = Object.fromEntries(results.map((r) => [r.id, r.status]));
    expect(byId).toEqual({
      author_publisher: "unknown",
      recency: "unknown",
      structured_data: "unknown",
      clarity: "unknown",
      speed: "n/a",
      external: "n/a",
    });
  });
});

describe("author_publisher", () => {
  it("passes with the JSON-LD publisher and author", () => {
    const result = check("author_publisher", scrapeOf(GOOD_HTML));
    expect(result.status).toBe("pass");
    expect(result.facts).toMatchObject({ publisher: "Voorbeeld BV", author: "Jan Jansen", author_source: "json_ld" });
  });

  it("falls back to og:site_name and meta author", () => {
    const html = `<head><meta property="og:site_name" content="Voorbeeld"><meta name="author" content="Anne"></head>`;
    const result = check("author_publisher", scrapeOf(html));
    expect(result.status).toBe("pass");
    expect(result.facts).toMatchObject({ publisher: "Voorbeeld", publisher_source: "og:site_name", author: "Anne", author_source: "meta_author" });
  });

  it("needs attention when nobody is named", () => {
    expect(check("author_publisher", scrapeOf(BARE_HTML)).status).toBe("attention");
  });
});

describe("recency", () => {
  it("reports the newest of the three dates and its age", () => {
    const result = check("recency", scrapeOf(GOOD_HTML));
    expect(result.status).toBe("pass");
    expect(result.facts).toMatchObject({
      visible_date: "3 oktober 2026",
      newest_date: "2026-11-01",
      newest_source: "json_ld_date_modified",
      age_days: 22,
    });
  });

  it("passes at exactly 365 days and needs attention at 366", () => {
    const at365 = check("recency", scrapeOf(withMetaModified(new Date(NOW.getTime() - 365 * DAY_MS).toISOString())));
    expect(at365.facts.age_days).toBe(365);
    expect(at365.status).toBe("pass");
    const at366 = check("recency", scrapeOf(withMetaModified(new Date(NOW.getTime() - 366 * DAY_MS).toISOString())));
    expect(at366.facts.age_days).toBe(366);
    expect(at366.status).toBe("attention");
  });

  it("is unknown when no date is found", () => {
    const result = check("recency", scrapeOf(BARE_HTML));
    expect(result.status).toBe("unknown");
    expect(result.facts.age_days).toBeNull();
  });

  it("counts whole days against the injected now", () => {
    expect(ageInDays(new Date("2026-11-13T00:00:00Z"), new Date("2026-11-23T23:59:00Z"))).toBe(10);
    expect(ageInDays(new Date("2026-11-23T00:00:00Z"), new Date("2026-11-23T23:59:00Z"))).toBe(0);
    expect(ageInDays(new Date("2026-11-25T00:00:00Z"), NOW)).toBeLessThan(0);
  });

  it.each([
    ["3 oktober 2026", "2026-10-03T00:00:00.000Z"],
    ["3 October 2026", "2026-10-03T00:00:00.000Z"],
    ["03-10-2026", "2026-10-03T00:00:00.000Z"],
    ["3/10/2026", "2026-10-03T00:00:00.000Z"],
    ["2026-10-03", "2026-10-03T00:00:00.000Z"],
    ["2026-10-03T08:00:00+02:00", "2026-10-03T06:00:00.000Z"],
  ])("parses %s", (raw, iso) => {
    expect(parsePageDate(raw)?.toISOString()).toBe(iso);
  });

  it.each(["31-02-2026", "3 brumaire 2026", "gisteren", "", null])("rejects %s", (raw) => {
    expect(parsePageDate(raw)).toBeNull();
  });
});

describe("structured_data", () => {
  it("passes with valid JSON-LD and lists the types", () => {
    const result = check("structured_data", scrapeOf(GOOD_HTML));
    expect(result.status).toBe("pass");
    expect(result.facts).toMatchObject({ blocks: 2, invalid_blocks: 0 });
    expect(result.facts.types).toEqual(expect.arrayContaining(["Organization", "Article", "Person"]));
  });

  it("needs attention when a block is invalid JSON", () => {
    const html = `<script type="application/ld+json">{"@type":"Organization"}</script><script type="application/ld+json">{oops</script>`;
    const result = check("structured_data", scrapeOf(html));
    expect(result.status).toBe("attention");
    expect(result.facts).toMatchObject({ blocks: 2, invalid_blocks: 1 });
  });

  it("needs attention when there is no JSON-LD", () => {
    expect(check("structured_data", scrapeOf(BARE_HTML)).status).toBe("attention");
  });
});

describe("clarity", () => {
  it("passes a well-structured page", () => {
    const result = check("clarity", scrapeOf(GOOD_HTML));
    expect(result.status).toBe("pass");
    expect(result.facts).toMatchObject({ h1_count: 1, skipped_heading_level: false, title_present: true, description_present: true, js_shell: false });
  });

  it("needs attention for a skipped level, missing title and description, and thin text", () => {
    const result = check("clarity", scrapeOf(BARE_HTML));
    expect(result.status).toBe("attention");
    expect(result.summary).toMatch(/skipped heading level/);
    expect(result.summary).toMatch(/no title/);
  });

  it("needs attention for two h1 headings", () => {
    const html = GOOD_HTML.replace("<h2>Hoe het werkt</h2>", "<h1>Nog een</h1>");
    const result = check("clarity", scrapeOf(html));
    expect(result.status).toBe("attention");
    expect(result.facts.h1_count).toBe(2);
  });

  it("fails a JavaScript shell", () => {
    const result = check("clarity", scrapeOf(JS_SHELL_HTML));
    expect(result.status).toBe("fail");
    expect(result.facts.js_shell).toBe(true);
  });
});

describe("speed and external", () => {
  it("are always n/a, even for a fetched page", () => {
    expect(check("speed", scrapeOf(GOOD_HTML)).status).toBe("n/a");
    expect(check("external", scrapeOf(GOOD_HTML)).status).toBe("n/a");
    expect(check("speed", scrapeOf(GOOD_HTML)).summary).toMatch(/not measured yet/);
  });
});
