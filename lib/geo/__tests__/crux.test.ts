import { afterEach, describe, it, expect, vi } from "vitest";
import { CRUX_ENDPOINT, CRUX_TIMEOUT_MS, queryCruxLcp } from "../crux";
import { measurePageSpeed, PSI_ENDPOINT, SPEED_TIMEOUT_MS, type SpeedMeasurement } from "../speed";
import { speedCheck } from "../checks/speed";
import { pageCheckDepsFromEnv } from "../page-check-deps";

const PAGE = "https://voorbeeld.example/diensten?ref=a&b=c";
const API_KEY = "test-crux-key-not-real";

/** A trimmed records:queryRecord body: only the LCP percentile is read. */
function record(p75: number | string) {
  return {
    record: {
      key: { formFactor: "PHONE", url: PAGE },
      metrics: {
        largest_contentful_paint: {
          histogram: [{ start: 0, end: 2500, density: 0.8 }],
          percentiles: { p75 },
        },
      },
    },
    collectionPeriod: {},
  };
}

const NOT_FOUND = { error: { code: 404, message: "chrome ux report data not found", status: "NOT_FOUND" } };
const NOT_ENABLED = {
  error: {
    code: 403,
    message: "Chrome UX Report API has not been used in project 123 before or it is disabled.",
    status: "PERMISSION_DENIED",
  },
};
const PSI_LAB = {
  lighthouseResult: {
    audits: {
      "largest-contentful-paint": { numericValue: 1_834.6 },
      "first-contentful-paint": { numericValue: 1_102.2 },
    },
    categories: { performance: { score: 0.9 } },
  },
};

const json = (body: unknown, status = 200) => () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function answering(...responses: (() => Response)[]) {
  let call = 0;
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const next = responses[Math.min(call, responses.length - 1)]!;
    call += 1;
    return next();
  });
}

type FetchMock = ReturnType<typeof answering>;

function crux(fetchMock: FetchMock, apiKey: string | null = API_KEY) {
  return queryCruxLcp(PAGE, {
    fetch: fetchMock as unknown as typeof fetch,
    timeoutMs: CRUX_TIMEOUT_MS,
    ...(apiKey ? { apiKey } : {}),
  });
}

function measure(fetchMock: FetchMock, apiKey: string | null = API_KEY): Promise<SpeedMeasurement> {
  return measurePageSpeed(PAGE, {
    fetch: fetchMock as unknown as typeof fetch,
    timeoutMs: SPEED_TIMEOUT_MS,
    ...(apiKey ? { apiKey } : {}),
  });
}

function requestBody(fetchMock: FetchMock, call: number): unknown {
  return JSON.parse(String(fetchMock.mock.calls[call]?.[1]?.body));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("queryCruxLcp: the request", () => {
  it("posts to records:queryRecord with the key, the page URL, the phone form factor and LCP only", async () => {
    const fetchMock = answering(json(record(1_650)));
    await crux(fetchMock);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(`${url.origin}${url.pathname}`).toBe(CRUX_ENDPOINT);
    expect(url.searchParams.get("key")).toBe(API_KEY);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(requestBody(fetchMock, 0)).toEqual({ url: PAGE, formFactor: "PHONE", metrics: ["largest_contentful_paint"] });
  });

  it("asks the origin after the page has no record", async () => {
    const fetchMock = answering(json(NOT_FOUND, 404), json(record(2_100)));
    await crux(fetchMock);

    expect(requestBody(fetchMock, 1)).toEqual({
      origin: "https://voorbeeld.example",
      formFactor: "PHONE",
      metrics: ["largest_contentful_paint"],
    });
  });

  it("makes no request without an API key", async () => {
    const fetchMock = answering(json(record(1_650)));

    expect(await crux(fetchMock, null)).toEqual({ status: "no_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("queryCruxLcp: answers", () => {
  it("reads the page's p75 LCP", async () => {
    expect(await crux(answering(json(record(1_650))))).toEqual({
      status: "found",
      field: { p75_ms: 1_650, category: "FAST", scope: "page" },
    });
  });

  it("falls back to the origin's p75 LCP", async () => {
    expect(await crux(answering(json(NOT_FOUND, 404), json(record(3_100))))).toEqual({
      status: "found",
      field: { p75_ms: 3_100, category: "AVERAGE", scope: "origin" },
    });
  });

  it("reads a p75 sent as a string", async () => {
    const result = await crux(answering(json(record("4500"))));

    expect(result).toEqual({ status: "found", field: { p75_ms: 4_500, category: "SLOW", scope: "page" } });
  });

  it("is no_data when neither the page nor the origin has a record", async () => {
    expect(await crux(answering(json(NOT_FOUND, 404)))).toEqual({ status: "no_data" });
  });

  it("treats a record without an LCP percentile as no record", async () => {
    expect(await crux(answering(json({ record: { metrics: {} } })))).toEqual({ status: "no_data" });
  });

  it("is not_enabled on 403 PERMISSION_DENIED, without asking the origin", async () => {
    const fetchMock = answering(json(NOT_ENABLED, 403));

    expect(await crux(fetchMock)).toEqual({ status: "not_enabled" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is unavailable on another 403", async () => {
    expect(await crux(answering(json({ error: { code: 403, status: "OTHER" } }, 403)))).toEqual({ status: "unavailable" });
  });

  it("is unavailable on a 429", async () => {
    expect(await crux(answering(json({ error: { code: 429 } }, 429)))).toEqual({ status: "unavailable" });
  });

  it("is unavailable when fetch rejects", async () => {
    const rejecting = vi.fn(async (): Promise<Response> => {
      throw new TypeError("fetch failed");
    });

    expect(await crux(rejecting as unknown as FetchMock)).toEqual({ status: "unavailable" });
  });

  it("is unavailable when the request outlives its timeout", async () => {
    const hanging = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const result = await queryCruxLcp(PAGE, { fetch: hanging as unknown as typeof fetch, apiKey: API_KEY, timeoutMs: 20 });

    expect(result).toEqual({ status: "unavailable" });
  });
});

describe("measurePageSpeed", () => {
  it("grades CrUX field data without calling PageSpeed Insights", async () => {
    const fetchMock = answering(json(record(1_650)));
    const result = await measure(fetchMock);

    expect(result).toEqual({
      ok: true,
      source: "field",
      lcp_ms: 1_650,
      fcp_ms: null,
      performance_score: null,
      field: { p75_ms: 1_650, category: "FAST", scope: "page" },
      lab: null,
      runs: 0,
      lab_error: null,
      crux: "found",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("runs PageSpeed Insights when CrUX has no data, and says so in crux", async () => {
    const fetchMock = answering(json(NOT_FOUND, 404), json(NOT_FOUND, 404), json(PSI_LAB));
    const result = await measure(fetchMock);

    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(PSI_ENDPOINT);
    expect(result).toMatchObject({ ok: true, source: "lab", lcp_ms: 1_835, runs: 1, crux: "no_data" });
  });

  it("runs PageSpeed Insights keyless, without CrUX, when there is no key", async () => {
    const fetchMock = answering(json(PSI_LAB));
    const result = await measure(fetchMock, null);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, source: "lab", crux: "no_key" });
  });

  it("keeps CrUX's answer on a failed PageSpeed Insights call", async () => {
    const fetchMock = answering(json(NOT_ENABLED, 403), json({ error: { code: 500, message: "x" } }, 500));

    expect(await measure(fetchMock)).toEqual({ ok: false, reason: "http_error", crux: "not_enabled" });
  });

  it("never puts the key in a result", async () => {
    for (const fetchMock of [answering(json(record(1_650))), answering(json(NOT_ENABLED, 403), json(PSI_LAB))]) {
      expect(JSON.stringify(await measure(fetchMock))).not.toContain(API_KEY);
    }
  });
});

describe("the CrUX key from the environment", () => {
  const PSI_KEY = "test-psi-key-not-real";
  const CRUX_KEY = "test-crux-only-key-not-real";

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function measureFromEnv(env: Record<string, string | undefined>, ...responses: (() => Response)[]) {
    const fetchMock = answering(...responses);
    vi.stubGlobal("fetch", fetchMock);
    const { measureSpeed } = pageCheckDepsFromEnv(env);
    return { fetchMock, result: measureSpeed!(PAGE) };
  }

  const calledUrl = (fetchMock: FetchMock, call: number) => String(fetchMock.mock.calls[call]?.[0]);

  it("asks CrUX with CHROMEUXREPORTS_API_KEY and PSI with PAGESPEED_API_KEY", async () => {
    const { fetchMock, result } = measureFromEnv(
      { CHROMEUXREPORTS_API_KEY: CRUX_KEY, PAGESPEED_API_KEY: PSI_KEY },
      json(NOT_FOUND, 404),
      json(NOT_FOUND, 404),
      json(PSI_LAB),
    );
    await result;

    expect(calledUrl(fetchMock, 0)).toBe(`${CRUX_ENDPOINT}?key=${CRUX_KEY}`);
    expect(calledUrl(fetchMock, 2)).toContain(PSI_ENDPOINT);
    expect(calledUrl(fetchMock, 2)).toContain(`key=${PSI_KEY}`);
    expect(calledUrl(fetchMock, 2)).not.toContain(CRUX_KEY);
  });

  it("falls back to PAGESPEED_API_KEY for CrUX when CHROMEUXREPORTS_API_KEY is unset", async () => {
    const { fetchMock, result } = measureFromEnv({ PAGESPEED_API_KEY: PSI_KEY }, json(record(1_650)));

    expect(await result).toMatchObject({ ok: true, source: "field", crux: "found" });
    expect(calledUrl(fetchMock, 0)).toBe(`${CRUX_ENDPOINT}?key=${PSI_KEY}`);
  });

  it("falls back to PAGESPEED_API_KEY when CHROMEUXREPORTS_API_KEY is empty", async () => {
    const { fetchMock, result } = measureFromEnv(
      { CHROMEUXREPORTS_API_KEY: "", PAGESPEED_API_KEY: PSI_KEY },
      json(record(1_650)),
    );
    await result;

    expect(calledUrl(fetchMock, 0)).toBe(`${CRUX_ENDPOINT}?key=${PSI_KEY}`);
  });

  it("uses CHROMEUXREPORTS_API_KEY for CrUX and a keyless PSI call when only it is set", async () => {
    const { fetchMock, result } = measureFromEnv(
      { CHROMEUXREPORTS_API_KEY: CRUX_KEY },
      json(NOT_FOUND, 404),
      json(NOT_FOUND, 404),
      json(PSI_LAB),
    );
    await result;

    expect(calledUrl(fetchMock, 0)).toBe(`${CRUX_ENDPOINT}?key=${CRUX_KEY}`);
    expect(calledUrl(fetchMock, 2)).not.toContain("key=");
  });

  it("skips CrUX (no_key) and has no field data when neither key is set", async () => {
    const { fetchMock, result } = measureFromEnv({}, json(PSI_LAB));
    const speed = await result;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calledUrl(fetchMock, 0)).toContain(PSI_ENDPOINT);
    expect(speed).toMatchObject({ ok: true, source: "lab", crux: "no_key" });
    expect(speedCheck.run({ speed } as never).facts).toMatchObject({ crux: "no_key" });
  });
});

describe("the speed check on a CrUX measurement", () => {
  it("summarises CrUX field data without a lab sentence", async () => {
    const result = speedCheck.run({ speed: await measure(answering(json(record(1_650)))) } as never);

    expect(result.status).toBe("pass");
    expect(result.summary).toBe("Real-user LCP (75th percentile, last 28 days, mobile, this page): 1650 ms, rated FAST.");
    expect(result.facts).toMatchObject({ source: "field", runs: 0, crux: "found" });
  });

  it("says field data is not available when the CrUX API is not enabled", async () => {
    const result = speedCheck.run({ speed: await measure(answering(json(NOT_ENABLED, 403), json(PSI_LAB))) } as never);

    expect(result.summary).toContain("Field data not available (CrUX API not enabled).");
    expect(result.facts).toMatchObject({ source: "lab", crux: "not_enabled" });
  });

  it("names the disabled CrUX API on a measurement that took too long", () => {
    const result = speedCheck.run({ speed: { ok: false, reason: "timeout", crux: "not_enabled" } } as never);

    expect(result.status).toBe("n/a");
    expect(result.summary).toBe(
      "Page speed was not measured: the measurement took too long. Field data not available (CrUX API not enabled).",
    );
  });
});
