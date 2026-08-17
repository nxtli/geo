/**
 * Provincie (verzorgingsgebied) en bedrijfsgrootte.
 *
 * Twee dimensies die alleen FILTEREN en bewust NIET meewegen in de scores. Deze
 * tests leggen dat expliciet vast, plus het gedrag waar het makkelijk fout gaat:
 * "landelijk" dekt elke provincie, en een onbekende waarde valt weg in plaats van
 * dat er iets gegokt wordt.
 */

import { describe, it, expect } from "vitest";
import {
  NATIONWIDE,
  coversProvince,
  citiesForProvinces,
  findProvince,
  normalizeProvince,
  normalizeProvinces,
  provincesLabel,
} from "../provinces";
import {
  MKB_BANDS,
  MKB_MAX_EMPLOYEES,
  SIZE_BANDS,
  bandForEmployeeCount,
  employeeCountFromText,
  isMkb,
  normalizeSizeBand,
  sizeBandLabel,
} from "../company-size";
import { filterProspects, computeStats } from "../filters";
import { filterFromSearchParams } from "../query";
import { createProspect } from "../store/serialize";
import type { Prospect } from "../types";

function prospect(overrides: Partial<Prospect> = {}): Prospect {
  const base = createProspect({ company_name: overrides.company_name ?? "Bedrijf" });
  return { ...base, ...overrides };
}

describe("provincies", () => {
  it("normaliseert labels, keys en varianten naar één key", () => {
    expect(normalizeProvince("Noord-Brabant")).toBe("noord_brabant");
    expect(normalizeProvince("noord_brabant")).toBe("noord_brabant");
    expect(normalizeProvince("  LIMBURG ")).toBe("limburg");
  });

  it("weigert onbekende waarden in plaats van te gokken", () => {
    expect(normalizeProvince("Vlaanderen")).toBeNull();
    expect(normalizeProvince("Randstad")).toBeNull();
    expect(normalizeProvince("")).toBeNull();
    expect(normalizeProvince(null)).toBeNull();
  });

  it("herkent landelijk in meerdere formuleringen", () => {
    expect(normalizeProvince("landelijk")).toBe(NATIONWIDE);
    expect(normalizeProvince("heel Nederland")).toBe(NATIONWIDE);
    expect(normalizeProvince("Nederland")).toBe(NATIONWIDE);
  });

  it("laat landelijk de losse provincies opslokken", () => {
    expect(normalizeProvinces(["limburg", "landelijk", "utrecht"])).toEqual([NATIONWIDE]);
  });

  it("ontdubbelt en negeert rommel in de lijst", () => {
    expect(normalizeProvinces(["limburg", "Limburg", "onzin", 42, null])).toEqual(["limburg"]);
    expect(normalizeProvinces("limburg")).toEqual([]);
  });

  it("laat landelijk elke provincie dekken", () => {
    // Anders zou een filter op Limburg elke landelijke keten wegfilteren,
    // terwijl regionale radio in Limburg juist voor hen kan werken.
    expect(coversProvince([NATIONWIDE], "limburg")).toBe(true);
    expect(coversProvince([NATIONWIDE], "friesland")).toBe(true);
    expect(coversProvince(["limburg"], "limburg")).toBe(true);
    expect(coversProvince(["limburg"], "friesland")).toBe(false);
    expect(coversProvince([], "limburg")).toBe(false);
  });

  it("geeft leesbare labels", () => {
    expect(provincesLabel([])).toBe("—");
    expect(provincesLabel([NATIONWIDE])).toBe("Landelijk");
    expect(provincesLabel(["limburg", "utrecht"])).toBe("Limburg, Utrecht");
  });

  it("levert steden als zoekhulp, zonder landelijk", () => {
    const cities = citiesForProvinces(["limburg"]);
    expect(cities).toContain("Maastricht");
    expect(citiesForProvinces([NATIONWIDE])).toEqual([]);
    expect(citiesForProvinces([])).toEqual([]);
  });

  it("kent elke provincie op zowel key als label", () => {
    for (const province of [
      "drenthe",
      "flevoland",
      "friesland",
      "gelderland",
      "groningen",
      "limburg",
      "noord_brabant",
      "noord_holland",
      "overijssel",
      "utrecht",
      "zeeland",
      "zuid_holland",
    ]) {
      const found = findProvince(province);
      expect(found, province).not.toBeNull();
      expect(normalizeProvince(found!.label)).toBe(province);
    }
  });
});

describe("bedrijfsgrootte", () => {
  it("dekt de banden aaneensluitend, zonder gat of overlap", () => {
    for (let i = 0; i < SIZE_BANDS.length - 1; i++) {
      expect(SIZE_BANDS[i].max).not.toBeNull();
      expect(SIZE_BANDS[i + 1].min).toBe((SIZE_BANDS[i].max as number) + 1);
    }
    expect(SIZE_BANDS[SIZE_BANDS.length - 1].max).toBeNull();
  });

  it("leidt de band af uit een aantal medewerkers", () => {
    expect(bandForEmployeeCount(1)).toBe("micro");
    expect(bandForEmployeeCount(9)).toBe("micro");
    expect(bandForEmployeeCount(10)).toBe("klein");
    expect(bandForEmployeeCount(99)).toBe("middel");
    expect(bandForEmployeeCount(100)).toBe("groot");
    expect(bandForEmployeeCount(5000)).toBe("zeer_groot");
  });

  it("geeft geen band bij een onmogelijk aantal", () => {
    expect(bandForEmployeeCount(0)).toBeNull();
    expect(bandForEmployeeCount(-3)).toBeNull();
    expect(bandForEmployeeCount(Number.NaN)).toBeNull();
  });

  it("haalt een aantal uit vrije tekst, ook met duizendscheiding", () => {
    expect(employeeCountFromText("circa 120 medewerkers")).toBe(120);
    expect(employeeCountFromText("1.200 medewerkers")).toBe(1200);
    expect(employeeCountFromText("ruim 40 fte in dienst")).toBe(40);
  });

  it("geeft null als er geen getal in staat", () => {
    expect(employeeCountFromText("een klein team")).toBeNull();
    expect(employeeCountFromText(null)).toBeNull();
    expect(employeeCountFromText("")).toBeNull();
  });

  it("houdt de MKB-grens op 99 medewerkers", () => {
    expect(isMkb(bandForEmployeeCount(MKB_MAX_EMPLOYEES))).toBe(true);
    expect(isMkb(bandForEmployeeCount(MKB_MAX_EMPLOYEES + 1))).toBe(false);
    expect(MKB_BANDS).toEqual(["micro", "klein", "middel"]);
    expect(isMkb(null)).toBe(false);
    expect(isMkb("onzin")).toBe(false);
  });

  it("is tolerant voor bandvarianten die een model kan opleveren", () => {
    expect(normalizeSizeBand("Zeer groot")).toBe("zeer_groot");
    expect(normalizeSizeBand("medium")).toBe("middel");
    expect(normalizeSizeBand("ZZP")).toBe("micro");
    expect(normalizeSizeBand("enterprise")).toBe("zeer_groot");
    expect(normalizeSizeBand("large")).toBe("groot");
    expect(normalizeSizeBand("gigantisch")).toBeNull();
  });

  it("geeft een streepje in plaats van een lege label", () => {
    expect(sizeBandLabel(null)).toBe("—");
    expect(sizeBandLabel("middel")).toBe("Middel (50–99)");
  });
});

describe("filteren op verzorgingsgebied en grootte", () => {
  const list = [
    prospect({ company_name: "Limburgse keten", coverage_provinces: ["limburg"], size_band: "klein" }),
    prospect({
      company_name: "Landelijke keten",
      coverage_provinces: [NATIONWIDE],
      size_band: "zeer_groot",
    }),
    prospect({ company_name: "Onbekend gebied", coverage_provinces: [], size_band: null }),
  ];

  it("houdt landelijke bedrijven bij een provinciefilter", () => {
    const result = filterProspects(list, { provinces: ["limburg"] });
    expect(result.map((p) => p.company_name)).toEqual(["Limburgse keten", "Landelijke keten"]);
  });

  it("filtert een prospect met onbekend verzorgingsgebied weg", () => {
    // Een bellijst voor Limburg mag niet vollopen met bedrijven waarvan we het
    // niet weten. De UI vermeldt dat er expliciet bij.
    const result = filterProspects(list, { provinces: ["friesland"] });
    expect(result.map((p) => p.company_name)).toEqual(["Landelijke keten"]);
  });

  it("filtert op grootteband en laat onbekend wegvallen", () => {
    expect(filterProspects(list, { sizeBands: [...MKB_BANDS] }).map((p) => p.company_name)).toEqual(
      ["Limburgse keten"],
    );
    expect(filterProspects(list, { sizeBands: ["zeer_groot"] }).map((p) => p.company_name)).toEqual(
      ["Landelijke keten"],
    );
  });

  it("laat de scores ongemoeid — grootte is een filter, geen weging", () => {
    // De Fit-rubric uit de briefing beloont schaal; die betekenis mag niet stil
    // veranderen omdat er een MKB-filter bij is gekomen.
    const mkb = prospect({ company_name: "MKB", size_band: "micro", fit_score: 70 });
    const groot = prospect({ company_name: "Groot", size_band: "zeer_groot", fit_score: 70 });
    expect(mkb.fit_score).toBe(groot.fit_score);
  });

  it("telt MKB en onbekend gebied mee in de dashboardcijfers", () => {
    const stats = computeStats(list);
    expect(stats.mkb).toBe(1);
    expect(stats.unknownCoverage).toBe(1);
  });
});

describe("filters uit de URL", () => {
  it("leest ?province= en negeert onzin", () => {
    expect(filterFromSearchParams({ province: "Limburg" }).provinces).toEqual(["limburg"]);
    expect(filterFromSearchParams({ province: "Texas" }).provinces).toBeUndefined();
  });

  it("vertaalt ?size=mkb naar de drie MKB-banden", () => {
    expect(filterFromSearchParams({ size: "mkb" }).sizeBands).toEqual([...MKB_BANDS]);
  });

  it("accepteert één losse band", () => {
    expect(filterFromSearchParams({ size: "zeer_groot" }).sizeBands).toEqual(["zeer_groot"]);
    expect(filterFromSearchParams({ size: "reusachtig" }).sizeBands).toBeUndefined();
  });
});
