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

import { renderEmailHtml, renderEmailText } from "../email/service";
import { factsOnlyResult } from "../analysis/providers/facts";

describe("bevestigingsmail", () => {
  const base = (factsOnlyResult as unknown as (i: unknown, r: string) => import("../types").GeoAnalysisResult)(
    { company_name: "Voorbeeld BV", homepage_url: "https://voorbeeld.nl", questions: ["a"], page_text: "x" },
    "test",
  );
  const scored = {
    ...base,
    unscored_reason: null,
    visibility_score: 62,
    short_summary: "De pagina is leesbaar voor AI-tools, maar mist concrete prijzen.",
    actions: [
      { title: "Zet de prijs op de pagina", why: "AI-tools halen concrete bedragen aan." },
      { title: "Beantwoord de hoofdvraag in de eerste alinea", why: "" },
    ],
  } as unknown as import("../types").GeoAnalysisResult;
  const params = {
    to: "x@example.com",
    name: "Sanne de Vries",
    companyName: "Voorbeeld BV",
    reportHtml: "",
    reportUrl: "/dc59261c-5500-4493-98fd-5cda901a2c66",
    pageUrl: "https://www.voorbeeld.nl/diensten/",
    brand: BRANDS.mat,
  };

  it("gebruikt de voornaam, de pagina en een volledig adres", () => {
    const html = renderEmailHtml({ ...params, analysis: scored });
    expect(html).toContain("Je rapport is klaar, Sanne");
    expect(html).not.toContain("homepage");
    expect(html).toContain("voorbeeld.nl/diensten");
    expect(html).toContain('href="https://geo.marketingaiteam.com/dc59261c-5500-4493-98fd-5cda901a2c66"');
    expect(html).toContain("https://geo.marketingaiteam.com/charlie-mat.jpg");
    expect(html).toContain("Zet de prijs op de pagina");
    expect(html).toContain("marketing-ai-team-logo.png");
  });

  it("toont geen 0/100 als er geen score is", () => {
    const html = renderEmailHtml({ ...params, analysis: base });
    const text = renderEmailText({ ...params, analysis: base });
    expect(base.unscored_reason).toBeTruthy();
    expect(html).toContain("Geen score");
    expect(html).not.toContain("/100");
    expect(text).toContain("Paginascore: Geen score");
  });
});

import { isReportId, reportPath } from "../report/serve";

describe("rapportadres", () => {
  it("is kort en herkent alleen rapportnummers", () => {
    expect(reportPath("dc59261c-5500-4493-98fd-5cda901a2c66")).toBe("/dc59261c-5500-4493-98fd-5cda901a2c66");
    expect(isReportId("dc59261c-5500-4493-98fd-5cda901a2c66")).toBe(true);
    expect(isReportId("local-dc59261c-5500-4493-98fd-5cda901a2c66")).toBe(true);
    expect(isReportId("admin")).toBe(false);
    expect(isReportId("favicon.ico")).toBe(false);
  });
});
