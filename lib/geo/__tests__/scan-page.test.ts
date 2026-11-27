import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { finalizeAnalysis, type RunAnalysisOutcome } from "../analysis";
import { MockAnalysisProvider } from "../analysis/providers/mock";
import { BRANDS } from "../brand";
import { extractPageFacts } from "../facts/page";
import { EVIDENCE } from "../knowledge";
import { analyzeRobots } from "../facts/robots";
import { handleMcpMessage, SCAN_PAGE_TOOL, CHECK_PAGES_TOOL, type JsonRpcResponse, type McpDeps } from "../mcp";
import { buildPreview, buildReportHtml } from "../report/service";
import { createScanRateLimit, scanMaxPerHour, scanPage, DEFAULT_SCAN_MAX_PER_HOUR, type ScanPageDeps } from "../scan-page";
import type { ScrapeResult } from "../scrape";
import type { GeoAnalysisInput } from "../types";

const NOW = new Date("2026-11-27T12:00:00Z");
const URL_ = "https://www.example.nl/diensten";
const HTML = `<html><head><title>Diensten</title></head><body><h1>Onze diensten</h1><p>Wij maken websites voor het mkb.</p></body></html>`;
const SITE_BRAND = Object.values(BRANDS)[0];
// A neutral booking link, so the snapshot holds no real calendar address.
const BRAND = { ...SITE_BRAND, cta: { ...SITE_BRAND.cta, url: "https://example.nl/afspraak/" } };

function fakeScrape(url: string): ScrapeResult {
  return {
    text: "Onze diensten. Wij maken websites voor het mkb.",
    metadata: { fetched: true, status: 200, title: "Diensten" },
    robotsTxt: "",
    llmsTxtPresent: false,
    facts: extractPageFacts(HTML, url),
    robots: analyzeRobots("", url),
  };
}

/** The deterministic mock engine, so the report is the same on every run. */
async function mockAnalyze(input: GeoAnalysisInput): Promise<RunAnalysisOutcome> {
  const { result } = await new MockAnalysisProvider().analyze(input);
  return { result, providerId: "mock", degraded: false };
}

function deps(overrides: Partial<ScanPageDeps> = {}): ScanPageDeps {
  return {
    fetchPage: vi.fn(async (url: string) => fakeScrape(url)),
    guard: vi.fn(async () => true),
    analyze: vi.fn(mockAnalyze),
    makePdf: vi.fn(async () => ({ pdfUrl: null })),
    brand: BRAND,
    now: () => NOW,
    ...overrides,
  };
}

const ARGS = {
  url: URL_,
  company: "Voorbeeld",
  questions: "Welk bureau maakt websites voor het mkb?",
  offer: "Websites voor het mkb",
  audience: "Mkb-ondernemers",
};

/**
 * What POST /api/geo/scan does with a lead, steps 2 to 4 (fetch, analyse,
 * report), written out as the route writes it. The tool must give the same.
 */
async function siteScanReport(page: ScrapeResult) {
  const lead = {
    name: "Bezoeker",
    company_name: ARGS.company,
    homepage_url: ARGS.url,
    offer_description: ARGS.offer,
    target_audience: ARGS.audience,
    desired_queries: ARGS.questions,
    competitors: null,
  };
  const { result: analysis } = await mockAnalyze({
    homepage_url: lead.homepage_url,
    company_name: lead.company_name,
    offer_description: lead.offer_description,
    target_audience: lead.target_audience,
    desired_queries: lead.desired_queries,
    competitors: lead.competitors,
    page_content: page.text,
    metadata: page.metadata,
    robots_txt: page.robotsTxt,
    llms_txt_present: page.llmsTxtPresent,
    facts: page.facts,
    robots: page.robots,
  });
  return { analysis, html: buildReportHtml({ lead, analysis, brand: BRAND, now: NOW }) };
}

describe("scanPage — the site scan's own report", () => {
  it("should render the same report HTML as the site scan for the same page and answers", async () => {
    const site = await siteScanReport(fakeScrape(URL_));

    const result = await scanPage(ARGS, deps());

    expect(result.report_html).toBe(site.html);
  });

  it("should keep the site's report unchanged (snapshot of the site template)", async () => {
    const site = await siteScanReport(fakeScrape(URL_));

    expect(site.html).toMatchSnapshot();
  });

  it("should return the scorecard and the preview the site shows", async () => {
    const site = await siteScanReport(fakeScrape(URL_));

    const result = await scanPage(ARGS, deps());

    expect({ scorecard: result.scorecard, preview: result.preview }).toEqual({
      scorecard: site.analysis,
      preview: buildPreview(site.analysis),
    });
  });

  it("should give the engine the same input the site scan gives it", async () => {
    const analyze = vi.fn(mockAnalyze);
    const page = fakeScrape(URL_);

    await scanPage(ARGS, deps({ analyze, fetchPage: async () => page }));

    expect(analyze).toHaveBeenCalledWith({
      homepage_url: URL_,
      company_name: "Voorbeeld",
      offer_description: "Websites voor het mkb",
      target_audience: "Mkb-ondernemers",
      desired_queries: "Welk bureau maakt websites voor het mkb?",
      competitors: null,
      page_content: page.text,
      metadata: page.metadata,
      robots_txt: page.robotsTxt,
      llms_txt_present: page.llmsTxtPresent,
      facts: page.facts,
      robots: page.robots,
    });
  });

  it("should use the host without www as the company when none is given", async () => {
    const result = await scanPage({ url: URL_ }, deps());

    expect(result.company).toBe("example.nl");
  });

  it("should fetch the page under the URL guard", async () => {
    const d = deps();

    await scanPage({ url: URL_ }, d);

    expect(d.fetchPage).toHaveBeenCalledWith(URL_, { guard: d.guard });
  });

  it("should pass the PDF URL through when the site stores PDFs", async () => {
    const result = await scanPage({ url: URL_ }, deps({ makePdf: async () => ({ pdfUrl: "https://files.example/r.pdf" }) }));

    expect(result.pdf_url).toBe("https://files.example/r.pdf");
  });

  it("should say why a page the guard refused was not read", async () => {
    const refused: ScrapeResult = { ...fakeScrape(URL_), text: null, metadata: { fetched: false, status: null }, fetchError: "url_not_allowed" };

    const result = await scanPage({ url: URL_ }, deps({ fetchPage: async () => refused }));

    expect({ fetched: result.fetched, fetch_error: result.fetch_error }).toEqual({ fetched: false, fetch_error: "url_not_allowed" });
  });

  it("should not touch leads, e-mail, Slack, HubSpot or the database", () => {
    const source = readFileSync(join(__dirname, "..", "scan-page.ts"), "utf8");

    expect(source).not.toMatch(/from "\.\/(email|notify|supabase)\//);
  });
});

/**
 * A page that trips the snippet rules of the attribution-guideline update
 * (#6): nearly all text inside data-nosnippet, a site name, an About link.
 */
const GUIDELINE_HTML = `<html><head><title>Diensten</title><meta property="og:site_name" content="Voorbeeld"></head><body>
<h1>Onze diensten</h1><div data-nosnippet><p>Wij maken websites voor het mkb. Snel, betaalbaar en goed vindbaar in zoekmachines en AI-assistenten.
Elk project begint met een gesprek over je doelen, je klanten en je aanbod.</p></div><a href="/over-ons">Over ons</a></body></html>`;

function guidelineScrape(url: string): ScrapeResult {
  return { ...fakeScrape(url), facts: extractPageFacts(GUIDELINE_HTML, url) };
}

/** The mock engine plus the site's real fact layer, which is where #6's rules live. */
async function factLayerAnalyze(input: GeoAnalysisInput): Promise<RunAnalysisOutcome> {
  const { result } = await new MockAnalysisProvider().analyze(input);
  return { result: finalizeAnalysis(result, input), providerId: "mock", degraded: false };
}

describe("scanPage — the attribution-guideline parts (#6)", () => {
  it("should carry the snippet finding, the site-name line and the new scope notes exactly as the site report", async () => {
    const page = guidelineScrape(URL_);
    const lead = { name: "Bezoeker", company_name: ARGS.company, homepage_url: ARGS.url, offer_description: ARGS.offer, target_audience: ARGS.audience, desired_queries: ARGS.questions, competitors: null };
    const { result: analysis } = await factLayerAnalyze({
      homepage_url: lead.homepage_url, company_name: lead.company_name, offer_description: lead.offer_description,
      target_audience: lead.target_audience, desired_queries: lead.desired_queries, competitors: null,
      page_content: page.text, metadata: page.metadata, robots_txt: page.robotsTxt, llms_txt_present: page.llmsTxtPresent,
      facts: page.facts, robots: page.robots,
    });
    const siteHtml = buildReportHtml({ lead, analysis, brand: BRAND, now: NOW });

    const result = await scanPage(ARGS, deps({ analyze: vi.fn(factLayerAnalyze), fetchPage: async () => page }));

    expect({
      same: result.report_html === siteHtml,
      nosnippet: result.report_html.includes("staat binnen data-nosnippet"),
      siteName: result.report_html.includes("Sitenaam en favicon"),
      noAnswer: result.report_html.includes("Google toont niet altijd een AI-antwoord."),
      measure: result.report_html.includes("Meet zelf het resultaat."),
      knowledge: result.report_html.includes(`Kennisbank ${EVIDENCE.version}`),
      grounding: EVIDENCE.items.some((item) => item.id === "E-GROUNDING"),
    }).toEqual({ same: true, nosnippet: true, siteName: true, noAnswer: true, measure: true, knowledge: true, grounding: true });
  });
});

describe("createScanRateLimit", () => {
  it("should allow max scans in the window and then say when to come back", () => {
    let at = 0;
    const limit = createScanRateLimit(2, 60_000, () => at);

    const outcomes = [limit.take(), limit.take(), ((at = 15_000), limit.take())];

    expect(outcomes).toEqual([{ ok: true }, { ok: true }, { ok: false, retryAfterSeconds: 45 }]);
  });

  it("should allow a scan again once the oldest one left the window", () => {
    let at = 0;
    const limit = createScanRateLimit(1, 60_000, () => at);
    limit.take();
    at = 60_000;

    expect(limit.take()).toEqual({ ok: true });
  });

  it.each([
    [undefined, DEFAULT_SCAN_MAX_PER_HOUR],
    ["", DEFAULT_SCAN_MAX_PER_HOUR],
    ["0", DEFAULT_SCAN_MAX_PER_HOUR],
    ["2.5", DEFAULT_SCAN_MAX_PER_HOUR],
    ["12", 12],
  ])("should read GEO_MCP_SCAN_MAX_PER_HOUR %j as %d", (value, expected) => {
    expect(scanMaxPerHour(value)).toBe(expected);
  });
});

function request(method: string, params?: unknown) {
  return { jsonrpc: "2.0", id: 1, method, ...(params === undefined ? {} : { params }) };
}

function resultOf(response: JsonRpcResponse | null): Record<string, unknown> {
  if (!response || "error" in response) throw new Error(`expected a result, got ${JSON.stringify(response)}`);
  return response.result;
}

function scanDeps(outcome?: Awaited<ReturnType<NonNullable<McpDeps["scanPage"]>>>): McpDeps {
  return {
    scanPage: async (args) => outcome ?? { ok: true, result: await scanPage(args, deps()) },
  };
}

describe("MCP — geo_scan_page", () => {
  it("should list only the scan tool on the scan route", async () => {
    const result = resultOf(await handleMcpMessage(request("tools/list"), scanDeps()));

    expect((result.tools as { name: string }[]).map((tool) => tool.name)).toEqual([SCAN_PAGE_TOOL]);
  });

  it("should return the report HTML in structuredContent and leave it out of the text", async () => {
    const result = resultOf(await handleMcpMessage(request("tools/call", { name: SCAN_PAGE_TOOL, arguments: { url: URL_ } }), scanDeps()));
    const text = (result.content as { text: string }[])[0].text;

    expect({
      isError: result.isError,
      html: typeof (result.structuredContent as { report_html?: unknown }).report_html,
      textHasHtml: "report_html" in JSON.parse(text),
    }).toEqual({ isError: false, html: "string", textHasHtml: false });
  });

  it("should answer a full rate limit with an error that says when to retry", async () => {
    const result = resultOf(
      await handleMcpMessage(request("tools/call", { name: SCAN_PAGE_TOOL, arguments: { url: URL_ } }), scanDeps({ ok: false, retryAfterSeconds: 120 })),
    );

    expect(result).toMatchObject({ isError: true, content: [{ text: "Too many scans right now. Try again in 120 seconds." }] });
  });

  it("should refuse a URL that is not http or https without scanning", async () => {
    const scan = vi.fn();

    const result = resultOf(await handleMcpMessage(request("tools/call", { name: SCAN_PAGE_TOOL, arguments: { url: "ftp://example.nl" } }), { scanPage: scan }));

    expect({ isError: result.isError, scanned: scan.mock.calls.length }).toEqual({ isError: true, scanned: 0 });
  });

  it("should not serve the page check on the scan route", async () => {
    const response = await handleMcpMessage(request("tools/call", { name: CHECK_PAGES_TOOL, arguments: { urls: [URL_] } }), scanDeps());

    expect(response).toMatchObject({ error: { message: `Unknown tool: ${CHECK_PAGES_TOOL}` } });
  });

  it("should not serve the scan on the page-check route", async () => {
    const response = await handleMcpMessage(request("tools/call", { name: SCAN_PAGE_TOOL, arguments: { url: URL_ } }), {
      checkPages: vi.fn(),
    });

    expect(response).toMatchObject({ error: { message: `Unknown tool: ${SCAN_PAGE_TOOL}` } });
  });
});
