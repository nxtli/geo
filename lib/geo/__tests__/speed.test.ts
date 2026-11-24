import { describe, it, expect, vi } from "vitest";
import { measureSpeed, parsePsiResponse, PSI_ENDPOINT, SPEED_TIMEOUT_MS, type SpeedMeasurement } from "../speed";

const PAGE = "https://voorbeeld.example/diensten?ref=a&b=c";
const API_KEY = "test-psi-key-not-real";

/** A trimmed PageSpeed Insights v5 body: only the fields measureSpeed reads, plus a little noise. */
function psiFixture(overrides: Partial<{ lcp: number; fcp: number; score: number }> = {}) {
  const { lcp = 1_834.6, fcp = 1_102.2, score = 0.917 } = overrides;
  return {
    id: PAGE,
    lighthouseResult: {
      requestedUrl: PAGE,
      audits: {
        "largest-contentful-paint": { id: "largest-contentful-paint", numericValue: lcp, displayValue: "1.8 s" },
        "first-contentful-paint": { id: "first-contentful-paint", numericValue: fcp, displayValue: "1.1 s" },
        "speed-index": { id: "speed-index", numericValue: 2_400 },
      },
      categories: { performance: { id: "performance", score } },
    },
  };
}

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function answering(response: () => Response) {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
}

const json = (body: unknown, status = 200) => () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function measure(fetchMock: FetchFn, apiKey?: string, timeoutMs = SPEED_TIMEOUT_MS): Promise<SpeedMeasurement> {
  return measureSpeed(PAGE, { fetch: fetchMock as unknown as typeof fetch, timeoutMs, ...(apiKey ? { apiKey } : {}) });
}

function requestedUrl(fetchMock: ReturnType<typeof answering>): URL {
  return new URL(String(fetchMock.mock.calls[0]?.[0]));
}

describe("measureSpeed", () => {
  it("uses a 40 s per-page timeout", () => {
    expect(SPEED_TIMEOUT_MS).toBe(40_000);
  });

  it("reads LCP and FCP in rounded ms and the score as a 0..100 integer", async () => {
    expect(await measure(answering(json(psiFixture())))).toEqual({
      ok: true,
      lcp_ms: 1_835,
      fcp_ms: 1_102,
      performance_score: 92,
      source: "lab",
    });
  });

  it("calls the v5 endpoint for the mobile performance category without a key when none is set", async () => {
    const fetchMock = answering(json(psiFixture()));
    await measure(fetchMock);

    const url = requestedUrl(fetchMock);
    expect({
      endpoint: `${url.origin}${url.pathname}`,
      page: url.searchParams.get("url"),
      strategy: url.searchParams.get("strategy"),
      category: url.searchParams.get("category"),
      hasKey: url.searchParams.has("key"),
    }).toEqual({ endpoint: PSI_ENDPOINT, page: PAGE, strategy: "mobile", category: "performance", hasKey: false });
  });

  it("adds the key to the query string when one is set", async () => {
    const fetchMock = answering(json(psiFixture()));
    await measure(fetchMock, API_KEY);

    expect(requestedUrl(fetchMock).searchParams.get("key")).toBe(API_KEY);
  });

  it("passes an abort signal to fetch", async () => {
    const fetchMock = answering(json(psiFixture()));
    await measure(fetchMock);

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["quota", 429],
    ["http_error", 500],
    ["http_error", 400],
    ["http_error", 403],
  ] as const)("is %s on HTTP %i", async (reason, status) => {
    expect(await measure(answering(json({ error: { code: status } }, status)), API_KEY)).toEqual({ ok: false, reason });
  });

  it("is invalid_response when the body is not JSON", async () => {
    const result = await measure(answering(() => new Response("<html>oops</html>", { status: 200 })), API_KEY);
    expect(result).toEqual({ ok: false, reason: "invalid_response" });
  });

  it("is network when fetch rejects", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      throw new TypeError("fetch failed");
    });
    expect(await measure(fetchMock, API_KEY)).toEqual({ ok: false, reason: "network" });
  });

  it("is timeout when the call outlives timeoutMs", async () => {
    const hanging = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    expect(await measure(hanging, API_KEY, 20)).toEqual({ ok: false, reason: "timeout" });
  });

  it("never puts the key in a result, successful or failed", async () => {
    const responses = [json(psiFixture()), json({}, 429), json({}, 500), json({ lighthouseResult: {} })];
    for (const response of responses) {
      expect(JSON.stringify(await measure(answering(response), API_KEY))).not.toContain(API_KEY);
    }
    const rejecting = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      throw new TypeError(`fetch failed for ${String(input)}`);
    });
    expect(JSON.stringify(await measure(rejecting, API_KEY))).not.toContain(API_KEY);
  });
});

describe("parsePsiResponse", () => {
  it.each([
    ["no lighthouseResult", {}],
    ["no LCP audit", { lighthouseResult: { audits: { "first-contentful-paint": { numericValue: 1 } }, categories: { performance: { score: 0.5 } } } }],
    ["a null score", psiFixture({ score: null as unknown as number })],
    ["a score above 1", psiFixture({ score: 1.5 })],
    ["a negative LCP", psiFixture({ lcp: -1 })],
    ["a string body", "not json"],
  ])("is invalid_response for %s", (_label, body) => {
    expect(parsePsiResponse(body)).toEqual({ ok: false, reason: "invalid_response" });
  });

  it("maps a perfect and a zero score", () => {
    expect([psiFixture({ score: 1 }), psiFixture({ score: 0 })].map((body) => parsePsiResponse(body))).toMatchObject([
      { ok: true, performance_score: 100 },
      { ok: true, performance_score: 0 },
    ]);
  });
});
