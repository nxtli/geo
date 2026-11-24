import { describe, it, expect } from "vitest";
import { extractPageFacts } from "../facts/page";
import { analyzeRobots } from "../facts/robots";
import type { ScrapeResult } from "../scrape";
import type { SpeedMeasurement } from "../speed";
import {
  AGING_MAX_AGE_DAYS,
  CHECK_IDS,
  CHECK_REGISTRY,
  FUTURE_TOLERANCE_DAYS,
  LCP_ATTENTION_MAX_MS,
  LCP_PASS_MAX_MS,
  RECENT_MAX_AGE_DAYS,
  ageInDays,
  parsePageDate,
  runChecks,
  type ClarityOutcome,
  type CheckId,
} from "../checks";

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

/** A page whose only date is article:modified_time, `days` days before NOW. */
function aged(days: number): ScrapeResult {
  return scrapeOf(withMetaModified(new Date(NOW.getTime() - days * DAY_MS).toISOString()));
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

  it("gives null evidence for every unknown and n/a result", () => {
    const results = runChecks(notFetchedScrape(), PAGE_URL, undefined, NOW);
    expect(results.map((r) => r.evidence)).toEqual(results.map(() => null));
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
      external: "unknown",
    });
  });
});

describe("author_publisher", () => {
  it("passes with the JSON-LD publisher and author", () => {
    const result = check("author_publisher", scrapeOf(GOOD_HTML));
    expect(result.status).toBe("pass");
    expect(result.facts).toMatchObject({ publisher: "Voorbeeld BV", author: "Jan Jansen", author_source: "json_ld" });
    expect(result.evidence).toBe("publisher: Voorbeeld BV (JSON-LD); author: Jan Jansen (JSON-LD)");
  });

  it("falls back to og:site_name and meta author", () => {
    const html = `<head><meta property="og:site_name" content="Voorbeeld"><meta name="author" content="Anne"></head>`;
    const result = check("author_publisher", scrapeOf(html));
    expect(result.status).toBe("pass");
    expect(result.facts).toMatchObject({ publisher: "Voorbeeld", publisher_source: "og:site_name", author: "Anne", author_source: "meta_author" });
    expect(result.evidence).toBe("publisher: Voorbeeld (og:site_name); author: Anne (meta author)");
  });

  it("names only the author in the evidence when there is no publisher", () => {
    const result = check("author_publisher", scrapeOf(`<head><meta name="author" content="Anne"></head>`));
    expect(result.evidence).toBe("author: Anne (meta author)");
  });

  it("needs attention when og:site_name is the only signal, with the site name as evidence", () => {
    const result = check("author_publisher", scrapeOf(`<head><meta property="og:site_name" content="Voorbeeld"></head>`));
    expect({ status: result.status, evidence: result.evidence }).toEqual({
      status: "attention",
      evidence: "publisher: Voorbeeld (og:site_name)",
    });
    expect(result.summary).toBe("Only a site name (Voorbeeld) was found; no named author or publisher.");
  });

  it("keeps passing when a site name comes with a JSON-LD publisher", () => {
    const html = `<head><meta property="og:site_name" content="Voorbeeld"><script type="application/ld+json">{"@type":"Organization","name":"Voorbeeld BV"}</script></head>`;
    const result = check("author_publisher", scrapeOf(html));
    expect({ status: result.status, evidence: result.evidence }).toEqual({
      status: "pass",
      evidence: "publisher: Voorbeeld BV (JSON-LD)",
    });
  });

  it("needs attention when nobody is named, with null evidence", () => {
    const result = check("author_publisher", scrapeOf(BARE_HTML));
    expect({ status: result.status, evidence: result.evidence }).toEqual({ status: "attention", evidence: null });
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
    expect(result.evidence).toBe("2026-11-01 (JSON-LD dateModified)");
  });

  it("quotes a visible date as found, with its source", () => {
    const html = `<html><body><p>Bijgewerkt op 3 oktober 2026. tekst</p></body></html>`;
    expect(check("recency", scrapeOf(html)).evidence).toBe("3 oktober 2026 (visible date)");
  });

  it("uses tiers of 180 and 365 days", () => {
    expect([RECENT_MAX_AGE_DAYS, AGING_MAX_AGE_DAYS]).toEqual([180, 365]);
  });

  it.each([
    [180, "pass"],
    [181, "attention"],
    [365, "attention"],
    [366, "fail"],
  ])("at %i days is %s", (days, status) => {
    const result = check("recency", aged(days));
    expect({ age: result.facts.age_days, status: result.status }).toEqual({ age: days, status });
  });

  it("allows a date up to one day in the future", () => {
    const result = check("recency", aged(-FUTURE_TOLERANCE_DAYS));
    expect({ age: result.facts.age_days, status: result.status, ignored: result.facts.ignored_future_date }).toEqual({
      age: -1,
      status: "pass",
      ignored: null,
    });
  });

  it("is unknown when the only date lies more than a day in the future, and says it was ignored", () => {
    const result = check("recency", aged(-30));
    expect({
      status: result.status,
      age: result.facts.age_days,
      newest: result.facts.newest_date,
      ignored: result.facts.ignored_future_date,
      evidence: result.evidence,
    }).toEqual({ status: "unknown", age: null, newest: null, ignored: "2026-12-23", evidence: null });
    expect(result.summary).toMatch(/future.*ignored/);
  });

  it("ignores a future date when picking the newest and grades the next one", () => {
    const tenDaysAgo = new Date(NOW.getTime() - 10 * DAY_MS).toISOString();
    const html = `<html><head><meta property="article:modified_time" content="${tenDaysAgo}">
<script type="application/ld+json">{"@type":"Article","dateModified":"2027-03-01"}</script></head><body><p>tekst</p></body></html>`;
    const result = check("recency", scrapeOf(html));
    expect({
      status: result.status,
      source: result.facts.newest_source,
      age: result.facts.age_days,
      ignored: result.facts.ignored_future_date,
    }).toEqual({ status: "pass", source: "meta_modified_time", age: 10, ignored: "2027-03-01" });
    expect(result.summary).toMatch(/A date in the future \(2027-03-01\) was ignored/);
  });

  it("reports ignored_future_date as null when no date is found", () => {
    expect(check("recency", scrapeOf(BARE_HTML)).facts.ignored_future_date).toBeNull();
  });

  it("is unknown when no date is found, with null evidence", () => {
    const result = check("recency", scrapeOf(BARE_HTML));
    expect(result.status).toBe("unknown");
    expect(result.facts.age_days).toBeNull();
    expect(result.evidence).toBeNull();
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
    expect(result.evidence).toBe(`page type: article; types: ${(result.facts.types as string[]).join(", ")}`);
  });

  it("needs attention when a block is invalid JSON", () => {
    const html = `<script type="application/ld+json">{"@type":"Organization"}</script><script type="application/ld+json">{oops</script>`;
    const result = check("structured_data", scrapeOf(html));
    expect(result.status).toBe("attention");
    expect(result.facts).toMatchObject({ blocks: 2, invalid_blocks: 1 });
  });

  it.each([
    ["an empty object", "{}"],
    ["an empty list", "[]"],
    ["objects without @type", '{"name":"Voorbeeld BV","url":"https://voorbeeld.example"}'],
  ])("needs attention when the blocks declare no types (%s)", (_label, json) => {
    const html = `<script type="application/ld+json">${json}</script>`;
    const result = check("structured_data", scrapeOf(html));
    expect({ status: result.status, evidence: result.evidence, blocks: result.facts.blocks }).toEqual({
      status: "attention",
      evidence: null,
      blocks: 1,
    });
    expect(result.summary).toMatch(/no types declared/);
  });

  it("needs attention when there is no JSON-LD, with null evidence", () => {
    const result = check("structured_data", scrapeOf(BARE_HTML));
    expect({ status: result.status, evidence: result.evidence }).toEqual({ status: "attention", evidence: null });
  });
});

describe("clarity", () => {
  it("passes a well-structured page", () => {
    const result = check("clarity", scrapeOf(GOOD_HTML));
    expect(result.status).toBe("pass");
    expect(result.facts).toMatchObject({ h1_count: 1, skipped_heading_level: false, title_present: true, description_present: true, js_shell: false });
    expect(result.evidence).toBe("Zakelijk leasen");
  });

  it("quotes the first h1 and cuts a long one to 120 characters", () => {
    const long = "Lang ".repeat(40).trim();
    const result = check("clarity", scrapeOf(`<html><body><h1>${long}</h1><h1>Tweede</h1></body></html>`));
    expect({ length: result.evidence?.length, end: result.evidence?.slice(-1), start: result.evidence?.slice(0, 9) }).toEqual({
      length: 120,
      end: "…",
      start: "Lang Lang",
    });
  });

  it("has null evidence when there is no h1", () => {
    expect(check("clarity", scrapeOf(`<html><body><h2>Alleen h2</h2></body></html>`)).evidence).toBeNull();
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

  function judged(scrape: ScrapeResult, clarity: ClarityOutcome) {
    const [result] = runChecks(scrape, PAGE_URL, ["clarity"], NOW, null, null, clarity);
    return result;
  }

  it("takes the model verdict as the status, with the structure issues after its reason", () => {
    const result = judged(scrapeOf(BARE_HTML), { ok: true, verdict: "pass", reason: "Clear offer for small firms." });
    expect({ status: result.status, verdict: result.facts.llm_verdict }).toEqual({ status: "pass", verdict: "pass" });
    expect(result.summary).toMatch(/^Clear offer for small firms\. Structure issues: .*no title/);
  });

  it("lets a model fail a well-structured page", () => {
    const result = judged(scrapeOf(GOOD_HTML), { ok: true, verdict: "fail", reason: "No offer is named." });
    expect({ status: result.status, summary: result.summary, evidence: result.evidence }).toEqual({
      status: "fail",
      summary: "No offer is named.",
      evidence: "Zakelijk leasen",
    });
  });

  it("keeps a JavaScript shell a fail whatever the model says", () => {
    const result = judged(scrapeOf(JS_SHELL_HTML), { ok: true, verdict: "pass", reason: "Clear." });
    expect({ status: result.status, verdict: result.facts.llm_verdict }).toEqual({ status: "fail", verdict: null });
  });

  it("is structure only without a verdict, and says why the model gave none", () => {
    const result = judged(scrapeOf(GOOD_HTML), { ok: false, reason: "timeout" });
    expect({ status: result.status, verdict: result.facts.llm_verdict, error: result.facts.llm_error }).toEqual({
      status: "pass",
      verdict: null,
      error: "timeout",
    });
  });

  it("says in the summary that the verdict was unavailable", () => {
    expect(judged(scrapeOf(GOOD_HTML), { ok: false, reason: "error" }).summary).toMatch(/verdict was unavailable; structure only\.$/);
  });

  it("has null model facts and no error when no model was asked", () => {
    const result = check("clarity", scrapeOf(GOOD_HTML));
    expect({ verdict: result.facts.llm_verdict, reason: result.facts.llm_reason, hasError: "llm_error" in result.facts }).toEqual({
      verdict: null,
      reason: null,
      hasError: false,
    });
  });
});

describe("speed", () => {
  function measured(lcp_ms: number, overrides: Partial<{ fcp_ms: number; performance_score: number }> = {}): SpeedMeasurement {
    return { ok: true, lcp_ms, fcp_ms: 1_100, performance_score: 92, source: "lab", ...overrides };
  }

  function speedCheck(speed: SpeedMeasurement | null | undefined, scrape = scrapeOf(GOOD_HTML)) {
    const [result] = runChecks(scrape, PAGE_URL, ["speed"], NOW, speed);
    return result;
  }

  it("uses LCP thresholds of 2000 and 4000 ms", () => {
    expect([LCP_PASS_MAX_MS, LCP_ATTENTION_MAX_MS]).toEqual([2_000, 4_000]);
  });

  it.each([
    [2_000, "pass"],
    [2_001, "attention"],
    [4_000, "attention"],
    [4_001, "fail"],
  ])("at LCP %i ms is %s", (lcp, status) => {
    expect(speedCheck(measured(lcp)).status).toBe(status);
  });

  it("reports the facts and quotes the measurement as evidence", () => {
    const result = speedCheck(measured(1_800));
    expect(result.facts).toEqual({ lcp_ms: 1_800, fcp_ms: 1_100, performance_score: 92, strategy: "mobile" });
    expect(result.evidence).toBe("LCP 1.8 s, FCP 1.1 s, score 92 (mobile, lab)");
  });

  it.each([
    ["timeout", /timed out/],
    ["http_error", /returned an error/],
    ["invalid_response", /unreadable/],
    ["network", /could not be reached/],
  ] as const)("is unknown when the measurement failed with %s, and names the reason", (reason, text) => {
    const result = speedCheck({ ok: false, reason });
    expect({ status: result.status, evidence: result.evidence, reason: result.facts.failure_reason }).toEqual({
      status: "unknown",
      evidence: null,
      reason,
    });
    expect(result.summary).toMatch(text);
  });

  it("is n/a, not unknown, when the PageSpeed Insights quota was exhausted", () => {
    const result = speedCheck({ ok: false, reason: "quota" });
    expect({ status: result.status, evidence: result.evidence, reason: result.facts.failure_reason }).toEqual({
      status: "n/a",
      evidence: null,
      reason: "quota",
    });
  });

  it("names the quota in one neutral sentence that does not tell a key holder to set a key", () => {
    const result = speedCheck({ ok: false, reason: "quota" });
    expect(result.summary).toBe(
      "Page speed was not measured: the PageSpeed Insights quota was exhausted (a PAGESPEED_API_KEY raises it).",
    );
  });

  it.each([
    ["absent", undefined],
    ["null", null],
  ])("is n/a when the measurement is %s", (_label, speed) => {
    const result = speedCheck(speed);
    expect({ status: result.status, evidence: result.evidence }).toEqual({ status: "n/a", evidence: null });
    expect(result.summary).toMatch(/not measured/);
  });
});
