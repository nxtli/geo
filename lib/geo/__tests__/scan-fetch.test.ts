import { afterEach, describe, it, expect, vi } from "vitest";
import { fetchHomepage, fetchPage } from "../scrape";

/**
 * The public scan (app/api/geo/scan) reads the homepage with fetchHomepage and
 * no options. The page check shares this code but always passes a guard;
 * these tests pin what the scan gets, so page-check work cannot change it.
 */

const HOME = "https://example.com/";
const HTML = `<html><head><title>Bakkerij Voorbeeld</title><meta name="description" content="Brood uit eigen oven."></head>
<body><h1>Vers brood, elke dag</h1><p>Wij bakken elke ochtend brood voor de buurt.</p></body></html>`;

type Route = (url: string) => Response | Promise<Response>;

function stubFetch(route: Route) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => route(String(input)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function site(page: () => Response): Route {
  return (url) => {
    if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /", { status: 200 });
    if (url.endsWith("/llms.txt")) return new Response("not found", { status: 404 });
    return page();
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchHomepage, as the public scan uses it", () => {
  it("is the same function as fetchPage", () => {
    expect(fetchHomepage).toBe(fetchPage);
  });

  it("returns the page text, metadata, robots and llms.txt fields the scan reads", async () => {
    stubFetch(site(() => new Response(HTML, { status: 200 })));

    const page = await fetchHomepage(HOME);

    expect({
      text: page.text?.includes("Wij bakken elke ochtend brood"),
      metadata: page.metadata,
      robotsTxt: page.robotsTxt,
      llmsTxtPresent: page.llmsTxtPresent,
      title: page.facts?.title,
      finalUrl: page.finalUrl,
      fetchError: page.fetchError,
    }).toEqual({
      text: true,
      metadata: {
        fetched: true,
        status: 200,
        title: "Bakkerij Voorbeeld",
        description: "Brood uit eigen oven.",
        word_count: page.facts!.wordCount,
        meta_robots: null,
        has_json_ld: false,
        h1_count: 1,
        heading_count: 1,
      },
      robotsTxt: "User-agent: *\nAllow: /",
      llmsTxtPresent: false,
      title: "Bakkerij Voorbeeld",
      finalUrl: undefined,
      fetchError: undefined,
    });
  });

  it("asks for the page, robots.txt and llms.txt, each once", async () => {
    const fetchMock = stubFetch(site(() => new Response(HTML, { status: 200 })));

    await fetchHomepage(HOME);

    expect(fetchMock.mock.calls.map(([input]) => String(input)).sort()).toEqual([
      HOME,
      "https://example.com/llms.txt",
      "https://example.com/robots.txt",
    ]);
  });

  it("reports a 404 homepage as not fetched, with its status and no facts", async () => {
    stubFetch(site(() => new Response("gone", { status: 404 })));

    const page = await fetchHomepage(HOME);

    expect({ text: page.text, metadata: page.metadata, facts: page.facts }).toEqual({
      text: null,
      metadata: { fetched: false, status: 404 },
      facts: null,
    });
  });

  it("reports a network error as status null, never a throw", async () => {
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });

    const page = await fetchHomepage(HOME);

    expect({ metadata: page.metadata, robotsTxt: page.robotsTxt, llms: page.llmsTxtPresent }).toEqual({
      metadata: { fetched: false, status: null },
      robotsTxt: null,
      llms: undefined,
    });
  });
});
