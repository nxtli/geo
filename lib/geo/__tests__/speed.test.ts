import { afterEach, describe, it, expect, vi } from "vitest";
import {
  LAB_RETRY_ABOVE_MS,
  LAB_RETRY_MIN_LEFT_MS,
  measureSpeed,
  PSI_ENDPOINT,
  readPsiBody,
  SPEED_TIMEOUT_MS,
  toMeasurement,
  type SpeedMeasurement,
} from "../speed";

const PAGE = "https://voorbeeld.example/diensten?ref=a&b=c";
const API_KEY = "test-psi-key-not-real";

/** Trimmed PageSpeed Insights v5 bodies: only the parts measureSpeed reads, plus a little noise. */
function labPart(overrides: Partial<{ lcp: number; fcp: number; score: number | null }> = {}) {
  const { lcp = 1_834.6, fcp = 1_102.2, score = 0.917 } = overrides;
  return {
    requestedUrl: PAGE,
    audits: {
      "largest-contentful-paint": { id: "largest-contentful-paint", numericValue: lcp, displayValue: "1.8 s" },
      "first-contentful-paint": { id: "first-contentful-paint", numericValue: fcp, displayValue: "1.1 s" },
      "speed-index": { id: "speed-index", numericValue: 2_400 },
    },
    categories: { performance: { id: "performance", score } },
  };
}

function experience(p75: number, category = "FAST", extra: Record<string, unknown> = {}) {
  return {
    id: PAGE,
    metrics: {
      LARGEST_CONTENTFUL_PAINT_MS: { percentile: p75, category, distributions: [] },
      FIRST_CONTENTFUL_PAINT_MS: { percentile: 900, category: "FAST" },
    },
    overall_category: category,
    ...extra,
  };
}

/** Lighthouse could not run the page: PSI answers 200 with runtimeError and audits without numericValue. */
function runtimeErrorPart(code = "FAILED_DOCUMENT_REQUEST") {
  return {
    requestedUrl: PAGE,
    runtimeError: {
      code,
      message: "Lighthouse was unable to reliably load the page you requested.\n  Make sure you are testing the correct URL.",
    },
    audits: {
      "largest-contentful-paint": { id: "largest-contentful-paint", score: null, scoreDisplayMode: "error" },
      "first-contentful-paint": { id: "first-contentful-paint", score: null, scoreDisplayMode: "error" },
    },
    categories: { performance: { id: "performance", score: null } },
  };
}

const LAB_ONLY = { id: PAGE, lighthouseResult: labPart() };
const FIELD_ONLY = { id: PAGE, loadingExperience: experience(1_650) };
const FIELD_AND_LAB = { id: PAGE, loadingExperience: experience(1_650), lighthouseResult: labPart({ lcp: 9_816 }) };
const RUNTIME_ERROR = { id: PAGE, lighthouseResult: runtimeErrorPart() };
const FIELD_AND_RUNTIME_ERROR = { id: PAGE, loadingExperience: experience(2_900, "AVERAGE"), lighthouseResult: runtimeErrorPart() };

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function answering(...responses: (() => Response)[]) {
  let call = 0;
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const next = responses[Math.min(call, responses.length - 1)]!;
    call += 1;
    return next();
  });
}

const json = (body: unknown, status = 200) => () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function measure(
  fetchMock: FetchFn,
  options: { apiKey?: string; timeoutMs?: number; now?: () => number } = {},
): Promise<SpeedMeasurement> {
  const { apiKey, timeoutMs = SPEED_TIMEOUT_MS, now } = options;
  return measureSpeed(PAGE, {
    fetch: fetchMock as unknown as typeof fetch,
    timeoutMs,
    ...(apiKey ? { apiKey } : {}),
    ...(now ? { now } : {}),
  });
}

function requestedUrl(fetchMock: ReturnType<typeof answering>): URL {
  return new URL(String(fetchMock.mock.calls[0]?.[0]));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("measureSpeed: the request", () => {
  it("uses a 40 s per-page timeout", () => {
    expect(SPEED_TIMEOUT_MS).toBe(40_000);
  });

  it("calls the v5 endpoint for the mobile performance category only, without a key when none is set", async () => {
    const fetchMock = answering(json(LAB_ONLY));
    await measure(fetchMock);

    const url = requestedUrl(fetchMock);
    expect({
      endpoint: `${url.origin}${url.pathname}`,
      page: url.searchParams.get("url"),
      strategy: url.searchParams.get("strategy"),
      categories: url.searchParams.getAll("category"),
      hasKey: url.searchParams.has("key"),
    }).toEqual({ endpoint: PSI_ENDPOINT, page: PAGE, strategy: "mobile", categories: ["performance"], hasKey: false });
  });

  it("adds the key to the query string when one is set", async () => {
    const fetchMock = answering(json(LAB_ONLY));
    await measure(fetchMock, { apiKey: API_KEY });

    expect(requestedUrl(fetchMock).searchParams.get("key")).toBe(API_KEY);
  });

  it("passes an abort signal to fetch", async () => {
    const fetchMock = answering(json(LAB_ONLY));
    await measure(fetchMock);

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("measureSpeed: field and lab data", () => {
  it("grades the real-user LCP when there is only field data", async () => {
    expect(await measure(answering(json(FIELD_ONLY)))).toEqual({
      ok: true,
      source: "field",
      lcp_ms: 1_650,
      fcp_ms: null,
      performance_score: null,
      field: { p75_ms: 1_650, category: "FAST", scope: "page" },
      lab: null,
      runs: 1,
      lab_error: null,
    });
  });

  it("grades the real-user LCP over a slow lab run, and keeps the lab run as evidence", async () => {
    expect(await measure(answering(json(FIELD_AND_LAB)))).toEqual({
      ok: true,
      source: "field",
      lcp_ms: 1_650,
      fcp_ms: 1_102,
      performance_score: 92,
      field: { p75_ms: 1_650, category: "FAST", scope: "page" },
      lab: { lcp_ms: 9_816, fcp_ms: 1_102, performance_score: 92 },
      runs: 1,
      lab_error: null,
    });
  });

  it("does not retry when field data decides, however slow the lab run", async () => {
    const fetchMock = answering(json(FIELD_AND_LAB));
    await measure(fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads LCP and FCP in rounded ms and the score as a 0..100 integer when there is only lab data", async () => {
    expect(await measure(answering(json(LAB_ONLY)))).toEqual({
      ok: true,
      source: "lab",
      lcp_ms: 1_835,
      fcp_ms: 1_102,
      performance_score: 92,
      field: null,
      lab: { lcp_ms: 1_835, fcp_ms: 1_102, performance_score: 92 },
      runs: 1,
      lab_error: null,
    });
  });

  it("uses the field data and names the lab failure when Lighthouse could not load the page", async () => {
    expect(await measure(answering(json(FIELD_AND_RUNTIME_ERROR)))).toMatchObject({
      ok: true,
      source: "field",
      lcp_ms: 2_900,
      lab: null,
      lab_error: { code: "FAILED_DOCUMENT_REQUEST" },
    });
  });
});

describe("measureSpeed: a page Lighthouse could not load", () => {
  it.each(["FAILED_DOCUMENT_REQUEST", "ERRORED_DOCUMENT_REQUEST", "NO_FCP", "PAGE_HUNG", "DNS_FAILURE"])(
    "is page_not_measurable with the %s code and its message when there is no field data",
    async (code) => {
      const body = { id: PAGE, lighthouseResult: runtimeErrorPart(code) };
      expect(await measure(answering(json(body)))).toEqual({
        ok: false,
        reason: "page_not_measurable",
        lighthouse_error: {
          code,
          message: "Lighthouse was unable to reliably load the page you requested. Make sure you are testing the correct URL.",
        },
      });
    },
  );

  it("reads the Lighthouse error from a non-2xx error body as well", async () => {
    const body = {
      error: {
        code: 500,
        message: "Lighthouse returned error: ERRORED_DOCUMENT_REQUEST. Lighthouse was unable to reliably load the page you requested. (Status code: 403)",
      },
    };
    expect(await measure(answering(json(body, 500)))).toEqual({
      ok: false,
      reason: "page_not_measurable",
      lighthouse_error: {
        code: "ERRORED_DOCUMENT_REQUEST",
        message: "Lighthouse was unable to reliably load the page you requested. (Status code: 403)",
      },
    });
  });

  it("cuts a long Lighthouse message to 300 characters", async () => {
    const body = { id: PAGE, lighthouseResult: { runtimeError: { code: "PAGE_HUNG", message: "x".repeat(1_000) } } };
    const result = await measure(answering(json(body)));
    expect(result.ok === false && result.lighthouse_error?.message.length).toBe(300);
  });

  it("never retries a page Lighthouse could not load", async () => {
    const fetchMock = answering(json(RUNTIME_ERROR));
    await measure(fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("measureSpeed: one more lab run when the first is slow", () => {
  const slow = { id: PAGE, lighthouseResult: labPart({ lcp: 9_816 }) };
  const fast = { id: PAGE, lighthouseResult: labPart({ lcp: 1_002 }) };

  it("retries above 4000 ms and keeps the lower run", async () => {
    const fetchMock = answering(json(slow), json(fast));
    const result = await measure(fetchMock);
    expect({ calls: fetchMock.mock.calls.length, result }).toMatchObject({
      calls: 2,
      result: { ok: true, source: "lab", lcp_ms: 1_002, runs: 2 },
    });
  });

  it("keeps the first run when the second is slower", async () => {
    const slower = { id: PAGE, lighthouseResult: labPart({ lcp: 12_000 }) };
    expect(await measure(answering(json(slow), json(slower)))).toMatchObject({ ok: true, lcp_ms: 9_816, runs: 2 });
  });

  it("keeps the first run as a single run when the second fails", async () => {
    expect(await measure(answering(json(slow), json({}, 429)))).toMatchObject({ ok: true, lcp_ms: 9_816, runs: 1 });
  });

  it("retries at the check's fail threshold", () => {
    expect(LAB_RETRY_ABOVE_MS).toBe(4_000);
  });

  it(`does not retry at ${LAB_RETRY_ABOVE_MS} ms`, async () => {
    const fetchMock = answering(json({ id: PAGE, lighthouseResult: labPart({ lcp: LAB_RETRY_ABOVE_MS }) }));
    expect(await measure(fetchMock)).toMatchObject({ ok: true, runs: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it(`does not retry when less than ${LAB_RETRY_MIN_LEFT_MS} ms of the page's time is left`, async () => {
    const clock = [0, SPEED_TIMEOUT_MS - LAB_RETRY_MIN_LEFT_MS + 1];
    const now = () => clock.shift() ?? SPEED_TIMEOUT_MS;
    const fetchMock = answering(json(slow), json(fast));
    expect(await measure(fetchMock, { now })).toMatchObject({ ok: true, lcp_ms: 9_816, runs: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives the retry only the time that is left", async () => {
    const clock = [0, 25_000];
    const now = () => clock.shift() ?? 25_000;
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await measure(answering(json(slow), json(fast)), { now });
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([SPEED_TIMEOUT_MS, SPEED_TIMEOUT_MS - 25_000]);
  });
});

describe("measureSpeed: failures", () => {
  it.each([
    ["quota", 429],
    ["http_error", 500],
    ["http_error", 400],
    ["http_error", 403],
  ] as const)("is %s on HTTP %i without a Lighthouse error", async (reason, status) => {
    expect(await measure(answering(json({ error: { code: status, message: "Something else" } }, status)), { apiKey: API_KEY })).toEqual({
      ok: false,
      reason,
    });
  });

  it("is quota on the daily-limit 429 PSI sends to keyless calls", async () => {
    const body = { error: { code: 429, message: "Quota exceeded for quota metric 'Queries' and limit 'Queries per day'", status: "RESOURCE_EXHAUSTED" } };
    expect(await measure(answering(json(body, 429)))).toEqual({ ok: false, reason: "quota" });
  });

  it("is invalid_response when the body is not JSON", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await measure(answering(() => new Response("<html>oops</html>", { status: 200 })), { apiKey: API_KEY });
    expect(result).toEqual({ ok: false, reason: "invalid_response" });
  });

  it("is invalid_response with neither field nor lab data, and logs the key names but no values", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const body = { kind: "pagespeedonline#result", captchaResult: "CAPTCHA_NOT_NEEDED", lighthouseResult: { audits: {}, secretish: "value-xyz" } };

    expect(await measure(answering(json(body)))).toEqual({ ok: false, reason: "invalid_response" });
    const logged = info.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(logged).toContain("top-level keys [captchaResult, kind, lighthouseResult]");
    expect(logged).toContain("lighthouseResult keys [audits, secretish]");
    expect(logged).not.toContain("value-xyz");
  });

  it("is timeout, not http_error, when reading a non-2xx body times out", async () => {
    const stalled = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      const res = new Response("", { status: 500 });
      vi.spyOn(res, "text").mockRejectedValue(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
      return res;
    });
    expect(await measure(stalled)).toEqual({ ok: false, reason: "timeout" });
  });

  it("never treats a field percentile of 0 as real-user data", () => {
    expect(readPsiBody({ loadingExperience: experience(0) })?.field).toBeNull();
  });

  it("hides the key in its URL-encoded form too", async () => {
    const key = "key/with+chars";
    const body = { id: PAGE, lighthouseResult: { runtimeError: { code: "PAGE_HUNG", message: `at ${encodeURIComponent(key)}` } } };
    const result = await measure(answering(json(body)), { apiKey: key });
    expect(result.ok === false && result.lighthouse_error?.message).toBe("at [key]");
  });

  it("is network when fetch rejects", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      throw new TypeError("fetch failed");
    });
    expect(await measure(fetchMock, { apiKey: API_KEY })).toEqual({ ok: false, reason: "network" });
  });

  it("is timeout when the call outlives timeoutMs", async () => {
    const hanging = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    expect(await measure(hanging, { apiKey: API_KEY, timeoutMs: 20 })).toEqual({ ok: false, reason: "timeout" });
  });

  it("never puts the key in a result, successful or failed", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const keyInMessage = { id: PAGE, lighthouseResult: { runtimeError: { code: "PAGE_HUNG", message: `hung at key=${API_KEY}` } } };
    const responses = [
      json(LAB_ONLY),
      json(FIELD_AND_LAB),
      json(keyInMessage),
      json({ error: { message: `Lighthouse returned error: NO_FCP. key=${API_KEY}` } }, 500),
      json({}, 429),
      json({}, 500),
      json({ lighthouseResult: {} }),
    ];
    for (const response of responses) {
      expect(JSON.stringify(await measure(answering(response), { apiKey: API_KEY }))).not.toContain(API_KEY);
    }
    const rejecting = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      throw new TypeError(`fetch failed for ${String(input)}`);
    });
    expect(JSON.stringify(await measure(rejecting, { apiKey: API_KEY }))).not.toContain(API_KEY);
  });
});

describe("readPsiBody and toMeasurement", () => {
  it("falls back to the site's field data when the page has none", () => {
    const body = { id: PAGE, loadingExperience: { id: PAGE }, originLoadingExperience: experience(2_400, "AVERAGE") };
    expect(readPsiBody(body)?.field).toEqual({ p75_ms: 2_400, category: "AVERAGE", scope: "origin" });
  });

  it("marks page-level field data that PSI itself filled from the origin as the site's", () => {
    const body = { id: PAGE, loadingExperience: experience(1_200, "FAST", { origin_fallback: true }) };
    expect(readPsiBody(body)?.field?.scope).toBe("origin");
  });

  it("leaves an unknown field category out rather than guessing", () => {
    const body = { id: PAGE, loadingExperience: experience(1_200, "NONE") };
    expect(readPsiBody(body)?.field?.category).toBeNull();
  });

  it("keeps a lab run whose score or FCP is missing", () => {
    const lab = labPart({ score: null });
    delete (lab.audits as Record<string, unknown>)["first-contentful-paint"];
    expect(readPsiBody({ lighthouseResult: lab })?.lab).toEqual({ lcp_ms: 1_835, fcp_ms: null, performance_score: null });
  });

  it("keeps a lab run when categories and runtimeError are null", () => {
    const body = { lighthouseResult: { ...labPart(), categories: null, runtimeError: null } };
    expect(readPsiBody(body)?.lab).toEqual({ lcp_ms: 1_835, fcp_ms: 1_102, performance_score: null });
  });

  it.each([
    ["no data at all", {}],
    ["an empty lighthouseResult", { lighthouseResult: {} }],
    ["audits without numericValue and no runtimeError", { lighthouseResult: { audits: { "largest-contentful-paint": { score: null } } } }],
    ["a negative LCP", { lighthouseResult: labPart({ lcp: -1 }) }],
    ["a field metric without a percentile", { loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { category: "FAST" } } } }],
    ["a string body", "not json"],
    ["null", null],
  ])("is invalid_response for %s, without throwing", (_label, body) => {
    expect(toMeasurement(readPsiBody(body))).toEqual({ ok: false, reason: "invalid_response" });
  });
});
