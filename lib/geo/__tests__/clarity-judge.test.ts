import { describe, it, expect, vi } from "vitest";
import { extractPageFacts } from "../facts/page";
import { analyzeRobots } from "../facts/robots";
import type { ScrapeResult } from "../scrape";
import {
  CLARITY_REASON_MAX,
  FIRST_SCREEN_MAX_CHARS,
  buildClarityPrompt,
  claudeClarityJudge,
  clarityJudgeFromEnv,
  firstScreenOf,
  parseClarityAnswer,
  type ClarityMessagesClient,
  type FirstScreen,
} from "../clarity-judge";
import { CLARITY_MODELS } from "../models";

const URL_ = "https://example.com/";
const SCREEN: FirstScreen = { url: URL_, title: "Titel", description: "Omschrijving", h1: "Kop", text: "Wij doen X voor Y." };

function scrape(html: string, text: string | null): ScrapeResult {
  return {
    text,
    metadata: { fetched: true, status: 200 },
    robotsTxt: "",
    facts: extractPageFacts(html, URL_),
    robots: analyzeRobots("", URL_),
  };
}

function answer(json: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(json) }] };
}

function stubClient(create: (params: { model: string }) => Promise<unknown>) {
  const spy = vi.fn(create);
  return { client: { messages: { create: spy } } as unknown as ClarityMessagesClient, create: spy };
}

describe("firstScreenOf", () => {
  it("takes the title, description, first h1 and the start of the text", () => {
    const html = `<html><head><title>T</title><meta name="description" content="D"></head><body><h2>Sub</h2><h1>Main</h1></body></html>`;
    const screen = firstScreenOf(scrape(html, `  a\n\n b  ${"x".repeat(FIRST_SCREEN_MAX_CHARS * 2)}`), URL_);
    expect({ ...screen, text: screen?.text.slice(0, 5), length: screen?.text.length }).toEqual({
      url: URL_,
      title: "T",
      description: "D",
      h1: "Main",
      text: "a b x",
      length: FIRST_SCREEN_MAX_CHARS,
    });
  });

  it("gives null without page text", () => {
    expect(firstScreenOf(scrape("<html></html>", null), URL_)).toBeNull();
  });
});

describe("buildClarityPrompt", () => {
  it("fences the page text as data and marks missing fields", () => {
    const prompt = buildClarityPrompt({ ...SCREEN, title: null });
    expect(prompt).toContain("Title: (none)");
    expect(prompt).toContain("<page_text>\nWij doen X voor Y.\n</page_text>");
  });
});

describe("parseClarityAnswer", () => {
  it("reads a verdict and a reason, also inside a code fence", () => {
    expect(parseClarityAnswer('```json\n{"verdict":"attention","reason":"  Vague   offer. "}\n```')).toEqual({
      verdict: "attention",
      reason: "Vague offer.",
    });
  });

  it("cuts a long reason", () => {
    const { reason } = parseClarityAnswer(JSON.stringify({ verdict: "pass", reason: "a".repeat(500) }));
    expect(reason).toHaveLength(CLARITY_REASON_MAX);
  });

  it("throws on an unknown verdict or an empty reason", () => {
    expect(() => parseClarityAnswer('{"verdict":"maybe","reason":"x"}')).toThrow();
    expect(() => parseClarityAnswer('{"verdict":"pass","reason":" "}')).toThrow();
  });
});

describe("claudeClarityJudge", () => {
  it("asks the first clarity model for a structured verdict", async () => {
    const { client, create } = stubClient(async () => answer({ verdict: "pass", reason: "Clear offer." }));

    const judged = await claudeClarityJudge(client, {})(SCREEN);

    expect({ judged, model: create.mock.calls[0][0].model }).toEqual({
      judged: { verdict: "pass", reason: "Clear offer." },
      model: CLARITY_MODELS[0],
    });
  });

  it("falls back to the next model when the API refuses one", async () => {
    const { client, create } = stubClient(async ({ model }) => {
      if (model === CLARITY_MODELS[0]) throw Object.assign(new Error("not found"), { status: 404 });
      return answer({ verdict: "fail", reason: "No offer named." });
    });

    const judged = await claudeClarityJudge(client, {})(SCREEN);

    expect({ judged, models: create.mock.calls.map(([params]) => params.model) }).toEqual({
      judged: { verdict: "fail", reason: "No offer named." },
      models: CLARITY_MODELS,
    });
  });

  it("throws on any other error without trying another model", async () => {
    const { client, create } = stubClient(async () => {
      throw Object.assign(new Error("overloaded"), { status: 529 });
    });

    await expect(claudeClarityJudge(client, {})(SCREEN)).rejects.toThrow("overloaded");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("tries a GEO_CLARITY_MODEL override first", async () => {
    const { client, create } = stubClient(async () => answer({ verdict: "pass", reason: "Ok." }));

    await claudeClarityJudge(client, { GEO_CLARITY_MODEL: "custom-model" })(SCREEN);

    expect(create.mock.calls[0][0].model).toBe("custom-model");
  });
});

describe("clarityJudgeFromEnv", () => {
  it("is off without an Anthropic key or with GEO_CLARITY_LLM=off", () => {
    expect(clarityJudgeFromEnv({})).toBeUndefined();
    expect(clarityJudgeFromEnv({ ANTHROPIC_API_KEY: "test-placeholder", GEO_CLARITY_LLM: "off" })).toBeUndefined();
  });

  it("is on with a key", () => {
    expect(clarityJudgeFromEnv({ ANTHROPIC_API_KEY: "test-placeholder" })).toBeTypeOf("function");
  });
});
