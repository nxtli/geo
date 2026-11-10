import { describe, it, expect } from "vitest";
import { BRANDS, resolveBrandId } from "../brand";
import { renderReportHtml } from "../report/template";
import { parseAnalysisResult } from "../analysis/provider";

describe("afzender", () => {
  it("kiest op env, dan cookie, dan hostnaam", () => {
    expect(resolveBrandId({ host: "geo.nxtli.com" })).toBe("nxtli");
    expect(resolveBrandId({ host: "geo.marketingaiteam.com" })).toBe("mat");
    expect(resolveBrandId({ host: "geo1-git-x.vercel.app" })).toBe("nxtli");
    expect(resolveBrandId({ host: "geo1-git-x.vercel.app", cookie: "mat" })).toBe("mat");
    expect(resolveBrandId({ host: "geo.marketingaiteam.com", env: "nxtli" })).toBe("nxtli");
    expect(resolveBrandId({ host: "x", cookie: "iets-anders" })).toBe("nxtli");
  });
  it("het rapport volgt de afzender", () => {
    const analysis = parseAnalysisResult({ short_summary: "x", rubric_version: "2" });
    const lead = { company_name: "V", homepage_url: "https://v.example", name: "T" };
    const mat = renderReportHtml({ lead, analysis, date: "10 november 2026", brand: BRANDS.mat });
    const nx = renderReportHtml({ lead, analysis, date: "10 november 2026" });
    expect(mat).toContain("Plan een demo");
    expect(mat).toContain("#1767f2");
    expect(mat).toContain("CRO-specialist in het Marketing AI Team");
    expect(mat).not.toContain("strategiesessie");
    expect(nx).toContain("Plan een sessie");
    expect(nx).toContain("#0c90a1");
  });
});
