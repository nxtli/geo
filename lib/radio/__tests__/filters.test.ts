import { describe, it, expect } from "vitest";
import {
  DEFAULT_SORT,
  computeStats,
  filterProspects,
  hasContactPerson,
  isLowConfidence,
  isReadyForWaalaxy,
  sortProspects,
} from "../filters";
import { createProspect } from "../store/serialize";
import type { Prospect } from "../types";

function prospect(overrides: Partial<Prospect> = {}): Prospect {
  const base = createProspect({ company_name: overrides.company_name ?? "Bedrijf" });
  return { ...base, ...overrides };
}

function scored(
  name: string,
  fit: number,
  trigger: number,
  priority: number,
  tier: Prospect["tier"],
  extra: Partial<Prospect> = {},
): Prospect {
  return prospect({
    company_name: name,
    fit_score: fit,
    trigger_score: trigger,
    priority_score: priority,
    tier,
    ...extra,
  });
}

describe("filterProspects", () => {
  const list = [
    scored("Alpha", 90, 60, 83, "A", {
      segment: "retail",
      industry: "Supermarkt",
      city: "Utrecht",
      primary_sales_angle: "Landelijke awareness plus lokale activatie",
      status: "Researched",
    }),
    scored("Beta", 70, 20, 58, "C", {
      segment: "fitness",
      industry: "Sportscholen",
      city: "Rotterdam",
      primary_sales_angle: "Recruitmentcampagne via regionale radio",
      status: "Contacted",
    }),
    prospect({ company_name: "Gamma" }), // ongescoord
  ];

  it("geeft zonder filter alles terug", () => {
    expect(filterProspects(list)).toHaveLength(3);
  });

  it("filtert op tier", () => {
    expect(filterProspects(list, { tiers: ["A"] }).map((p) => p.company_name)).toEqual(["Alpha"]);
  });

  it("sluit ongescoorde prospects uit bij een tierfilter", () => {
    expect(filterProspects(list, { tiers: ["A", "B", "C", "D"] })).toHaveLength(2);
  });

  it("filtert op status", () => {
    expect(filterProspects(list, { statuses: ["Contacted"] }).map((p) => p.company_name)).toEqual([
      "Beta",
    ]);
  });

  it("filtert op segment", () => {
    expect(filterProspects(list, { segments: ["fitness"] })).toHaveLength(1);
  });

  it("filtert op branche als substring, case-insensitive", () => {
    expect(filterProspects(list, { industry: "supermarkt" })).toHaveLength(1);
  });

  it("filtert op sales angle", () => {
    expect(filterProspects(list, { angle: "recruitment" }).map((p) => p.company_name)).toEqual([
      "Beta",
    ]);
  });

  it("filtert ook op de angle-SOORT, niet alleen op de uitgeschreven tekst", () => {
    // De soort ("Recruitment") staat zelden letterlijk in de angle-prose, maar
    // dat is wél waar iemand op filtert.
    const p = scored("Delta", 80, 20, 65, "B", {
      primary_sales_angle: "Veertien openstaande technische vacatures in Noord-Nederland.",
      sales_angles: [
        {
          kind: "Recruitment",
          angle: "Veertien openstaande technische vacatures in Noord-Nederland.",
          strength: 9,
        },
      ],
    });
    expect(filterProspects([p], { angle: "recruitment" })).toHaveLength(1);
    expect(filterProspects([p], { angle: "vacatures" })).toHaveLength(1);
    expect(filterProspects([p], { angle: "travel" })).toHaveLength(0);
  });

  it("filtert op locatie", () => {
    expect(filterProspects(list, { location: "utrecht" })).toHaveLength(1);
  });

  it("filtert op minimale scores en laat ongescoorde weg", () => {
    expect(filterProspects(list, { minPriority: 60 }).map((p) => p.company_name)).toEqual(["Alpha"]);
    expect(filterProspects(list, { minFit: 80 })).toHaveLength(1);
    expect(filterProspects(list, { minTrigger: 50 })).toHaveLength(1);
    // minPriority 0 mag ongescoorde (null) nog steeds uitsluiten.
    expect(filterProspects(list, { minPriority: 0 })).toHaveLength(2);
  });

  it("filtert op contactpersoon aanwezig ja/nee", () => {
    const withContact = scored("Delta", 80, 10, 63, "C", {
      contact: {
        first_name: "Eva",
        last_name: "Jansen",
        title: "Head of Marketing",
        linkedin_url: null,
        source: "csv",
        confidence: "high",
      },
    });
    const all = [...list, withContact];
    expect(filterProspects(all, { hasContact: true }).map((p) => p.company_name)).toEqual(["Delta"]);
    expect(filterProspects(all, { hasContact: false })).toHaveLength(3);
  });

  it("filtert op LinkedIn-URL aanwezig ja/nee", () => {
    const withLi = scored("Epsilon", 80, 10, 63, "C", {
      contact: {
        first_name: "Eva",
        last_name: null,
        title: null,
        linkedin_url: "https://www.linkedin.com/in/eva",
        source: "csv",
        confidence: null,
      },
    });
    expect(filterProspects([...list, withLi], { hasLinkedIn: true })).toHaveLength(1);
  });

  it("zoekt op naam en website", () => {
    expect(filterProspects(list, { search: "alph" })).toHaveLength(1);
  });

  it("kan DEMO DATA uitsluiten", () => {
    const demo = scored("Demo BV", 80, 10, 63, "C", { demo: true });
    const all = [...list, demo];
    expect(filterProspects(all, { includeDemo: false })).toHaveLength(3);
    expect(filterProspects(all)).toHaveLength(4);
  });

  it("filtert op lage confidence", () => {
    const low = scored("Laag", 50, 0, 38, "D", { research_confidence: 20 });
    const high = scored("Hoog", 50, 0, 38, "D", { research_confidence: 80 });
    expect(
      filterProspects([low, high], { lowConfidenceOnly: true }).map((p) => p.company_name),
    ).toEqual(["Laag"]);
  });

  it("combineert filters met AND", () => {
    expect(filterProspects(list, { tiers: ["A"], location: "rotterdam" })).toHaveLength(0);
  });
});

describe("sortProspects", () => {
  const list = [
    scored("Laag", 40, 10, 33, "D"),
    scored("Hoog", 95, 80, 91, "A"),
    scored("Midden", 70, 40, 63, "C"),
    prospect({ company_name: "Ongescoord" }),
  ];

  it("sorteert standaard op priority aflopend", () => {
    expect(sortProspects(list, DEFAULT_SORT).map((p) => p.company_name)).toEqual([
      "Hoog",
      "Midden",
      "Laag",
      "Ongescoord",
    ]);
  });

  it("zet ongescoorde prospects altijd achteraan, ook oplopend", () => {
    const asc = sortProspects(list, { key: "priority", direction: "asc" });
    expect(asc[asc.length - 1].company_name).toBe("Ongescoord");
    expect(asc[0].company_name).toBe("Laag");
  });

  it("sorteert op fit, trigger en naam", () => {
    expect(sortProspects(list, { key: "fit", direction: "desc" })[0].company_name).toBe("Hoog");
    expect(sortProspects(list, { key: "trigger", direction: "desc" })[0].company_name).toBe("Hoog");
    expect(sortProspects(list, { key: "company", direction: "asc" })[0].company_name).toBe("Hoog");
  });

  it("muteert de invoerlijst niet", () => {
    const original = [...list];
    sortProspects(list, { key: "company", direction: "asc" });
    expect(list).toEqual(original);
  });
});

describe("Waalaxy-gereedheid", () => {
  const withProfile = (url: string | null, firstName: string | null = "Eva"): Prospect =>
    prospect({
      contact: {
        first_name: firstName,
        last_name: "Jansen",
        title: "CMO",
        linkedin_url: url,
        source: "csv",
        confidence: "high",
      },
    });

  it("vereist een persoonsprofiel-URL, niet een bedrijfspagina", () => {
    expect(isReadyForWaalaxy(withProfile("https://www.linkedin.com/in/eva-jansen"))).toBe(true);
    expect(isReadyForWaalaxy(withProfile("https://www.linkedin.com/company/coolblue"))).toBe(false);
  });

  it("vereist ook een naam", () => {
    expect(isReadyForWaalaxy(withProfile("https://www.linkedin.com/in/eva-jansen", null))).toBe(
      false,
    );
  });

  it("herkent een ontbrekende contactpersoon", () => {
    expect(hasContactPerson(prospect())).toBe(false);
    expect(hasContactPerson(withProfile(null))).toBe(true);
  });
});

describe("computeStats", () => {
  const list = [
    scored("A1", 90, 60, 83, "A", {
      research_confidence: 80,
      contact: {
        first_name: "Eva",
        last_name: "Jansen",
        title: "CMO",
        linkedin_url: "https://www.linkedin.com/in/eva-jansen",
        source: "csv",
        confidence: "high",
      },
    }),
    scored("B1", 70, 40, 63, "B", { research_confidence: 30 }),
    prospect({ company_name: "Nieuw" }),
  ];

  it("telt totalen en tiers", () => {
    const stats = computeStats(list);
    expect(stats.total).toBe(3);
    expect(stats.tierA).toBe(1);
    expect(stats.tierB).toBe(1);
    expect(stats.notResearched).toBe(1);
  });

  it("telt Waalaxy-gereed en missende contacten", () => {
    const stats = computeStats(list);
    expect(stats.readyForWaalaxy).toBe(1);
    expect(stats.missingContact).toBe(2);
  });

  it("rekent gemiddelden alleen over gescoorde prospects", () => {
    const stats = computeStats(list);
    expect(stats.avgFit).toBe(80); // (90+70)/2, niet /3
    expect(stats.avgTrigger).toBe(50);
  });

  it("geeft null-gemiddelden bij een lege lijst", () => {
    const stats = computeStats([]);
    expect(stats.total).toBe(0);
    expect(stats.avgFit).toBeNull();
    expect(stats.avgTrigger).toBeNull();
  });

  it("telt lage confidence", () => {
    expect(computeStats(list).lowConfidence).toBe(1);
    expect(isLowConfidence(list[1])).toBe(true);
  });
});
