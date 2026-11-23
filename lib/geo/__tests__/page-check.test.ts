import { describe, it, expect, vi } from "vitest";
import { extractPageFacts } from "../facts/page";
import { analyzeRobots } from "../facts/robots";
import type { ScrapeResult } from "../scrape";
import {
  FETCH_CONCURRENCY,
  checkMachineAuth,
  pageCheckBodySchema,
  runPageCheck,
  type PageCheckFetched,
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
