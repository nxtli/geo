import { afterEach, describe, it, expect, vi } from "vitest";
import { fetchPage, PAGE_MAX_BYTES, readCappedText, SIGNAL_MAX_BYTES } from "../scrape";

const CHUNK = 64 * 1024;
const encoder = new TextEncoder();

/** Pulled bytes stay within one chunk of read-ahead past the cap. */
function expectStoppedNear(pulled: number, cap: number) {
  expect(pulled).toBeGreaterThanOrEqual(cap);
  expect(pulled).toBeLessThanOrEqual(cap + 2 * CHUNK);
}

/**
 * A body stream that pulls CHUNK-sized chunks: `head` first (padded), then
 * filler, for `totalBytes` bytes or forever. Records how much was pulled and
 * whether the reader cancelled it.
 */
function streamedBody(head: string, totalBytes = Number.POSITIVE_INFINITY) {
  const stats = { pulled: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (stats.pulled >= totalBytes) {
          controller.close();
          return;
        }
        const size = Math.min(CHUNK, totalBytes - stats.pulled);
        const chunk = stats.pulled === 0 ? encoder.encode(head.padEnd(size, " ")) : new Uint8Array(size).fill(0x61);
        stats.pulled += chunk.byteLength;
        controller.enqueue(chunk);
      },
      cancel() {
        stats.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, stats };
}

describe("readCappedText", () => {
  it("returns a body under the cap whole", async () => {
    expect(await readCappedText(new Response("kort antwoord"), 1_024)).toBe("kort antwoord");
  });

  it("returns an empty string for a missing body", async () => {
    expect(await readCappedText(new Response(null, { status: 204 }), 1_024)).toBe("");
  });

  it("stops at the cap and cancels the rest of the stream", async () => {
    const { stream, stats } = streamedBody("<title>x</title>");
    const text = await readCappedText(new Response(stream), 3 * CHUNK + 10);

    expect({ length: text.length, cancelled: stats.cancelled }).toEqual({ length: 3 * CHUNK + 10, cancelled: true });
    expectStoppedNear(stats.pulled, 3 * CHUNK + 10);
  });

  it("ends in a replacement character when the cap cuts a multi-byte character", async () => {
    const text = await readCappedText(new Response("aé"), 2);
    expect(text).toBe("a�");
  });
});

describe("fetchPage body cap", () => {
  const PAGE = "https://voorbeeld.example/groot";
  const HEAD = "<html><head><title>Grote pagina</title></head><body><h1>Grote pagina</h1><p>";

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubRoutes(routes: Record<string, () => Response>) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const route = routes[String(input)];
      return route ? route() : new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("uses 2 MB for the page and 512 KB for robots.txt and llms.txt", () => {
    expect([PAGE_MAX_BYTES, SIGNAL_MAX_BYTES]).toEqual([2 * 1024 * 1024, 512 * 1024]);
  });

  it("guarded: reads at most 2 MB of an endless page, cancels it, and still computes facts", async () => {
    const page = streamedBody(HEAD);
    stubRoutes({ [PAGE]: () => new Response(page.stream, { status: 200, headers: { "content-type": "text/html" } }) });

    const result = await fetchPage(PAGE, { guard: () => true });

    expect({ fetched: result.metadata.fetched, title: result.facts?.title, cancelled: page.stats.cancelled }).toEqual({
      fetched: true,
      title: "Grote pagina",
      cancelled: true,
    });
    expectStoppedNear(page.stats.pulled, PAGE_MAX_BYTES);
  });

  it("guarded: reads at most 512 KB of an endless robots.txt", async () => {
    const robots = streamedBody("User-agent: *\nDisallow: /intern\n");
    stubRoutes({
      [PAGE]: () => new Response(`${HEAD}tekst</p></body></html>`, { status: 200 }),
      "https://voorbeeld.example/robots.txt": () => new Response(robots.stream, { status: 200 }),
    });

    const result = await fetchPage(PAGE, { guard: () => true });

    expect({ known: result.robots.known, cancelled: robots.stats.cancelled }).toEqual({ known: true, cancelled: true });
    expectStoppedNear(robots.stats.pulled, SIGNAL_MAX_BYTES);
  });

  it("unguarded: the scan path still reads the whole body, past the cap", async () => {
    const total = PAGE_MAX_BYTES + 2 * CHUNK;
    const page = streamedBody(HEAD, total);
    stubRoutes({ [PAGE]: () => new Response(page.stream, { status: 200 }) });

    const result = await fetchPage(PAGE);

    expect({ fetched: result.metadata.fetched, cancelled: page.stats.cancelled, pulled: page.stats.pulled }).toEqual({
      fetched: true,
      cancelled: false,
      pulled: total,
    });
  });
});
