import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStoreDriver } from "../store/file-driver";
import {
  addProspect,
  getProspect,
  listProspects,
  setStatusMany,
  setStoreForTesting,
  updateProspect,
  deleteProspect,
} from "../store";
import { createProspect, flattenProspect, FIT_SCORE_COLUMNS } from "../store/serialize";
import { FIT_COMPONENTS } from "../scoring/rubric";
import { RADIO_SCHEMA_SQL } from "../store/schema";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "radio-store-"));
  file = join(dir, "prospects.json");
  setStoreForTesting(new FileStoreDriver(file));
});

afterEach(async () => {
  setStoreForTesting(null);
  await rm(dir, { recursive: true, force: true });
});

describe("FileStoreDriver", () => {
  it("start leeg en maakt het bestand aan", async () => {
    expect(await listProspects()).toEqual([]);
    const raw = JSON.parse(await readFile(file, "utf8"));
    expect(raw.prospects).toEqual([]);
  });

  it("slaat op en leest terug", async () => {
    const { prospect } = await addProspect({
      company_name: "Test Retail BV",
      website: "testretail.nl",
    });
    expect(prospect.company_name).toBe("Test Retail BV");
    expect(prospect.website).toBe("https://testretail.nl");
    expect(prospect.status).toBe("New");

    const fetched = await getProspect(prospect.id);
    expect(fetched?.id).toBe(prospect.id);
    expect(await listProspects()).toHaveLength(1);
  });

  it("werkt bij en houdt created_at vast", async () => {
    const { prospect } = await addProspect({ company_name: "A" });
    const updated = await updateProspect(prospect.id, { status: "Contacted", notes: "gebeld" });
    expect(updated?.status).toBe("Contacted");
    expect(updated?.notes).toBe("gebeld");
    expect(updated?.created_at).toBe(prospect.created_at);
    expect(updated?.id).toBe(prospect.id);
  });

  it("geeft null bij bijwerken van een onbekend id", async () => {
    expect(await updateProspect("bestaat-niet", { status: "Won" })).toBeNull();
  });

  it("verwijdert", async () => {
    const { prospect } = await addProspect({ company_name: "Weg" });
    expect(await deleteProspect(prospect.id)).toBe(true);
    expect(await deleteProspect(prospect.id)).toBe(false);
    expect(await listProspects()).toEqual([]);
  });

  it("serialiseert gelijktijdige writes zonder er één te verliezen", async () => {
    // Dit is de race die een naïeve read-modify-write implementatie sloopt.
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        addProspect({ company_name: `Bedrijf ${i}`, website: `bedrijf${i}.nl` }),
      ),
    );
    expect(await listProspects()).toHaveLength(25);
  });

  it("overleeft een corrupt JSON-bestand zonder te crashen", async () => {
    await writeFile(file, "{ dit is geen json", "utf8");
    expect(await listProspects()).toEqual([]);
  });

  it("zet status voor meerdere prospects", async () => {
    const a = await addProspect({ company_name: "A", website: "a.nl" });
    const b = await addProspect({ company_name: "B", website: "b.nl" });
    const count = await setStatusMany([a.prospect.id, b.prospect.id], "Exported to Waalaxy");
    expect(count).toBe(2);
    const all = await listProspects();
    expect(all.every((p) => p.status === "Exported to Waalaxy")).toBe(true);
  });
});

describe("dedupe bij toevoegen", () => {
  it("herkent hetzelfde bedrijf op website (ook met www en trailing slash)", async () => {
    await addProspect({ company_name: "Coolblue", website: "https://www.coolblue.nl/" });
    const second = await addProspect({ company_name: "Coolblue NL", website: "coolblue.nl" });
    expect(second.duplicate).toBe(true);
    expect(await listProspects()).toHaveLength(1);
  });

  it("herkent hetzelfde bedrijf op naam (case-insensitive)", async () => {
    await addProspect({ company_name: "Praxis" });
    const second = await addProspect({ company_name: "  praxis " });
    expect(second.duplicate).toBe(true);
    expect(await listProspects()).toHaveLength(1);
  });

  it("verrijkt een bestaande prospect met nieuwe contactgegevens", async () => {
    const first = await addProspect({ company_name: "Gamma", website: "gamma.nl" });
    expect(first.prospect.contact.linkedin_url).toBeNull();

    const second = await addProspect({
      company_name: "Gamma",
      website: "gamma.nl",
      contact_first_name: "Eva",
      contact_last_name: "Jansen",
      linkedin_url: "https://www.linkedin.com/in/eva-jansen",
      contact_source: "csv-import",
    });
    expect(second.duplicate).toBe(true);
    expect(second.prospect.contact.first_name).toBe("Eva");
    expect(second.prospect.contact.linkedin_url).toBe("https://www.linkedin.com/in/eva-jansen");
    expect(await listProspects()).toHaveLength(1);
  });

  it("overschrijft bestaande contactgegevens NIET", async () => {
    await addProspect({
      company_name: "Hornbach",
      website: "hornbach.nl",
      contact_first_name: "Piet",
    });
    const second = await addProspect({
      company_name: "Hornbach",
      website: "hornbach.nl",
      contact_first_name: "Klaas",
    });
    expect(second.prospect.contact.first_name).toBe("Piet");
  });

  it("behandelt twee bedrijven zonder website als verschillend op naam", async () => {
    await addProspect({ company_name: "Alpha" });
    const second = await addProspect({ company_name: "Beta" });
    expect(second.duplicate).toBe(false);
    expect(await listProspects()).toHaveLength(2);
  });
});

describe("flattenProspect", () => {
  it("levert een kolom per fit-component", () => {
    const prospect = createProspect({ company_name: "X" });
    prospect.fit_components = FIT_COMPONENTS.map((c) => ({
      key: c.key,
      label: c.label,
      max: c.max,
      score: c.max,
      rationale: "r",
      basis: "fact",
    }));
    const flat = flattenProspect(prospect);
    for (const { column, key } of FIT_SCORE_COLUMNS) {
      const def = FIT_COMPONENTS.find((c) => c.key === key)!;
      expect(flat[column]).toBe(def.max);
    }
  });

  it("geeft null voor componenten van een ongescoorde prospect", () => {
    const flat = flattenProspect(createProspect({ company_name: "X" }));
    for (const { column } of FIT_SCORE_COLUMNS) {
      expect(flat[column]).toBeNull();
    }
  });

  it("bevat elke kolom uit §11 van de briefing", () => {
    const flat = flattenProspect(createProspect({ company_name: "X" }));
    const required = [
      "company_name", "website", "industry", "description", "city", "country",
      "company_size", "number_of_locations", "fit_score", "trigger_score",
      "priority_score", "tier", "b2c_score", "geographic_score", "marketing_score",
      "scale_score", "customer_value_score", "growth_score", "recruitment_score",
      "campaign_score", "awareness_score", "budget_score", "primary_trigger",
      "trigger_date", "primary_sales_angle", "angle_strength",
      "recommended_contact_role", "contact_first_name", "contact_last_name",
      "contact_title", "linkedin_url", "personalization_context",
      "opening_question", "evidence", "confidence", "date_researched", "status",
      "notes",
    ];
    for (const column of required) {
      expect(flat, `kolom ${column} ontbreekt`).toHaveProperty(column);
    }
  });

  it("heeft voor elke gevlakte kolom ook een kolom in het SQL-schema", () => {
    // Bewaakt dat de gegenereerde INSERT niet op een ontbrekende kolom knalt.
    const flat = flattenProspect(createProspect({ company_name: "X" }));
    for (const column of Object.keys(flat)) {
      expect(RADIO_SCHEMA_SQL, `kolom ${column} mist in het schema`).toMatch(
        new RegExp(`\\n\\s+${column}\\s`),
      );
    }
  });
});
