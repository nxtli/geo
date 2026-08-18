/**
 * Lokale MKB-route: branchelijst, Overpass-query, kaartdata inlezen en de
 * LinkedIn-zoeklinks.
 *
 * Deze tests draaien op VASTE voorbeelddata, niet op de echte kaartdienst. Dat
 * is bewust — een test die het internet nodig heeft faalt op de verkeerde
 * momenten — maar het betekent ook dat ze niet bewijzen dat de dienst zelf
 * antwoordt zoals verwacht. Wat ze wél bewaken: de query is geldig, ontbrekende
 * velden worden niet aangevuld, en er komt nooit een verzonnen profiel-URL uit.
 */

import { describe, it, expect } from "vitest";
import {
  LOCAL_VERTICALS,
  findVertical,
  normalizeVerticals,
  verticalForTags,
} from "../local/verticals";
import { buildQuery, parseOverpass, tagsByElement } from "../local/overpass";
import {
  OWNER_ROLE_TERMS,
  ownerSearchUrl,
  peopleSearchUrl,
  verticalSearchQuery,
  verticalSearchUrl,
} from "../linkedin-search";
import { RADIO_SEGMENTS } from "../segments";
import { PROVINCES } from "../provinces";

/** Antwoord zoals Overpass het teruggeeft: elements met type, id en tags. */
const OVERPASS_SAMPLE = {
  version: 0.6,
  elements: [
    {
      type: "node",
      id: 123,
      lat: 51.44,
      lon: 5.47,
      tags: {
        name: "Tuincentrum De Groene Vinger",
        shop: "garden_centre",
        "addr:city": "Weert",
        "addr:street": "Roermondseweg 12",
        "addr:postcode": "6004 AR",
        website: "https://degroenevinger.nl",
        phone: "+31 495 123456",
      },
    },
    {
      type: "way",
      id: 456,
      center: { lat: 51.5, lon: 5.5 },
      tags: {
        name: "Intratuin Roermond",
        shop: "garden_centre",
        brand: "Intratuin",
        "addr:city": "Roermond",
      },
    },
    {
      type: "node",
      id: 789,
      tags: {
        name: "Autobedrijf Janssen",
        shop: "car_repair",
        "contact:website": "www.autojanssen.nl",
        "contact:phone": "0475-123456",
      },
    },
    // Geen naam: kan niet opgezocht worden, moet wegvallen.
    { type: "node", id: 999, tags: { shop: "garden_centre", "addr:city": "Venlo" } },
    // Onbekend type: negeren.
    { type: "note", id: 1000, tags: { name: "Rommel" } },
  ],
};

describe("branchelijst", () => {
  it("heeft unieke keys, een label en minstens één OSM-tag", () => {
    expect(new Set(LOCAL_VERTICALS.map((v) => v.key)).size).toBe(LOCAL_VERTICALS.length);
    for (const vertical of LOCAL_VERTICALS) {
      expect(vertical.label.length, vertical.key).toBeGreaterThan(2);
      expect(vertical.osm.length, vertical.key).toBeGreaterThan(0);
      expect(vertical.linkedin_terms.length, vertical.key).toBeGreaterThan(0);
      expect(vertical.angle.length, vertical.key).toBeGreaterThan(20);
    }
  });

  it("verwijst alleen naar bestaande segmenten", () => {
    const keys = new Set(RADIO_SEGMENTS.map((s) => s.key));
    for (const vertical of LOCAL_VERTICALS) {
      if (vertical.segment !== null) {
        expect(keys.has(vertical.segment), `${vertical.key}: ${vertical.segment}`).toBe(true);
      }
    }
  });

  it("normaliseert keys en gooit onbekende weg", () => {
    expect(normalizeVerticals(["tuincentrum", "TUINCENTRUM", "onzin"])).toEqual(["tuincentrum"]);
    expect(normalizeVerticals("tuincentrum")).toEqual([]);
    expect(findVertical("beddenzaak")?.label).toBe("Beddenspeciaalzaak");
    expect(findVertical("bakker")).toBeNull();
  });

  it("wijst tags toe aan de juiste branche", () => {
    expect(verticalForTags({ shop: "garden_centre" })?.key).toBe("tuincentrum");
    expect(verticalForTags({ craft: "roofer" })?.key).toBe("dakdekker");
    expect(verticalForTags({ shop: "bakery" })).toBeNull();
  });

  it("kijkt alleen binnen de gekozen branches", () => {
    const only = LOCAL_VERTICALS.filter((v) => v.key === "autogarage");
    expect(verticalForTags({ shop: "garden_centre" }, only)).toBeNull();
    expect(verticalForTags({ shop: "car_repair" }, only)?.key).toBe("autogarage");
  });
});

describe("Overpass-query", () => {
  it("gebruikt de ISO-code van de provincie en de tags van de branches", () => {
    const query = buildQuery("limburg", LOCAL_VERTICALS.filter((v) => v.key === "tuincentrum"));
    expect(query).toContain('area["ISO3166-2"="NL-LI"]');
    expect(query).toContain('nwr["shop"="garden_centre"](area.zoekgebied);');
    expect(query).toContain("[out:json]");
    expect(query).toContain("out center tags;");
  });

  it("ontdubbelt tags die in meerdere branches voorkomen", () => {
    const query = buildQuery("limburg", [...LOCAL_VERTICALS]);
    const occurrences = query.split('nwr["shop"="car_repair"]').length - 1;
    expect(occurrences).toBe(1);
  });

  it("weigert een onbekende provincie in plaats van een lege query te sturen", () => {
    expect(() => buildQuery("texas", [...LOCAL_VERTICALS])).toThrow(/onbekende_provincie/);
  });

  it("weigert een lege branchelijst", () => {
    expect(() => buildQuery("limburg", [])).toThrow(/geen_branches/);
  });

  it("kan voor elke provincie een query bouwen", () => {
    for (const province of PROVINCES) {
      expect(() => buildQuery(province.key, [...LOCAL_VERTICALS]), province.key).not.toThrow();
    }
  });
});

describe("kaartdata inlezen", () => {
  const places = parseOverpass(OVERPASS_SAMPLE);

  it("leest naam, plaats, website en telefoon", () => {
    const tuincentrum = places.find((p) => p.name.startsWith("Tuincentrum"))!;
    expect(tuincentrum.city).toBe("Weert");
    expect(tuincentrum.website).toBe("https://degroenevinger.nl");
    expect(tuincentrum.phone).toBe("+31 495 123456");
    expect(tuincentrum.source_url).toBe("https://www.openstreetmap.org/node/123");
  });

  it("accepteert ook de contact:-varianten van de tags", () => {
    const garage = places.find((p) => p.name === "Autobedrijf Janssen")!;
    expect(garage.website).toBe("https://www.autojanssen.nl");
    expect(garage.phone).toBe("0475-123456");
  });

  it("laat ontbrekende velden leeg in plaats van ze aan te vullen", () => {
    const garage = places.find((p) => p.name === "Autobedrijf Janssen")!;
    expect(garage.city).toBeNull();
    expect(garage.postcode).toBeNull();
  });

  it("herkent een filiaal van een keten aan de merknaam-tag", () => {
    const chain = places.find((p) => p.name === "Intratuin Roermond")!;
    expect(chain.chain).toBe("Intratuin");
    const independent = places.find((p) => p.name === "Autobedrijf Janssen")!;
    expect(independent.chain).toBeNull();
  });

  it("laat objecten zonder naam weg", () => {
    // Zonder naam kun je niemand opzoeken, dus zo'n rij is waardeloos.
    expect(places).toHaveLength(3);
    expect(places.some((p) => !p.name)).toBe(false);
  });

  it("negeert onbekende objecttypes", () => {
    expect(places.some((p) => p.name === "Rommel")).toBe(false);
  });

  it("overleeft rommel in plaats van te crashen", () => {
    expect(parseOverpass(null)).toEqual([]);
    expect(parseOverpass({})).toEqual([]);
    expect(parseOverpass({ elements: "geen lijst" })).toEqual([]);
    expect(parseOverpass({ elements: [{}, { type: "node" }] })).toEqual([]);
  });

  it("houdt de tags per object bij, zodat de branche te bepalen is", () => {
    const tags = tagsByElement(OVERPASS_SAMPLE);
    expect(tags.get("node/123")?.shop).toBe("garden_centre");
    expect(verticalForTags(tags.get("node/789")!)?.key).toBe("autogarage");
  });
});

describe("LinkedIn-zoeklinks", () => {
  it("bouwt een people-search-URL, geen profiel-URL", () => {
    const url = ownerSearchUrl("Tuincentrum De Groene Vinger", { city: "Weert" });
    expect(url.startsWith("https://www.linkedin.com/search/results/people/")).toBe(true);
    // Dit is de kern: nooit /in/<iemand> construeren.
    expect(url).not.toContain("/in/");
  });

  it("zet de bedrijfsnaam, de rollen en de plaats in de zoekopdracht", () => {
    const keywords = decodeURIComponent(
      new URL(ownerSearchUrl("Autobedrijf Janssen", { city: "Venlo" })).searchParams.get(
        "keywords",
      )!,
    );
    expect(keywords).toContain('"Autobedrijf Janssen"');
    expect(keywords).toContain('"eigenaar"');
    expect(keywords).toContain('"Venlo"');
    expect(keywords).toContain(" AND ");
  });

  it("zet meerdere rollen in een OR-groep", () => {
    const query = verticalSearchQuery({ terms: ["tuincentrum"], region: "Limburg" });
    expect(query).toContain(" OR ");
    expect(query).toContain('("eigenaar"');
    expect(query).toContain('"tuincentrum"');
    expect(query).toContain('"Limburg"');
  });

  it("gebruikt geen haakjes bij één term", () => {
    const query = verticalSearchQuery({ terms: ["tuincentrum"], roles: ["eigenaar"] });
    expect(query).toBe('"eigenaar" AND "tuincentrum"');
  });

  it("laat de regio weg als die er niet is", () => {
    expect(verticalSearchQuery({ terms: ["tuincentrum"], roles: ["eigenaar"] })).not.toContain(
      "Limburg",
    );
    expect(verticalSearchQuery({ terms: ["tuincentrum"], roles: ["eigenaar"], region: "  " }))
      .not.toContain('""');
  });

  it("ontsnapt aanhalingstekens in plaats van de zoekopdracht te breken", () => {
    const query = decodeURIComponent(
      new URL(ownerSearchUrl('Jansen "de Echte" BV')).searchParams.get("keywords")!,
    );
    expect(query).toBe(
      '"Jansen de Echte BV" AND ("eigenaar" OR "directeur" OR "mede-eigenaar" OR "bedrijfsleider")',
    );
  });

  it("valt terug op de kale zoekpagina bij een lege naam", () => {
    expect(ownerSearchUrl("   ")).toBe("https://www.linkedin.com/search/results/people/");
    expect(peopleSearchUrl("")).toBe("https://www.linkedin.com/search/results/people/");
  });

  it("kan voor elke branche een zoeklink bouwen", () => {
    for (const vertical of LOCAL_VERTICALS) {
      for (const province of PROVINCES) {
        const url = verticalSearchUrl({
          terms: vertical.linkedin_terms,
          region: province.label,
        });
        expect(url, `${vertical.key}/${province.key}`).toContain("keywords=");
        expect(url).not.toContain("/in/");
      }
    }
  });

  it("houdt de rollenlijst kort — LinkedIn weegt lange reeksen slechter", () => {
    expect(OWNER_ROLE_TERMS.length).toBeLessThanOrEqual(5);
  });
});
