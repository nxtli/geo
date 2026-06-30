import { describe, it, expect } from "vitest";
import { parseAnalysisResult } from "../analysis/provider";
import { GEO_CATEGORIES, GEO_MAX_SCORE } from "../analysis/rubric";

/** Minimal valid analysis payload; override the bits a test cares about. */
function base(overrides: Record<string, unknown>) {
  return { visibility_score: 0, short_summary: "test", ...overrides };
}

const sumScores = (cs: Array<{ score: number }>) =>
  cs.reduce((s, c) => s + c.score, 0);

describe("parseAnalysisResult", () => {
  it("derives the headline from the rubric breakdown and always sums to it", () => {
    const category_scores = GEO_CATEGORIES.map((c) => ({
      key: c.key,
      label: c.label,
      score: c.max,
      max: c.max,
      summary: "",
    }));
    const r = parseAnalysisResult(base({ category_scores }));
    expect(r.category_scores).toHaveLength(GEO_CATEGORIES.length);
    expect(r.visibility_score).toBe(sumScores(r.category_scores));
    expect(r.visibility_score).toBe(GEO_MAX_SCORE); // all categories maxed
  });

  it("rescales categories scored against a different max and enforces rubric maxes", () => {
    // Model scored each category 50 out of its own max of 100.
    const category_scores = GEO_CATEGORIES.map((c) => ({
      key: c.key,
      label: c.label,
      score: 50,
      max: 100,
      summary: "",
    }));
    const r = parseAnalysisResult(base({ category_scores }));
    for (const c of r.category_scores) {
      const rubric = GEO_CATEGORIES.find((g) => g.key === c.key)!;
      expect(c.max).toBe(rubric.max); // rubric max enforced
      expect(c.score).toBe(Math.round(rubric.max / 2)); // rescaled
      expect(c.score).toBeLessThanOrEqual(c.max);
    }
    expect(r.visibility_score).toBe(sumScores(r.category_scores));
    expect(r.visibility_score).toBeLessThanOrEqual(GEO_MAX_SCORE);
  });

  it("normalizes a wrong-count category set back to the full /100 rubric", () => {
    const subset = GEO_CATEGORIES.slice(0, 3).map((c) => ({
      key: c.key,
      label: c.label,
      score: c.max,
      max: c.max,
      summary: "",
    }));
    const r = parseAnalysisResult(base({ category_scores: subset }));
    expect(r.category_scores).toHaveLength(GEO_CATEGORIES.length);
    expect(r.category_scores.reduce((s, c) => s + c.max, 0)).toBe(GEO_MAX_SCORE);
    expect(r.visibility_score).toBe(sumScores(r.category_scores));
  });

  it("clamps an over-max category score before summing", () => {
    const category_scores = GEO_CATEGORIES.map((c, i) => ({
      key: c.key,
      label: c.label,
      score: i === 0 ? c.max + 999 : 0, // first category wildly over its max
      max: c.max,
      summary: "",
    }));
    const r = parseAnalysisResult(base({ category_scores }));
    expect(r.category_scores[0].score).toBe(GEO_CATEGORIES[0].max);
    expect(r.visibility_score).toBe(GEO_CATEGORIES[0].max);
  });

  it("does not double-count: blank keys with partial label matches map each entry once", () => {
    // 6 entries, all blank keys; two carry rubric labels, four are generic.
    const category_scores = [
      { key: "", label: "Vraaggerichte structuur", score: 18, max: 20, summary: "" },
      { key: "", label: "Concrete feiten", score: 12, max: 15, summary: "" },
      { key: "", label: "Other A", score: 10, max: 20, summary: "" },
      { key: "", label: "Other B", score: 10, max: 20, summary: "" },
      { key: "", label: "Other C", score: 10, max: 20, summary: "" },
      { key: "", label: "Other D", score: 10, max: 20, summary: "" },
    ];
    const r = parseAnalysisResult(base({ category_scores }));
    const get = (k: string) => r.category_scores.find((c) => c.key === k)!;
    // Exact label matches are preserved, not stolen by the positional fallback.
    expect(get("vraaggerichte_structuur").score).toBe(18);
    expect(get("concrete_feiten").score).toBe(12);
    // Invariant holds and nothing is inflated past /100.
    expect(r.visibility_score).toBe(sumScores(r.category_scores));
    expect(r.visibility_score).toBeLessThanOrEqual(GEO_MAX_SCORE);
  });

  it("clamps the raw headline 0..100 when no breakdown is supplied", () => {
    expect(parseAnalysisResult(base({ visibility_score: 150 })).visibility_score).toBe(100);
    expect(parseAnalysisResult(base({ visibility_score: -5 })).visibility_score).toBe(0);
    expect(parseAnalysisResult(base({ visibility_score: 63 })).visibility_score).toBe(63);
  });
});
