import { afterEach, describe, it, expect, vi } from "vitest";
import { extractPageFacts } from "../facts/page";
import { analyzeRobots } from "../facts/robots";
import { fetchPage, MAX_REDIRECTS, type ScrapeResult } from "../scrape";
import { measureSpeed, type SpeedMeasurement } from "../speed";
import type { LookupAll } from "../url-safety";
import type { ClarityJudge } from "../clarity-judge";
import {
  FETCH_CONCURRENCY,
  PAGE_CHECK_BUDGET_MS,
  checkMachineAuth,
  pageCheckBodySchema,
  runPageCheck,
  type PageCheckFetched,
  type PageCheckResult,
} from "../page-check";

const NOW = new Date("2026-11-23T12:00:00Z");
const HTML = `<html><head><title>Pagina</title></head><body><h1>Pagina</h1><p>tekst</p></body></html>`;

function fakeScrape(url: string, robotsTxt: string | null = ""): ScrapeResult {
  return {
    text: null,
    metadata: { fetched: true, status: 200, title: "Meta titel" },
    robotsTxt,
    llmsTxtPresent: true,
    facts: extractPageFacts(HTML, url),
    robots: analyzeRobots(robotsTxt, url),
  };
}

function run(urls: string[], fetchPage = vi.fn(async (url: string) => fakeScrape(url)), checks?: string[]) {
  const body = pageCheckBodySchema.parse({ urls, checks });
  return { fetchPage, response: runPageCheck(body, { fetchPage, now: () => NOW }) };
}

describe("pageCheckBodySchema", () => {
  const url = (i: number) => `https://example.com/${i}`;

  it("accepts 1 to 10 urls", () => {
    expect(pageCheckBodySchema.safeParse({ urls: [url(1)] }).success).toBe(true);
    expect(pageCheckBodySchema.safeParse({ urls: Array.from({ length: 10 }, (_, i) => url(i)) }).success).toBe(true);
  });

  it("rejects no urls and more than 10", () => {
    expect(pageCheckBodySchema.safeParse({ urls: [] }).success).toBe(false);
    expect(pageCheckBodySchema.safeParse({ urls: Array.from({ length: 11 }, (_, i) => url(i)) }).success).toBe(false);
  });

  it("rejects a url longer than 2048 characters", () => {
    expect(pageCheckBodySchema.safeParse({ urls: [`https://example.com/${"a".repeat(2048)}`] }).success).toBe(false);
  });

  it("rejects an unknown check id", () => {
    expect(pageCheckBodySchema.safeParse({ urls: [url(1)], checks: ["speed", "vibes"] }).success).toBe(false);
  });
});

describe("runPageCheck", () => {
  it("fetches allowed urls, refuses blocked ones without fetching, and keeps input order", async () => {
    const { fetchPage, response } = run(["https://example.com/a", "http://localhost/admin", "https://example.com/b"]);
    const { results } = await response;
    expect(results.map((r) => r.url)).toEqual(["https://example.com/a", "http://localhost/admin", "https://example.com/b"]);
    expect(results[1]).toEqual({ url: "http://localhost/admin", fetched: false, error: "url_not_allowed" });
    expect(results[0].fetched).toBe(true);
    expect(results[2].fetched).toBe(true);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).not.toHaveBeenCalledWith("http://localhost/admin");
  });

  it("collapses duplicate urls into one result", async () => {
    const { fetchPage, response } = run(["https://example.com/a", " https://example.com/a ", "https://example.com/a"]);
    const { results } = await response;
    expect(results).toHaveLength(1);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("turns a throwing fetch into fetch_failed and still checks the other urls", async () => {
    const fetchPage = vi.fn(async (url: string) => {
      if (url.endsWith("/boom")) throw new Error("socket hang up");
      return fakeScrape(url);
    });
    const { results } = await run(["https://example.com/boom", "https://example.com/ok"], fetchPage).response;
    expect(results[0]).toEqual({ url: "https://example.com/boom", fetched: false, error: "fetch_failed" });
    expect(results[1].fetched).toBe(true);
  });

  it("returns the response shape with checked_at, status, title, robots and llms_txt", async () => {
    const fetchPage = vi.fn(async (url: string) => fakeScrape(url, "User-agent: PerplexityBot\nDisallow: /"));
    const response = await run(["https://example.com/a"], fetchPage).response;
    expect(response.ok).toBe(true);
    expect(response.checked_at).toBe(NOW.toISOString());
    const result = response.results[0] as PageCheckFetched;
    expect(result).toMatchObject({
      url: "https://example.com/a",
      fetched: true,
      status: 200,
      title: "Pagina",
      robots: { known: true, blocked_search: ["PerplexityBot"] },
      llms_txt: true,
    });
    expect(result.checks.map((c) => c.id)).toEqual(["author_publisher", "recency", "structured_data", "clarity", "speed", "external"]);
    expect(result.checks.map((c) => [c.id, c.status, c.evidence])).toEqual([
      ["author_publisher", "attention", null],
      ["recency", "unknown", null],
      ["structured_data", "attention", null],
      ["clarity", "attention", "Pagina"],
      ["speed", "n/a", null],
      ["external", "fail", null],
    ]);
  });

  it("runs only the requested checks", async () => {
    const { results } = await run(["https://example.com/a"], undefined, ["recency"]).response;
    expect((results[0] as PageCheckFetched).checks.map((c) => c.id)).toEqual(["recency"]);
  });

  it("reports a page that came back without content as not fetched, with unknown checks", async () => {
    const fetchPage = vi.fn(
      async (url: string): Promise<ScrapeResult> => ({
        text: null,
        metadata: { fetched: false, status: 404 },
        robotsTxt: null,
        facts: null,
        robots: analyzeRobots(null, url),
      }),
    );
    const result = (await run(["https://example.com/gone"], fetchPage).response).results[0] as PageCheckFetched;
    expect(result).toMatchObject({ fetched: false, status: 404, title: null, robots: { known: false, blocked_search: [] }, llms_txt: null });
    expect(result.checks.find((c) => c.id === "clarity")?.status).toBe("unknown");
  });

  it(`never has more than ${FETCH_CONCURRENCY} fetches in flight`, async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchPage = vi.fn(async (url: string) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return fakeScrape(url);
    });
    const urls = Array.from({ length: 8 }, (_, i) => `https://example.com/${i}`);
    const { results } = await run(urls, fetchPage).response;
    expect(results).toHaveLength(8);
    expect(peak).toBe(FETCH_CONCURRENCY);
  });
});

describe("runPageCheck speed measurement", () => {
  const FAST: SpeedMeasurement = { ok: true, lcp_ms: 1_800, fcp_ms: 1_100, performance_score: 92, source: "lab" };

  function speedOf(result: PageCheckResult) {
    return (result as PageCheckFetched).checks.find((c) => c.id === "speed");
  }

  function runWithSpeed(
    urls: string[],
    measureSpeed: (url: string) => Promise<SpeedMeasurement>,
    options: { checks?: string[]; fetchPage?: (url: string) => Promise<ScrapeResult> } = {},
  ) {
    const fetchPage = options.fetchPage ?? (async (url: string) => fakeScrape(url));
    return runPageCheck(pageCheckBodySchema.parse({ urls, checks: options.checks }), {
      fetchPage,
      measureSpeed,
      now: () => NOW,
    });
  }

  it("measures the final url and grades it when no checks are named", async () => {
    const measureSpeed = vi.fn(async (_url: string) => FAST);
    const fetchPage = async (url: string) => ({ ...fakeScrape(`${url}/eind`), finalUrl: `${url}/eind` });

    const { results } = await runWithSpeed(["https://example.com/a"], measureSpeed, { fetchPage });

    expect(measureSpeed.mock.calls).toEqual([["https://example.com/a/eind"]]);
    expect(speedOf(results[0]!)).toEqual({
      id: "speed",
      status: "pass",
      summary: "Mobile lab measurement: LCP 1800 ms, FCP 1100 ms, performance score 92.",
      facts: { lcp_ms: 1_800, fcp_ms: 1_100, performance_score: 92, strategy: "mobile" },
      evidence: "LCP 1.8 s, FCP 1.1 s, score 92 (mobile, lab)",
    });
  });

  it("measures when speed is among the requested checks", async () => {
    const measureSpeed = vi.fn(async (_url: string) => FAST);
    await runWithSpeed(["https://example.com/a"], measureSpeed, { checks: ["recency", "speed"] });
    expect(measureSpeed).toHaveBeenCalledTimes(1);
  });

  it("makes no PSI call when speed is not requested", async () => {
    const measureSpeed = vi.fn(async (_url: string) => FAST);
    const { results } = await runWithSpeed(["https://example.com/a"], measureSpeed, { checks: ["recency"] });
    expect({ calls: measureSpeed.mock.calls.length, ids: (results[0] as PageCheckFetched).checks.map((c) => c.id) }).toEqual({
      calls: 0,
      ids: ["recency"],
    });
  });

  it("leaves speed n/a when no measurer is wired", async () => {
    const { results } = await run(["https://example.com/a"]).response;
    expect(speedOf(results[0]!)?.status).toBe("n/a");
  });

  it("makes no PSI call for a refused url, before or during the fetch", async () => {
    const measureSpeed = vi.fn(async (_url: string) => FAST);
    const fetchPage = async (url: string): Promise<ScrapeResult> =>
      url.includes("omleiding")
        ? { ...fakeScrape(url), metadata: { fetched: false, status: null }, facts: null, fetchError: "url_not_allowed" }
        : fakeScrape(url);

    const { results } = await runWithSpeed(["http://10.0.0.5/", "https://example.com/omleiding"], measureSpeed, { fetchPage });

    expect({ calls: measureSpeed.mock.calls.length, errors: results.map((r) => ("error" in r ? r.error : null)) }).toEqual({
      calls: 0,
      errors: ["url_not_allowed", "url_not_allowed"],
    });
  });

  it("makes no PSI call for a page that did not load, and leaves speed n/a", async () => {
    const measureSpeed = vi.fn(async (_url: string) => FAST);
    const fetchPage = async (url: string): Promise<ScrapeResult> => ({
      ...fakeScrape(url),
      metadata: { fetched: false, status: 503 },
      facts: null,
    });

    const { results } = await runWithSpeed(["https://example.com/a"], measureSpeed, { fetchPage });

    expect({ calls: measureSpeed.mock.calls.length, fetched: results[0]?.fetched, speed: speedOf(results[0]!)?.status }).toEqual({
      calls: 0,
      fetched: false,
      speed: "n/a",
    });
  });

  it("reports a failed measurement as unknown with its reason, and keeps the page result", async () => {
    const { results } = await runWithSpeed(["https://example.com/a"], async () => ({ ok: false, reason: "http_error" }));
    expect({ fetched: results[0]?.fetched, status: speedOf(results[0]!)?.status, summary: speedOf(results[0]!)?.summary }).toEqual({
      fetched: true,
      status: "unknown",
      summary: "Page speed could not be measured: PageSpeed Insights returned an error.",
    });
  });

  it("reports an exhausted quota as n/a with reason quota, and keeps the page result", async () => {
    const { results } = await runWithSpeed(["https://example.com/a"], async () => ({ ok: false, reason: "quota" }));
    expect({ fetched: results[0]?.fetched, status: speedOf(results[0]!)?.status, reason: speedOf(results[0]!)?.facts.failure_reason }).toEqual({
      fetched: true,
      status: "n/a",
      reason: "quota",
    });
  });

  it("treats a measurer that throws as a network failure, not a failed page", async () => {
    const { results } = await runWithSpeed(["https://example.com/a"], async () => {
      throw new Error("boom");
    });
    expect({ fetched: results[0]?.fetched, reason: speedOf(results[0]!)?.facts.failure_reason }).toEqual({
      fetched: true,
      reason: "network",
    });
  });

  it("does not let one timed-out measurement block the other pages", async () => {
    const finished: string[] = [];
    // The real measureSpeed with a short timeout: PSI hangs for page a and answers at once for the others.
    const psiFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const page = new URL(String(input)).searchParams.get("url") ?? "";
      if (page.endsWith("/a")) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        });
      }
      const body = {
        lighthouseResult: {
          audits: { "largest-contentful-paint": { numericValue: 1_500 }, "first-contentful-paint": { numericValue: 900 } },
          categories: { performance: { score: 0.95 } },
        },
      };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    const measure = async (url: string) => {
      const result = await measureSpeed(url, { fetch: psiFetch as unknown as typeof fetch, timeoutMs: 50 });
      finished.push(url);
      return result;
    };

    const { results } = await runWithSpeed(
      ["https://example.com/a", "https://example.com/b", "https://example.com/c", "https://example.com/d"],
      measure,
    );

    expect({
      statuses: results.map((r) => speedOf(r)?.status),
      lastFinished: finished[finished.length - 1],
      summary: speedOf(results[0]!)?.summary,
    }).toEqual({
      statuses: ["unknown", "pass", "pass", "pass"],
      lastFinished: "https://example.com/a",
      summary: "Page speed could not be measured: the measurement timed out.",
    });
  });
});

describe("checkMachineAuth", () => {
  it("hides the endpoint when no token is configured", () => {
    expect(checkMachineAuth("Bearer anything", undefined)).toBe("not_found");
    expect(checkMachineAuth("Bearer anything", "")).toBe("not_found");
  });

  it.each([
    ["a missing header", null],
    ["a wrong token", "Bearer wrong-token"],
    ["a token of another length", "Bearer s3cret-token-plus"],
    ["a non-bearer scheme", "Basic s3cret-token"],
    ["a bare token", "s3cret-token"],
  ])("is unauthorized for %s", (_label, header) => {
    expect(checkMachineAuth(header, "s3cret-token")).toBe("unauthorized");
  });

  it("accepts the right bearer token", () => {
    expect(checkMachineAuth("Bearer s3cret-token", "s3cret-token")).toBe("ok");
    expect(checkMachineAuth("bearer s3cret-token", "s3cret-token")).toBe("ok");
  });
});

describe("runPageCheck with the real fetchPage (redirect and DNS guard)", () => {
  const PUBLIC_IP = "93.184.216.34";

  /** A lookup answering from `table`; an unknown host fails like ENOTFOUND. */
  function lookupFrom(table: Record<string, string[]>): LookupAll {
    return vi.fn(async (hostname: string) => {
      const addresses = table[hostname];
      if (!addresses) throw new Error(`getaddrinfo ENOTFOUND ${hostname}`);
      return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
    });
  }

  const htmlPage = () => new Response(HTML, { status: 200, headers: { "content-type": "text/html" } });
  const redirectTo = (location: string) => () => new Response(null, { status: 302, headers: { location } });

  /** Stubs global fetch: known URLs answer from `routes`, anything else is a 404. */
  function stubFetch(routes: Record<string, () => Response>) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const route = routes[String(input)];
      return route ? route() : new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const fetchedUrls = (fetchMock: ReturnType<typeof stubFetch>) => fetchMock.mock.calls.map(([input]) => String(input));

  const check = async (url: string, lookup: LookupAll) =>
    (await runPageCheck(pageCheckBodySchema.parse({ urls: [url] }), { lookup, now: () => NOW })).results[0];

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses a redirect to a private address without fetching it", async () => {
    const fetchMock = stubFetch({ "https://example.com/a": redirectTo("http://10.0.0.5/admin") });

    const result = await check("https://example.com/a", lookupFrom({ "example.com": [PUBLIC_IP] }));

    expect(result).toEqual({ url: "https://example.com/a", fetched: false, error: "url_not_allowed" });
    expect(fetchedUrls(fetchMock)).toEqual(["https://example.com/a"]);
  });

  it("follows a redirect chain to a public page and reports the final url", async () => {
    const fetchMock = stubFetch({
      "https://example.com/a": redirectTo("/b"),
      "https://example.com/b": redirectTo("https://www.example.com/c"),
      "https://www.example.com/c": htmlPage,
      "https://www.example.com/robots.txt": () => new Response("User-agent: PerplexityBot\nDisallow: /", { status: 200 }),
    });

    const result = await check(
      "https://example.com/a",
      lookupFrom({ "example.com": [PUBLIC_IP], "www.example.com": [PUBLIC_IP] }),
    );

    expect(result).toMatchObject({
      url: "https://example.com/a",
      final_url: "https://www.example.com/c",
      fetched: true,
      status: 200,
      robots: { known: true, blocked_search: ["PerplexityBot"] },
      llms_txt: false,
    });
    expect(fetchedUrls(fetchMock)).toEqual(
      expect.arrayContaining(["https://www.example.com/robots.txt", "https://www.example.com/llms.txt"]),
    );
    expect(fetchMock.mock.calls.every(([, init]) => init?.redirect === "manual")).toBe(true);
  });

  it("leaves final_url out when there was no redirect", async () => {
    stubFetch({ "https://example.com/a": htmlPage });

    const result = await check("https://example.com/a", lookupFrom({ "example.com": [PUBLIC_IP] }));

    expect(result).not.toHaveProperty("final_url");
  });

  it(`follows ${MAX_REDIRECTS} redirects`, async () => {
    const routes: Record<string, () => Response> = { [`https://example.com/${MAX_REDIRECTS}`]: htmlPage };
    for (let i = 0; i < MAX_REDIRECTS; i++) routes[`https://example.com/${i}`] = redirectTo(`/${i + 1}`);
    stubFetch(routes);

    const result = await check("https://example.com/0", lookupFrom({ "example.com": [PUBLIC_IP] }));

    expect(result).toMatchObject({ fetched: true, final_url: `https://example.com/${MAX_REDIRECTS}` });
  });

  it("turns a chain of 6 redirects into fetch_failed", async () => {
    const routes: Record<string, () => Response> = {};
    for (let i = 0; i < 6; i++) routes[`https://example.com/${i}`] = redirectTo(`/${i + 1}`);
    routes["https://example.com/6"] = htmlPage;
    const fetchMock = stubFetch(routes);

    const result = await check("https://example.com/0", lookupFrom({ "example.com": [PUBLIC_IP] }));

    expect(result).toEqual({ url: "https://example.com/0", fetched: false, error: "fetch_failed" });
    expect(fetchedUrls(fetchMock)).not.toContain("https://example.com/6");
  });

  it.each([
    ["resolves to 10.x", { "intranet.example.com": ["10.1.2.3"] }],
    ["has one private address among public ones", { "intranet.example.com": [PUBLIC_IP, "192.168.1.10"] }],
    ["does not resolve", {}],
  ])("refuses a hostname that %s, without fetching", async (_label, table: Record<string, string[]>) => {
    const fetchMock = stubFetch({ "https://intranet.example.com/": htmlPage });

    const result = await check("https://intranet.example.com/", lookupFrom(table));

    expect({ result, fetches: fetchMock.mock.calls.length }).toEqual({
      result: { url: "https://intranet.example.com/", fetched: false, error: "url_not_allowed" },
      fetches: 0,
    });
  });

  it("treats a refused robots.txt redirect as unreachable", async () => {
    stubFetch({
      "https://example.com/a": htmlPage,
      "https://example.com/robots.txt": redirectTo("http://127.0.0.1/robots.txt"),
    });

    const result = await check("https://example.com/a", lookupFrom({ "example.com": [PUBLIC_IP] }));

    expect(result).toMatchObject({ fetched: true, robots: { known: false } });
  });
});

describe("fetchPage without a guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps today's behaviour: every fetch follows redirects itself and no final url is added", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(HTML, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPage("https://example.com/a");

    expect({
      redirects: fetchMock.mock.calls.map(([, init]) => init?.redirect),
      finalUrl: result.finalUrl,
      fetchError: result.fetchError,
    }).toEqual({ redirects: ["follow", "follow", "follow"], finalUrl: undefined, fetchError: undefined });
  });
});

describe("runPageCheck time budget", () => {
  const never = <T,>() => new Promise<T>(() => {});

  function runBudget(
    urls: string[],
    deps: { fetchPage: (url: string) => Promise<ScrapeResult>; measureSpeed?: (url: string) => Promise<SpeedMeasurement> },
    budgetMs: number,
    checks?: string[],
  ) {
    return runPageCheck(pageCheckBodySchema.parse({ urls, checks }), { ...deps, now: () => NOW, budgetMs });
  }

  it("has a 90 second default budget", () => {
    expect(PAGE_CHECK_BUDGET_MS).toBe(90_000);
  });

  it("returns a page whose fetch outlasts the budget with every check n/a, and keeps the pages that finished", async () => {
    const fetchPage = async (url: string) => (url.endsWith("/slow") ? never<ScrapeResult>() : fakeScrape(url));

    const { results } = await runBudget(["https://example.com/a", "https://example.com/slow"], { fetchPage }, 50, [
      "clarity",
      "speed",
    ]);

    expect(results[0]).toMatchObject({ url: "https://example.com/a", fetched: true });
    expect(results[1]).toEqual({
      url: "https://example.com/slow",
      fetched: false,
      status: null,
      title: null,
      checks: ["clarity", "speed"].map((id) => ({
        id,
        status: "n/a",
        summary: "Not checked: the time budget of this request ran out first.",
        facts: { reason: "time_budget" },
        evidence: null,
      })),
      robots: { known: false, blocked_search: [] },
      llms_txt: null,
    });
  });

  it("does not start a fetch once the budget is spent", async () => {
    const fetchPage = vi.fn(async (url: string) => fakeScrape(url));

    const { results } = await runBudget(["https://example.com/a"], { fetchPage }, 0);

    expect({ calls: fetchPage.mock.calls.length, status: (results[0] as PageCheckFetched).checks[0]?.facts }).toEqual({
      calls: 0,
      status: { reason: "time_budget" },
    });
  });

  it("counts a speed measurement still running at the budget as a timeout", async () => {
    const { results } = await runBudget(
      ["https://example.com/a"],
      { fetchPage: async (url) => fakeScrape(url), measureSpeed: () => never<SpeedMeasurement>() },
      50,
      ["speed"],
    );

    expect((results[0] as PageCheckFetched).checks[0]?.facts).toMatchObject({ failure_reason: "timeout" });
  });

  it("counts an off-page source still running at the budget as an error", async () => {
    const { results } = await runPageCheck(pageCheckBodySchema.parse({ urls: ["https://example.com/a"] }), {
      fetchPage: async (url) => fakeScrape(url),
      searchProvider: { name: "stub", search: () => never() },
      now: () => NOW,
      budgetMs: 50,
    });

    expect((results[0] as PageCheckFetched).checks.find((check) => check.id === "external")?.facts).toMatchObject({
      search: "error",
    });
  });
});

describe("runPageCheck clarity verdict", () => {
  const TEXT_HTML = `<html><head><title>Bakkerij</title><meta name="description" content="Brood"></head><body><h1>Vers brood</h1><p>${"woord ".repeat(200)}</p></body></html>`;

  function textScrape(url: string): ScrapeResult {
    return { ...fakeScrape(url), text: "Vers brood. Wij bakken elke dag.", facts: extractPageFacts(TEXT_HTML, url) };
  }

  function clarityOf(result: PageCheckResult) {
    return (result as PageCheckFetched).checks.find((c) => c.id === "clarity");
  }

  function runJudged(judgeClarity: ClarityJudge, options: { checks?: string[]; scrape?: (url: string) => ScrapeResult; budgetMs?: number } = {}) {
    const scrape = options.scrape ?? textScrape;
    return runPageCheck(pageCheckBodySchema.parse({ urls: ["https://example.com/a"], checks: options.checks }), {
      fetchPage: async (url) => scrape(url),
      judgeClarity,
      now: () => NOW,
      ...(options.budgetMs !== undefined ? { budgetMs: options.budgetMs } : {}),
    });
  }

  it("uses the model's verdict as the status and keeps the structure as evidence", async () => {
    const judge = vi.fn<ClarityJudge>(async () => ({ verdict: "attention", reason: "The offer is named but not who it is for." }));

    const { results } = await runJudged(judge, { checks: ["clarity"] });

    expect(judge.mock.calls[0]?.[0]).toMatchObject({ url: "https://example.com/a", h1: "Vers brood", title: "Bakkerij" });
    expect(clarityOf(results[0]!)).toMatchObject({
      status: "attention",
      summary: "The offer is named but not who it is for.",
      facts: { h1_count: 1, title_present: true, llm_verdict: "attention", llm_reason: "The offer is named but not who it is for." },
      evidence: "Vers brood",
    });
  });

  it("is not asked when clarity is not requested", async () => {
    const judge = vi.fn<ClarityJudge>(async () => ({ verdict: "pass", reason: "Clear." }));

    await runJudged(judge, { checks: ["speed"] });

    expect(judge).not.toHaveBeenCalled();
  });

  it("falls back to the structure verdict when the judge throws", async () => {
    const { results } = await runJudged(async () => {
      throw new Error("overloaded");
    }, { checks: ["clarity"] });

    expect(clarityOf(results[0]!)).toMatchObject({ status: "pass", facts: { llm_verdict: null, llm_error: "error" } });
  });

  it("falls back to the structure verdict when the judge outlasts the budget", async () => {
    const { results } = await runJudged(() => new Promise(() => {}), { checks: ["clarity"], budgetMs: 50 });

    expect(clarityOf(results[0]!)).toMatchObject({ status: "pass", facts: { llm_verdict: null, llm_error: "timeout" } });
  });

  it("is not asked for a page without text", async () => {
    const judge = vi.fn<ClarityJudge>(async () => ({ verdict: "pass", reason: "Clear." }));

    await runJudged(judge, { checks: ["clarity"], scrape: fakeScrape });

    expect(judge).not.toHaveBeenCalled();
  });
});
