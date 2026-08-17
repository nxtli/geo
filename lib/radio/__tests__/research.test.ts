import { describe, it, expect } from "vitest";
import { parseResearchResult } from "../research/provider";
import { isPathAllowed, parseRobots, rankCandidateLinks, htmlToText } from "../research/fetch";
import { HeuristicResearchProvider } from "../research/providers/heuristic";
import { FIT_COMPONENTS } from "../scoring/rubric";
import type { CompanyWebData, FetchedSource } from "../types";

const ALLOWED = ["https://voorbeeld.nl", "https://voorbeeld.nl/vacatures"];

/** Minimale, geldige modeloutput; overschrijf wat een test nodig heeft. */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    company_name: "Voorbeeld BV",
    industry: "Retail",
    segment: "retail",
    description: "Een winkelketen.",
    city: "Utrecht",
    country: "Nederland",
    company_size: { value: null, basis: "unknown" },
    number_of_locations: { value: null, basis: "unknown" },
    appears_active: { value: true, basis: "fact" },
    serves_dutch_market: { value: true, basis: "fact" },
    purely_specialist_b2b: { value: false, basis: "fact" },
    fit_components: [],
    triggers: [],
    sales_angles: [],
    why_interesting: [],
    recommended_contact_role: "Head of Marketing",
    contact_person: null,
    personalization: null,
    evidence: [],
    radio_use_case_override: null,
    ...overrides,
  };
}

const parse = (overrides: Record<string, unknown> = {}, allowed = ALLOWED) =>
  parseResearchResult(payload(overrides), {
    allowedUrls: allowed,
    fallbackCompanyName: "Fallback BV",
  });

describe("bronverificatie — de kern van de anti-hallucinatie", () => {
  it("houdt bewijs met een opgehaalde URL", () => {
    const { result, rejected_sources } = parse({
      evidence: [
        {
          url: "https://voorbeeld.nl/vacatures",
          title: "Vacatures",
          fact: "Twaalf openstaande vacatures.",
          date: "2026-07-01",
          confidence: "high",
        },
      ],
    });
    expect(result.evidence).toHaveLength(1);
    expect(rejected_sources).toEqual([]);
  });

  it("verwerpt bewijs met een verzonnen URL", () => {
    const { result, rejected_sources } = parse({
      evidence: [
        {
          url: "https://voorbeeld.nl/nieuws/opening-tilburg-2026",
          title: "Opening Tilburg",
          fact: "Nieuwe vestiging in Tilburg.",
          date: "2026-08-01",
          confidence: "high",
        },
      ],
    });
    expect(result.evidence).toEqual([]);
    expect(rejected_sources).toContain("https://voorbeeld.nl/nieuws/opening-tilburg-2026");
  });

  it("verwerpt een trigger waarvan de bron niet opgehaald is", () => {
    const { result } = parse({
      triggers: [
        {
          kind: "new_location",
          label: "Opent vestiging in Tilburg",
          explanation: "Concrete aanleiding.",
          source_url: "https://voorbeeld.nl/nieuws/verzonnen",
          date: "2026-08-01",
          confidence: "high",
        },
      ],
    });
    // Geen bewijs, geen trigger — anders zou de Trigger Score op fictie rusten.
    expect(result.triggers).toEqual([]);
  });

  it("houdt een trigger met een geverifieerde bron", () => {
    const { result } = parse({
      triggers: [
        {
          kind: "hiring_surge",
          label: "Veel vacatures",
          explanation: "Structurele wervingsbehoefte.",
          source_url: "https://voorbeeld.nl/vacatures",
          date: "2026-08-01",
          confidence: "high",
        },
      ],
    });
    expect(result.triggers).toHaveLength(1);
    expect(result.triggers[0].kind).toBe("hiring_surge");
  });

  it("accepteert dezelfde URL met www, trailing slash of query", () => {
    const { result } = parse(
      {
        evidence: [
          {
            url: "https://www.voorbeeld.nl/vacatures/?utm_source=nieuwsbrief",
            title: "Vacatures",
            fact: "Vacatures aanwezig.",
            date: null,
            confidence: "medium",
          },
        ],
      },
      ["https://voorbeeld.nl/vacatures"],
    );
    expect(result.evidence).toHaveLength(1);
    // De opgeslagen URL is de ECHT opgehaalde variant, niet de modelvariant.
    expect(result.evidence[0].url).toBe("https://voorbeeld.nl/vacatures");
  });

  it("verwerpt alles als er geen enkele bron is opgehaald", () => {
    const { result } = parse(
      {
        evidence: [
          { url: "https://voorbeeld.nl", title: "T", fact: "f", date: null, confidence: "high" },
        ],
        triggers: [
          {
            kind: "funding",
            label: "Investering",
            explanation: "x",
            source_url: "https://voorbeeld.nl",
            date: null,
            confidence: "high",
          },
        ],
      },
      [],
    );
    expect(result.evidence).toEqual([]);
    expect(result.triggers).toEqual([]);
  });

  it("verwerpt bewijs zonder feit, ook met geldige URL", () => {
    const { result } = parse({
      evidence: [
        { url: "https://voorbeeld.nl", title: "Home", fact: "   ", date: null, confidence: "high" },
      ],
    });
    expect(result.evidence).toEqual([]);
  });
});

describe("getallen alleen als vastgesteld feit", () => {
  it("neemt company_size over als het een fact is", () => {
    const { result } = parse({
      company_size: { value: "120 medewerkers", basis: "fact" },
    });
    expect(result.company_size.value).toBe("120 medewerkers");
  });

  it("gooit een geschatte company_size weg", () => {
    const { result } = parse({
      company_size: { value: "ongeveer 100 medewerkers", basis: "inference" },
    });
    expect(result.company_size.value).toBeNull();
    expect(result.company_size.basis).toBe("inference");
  });

  it("gooit een geschat aantal vestigingen weg", () => {
    const { result } = parse({
      number_of_locations: { value: 25, basis: "inference" },
    });
    expect(result.number_of_locations.value).toBeNull();
  });

  it("neemt een vastgesteld aantal vestigingen over", () => {
    const { result } = parse({
      number_of_locations: { value: 25, basis: "fact" },
    });
    expect(result.number_of_locations.value).toBe(25);
  });

  it("weigert een onzinnig aantal vestigingen", () => {
    const { result } = parse({ number_of_locations: { value: 0, basis: "fact" } });
    expect(result.number_of_locations.value).toBeNull();
  });
});

describe("contactpersoon", () => {
  it("neemt een persoon over met geverifieerde bron", () => {
    const { result } = parse({
      contact_person: {
        first_name: "Eva",
        last_name: "Jansen",
        title: "Head of Marketing",
        source_url: "https://voorbeeld.nl",
        confidence: "high",
      },
    });
    expect(result.contact_person?.first_name).toBe("Eva");
    expect(result.contact_person?.source_url).toBe("https://voorbeeld.nl");
  });

  it("gooit een persoon zonder geverifieerde bron weg", () => {
    const { result } = parse({
      contact_person: {
        first_name: "Eva",
        last_name: "Jansen",
        title: "CMO",
        source_url: "https://voorbeeld.nl/team-verzonnen",
        confidence: "high",
      },
    });
    expect(result.contact_person).toBeNull();
  });

  it("gooit een persoon zonder voornaam weg", () => {
    const { result } = parse({
      contact_person: {
        first_name: null,
        last_name: "Jansen",
        title: "CMO",
        source_url: "https://voorbeeld.nl",
        confidence: "high",
      },
    });
    expect(result.contact_person).toBeNull();
  });

  it("bevat geen enkel LinkedIn-veld in het contactpersoon-resultaat", () => {
    const { result } = parse({
      contact_person: {
        first_name: "Eva",
        last_name: null,
        title: null,
        source_url: "https://voorbeeld.nl",
        confidence: "high",
      },
    });
    expect(result.contact_person).not.toHaveProperty("linkedin_url");
  });

  it("normaliseert een rolvariant naar de canonieke rol", () => {
    expect(parse({ recommended_contact_role: "hoofd marketing" }).result.recommended_contact_role)
      .toBe("Head of Marketing");
    expect(parse({ recommended_contact_role: "eigenaar" }).result.recommended_contact_role)
      .toBe("Managing Director / eigenaar");
    expect(parse({ recommended_contact_role: "Chief Vibes Officer" }).result.recommended_contact_role)
      .toBeNull();
  });
});

describe("normalisatie van modeloutput", () => {
  it("degradeert een componentscore zonder onderbouwing naar unknown", () => {
    const { result } = parse({
      fit_components: [{ key: "b2c", score: 20, rationale: "  ", basis: "fact" }],
    });
    expect(result.fit_components[0].basis).toBe("unknown");
  });

  it("vult label en max uit de rubric in", () => {
    const { result } = parse({
      fit_components: [{ key: "b2c", score: 20, rationale: "Sterk consumentenmerk.", basis: "fact" }],
    });
    const def = FIT_COMPONENTS.find((c) => c.key === "b2c")!;
    expect(result.fit_components[0].label).toBe(def.label);
    expect(result.fit_components[0].max).toBe(def.max);
  });

  it("kapt sales angles op 3 en klemt strength op 1-10", () => {
    const { result } = parse({
      sales_angles: [
        { kind: "A", angle: "een", strength: 99 },
        { kind: "B", angle: "twee", strength: -5 },
        { kind: "C", angle: "drie", strength: 7 },
        { kind: "D", angle: "vier", strength: 5 },
      ],
    });
    expect(result.sales_angles).toHaveLength(3);
    expect(result.sales_angles[0].strength).toBe(10);
  });

  it("houdt de STERKSTE drie angles, niet de eerste drie", () => {
    const { result } = parse({
      sales_angles: [
        { kind: "zwak1", angle: "een", strength: 2 },
        { kind: "zwak2", angle: "twee", strength: 3 },
        { kind: "zwak3", angle: "drie", strength: 4 },
        { kind: "sterkst", angle: "vier", strength: 10 },
      ],
    });
    expect(result.sales_angles.map((a) => a.kind)).toEqual(["sterkst", "zwak3", "zwak2"]);
    // sales_angles[0] is overal de primaire angle — ook in het personalisatieblok.
    expect(result.sales_angles[0].kind).toBe("sterkst");
  });

  it("gooit een lege angle weg", () => {
    const { result } = parse({
      sales_angles: [{ kind: "A", angle: "   ", strength: 8 }],
    });
    expect(result.sales_angles).toEqual([]);
  });

  it("kapt why_interesting op 5 bullets", () => {
    const { result } = parse({
      why_interesting: ["a", "b", "c", "d", "e", "f", "g"],
    });
    expect(result.why_interesting).toHaveLength(5);
  });

  it("normaliseert een onbekend triggersoort naar 'other'", () => {
    const { result } = parse({
      triggers: [
        {
          kind: "iets-heel-nieuws",
          label: "Signaal",
          explanation: "x",
          source_url: "https://voorbeeld.nl",
          date: null,
          confidence: "medium",
        },
      ],
    });
    expect(result.triggers[0].kind).toBe("other");
  });

  it("normaliseert een Nederlandse triggersoort", () => {
    const { result } = parse({
      triggers: [
        {
          kind: "nieuwe vestiging",
          label: "Opening",
          explanation: "x",
          source_url: "https://voorbeeld.nl",
          date: null,
          confidence: "medium",
        },
      ],
    });
    expect(result.triggers[0].kind).toBe("new_location");
  });

  it("normaliseert datums, ook Nederlandse maandnamen", () => {
    const dateOf = (date: string) =>
      parse({
        triggers: [
          {
            kind: "event",
            label: "Festival",
            explanation: "x",
            source_url: "https://voorbeeld.nl",
            date,
            confidence: "medium",
          },
        ],
      }).result.triggers[0]?.date ?? null;

    expect(dateOf("2026-07-15T10:00:00Z")).toBe("2026-07-15");
    expect(dateOf("15 juli 2026")).toBe("2026-07-15");
    expect(dateOf("binnenkort")).toBeNull();
    expect(dateOf("")).toBeNull();
  });

  it("weigert absurde datums die uit een misparse kunnen komen", () => {
    // Belangrijk: een toekomstdatum krijgt recency-factor 1.0, dus een misparse
    // naar het jaar 3000 zou de Trigger Score opblazen.
    const dateOf = (date: string) =>
      parse({
        triggers: [
          {
            kind: "event",
            label: "x",
            explanation: "x",
            source_url: "https://voorbeeld.nl",
            date,
            confidence: "medium",
          },
        ],
      }).result.triggers[0]?.date ?? null;

    expect(dateOf("3000-01-01")).toBeNull();
    expect(dateOf("1888-01-01")).toBeNull();
  });

  it("valt terug op de opgegeven bedrijfsnaam als het model die leeg laat", () => {
    expect(parse({ company_name: "  " }).result.company_name).toBe("Fallback BV");
  });

  it("normaliseert een onbekend segment naar null", () => {
    expect(parse({ segment: "ruimtevaart" }).result.segment).toBeNull();
    expect(parse({ segment: "Automotive" }).result.segment).toBe("automotive");
  });

  it("negeert onbekende velden en vult ontbrekende met defaults", () => {
    const { result } = parseResearchResult(
      { company_name: "X", onzin_veld: true },
      { allowedUrls: [], fallbackCompanyName: "X" },
    );
    expect(result.fit_components).toEqual([]);
    expect(result.evidence).toEqual([]);
    expect(result.radio_use_case_override).toBeNull();
  });
});

describe("robots.txt", () => {
  it("leest Disallow uit de wildcard-groep", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /admin\nDisallow: /checkout\n");
    expect(rules.disallow).toEqual(["/admin", "/checkout"]);
    expect(isPathAllowed("/admin/login", rules)).toBe(false);
    expect(isPathAllowed("/vacatures", rules)).toBe(true);
  });

  it("negeert regels van een andere user-agent", () => {
    const rules = parseRobots("User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nDisallow: /privé\n");
    expect(isPathAllowed("/vacatures", rules)).toBe(true);
    expect(isPathAllowed("/privé", rules)).toBe(false);
  });

  it("respecteert een volledige blokkade", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /\n");
    expect(isPathAllowed("/", rules)).toBe(false);
    expect(isPathAllowed("/wat-dan-ook", rules)).toBe(false);
  });

  it("negeert commentaar en lege regels", () => {
    const rules = parseRobots("# commentaar\n\nUser-agent: *\nDisallow: /x # ook commentaar\n");
    expect(rules.disallow).toEqual(["/x"]);
  });

  it("behandelt een wildcard-pad als zijn prefix", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /zoek*results\n");
    expect(isPathAllowed("/zoeken", rules)).toBe(false);
    expect(isPathAllowed("/vacatures", rules)).toBe(true);
  });

  it("staat alles toe als robots.txt onbekend is", () => {
    expect(isPathAllowed("/wat-dan-ook", { disallow: [], unknown: true })).toBe(true);
  });

  it("staat Allow-only robots.txt toe", () => {
    const rules = parseRobots("User-agent: *\nAllow: /\n");
    expect(isPathAllowed("/vacatures", rules)).toBe(true);
  });
});

describe("linkherkenning", () => {
  const html = `
    <a href="/vacatures">Werken bij ons</a>
    <a href="/over-ons">Over ons</a>
    <a href="/vestigingen">Winkels</a>
    <a href="/product/schroef-4mm">Een product</a>
    <a href="https://www.linkedin.com/company/voorbeeld">LinkedIn</a>
    <a href="https://andere-site.nl/nieuws">Extern nieuws</a>
    <a href="/brochure.pdf">Brochure</a>
    <a href="mailto:info@voorbeeld.nl">Mail</a>
    <a href="/nieuws">Nieuws</a>
  `;

  it("kiest relevante same-origin pagina's", () => {
    const links = rankCandidateLinks(html, "https://voorbeeld.nl");
    expect(links).toContain("https://voorbeeld.nl/vacatures");
    expect(links).toContain("https://voorbeeld.nl/nieuws");
    expect(links).toContain("https://voorbeeld.nl/over-ons");
  });

  it("sluit LinkedIn en andere socials altijd uit", () => {
    const links = rankCandidateLinks(html, "https://voorbeeld.nl");
    expect(links.some((l) => l.includes("linkedin"))).toBe(false);
  });

  it("sluit externe domeinen, bestanden en mailto uit", () => {
    const links = rankCandidateLinks(html, "https://voorbeeld.nl");
    expect(links.some((l) => l.includes("andere-site.nl"))).toBe(false);
    expect(links.some((l) => l.endsWith(".pdf"))).toBe(false);
    expect(links.some((l) => l.startsWith("mailto"))).toBe(false);
  });

  it("negeert irrelevante pagina's", () => {
    const links = rankCandidateLinks(html, "https://voorbeeld.nl");
    expect(links.some((l) => l.includes("/product/"))).toBe(false);
  });

  it("zet vacatures boven contact (hoger gewicht)", () => {
    const links = rankCandidateLinks(
      `<a href="/contact">Contact</a><a href="/vacatures">Vacatures</a>`,
      "https://voorbeeld.nl",
    );
    expect(links[0]).toBe("https://voorbeeld.nl/vacatures");
  });

  it("geeft een lege lijst bij een onbruikbare basis-URL", () => {
    expect(rankCandidateLinks(html, "geen-url")).toEqual([]);
  });
});

describe("htmlToText", () => {
  it("strip scripts, styles en tags", () => {
    const text = htmlToText(
      "<html><head><style>b{}</style><script>alert(1)</script></head><body><h1>Titel</h1><p>Tekst &amp; meer</p></body></html>",
    );
    expect(text).toContain("Titel");
    expect(text).toContain("Tekst & meer");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("<");
  });
});

describe("HeuristicResearchProvider", () => {
  const provider = new HeuristicResearchProvider();

  const web = (sources: FetchedSource[]): CompanyWebData => ({
    root_url: "https://voorbeeld.nl",
    sources,
    failed_urls: [],
  });

  const input = (sources: FetchedSource[]) => ({
    company_name: "Voorbeeld BV",
    website: "https://voorbeeld.nl",
    web: web(sources),
  });

  it("is altijd beschikbaar", () => {
    expect(provider.isConfigured()).toBe(true);
  });

  it("zet alles op unknown als er geen bronnen zijn", async () => {
    const { result } = await provider.research(input([]));
    expect(result.fit_components).toHaveLength(FIT_COMPONENTS.length);
    expect(result.fit_components.every((c) => c.basis === "unknown" && c.score === 0)).toBe(true);
    expect(result.triggers).toEqual([]);
    expect(result.evidence).toEqual([]);
    expect(result.contact_person).toBeNull();
  });

  it("verzint nooit een bron-URL", async () => {
    const source: FetchedSource = {
      url: "https://voorbeeld.nl",
      title: "Home",
      text: "Werken bij ons? Bekijk onze vacatures. Wij zoeken collega's. Solliciteer nu. Onze winkels in heel Nederland.",
      status: 200,
    };
    const { result } = await provider.research(input([source]));
    for (const item of result.evidence) {
      expect(item.url).toBe(source.url);
    }
    for (const t of result.triggers) {
      expect(t.source_url).toBe(source.url);
    }
  });

  it("herkent vacature- en vestigingssignalen", async () => {
    const { result } = await provider.research(
      input([
        {
          url: "https://voorbeeld.nl/vacatures",
          title: "Vacatures",
          text: "Vacature monteur. Vacature verkoper. Vacature manager. Wij zoeken nieuwe collega's. Solliciteer.",
          status: 200,
        },
      ]),
    );
    const recruitment = result.fit_components.find((c) => c.key === "recruitment")!;
    expect(recruitment.score).toBeGreaterThan(0);
    expect(result.triggers.some((t) => t.kind === "hiring_surge")).toBe(true);
  });

  it("stelt nooit aantallen vast", async () => {
    const { result } = await provider.research(
      input([
        {
          url: "https://voorbeeld.nl",
          title: "Home",
          text: "Wij hebben 42 vestigingen en 900 medewerkers in heel Nederland.",
          status: 200,
        },
      ]),
    );
    // Zelfs met getallen in de tekst: de heuristiek mag ze niet als feit claimen.
    expect(result.company_size.value).toBeNull();
    expect(result.number_of_locations.value).toBeNull();
  });

  it("geeft triggers zonder datum, wat de trigger-score automatisch tempert", async () => {
    const { result } = await provider.research(
      input([
        {
          url: "https://voorbeeld.nl",
          title: "Home",
          text: "Binnenkort open! We openen een nieuwe vestiging. Opening volgende maand.",
          status: 200,
        },
      ]),
    );
    expect(result.triggers.length).toBeGreaterThan(0);
    expect(result.triggers.every((t) => t.date === null)).toBe(true);
  });

  it("is deterministisch", async () => {
    const sources = [
      {
        url: "https://voorbeeld.nl",
        title: "Home",
        text: "Onze winkels, acties en vacatures in heel Nederland. Volg ons op Instagram.",
        status: 200,
      },
    ];
    const a = await provider.research(input(sources));
    const b = await provider.research(input(sources));
    expect(a.result).toEqual(b.result);
  });

  it("claimt nooit de hoogste ankerwaarde van een component", async () => {
    // Trefwoorden tellen kan het topanker niet onderbouwen. Zonder deze grens
    // haalde een doorsnee-pagina al fit 90/100 en dus valse Tier A-signalen.
    const spammy = "campagne ".repeat(40) +
      "vacature ".repeat(40) +
      "winkels vestigingen filialen ".repeat(40) +
      "heel nederland landelijk ".repeat(40) +
      "actie korting sale ".repeat(40) +
      "webshop bestel bezorg ".repeat(40) +
      "instagram facebook tiktok ".repeat(40) +
      "voor jou jouw gezin klanten ".repeat(40) +
      "groei uitbreiding nieuwe vestiging ".repeat(40) +
      "abonnement ".repeat(40);

    const { result } = await provider.research(
      input([{ url: "https://voorbeeld.nl", title: "Home", text: spammy, status: 200 }]),
    );

    for (const component of result.fit_components) {
      const def = FIT_COMPONENTS.find((c) => c.key === component.key)!;
      const highest = Math.max(...def.anchors.map((a) => a.score));
      expect(
        component.score,
        `${component.key} mag het topanker (${highest}) niet halen`,
      ).toBeLessThan(highest);
    }

    // Praktisch gevolg: de heuristiek komt niet aan een Tier A-waardige fit.
    const total = result.fit_components.reduce((sum, c) => sum + c.score, 0);
    expect(total).toBeLessThanOrEqual(69);
  });
});
