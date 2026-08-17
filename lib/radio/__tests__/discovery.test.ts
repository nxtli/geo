import { describe, it, expect } from "vitest";
import { parseDiscoveryResult } from "../discovery/provider";
import {
  DISCOVERY_QUERIES,
  findQuery,
  queriesForSegment,
  timingQueries,
} from "../discovery/queries";
import { RADIO_SEGMENTS } from "../segments";

const ALLOWED = [
  "https://www.retailtrends.nl/nieuws/keten-opent-vestiging",
  "https://fd.nl/bedrijfsleven/groeimerk",
];

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    company_name: "Zonnestraat Keukens",
    website: "zonnestraat-keukens.nl",
    segment: "home_living",
    why: "Landelijke keukenketen met hoge klantwaarde.",
    signal: "Opent twee nieuwe vestigingen",
    signal_date: "2026-07-01",
    source_url: ALLOWED[0],
    confidence: "high",
    ...overrides,
  };
}

const parse = (
  candidates: Array<Record<string, unknown>>,
  opts: { allowed?: string[]; known?: string[]; limit?: number } = {},
) =>
  parseDiscoveryResult(
    { candidates },
    {
      allowedUrls: opts.allowed ?? ALLOWED,
      knownCompanies: opts.known ?? [],
      limit: opts.limit ?? 10,
    },
  );

describe("zoekrichtingen", () => {
  it("heeft unieke keys en minstens één zoekterm per richting", () => {
    expect(new Set(DISCOVERY_QUERIES.map((q) => q.key)).size).toBe(DISCOVERY_QUERIES.length);
    for (const q of DISCOVERY_QUERIES) {
      expect(q.searches.length, `${q.key} heeft geen zoektermen`).toBeGreaterThan(0);
      expect(q.label.length).toBeGreaterThan(3);
    }
  });

  it("verwijst alleen naar bestaande segmenten", () => {
    const keys = new Set(RADIO_SEGMENTS.map((s) => s.key));
    for (const q of DISCOVERY_QUERIES) {
      if (q.segment !== null) {
        expect(keys.has(q.segment), `onbekend segment "${q.segment}" in ${q.key}`).toBe(true);
      }
    }
  });

  it("heeft zowel fit- als timing-richtingen", () => {
    expect(DISCOVERY_QUERIES.some((q) => q.kind === "fit")).toBe(true);
    expect(timingQueries().length).toBeGreaterThan(0);
  });

  it("dekt de zoekopdrachten uit §18 van de briefing", () => {
    const alles = DISCOVERY_QUERIES.map((q) => `${q.label} ${q.searches.join(" ")}`)
      .join(" ")
      .toLowerCase();
    for (const onderwerp of [
      "retailketen",
      "vestiging",
      "vacature",
      "e-commerce",
      "reis",
      "opleid",
      "telecom",
      "energie",
      "woon",
      "fitness",
      "festival",
      "franchise",
      "automotive",
      "groei",
      "lanceert",
    ]) {
      expect(alles, `zoekonderwerp "${onderwerp}" ontbreekt`).toContain(onderwerp);
    }
  });

  it("filtert per segment en houdt de segment-brede richtingen erbij", () => {
    const retail = queriesForSegment("retail");
    expect(retail.some((q) => q.segment === "retail")).toBe(true);
    expect(retail.every((q) => q.segment === "retail" || q.segment === null)).toBe(true);
  });

  it("vindt een richting op key en geeft null bij onbekend", () => {
    expect(findQuery("new_locations")?.kind).toBe("timing");
    expect(findQuery("bestaat-niet")).toBeNull();
  });
});

describe("bronverificatie bij discovery", () => {
  it("houdt een kandidaat met een bron uit de zoekresultaten", () => {
    const { candidates, rejected_sources } = parse([candidate()]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].website).toBe("https://zonnestraat-keukens.nl");
    expect(rejected_sources).toEqual([]);
  });

  it("verwerpt een kandidaat met een verzonnen bron", () => {
    const { candidates, rejected_sources } = parse([
      candidate({ source_url: "https://verzonnen-nieuwssite.nl/artikel" }),
    ]);
    expect(candidates).toEqual([]);
    expect(rejected_sources).toContain("https://verzonnen-nieuwssite.nl/artikel");
  });

  it("verwerpt een kandidaat zonder bron", () => {
    expect(parse([candidate({ source_url: "" })]).candidates).toEqual([]);
  });

  it("accepteert een andere pagina op een domein dat in de resultaten stond", () => {
    // Zoekmachines geven vaak de canonieke pagina terug terwijl het model de
    // sectie noemt; hetzelfde domein blijft een echte vindplaats.
    const { candidates } = parse([
      candidate({ source_url: "https://retailtrends.nl/nieuws/ander-artikel" }),
    ]);
    expect(candidates).toHaveLength(1);
  });

  it("verwerpt alles als er geen zoekresultaten waren", () => {
    expect(parse([candidate()], { allowed: [] }).candidates).toEqual([]);
  });
});

describe("kandidaat-normalisatie", () => {
  it("weigert een kandidaat zonder naam of zonder bruikbare website", () => {
    expect(parse([candidate({ company_name: "  " })]).candidates).toEqual([]);
    expect(parse([candidate({ website: "geen-domein" })]).candidates).toEqual([]);
    expect(parse([candidate({ website: "" })]).candidates).toEqual([]);
  });

  it("normaliseert de website naar een https-URL", () => {
    expect(parse([candidate({ website: "www.voorbeeld.nl/pagina?utm=x" })]).candidates[0].website)
      .toBe("https://www.voorbeeld.nl/pagina");
  });

  it("laat bedrijven weg die we al hebben", () => {
    const { candidates } = parse([candidate()], { known: ["zonnestraat keukens"] });
    expect(candidates).toEqual([]);
  });

  it("ontdubbelt binnen dezelfde ronde op naam en op website", () => {
    const { candidates } = parse([
      candidate(),
      candidate({ company_name: "Zonnestraat Keukens" }),
      candidate({ company_name: "Andere Naam", website: "https://www.zonnestraat-keukens.nl/" }),
    ]);
    expect(candidates).toHaveLength(1);
  });

  it("respecteert de limiet", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      candidate({ company_name: `Bedrijf ${i}`, website: `bedrijf${i}.nl` }),
    );
    expect(parse(many, { limit: 3 }).candidates).toHaveLength(3);
  });

  it("normaliseert een onbekend segment naar null", () => {
    expect(parse([candidate({ segment: "ruimtevaart" })]).candidates[0].segment).toBeNull();
    expect(parse([candidate({ segment: "Automotive" })]).candidates[0].segment).toBe("automotive");
  });

  it("neemt een signaal met datum over en weigert een absurde datum", () => {
    expect(parse([candidate()]).candidates[0].signal_date).toBe("2026-07-01");
    expect(parse([candidate({ signal_date: "3000-01-01" })]).candidates[0].signal_date).toBeNull();
    expect(parse([candidate({ signal_date: "binnenkort" })]).candidates[0].signal_date).toBeNull();
    expect(parse([candidate({ signal_date: null })]).candidates[0].signal_date).toBeNull();
  });

  it("maakt een leeg signaal null in plaats van een lege string", () => {
    expect(parse([candidate({ signal: "   " })]).candidates[0].signal).toBeNull();
  });

  it("valt terug op low bij een onbekende confidence", () => {
    expect(parse([candidate({ confidence: "zeker-wel" })]).candidates[0].confidence).toBe("low");
  });

  it("negeert onbekende velden en een lege lijst", () => {
    expect(parse([]).candidates).toEqual([]);
    expect(
      parseDiscoveryResult({ candidates: [], onzin: 1 }, {
        allowedUrls: [],
        knownCompanies: [],
        limit: 5,
      }).candidates,
    ).toEqual([]);
  });

  it("overleeft een respons zonder candidates-veld", () => {
    expect(
      parseDiscoveryResult({}, { allowedUrls: ALLOWED, knownCompanies: [], limit: 5 }).candidates,
    ).toEqual([]);
  });
});
