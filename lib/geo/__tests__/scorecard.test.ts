import { describe, it, expect } from "vitest";
import { EVIDENCE, SCORECARD, getEvidence } from "../knowledge";
import { parseAnalysisResult } from "../analysis/provider";
import { finalizeAnalysis } from "../analysis";
import { GEO_CATEGORIES, rubricFor } from "../analysis/rubric";
import { buyerFromBrain } from "../brain";
import { buildAnalysisPrompt, GEO_SYSTEM_PROMPT } from "../analysis/prompt";
import { analyzeRobots } from "../facts/robots";
import { extractPageFacts } from "../facts/page";
import type { CriterionVerdict } from "../types";

const all = SCORECARD.dimensions.flatMap((d) => d.criteria);
const verdicts = (v: CriterionVerdict, over: Record<string, CriterionVerdict> = {}) =>
  all.map((c) => ({ id: c.id, verdict: over[c.id] ?? v, finding: `bevinding ${c.id}`, quote: "" }));

describe("kennisbank", () => {
  it("scorecard telt op tot 100 en elk criterium verwijst naar een bestaande aanname met bron", () => {
    expect(all.reduce((s, c) => s + c.max, 0)).toBe(100);
    for (const c of [...all, ...SCORECARD.gates]) {
      expect(c.done_when.length).toBeGreaterThan(10);
      for (const id of c.evidence) expect(getEvidence(id), `${c.id} → ${id}`).toBeDefined();
    }
    for (const e of EVIDENCE.items) {
      expect(e.sources.length, e.id).toBeGreaterThan(0);
      expect(e.revise_if.length, e.id).toBeGreaterThan(10);
      for (const s of e.sources) expect(s.url).toMatch(/^https:\/\//);
    }
  });
  it("geen criterium met punten steunt alleen op ontkrachte aannames", () => {
    for (const c of all) expect(c.evidence.some((id) => getEvidence(id)!.grade !== "ontkracht")).toBe(true);
  });
  it("de prompt noemt elk criterium en geen percentages uit de eerste GEO-studie", () => {
    for (const c of all) expect(GEO_SYSTEM_PROMPT).toContain(c.id);
    expect(GEO_SYSTEM_PROMPT).not.toMatch(/\+41%|\+115%|\+28%/);
  });
});

describe("scoren uit oordelen", () => {
  it("alles voldoet = 100, alles niet = 0, punten komen uit de code", () => {
    expect(parseAnalysisResult({ short_summary: "x", criteria: verdicts("voldoet") }).visibility_score).toBe(100);
    expect(parseAnalysisResult({ short_summary: "x", criteria: verdicts("niet"), visibility_score: 90 }).visibility_score).toBe(0);
  });
  it("nvt telt niet mee en verlaagt de score niet", () => {
    const r = parseAnalysisResult({ short_summary: "x", criteria: verdicts("voldoet", { G4: "nvt", F3: "nvt", D1: "nvt" }) });
    expect(r.visibility_score).toBe(100);
    expect(r.rubric_version).toBe("2");
  });
  it("een oud resultaat zonder versie blijft op de oude rubric", () => {
    const old = rubricFor("1").map((c) => ({ key: c.key, label: c.label, score: c.max, max: c.max, summary: "" }));
    const r = parseAnalysisResult({ short_summary: "x", visibility_score: 100, category_scores: old });
    expect(r.rubric_version).toBe("1");
    expect(r.category_scores.map((c) => c.key)).toEqual(rubricFor("1").map((c) => c.key));
    expect(r.visibility_score).toBe(100);
    expect(GEO_CATEGORIES.map((c) => c.key)).not.toEqual(r.category_scores.map((c) => c.key));
  });
});

describe("finalizeAnalysis", () => {
  const url = "https://voorbeeld.example/";
  const input = { homepage_url: url, company_name: "V", offer_description: "lease", target_audience: "hr", desired_queries: "Wat kost een leasefiets?" };
  const html = "<h1>Lease</h1><p>Wij regelen het.</p>";
  it("elk verloren punt krijgt een advies met eigenaar, klaar-als en bron; hoogste prioriteit eerst", () => {
    const r = parseAnalysisResult({
      short_summary: "x",
      criteria: verdicts("voldoet", { B1: "niet", C2: "deels", A1: "niet" }),
      actions: [{ criterion: "b1", title: "Zet het bedrag onder de kop Tarieven", why: "Geen prijs", where: "Tarieven", before: "", after: "[invullen: prijs]", effort: "laag" }],
    });
    finalizeAnalysis(r, { ...input, facts: extractPageFacts(html, url), robots: analyzeRobots("", url) });
    const ids = r.actions.map((a) => a.criterion);
    expect(ids.slice(0, 2)).toEqual(["A1", "B1"]);
    expect(ids).toContain("C2");
    const b1 = r.actions.find((a) => a.criterion === "B1")!;
    expect(b1.title).toBe("Zet het bedrag onder de kop Tarieven");
    expect(b1.points).toBe(7);
    expect(b1.owner).toBe("Marketeer");
    for (const a of r.actions) {
      expect(a.title).not.toBe("");
      expect(a.done_when).not.toBe("");
      expect(a.source).not.toBe("");
    }
    expect(r.quick_wins.length).toBeGreaterThan(0);
    expect(r.blocked).toBe(false);
  });
  it("een geblokkeerde zoekbot topt de score af, ook na opnieuw inlezen", () => {
    const r = parseAnalysisResult({ short_summary: "x", criteria: verdicts("voldoet") });
    finalizeAnalysis(r, { ...input, facts: extractPageFacts(html, url), robots: analyzeRobots("User-agent: *\nDisallow: /", url) });
    expect(r.blocked).toBe(true);
    expect(r.visibility_score).toBe(SCORECARD.blocked_cap);
    expect(r.actions[0].criterion).toBe("P1");
    expect(parseAnalysisResult(JSON.parse(JSON.stringify(r))).visibility_score).toBe(SCORECARD.blocked_cap);
  });
  it("geen pagina = geen score", () => {
    const r = parseAnalysisResult({ short_summary: "x", criteria: verdicts("nvt") });
    finalizeAnalysis(r, { ...input, facts: null, robots: analyzeRobots(null, url) });
    expect(r.unscored_reason).not.toBeNull();
    expect(r.visibility_score).toBe(0);
  });
});

describe("Marketingbrein", () => {
  const brain = {
    brandName: "V",
    initialProfile: { vragen: ["afgeleid van de website"] },
    blocks: [
      { key: "audience", present: [{ knowledgeNumber: 7, type: "publiek", name: "HR-manager", content: "mkb" }] },
      { key: "how", present: [{ knowledgeNumber: "K21", type: "veelgestelde vraag", name: "Wat kost een leasefiets?" }, { knowledgeNumber: 14, type: "product", name: "Lease e-bike", content: "vanaf € 59" }], missing: ["klantcases"] },
    ],
  };
  it("gebruikt alleen goedgekeurde kennis, met K-nummers, en meldt gaten", () => {
    const b = buyerFromBrain(brain);
    expect(b.questions).toEqual([{ text: "Wat kost een leasefiets?", source: "Marketingbrein, goedgekeurd", ref: "K21" }]);
    expect(b.audiences[0]).toContain("[K7]");
    expect(b.offers[0]).toContain("€ 59");
    expect(JSON.stringify(b)).not.toContain("afgeleid van de website");
    expect(b.gaps.join(" ")).toMatch(/klantcases/);
    expect(b.gaps.join(" ")).toMatch(/Keuzecriteria/);
  });
  it("de prompt toont de herkomst van de klantvragen", () => {
    const base = { homepage_url: "https://v.example/", company_name: "V", offer_description: "lease", target_audience: "hr", desired_queries: "Wat kost het?" };
    expect(buildAnalysisPrompt({ ...base, buyer: buyerFromBrain(brain) })).toContain("[K21] Wat kost een leasefiets?");
    expect(buildAnalysisPrompt(base)).toContain("niet getoetst");
  });
});

describe("zonder taalmodel en met een afwijkende merknaam", () => {
  const url = "https://marketingaiteam.com/";
  const html = '<head><meta property="og:site_name" content="Marketing AI Team"></head><h1>Van losse AI-tools naar één Marketing AI Team.</h1>';
  const input = { homepage_url: url, company_name: "NXTLI", offer_description: "x", target_audience: "y", desired_queries: "z", facts: extractPageFacts(html, url), robots: analyzeRobots("", url) };
  it("valt terug op alleen feiten: geen score, geen geschatte teksten", async () => {
    const { runGeoAnalysis } = await import("../analysis");
    const prev = { k: process.env.ANTHROPIC_API_KEY, p: process.env.GEO_ANALYSIS_PROVIDER, s: process.env.GEO_AI_SEARCH };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEO_ANALYSIS_PROVIDER;
    process.env.GEO_AI_SEARCH = "off";
    const out = await runGeoAnalysis(input);
    if (prev.k) process.env.ANTHROPIC_API_KEY = prev.k;
    if (prev.p) process.env.GEO_ANALYSIS_PROVIDER = prev.p;
    if (prev.s) process.env.GEO_AI_SEARCH = prev.s; else delete process.env.GEO_AI_SEARCH;
    expect(out.providerId).toBe("facts");
    expect(out.degraded).toBe(true);
    expect(out.result.unscored_reason).not.toBeNull();
    expect(out.result.visibility_score).toBe(0);
    expect(out.result.category_scores).toHaveLength(0);
    expect(out.result.technical_checks.length).toBeGreaterThan(3);
    expect(JSON.stringify(out.result)).not.toContain("mock");
  });
  it("de beoordeling gaat over het merk van de pagina, niet over de ingevulde bedrijfsnaam", async () => {
    const { subjectName } = await import("../analysis");
    expect(subjectName(input)).toBe("Marketing AI Team");
    expect(subjectName({ ...input, company_name: "marketing ai team" })).toBe("marketing ai team");
    expect(subjectName({ ...input, facts: null })).toBe("NXTLI");
    expect(buildAnalysisPrompt(input)).toContain("Merk volgens de pagina zelf: Marketing AI Team");
    const r = parseAnalysisResult({ short_summary: "x", criteria: verdicts("voldoet") });
    finalizeAnalysis(r, input);
    expect(r.subject_name).toBe("Marketing AI Team");
    expect(r.scope_notes[0]).toContain("NXTLI");
  });
});
