import { describe, expect, it } from "vitest";
import { cleanForReader, stripCriterionCodes } from "../report/reader-text";
import { PROBE_MODELS, candidates } from "../models";
import { responsesOutputText } from "../analysis/llm-visibility";
import type { GeoAnalysisResult } from "../types";

describe("stripCriterionCodes", () => {
  it("haalt codes tussen haakjes weg", () => {
    expect(stripCriterionCodes("Wat concreet en citeerbaar is (B2).")).toBe("Wat concreet en citeerbaar is.");
    expect(stripCriterionCodes("Niet-citeerbaar voor een AI-tool (D1, C2).")).toBe("Niet-citeerbaar voor een AI-tool.");
    expect(stripCriterionCodes("Zonder bewijs (U1 en U2) blijft het generiek.")).toBe("Zonder bewijs blijft het generiek.");
    expect(stripCriterionCodes("Dit scoort laag bij criterium A4.")).toBe("Dit scoort laag.");
  });
  it("laat gewone tekst en koppen met rust", () => {
    expect(stripCriterionCodes("Zet de prijs onder de h1 (vanaf € 49).")).toBe("Zet de prijs onder de h1 (vanaf € 49).");
    expect(stripCriterionCodes("Plan B2B-campagnes in Q4.")).toBe("Plan B2B-campagnes in Q4.");
  });
  it("bewaart het veld criterion", () => {
    const a = { strengths: ["Sterk (F2)."], actions: [{ criterion: "B1", title: "Zet de prijs erbij (B1)" }] } as unknown as GeoAnalysisResult;
    const c = cleanForReader(a);
    expect(c.strengths[0]).toBe("Sterk.");
    expect(c.actions[0].criterion).toBe("B1");
    expect(c.actions[0].title).toBe("Zet de prijs erbij");
  });
});

describe("modellen", () => {
  it("zet een eigen model voorop en houdt de terugval", () => {
    const env = { GEO_GROK_MODEL: "grok-4.3" } as unknown as NodeJS.ProcessEnv;
    expect(candidates("GEO_GROK_MODEL", PROBE_MODELS.grok, env)).toEqual(["grok-4.3", "grok-4.7"]);
    expect(candidates("GEO_GROK_MODEL", PROBE_MODELS.grok, {} as NodeJS.ProcessEnv)[0]).toBe("grok-4.7");
  });
  it("leest de tekst uit een antwoord van de Perplexity Agent API", () => {
    const json = { output: [{ type: "search_results", results: [] }, { type: "message", content: [{ type: "output_text", text: "NXTLI is een bureau." }] }] };
    expect(responsesOutputText(json)).toBe("NXTLI is een bureau.");
  });
});
