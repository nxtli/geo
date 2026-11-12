import { describe, expect, it } from "vitest";
import { SCORECARD } from "../knowledge";
import { CHARLIE_STEPS } from "../charlie";
import { CRITERIA_COUNT, DIMENSION_COUNT, DIMENSION_POINTS, FEATURES, HOW, faqs } from "../landing";

describe("landingspagina", () => {
  it("noemt dezelfde aantallen als de scorecard", () => {
    expect(CRITERIA_COUNT).toBe(SCORECARD.dimensions.reduce((n, d) => n + d.criteria.length, 0));
    expect(DIMENSION_COUNT).toBe(SCORECARD.dimensions.length);
    for (const d of SCORECARD.dimensions) {
      expect(DIMENSION_POINTS[d.label]).toBe(d.criteria.reduce((n, c) => n + c.max, 0));
    }
    expect(FEATURES.items.reduce((n, i) => n + i.points, 0)).toBe(100);
    expect(FEATURES.items.map((i) => i.weight)).toEqual([
      "Weegt zwaar", "Weegt zwaar", "Weegt gemiddeld", "Weegt gemiddeld",
      "Weegt gemiddeld", "Weegt gemiddeld", "Weegt licht", "Weegt licht",
    ]);
  });
  it("noemt het echte aantal vragen in de chat", () => {
    expect(CHARLIE_STEPS.length).toBe(9);
    expect(HOW.intro).toContain("negen korte vragen");
  });
  it("schrijft zonder gedachtestreepjes en uitroeptekens", () => {
    const text = JSON.stringify([FEATURES, HOW, faqs("Marketing AI Team")]);
    expect(text).not.toMatch(/[—–!]/);
  });
});
