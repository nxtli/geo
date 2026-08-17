import { describe, it, expect } from "vitest";
import {
  FIT_COMPONENTS,
  FIT_MAX_SCORE,
  TIERS,
  computeFitScore,
  computePriorityScore,
  computeResearchConfidence,
  computeTriggerScore,
  confidenceLabel,
  detectKnockouts,
  reconcileFitComponents,
  scoreProspect,
  snapToAnchor,
  tierFor,
} from "../scoring";
import { recencyFactor } from "../scoring/triggers";
import type { ClaimKind, FitComponentScore, ProspectTrigger } from "../types";

/** Vast referentiemoment zodat recency-tests deterministisch zijn. */
const NOW = Date.parse("2026-08-17T12:00:00Z");

const daysAgo = (n: number): string =>
  new Date(NOW - n * 86_400_000).toISOString().slice(0, 10);

/** Componentscores met alles op max, tenzij overschreven. */
function maxedComponents(
  overrides: Partial<Record<string, number>> = {},
  basis: ClaimKind = "fact",
): FitComponentScore[] {
  return FIT_COMPONENTS.map((c) => ({
    key: c.key,
    label: c.label,
    max: c.max,
    score: overrides[c.key] ?? c.max,
    rationale: "onderbouwd",
    basis,
  }));
}

function trigger(overrides: Partial<ProspectTrigger> = {}): ProspectTrigger {
  return {
    kind: "new_location",
    label: "Opent nieuwe vestiging",
    explanation: "Concrete campagne-aanleiding",
    source_url: "https://example.nl/nieuws",
    date: daysAgo(10),
    confidence: "high",
    ...overrides,
  };
}

describe("rubric", () => {
  it("telt op tot exact 100", () => {
    expect(FIT_MAX_SCORE).toBe(100);
  });

  it("heeft tien componenten met unieke keys", () => {
    expect(FIT_COMPONENTS).toHaveLength(10);
    expect(new Set(FIT_COMPONENTS.map((c) => c.key)).size).toBe(10);
  });

  it("snapt naar het dichtstbijzijnde toegestane anker", () => {
    const b2c = FIT_COMPONENTS[0]; // 0/5/10/15/20
    expect(snapToAnchor(b2c, 14)).toBe(15);
    expect(snapToAnchor(b2c, 11)).toBe(10);
    expect(snapToAnchor(b2c, 999)).toBe(20); // geklemd op max
    expect(snapToAnchor(b2c, -5)).toBe(0); // geklemd op 0
  });

  it("kiest bij gelijke afstand het lagere anker (conservatief)", () => {
    const b2c = FIT_COMPONENTS[0];
    expect(snapToAnchor(b2c, 12.5)).toBe(10); // precies tussen 10 en 15
  });

  it("snapt NaN naar 0", () => {
    expect(snapToAnchor(FIT_COMPONENTS[0], Number.NaN)).toBe(0);
  });
});

describe("reconcileFitComponents", () => {
  it("levert altijd alle tien componenten in rubric-volgorde", () => {
    const result = reconcileFitComponents([
      { key: "b2c", label: "x", score: 20, max: 20, rationale: "r", basis: "fact" },
    ]);
    expect(result).toHaveLength(10);
    expect(result.map((c) => c.key)).toEqual(FIT_COMPONENTS.map((c) => c.key));
  });

  it("markeert ontbrekende componenten als unknown met score 0", () => {
    const result = reconcileFitComponents([]);
    expect(result.every((c) => c.score === 0)).toBe(true);
    expect(result.every((c) => c.basis === "unknown")).toBe(true);
    // Cruciaal: de fit-score staat nog steeds op de /100-schaal, niet op /0.
    expect(computeFitScore(result)).toBe(0);
  });

  it("herschaalt een component die tegen een andere max is gescoord", () => {
    // Model gaf 50/100 voor b2c; rubric-max is 20 → 10.
    const result = reconcileFitComponents([
      { key: "b2c", label: "x", score: 50, max: 100, rationale: "r", basis: "fact" },
    ]);
    expect(result.find((c) => c.key === "b2c")!.score).toBe(10);
  });

  it("degradeert een score zonder onderbouwing naar unknown", () => {
    const result = reconcileFitComponents([
      { key: "b2c", label: "x", score: 20, max: 20, rationale: "   ", basis: "fact" },
    ]);
    const b2c = result.find((c) => c.key === "b2c")!;
    expect(b2c.basis).toBe("unknown");
  });

  it("dwingt de rubric-max af als het model te hoog scoort", () => {
    const result = reconcileFitComponents([
      { key: "recruitment", label: "x", score: 99, max: 5, rationale: "r", basis: "fact" },
    ]);
    expect(result.find((c) => c.key === "recruitment")!.score).toBe(5);
  });
});

describe("computeFitScore", () => {
  it("is 100 als alles op max staat", () => {
    expect(computeFitScore(reconcileFitComponents(maxedComponents()))).toBe(100);
  });

  it("telt de componenten op", () => {
    const components = reconcileFitComponents(
      maxedComponents({ b2c: 10, geographic: 8 }),
    );
    // 100 - (20-10) - (15-8) = 83
    expect(computeFitScore(components)).toBe(83);
  });
});

describe("computeTriggerScore", () => {
  it("is 0 zonder triggers", () => {
    const result = computeTriggerScore([], NOW);
    expect(result.score).toBe(0);
    expect(result.primary).toBeNull();
  });

  it("laat recente triggers zwaarder wegen dan oude", () => {
    const recent = computeTriggerScore([trigger({ date: daysAgo(5) })], NOW).score;
    const old = computeTriggerScore([trigger({ date: daysAgo(500) })], NOW).score;
    expect(recent).toBeGreaterThan(old);
  });

  it("laat een trigger zonder datum lichter wegen dan een recente", () => {
    const dated = computeTriggerScore([trigger({ date: daysAgo(5) })], NOW).score;
    const undated = computeTriggerScore([trigger({ date: null })], NOW).score;
    expect(undated).toBeLessThan(dated);
    expect(undated).toBeGreaterThan(0);
  });

  it("laat confidence meewegen", () => {
    const high = computeTriggerScore([trigger({ confidence: "high" })], NOW).score;
    const low = computeTriggerScore([trigger({ confidence: "low" })], NOW).score;
    expect(high).toBeGreaterThan(low);
  });

  it("laat zware soorten zwaarder wegen dan lichte", () => {
    const funding = computeTriggerScore([trigger({ kind: "funding" })], NOW).score;
    const season = computeTriggerScore([trigger({ kind: "new_season" })], NOW).score;
    expect(funding).toBeGreaterThan(season);
  });

  it("past afnemende opbrengst toe: veel zwakke triggers verslaan één sterke niet", () => {
    const oneStrong = computeTriggerScore(
      [trigger({ kind: "funding", date: daysAgo(5), confidence: "high" })],
      NOW,
    ).score;
    const manyWeak = computeTriggerScore(
      Array.from({ length: 6 }, () =>
        trigger({ kind: "other", date: null, confidence: "low" }),
      ),
      NOW,
    ).score;
    expect(oneStrong).toBeGreaterThan(manyWeak);
  });

  it("kapt op 100 bij heel veel sterke triggers", () => {
    const result = computeTriggerScore(
      Array.from({ length: 12 }, () =>
        trigger({ kind: "funding", date: daysAgo(1), confidence: "high" }),
      ),
      NOW,
    );
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBe(100);
  });

  it("sorteert aflopend en kiest de zwaarste als primary", () => {
    const result = computeTriggerScore(
      [
        trigger({ kind: "new_season", label: "zwak", date: null, confidence: "low" }),
        trigger({ kind: "funding", label: "sterk", date: daysAgo(2), confidence: "high" }),
      ],
      NOW,
    );
    expect(result.primary?.label).toBe("sterk");
    expect(result.triggers[0].weight!).toBeGreaterThan(result.triggers[1].weight!);
  });

  it("behandelt een aangekondigd toekomstig moment als volwaardige aanleiding", () => {
    expect(recencyFactor(daysAgo(-20), NOW)).toBe(1);
  });

  it("valt terug op de onbekend-factor bij een onparseerbare datum", () => {
    expect(recencyFactor("geen datum", NOW)).toBe(0.5);
  });
});

describe("computePriorityScore", () => {
  it("weegt fit 75% en trigger 25%", () => {
    expect(computePriorityScore(100, 0)).toBe(75);
    expect(computePriorityScore(0, 100)).toBe(25);
    expect(computePriorityScore(80, 40)).toBe(70); // 60 + 10
  });

  it("rondt af op een heel getal", () => {
    expect(Number.isInteger(computePriorityScore(83, 37))).toBe(true);
  });
});

describe("tierFor", () => {
  it("hanteert de grenzen uit de briefing", () => {
    expect(tierFor(100)).toBe("A");
    expect(tierFor(80)).toBe("A");
    expect(tierFor(79)).toBe("B");
    expect(tierFor(65)).toBe("B");
    expect(tierFor(64)).toBe("C");
    expect(tierFor(50)).toBe("C");
    expect(tierFor(49)).toBe("D");
    expect(tierFor(0)).toBe("D");
  });

  it("dekt met de tiers het hele bereik 0-100 zonder gaten", () => {
    for (let p = 0; p <= 100; p++) {
      const matches = TIERS.filter((t) => p >= t.min && p <= t.max);
      expect(matches).toHaveLength(1);
    }
  });
});

describe("computeResearchConfidence", () => {
  const evidence = [
    { url: "https://example.nl/a", title: "A", fact: "f", date: null, confidence: "high" as const },
    { url: "https://example.nl/b", title: "B", fact: "f", date: null, confidence: "high" as const },
    { url: "https://example.nl/c", title: "C", fact: "f", date: null, confidence: "high" as const },
    { url: "https://example.nl/d", title: "D", fact: "f", date: null, confidence: "high" as const },
  ];

  it("geeft hoge confidence bij volledig feitelijk bewijs en genoeg bronnen", () => {
    const score = computeResearchConfidence({
      components: reconcileFitComponents(maxedComponents({}, "fact")),
      evidence,
      fetchedSourceCount: 4,
    });
    expect(score).toBe(100);
  });

  it("geeft 0 als alles unknown is", () => {
    expect(
      computeResearchConfidence({
        components: reconcileFitComponents([]),
        evidence: [],
        fetchedSourceCount: 0,
      }),
    ).toBe(0);
  });

  it("straft het ontbreken van opgehaalde bronnen af", () => {
    const withSources = computeResearchConfidence({
      components: reconcileFitComponents(maxedComponents({}, "fact")),
      evidence,
      fetchedSourceCount: 4,
    });
    const withoutSources = computeResearchConfidence({
      components: reconcileFitComponents(maxedComponents({}, "fact")),
      evidence: [],
      fetchedSourceCount: 0,
    });
    expect(withoutSources).toBeLessThan(withSources);
    // Kan nooit "zeker" lijken op basis van niets.
    expect(withoutSources).toBeLessThanOrEqual(25);
  });

  it("weegt inference lichter dan fact", () => {
    const facts = computeResearchConfidence({
      components: reconcileFitComponents(maxedComponents({}, "fact")),
      evidence,
      fetchedSourceCount: 4,
    });
    const inferences = computeResearchConfidence({
      components: reconcileFitComponents(maxedComponents({}, "inference")),
      evidence,
      fetchedSourceCount: 4,
    });
    expect(inferences).toBeLessThan(facts);
    expect(inferences).toBe(50);
  });

  it("labelt de score", () => {
    expect(confidenceLabel(90)).toBe("high");
    expect(confidenceLabel(50)).toBe("medium");
    expect(confidenceLabel(10)).toBe("low");
    expect(confidenceLabel(null)).toBeNull();
  });
});

describe("detectKnockouts", () => {
  const healthy = reconcileFitComponents(maxedComponents());

  it("vindt geen knock-out bij een sterke prospect", () => {
    expect(detectKnockouts({ components: healthy, research_confidence: 90 })).toEqual([]);
  });

  it("slaat aan op puur specialistisch B2B", () => {
    const reasons = detectKnockouts({
      components: healthy,
      research_confidence: 90,
      purely_specialist_b2b: { value: true, basis: "fact" },
    });
    expect(reasons.join(" ")).toMatch(/B2B/);
  });

  it("slaat aan als de Nederlandse markt niet bediend wordt", () => {
    const reasons = detectKnockouts({
      components: healthy,
      research_confidence: 90,
      serves_dutch_market: { value: false, basis: "fact" },
    });
    expect(reasons.join(" ")).toMatch(/Nederlandse markt/);
  });

  it("slaat aan bij een inactief bedrijf", () => {
    const reasons = detectKnockouts({
      components: healthy,
      research_confidence: 90,
      appears_active: { value: false, basis: "fact" },
    });
    expect(reasons.join(" ")).toMatch(/niet meer actief/);
  });

  it("slaat NIET aan bij onbekend (null) — alleen een expliciet nee telt", () => {
    const reasons = detectKnockouts({
      components: healthy,
      research_confidence: 90,
      purely_specialist_b2b: { value: null, basis: "unknown" },
      serves_dutch_market: { value: null, basis: "unknown" },
      appears_active: { value: null, basis: "unknown" },
    });
    expect(reasons).toEqual([]);
  });

  it("slaat aan bij b2c 0 en bij schaal 0", () => {
    const reasons = detectKnockouts({
      components: reconcileFitComponents(maxedComponents({ b2c: 0, scale: 0 })),
      research_confidence: 90,
    });
    expect(reasons.join(" ")).toMatch(/Consumenten/);
    expect(reasons.join(" ")).toMatch(/schaal/);
  });

  it("slaat aan bij een extreem klein lokaal bedrijf", () => {
    const reasons = detectKnockouts({
      components: reconcileFitComponents(maxedComponents({ geographic: 3, scale: 2 })),
      research_confidence: 90,
    });
    expect(reasons.join(" ")).toMatch(/klein lokaal/);
  });

  it("slaat aan bij te lage research-confidence", () => {
    const reasons = detectKnockouts({ components: healthy, research_confidence: 10 });
    expect(reasons.join(" ")).toMatch(/Onvoldoende betrouwbare informatie/);
  });
});

describe("scoreProspect", () => {
  const strongInput = {
    fit_components: maxedComponents(),
    triggers: [trigger()],
    evidence: [
      { url: "https://example.nl/a", title: "A", fact: "f", date: null, confidence: "high" as const },
      { url: "https://example.nl/b", title: "B", fact: "f", date: null, confidence: "high" as const },
      { url: "https://example.nl/c", title: "C", fact: "f", date: null, confidence: "high" as const },
      { url: "https://example.nl/d", title: "D", fact: "f", date: null, confidence: "high" as const },
    ],
    fetchedSourceCount: 4,
    now: NOW,
  };

  it("levert een consistente Tier A voor een sterke prospect", () => {
    const result = scoreProspect(strongInput);
    expect(result.fit_score).toBe(100);
    expect(result.trigger_score).toBeGreaterThan(0);
    expect(result.priority_score).toBe(
      computePriorityScore(result.fit_score, result.trigger_score),
    );
    expect(result.tier).toBe("A");
    expect(result.knockouts).toEqual([]);
  });

  it("houdt priority exact gelijk aan de formule", () => {
    const result = scoreProspect({
      ...strongInput,
      fit_components: maxedComponents({ b2c: 10, marketing: 5 }),
    });
    expect(result.priority_score).toBe(
      Math.round(result.fit_score * 0.75 + result.trigger_score * 0.25),
    );
  });

  it("forceert tier D bij een knock-out, ook bij een hoge priority", () => {
    const result = scoreProspect({
      ...strongInput,
      purely_specialist_b2b: { value: true, basis: "fact" },
    });
    expect(result.knockouts.length).toBeGreaterThan(0);
    expect(result.tier).toBe("D");
    // De oorspronkelijke tier blijft zichtbaar zodat Eric ziet wat er weggezet is.
    expect(result.tier_before_knockout).toBe("A");
    // Scores blijven zichtbaar — alleen de tier is geforceerd.
    expect(result.priority_score).toBeGreaterThan(49);
  });

  it("respecteert een onderbouwde radio-use-case override", () => {
    const result = scoreProspect({
      ...strongInput,
      purely_specialist_b2b: { value: true, basis: "fact" },
      radio_use_case_override: "Recruitmentcampagne voor 40 technische vacatures.",
    });
    expect(result.knockouts.length).toBeGreaterThan(0);
    expect(result.tier).toBe("A"); // niet geforceerd
    expect(result.knockout_override).toContain("Recruitmentcampagne");
    expect(result.tier_before_knockout).toBeNull();
  });

  it("negeert een lege override", () => {
    const result = scoreProspect({
      ...strongInput,
      purely_specialist_b2b: { value: true, basis: "fact" },
      radio_use_case_override: "   ",
    });
    expect(result.tier).toBe("D");
    expect(result.knockout_override).toBeNull();
  });

  it("geeft een lege prospect score 0 en tier D", () => {
    const result = scoreProspect({
      fit_components: [],
      triggers: [],
      evidence: [],
      fetchedSourceCount: 0,
      now: NOW,
    });
    expect(result.fit_score).toBe(0);
    expect(result.trigger_score).toBe(0);
    expect(result.priority_score).toBe(0);
    expect(result.tier).toBe("D");
    expect(result.research_confidence).toBe(0);
    // Te weinig info is zelf een knock-outreden.
    expect(result.knockouts.length).toBeGreaterThan(0);
  });

  it("is deterministisch: dezelfde input geeft dezelfde uitkomst", () => {
    const a = scoreProspect(strongInput);
    const b = scoreProspect(strongInput);
    expect(a).toEqual(b);
  });
});
