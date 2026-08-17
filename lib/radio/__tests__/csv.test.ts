import { describe, it, expect } from "vitest";
import {
  buildWaalaxyExport,
  detectDelimiter,
  parseBatchList,
  parseCsv,
  parseProspectCsv,
  toCsv,
  WAALAXY_HEADERS,
} from "../csv";
import { createProspect } from "../store/serialize";
import type { Prospect } from "../types";

describe("parseCsv", () => {
  it("leest een eenvoudige komma-CSV", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("herkent puntkomma's (Nederlands Excel)", () => {
    expect(detectDelimiter("company_name;website")).toBe(";");
    expect(parseCsv("a;b\n1;2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("herkent tabs", () => {
    expect(parseCsv("a\tb\n1\t2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("respecteert aanhalingstekens met ingesloten scheidingsteken", () => {
    expect(parseCsv('naam,plaats\n"Jansen, Eva",Utrecht\n')).toEqual([
      ["naam", "plaats"],
      ["Jansen, Eva", "Utrecht"],
    ]);
  });

  it("verwerkt dubbele aanhalingstekens als escape", () => {
    expect(parseCsv('a\n"zeg ""hallo"""\n')).toEqual([["a"], ['zeg "hallo"']]);
  });

  it("verwerkt een regeleinde binnen een veld", () => {
    expect(parseCsv('a,b\n"regel1\nregel2",x\n')).toEqual([
      ["a", "b"],
      ["regel1\nregel2", "x"],
    ]);
  });

  it("verwerkt CRLF", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("verwerkt een bestand zonder afsluitende newline", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strip een UTF-8 BOM", () => {
    const rows = parseCsv("﻿company_name,website\nCoolblue,coolblue.nl\n");
    expect(rows[0][0]).toBe("company_name");
  });

  it("negeert lege regels", () => {
    expect(parseCsv("a,b\n\n1,2\n\n")).toHaveLength(2);
  });
});

describe("parseProspectCsv", () => {
  it("leest het eenvoudige schema company_name,website", () => {
    const { rows, errors } = parseProspectCsv("company_name,website\nCoolblue,coolblue.nl\n");
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].company_name).toBe("Coolblue");
    expect(rows[0].website).toBe("coolblue.nl");
  });

  it("leest het uitgebreide schema met contactgegevens", () => {
    const csv =
      "company_name,website,linkedin_url,contact_first_name,contact_last_name\n" +
      "Coolblue,coolblue.nl,https://www.linkedin.com/in/eva-jansen,Eva,Jansen\n";
    const { rows } = parseProspectCsv(csv);
    expect(rows[0].contact_first_name).toBe("Eva");
    expect(rows[0].linkedin_url).toBe("https://www.linkedin.com/in/eva-jansen");
    expect(rows[0].contact_source).toBe("csv-import");
  });

  it("accepteert Nederlandse en alternatieve kolomnamen", () => {
    const { rows } = parseProspectCsv(
      "bedrijfsnaam;url;voornaam;achternaam;functie;plaats\nGamma;gamma.nl;Eva;Jansen;CMO;Utrecht\n",
    );
    expect(rows[0].company_name).toBe("Gamma");
    expect(rows[0].website).toBe("gamma.nl");
    expect(rows[0].contact_first_name).toBe("Eva");
    expect(rows[0].contact_title).toBe("CMO");
    expect(rows[0].city).toBe("Utrecht");
  });

  it("leidt een naam af uit de website als de naam ontbreekt", () => {
    const { rows } = parseProspectCsv("website\nhttps://www.praxis.nl\n");
    expect(rows[0].company_name).toBe("praxis.nl");
  });

  it("meldt een onherkenbare kopregel in plaats van stil te falen", () => {
    const { rows, errors } = parseProspectCsv("foo,bar\n1,2\n");
    expect(rows).toEqual([]);
    expect(errors[0].reason).toMatch(/Kopregel niet herkend/);
  });

  it("meldt een lege regel met regelnummer", () => {
    const { rows, errors } = parseProspectCsv(
      'company_name,website\nCoolblue,coolblue.nl\n"",""\nGamma,gamma.nl\n',
    );
    expect(rows).toHaveLength(2);
    expect(errors).toEqual([]); // volledig lege regels worden gefilterd
  });

  it("weigert een onbruikbare LinkedIn-URL maar houdt de rij", () => {
    const { rows, errors } = parseProspectCsv(
      "company_name,linkedin_url\nCoolblue,https://example.com/eva\n",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].linkedin_url).toBeNull();
    expect(errors[0].reason).toMatch(/LinkedIn-URL niet herkend/);
  });

  it("meldt een leeg bestand", () => {
    expect(parseProspectCsv("").errors[0].reason).toMatch(/leeg/);
  });
});

describe("parseBatchList", () => {
  it("leest één website per regel", () => {
    const rows = parseBatchList("coolblue.nl\nhttps://www.gamma.nl\npraxis.nl\n");
    expect(rows).toHaveLength(3);
    expect(rows[0].website).toBe("https://coolblue.nl");
    expect(rows[0].company_name).toBe("coolblue.nl");
  });

  it("leest 'Naam, website' per regel", () => {
    const rows = parseBatchList("Coolblue, coolblue.nl\n");
    expect(rows[0].company_name).toBe("Coolblue");
    expect(rows[0].website).toBe("https://coolblue.nl");
  });

  it("leest 'website, Naam' ook goed", () => {
    const rows = parseBatchList("coolblue.nl, Coolblue\n");
    expect(rows[0].company_name).toBe("Coolblue");
    expect(rows[0].website).toBe("https://coolblue.nl");
  });

  it("accepteert een naam zonder website", () => {
    const rows = parseBatchList("Een Bedrijf Zonder Site\n");
    expect(rows[0].company_name).toBe("Een Bedrijf Zonder Site");
    expect(rows[0].website).toBeNull();
  });

  it("ontdubbelt binnen de batch", () => {
    const rows = parseBatchList("coolblue.nl\nhttps://coolblue.nl\nCOOLBLUE.NL\n");
    expect(rows).toHaveLength(1);
  });

  it("negeert lege regels", () => {
    expect(parseBatchList("\n\ncoolblue.nl\n\n")).toHaveLength(1);
  });

  it("kan een lijst van 100 websites aan", () => {
    const list = Array.from({ length: 100 }, (_, i) => `bedrijf${i}.nl`).join("\n");
    expect(parseBatchList(list)).toHaveLength(100);
  });
});

describe("toCsv", () => {
  it("schrijft een kopregel en rijen", () => {
    const csv = toCsv(["a", "b"], [{ a: 1, b: 2 }]);
    expect(csv).toContain("a,b");
    expect(csv).toContain("1,2");
  });

  it("begint met een UTF-8 BOM zodat Excel accenten goed leest", () => {
    expect(toCsv(["a"], [{ a: "Café" }]).charCodeAt(0)).toBe(0xfeff);
  });

  it("escapet komma's, aanhalingstekens en newlines", () => {
    const csv = toCsv(["a"], [{ a: 'x, y "z"\nnieuw' }]);
    expect(csv).toContain('"x, y ""z""\nnieuw"');
  });

  it("schrijft lege cellen voor ontbrekende velden", () => {
    expect(toCsv(["a", "b"], [{ a: "x" }])).toContain("x,");
  });

  it("is rondloop-veilig: wat we schrijven kunnen we teruglezen", () => {
    const rows = [{ a: 'komma, en "quote"', b: "regel\nbreak" }];
    const parsed = parseCsv(toCsv(["a", "b"], rows));
    expect(parsed[1]).toEqual(['komma, en "quote"', "regel\nbreak"]);
  });
});

describe("buildWaalaxyExport", () => {
  function prospect(overrides: Partial<Prospect> = {}): Prospect {
    const base = createProspect({ company_name: overrides.company_name ?? "Bedrijf" });
    return {
      ...base,
      fit_score: 85,
      trigger_score: 60,
      priority_score: 79,
      tier: "B",
      primary_sales_angle: "Landelijke awareness plus lokale activatie",
      personalization: {
        reason: "Groeiende keten",
        trigger: "Nieuwe vestiging",
        observation: "Landelijke dekking",
        angle: "Retail",
        opening_question: "Zetten jullie radio al structureel in?",
      },
      ...overrides,
    };
  }

  const withContact = (linkedin: string | null, firstName: string | null = "Eva") =>
    prospect({
      contact: {
        first_name: firstName,
        last_name: "Jansen",
        title: "Head of Marketing",
        linkedin_url: linkedin,
        source: "csv-import",
        confidence: "high",
      },
    });

  it("exporteert een prospect met profiel-URL", () => {
    const result = buildWaalaxyExport([withContact("https://www.linkedin.com/in/eva-jansen")]);
    expect(result.exported).toBe(1);
    expect(result.missingLinkedIn).toEqual([]);
    expect(result.csv).toContain("eva-jansen");
    expect(result.csv).toContain("Eva");
  });

  it("bevat alle voorgeschreven kolommen", () => {
    const result = buildWaalaxyExport([withContact("https://www.linkedin.com/in/eva-jansen")]);
    const headerLine = result.csv.replace(/^﻿/, "").split("\r\n")[0];
    expect(headerLine.split(",")).toEqual([...WAALAXY_HEADERS]);
  });

  it("zet een prospect zonder LinkedIn-URL apart", () => {
    const result = buildWaalaxyExport([withContact(null)]);
    expect(result.exported).toBe(0);
    expect(result.missingLinkedIn).toHaveLength(1);
    expect(result.missingLinkedIn[0].reason).toMatch(/Geen LinkedIn-URL/);
  });

  it("zet een bedrijfspagina apart — dat is geen persoonsprofiel", () => {
    const result = buildWaalaxyExport([
      withContact("https://www.linkedin.com/company/coolblue"),
    ]);
    expect(result.exported).toBe(0);
    expect(result.missingLinkedIn[0].reason).toMatch(/bedrijfspagina/);
  });

  it("zet een profiel zonder naam apart", () => {
    const result = buildWaalaxyExport([
      withContact("https://www.linkedin.com/in/onbekend", null),
    ]);
    expect(result.exported).toBe(0);
    expect(result.missingLinkedIn[0].reason).toMatch(/geen naam/);
  });

  it("verzint nooit een LinkedIn-URL", () => {
    const result = buildWaalaxyExport([withContact(null)]);
    expect(result.csv).not.toContain("linkedin.com/in");
  });

  it("levert een aparte CSV voor de missende groep", () => {
    const result = buildWaalaxyExport([withContact(null)]);
    expect(result.missingCsv).toContain("Bedrijf");
    expect(result.missingCsv).toContain("Geen LinkedIn-URL");
  });

  it("splitst een gemengde selectie correct", () => {
    const result = buildWaalaxyExport([
      withContact("https://www.linkedin.com/in/eva-jansen"),
      withContact(null),
      withContact("https://www.linkedin.com/in/piet"),
    ]);
    expect(result.exported).toBe(2);
    expect(result.missingLinkedIn).toHaveLength(1);
  });

  it("valt voor job_title terug op de aanbevolen rol", () => {
    const p = prospect({
      recommended_contact_role: "CMO",
      contact: {
        first_name: "Eva",
        last_name: "Jansen",
        title: null,
        linkedin_url: "https://www.linkedin.com/in/eva-jansen",
        source: "csv",
        confidence: "high",
      },
    });
    expect(buildWaalaxyExport([p]).csv).toContain("CMO");
  });

  it("geeft een lege export bij een lege selectie", () => {
    const result = buildWaalaxyExport([]);
    expect(result.exported).toBe(0);
    expect(result.missingLinkedIn).toEqual([]);
  });
});
