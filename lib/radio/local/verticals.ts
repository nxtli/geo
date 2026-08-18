/**
 * Lokale MKB-branches waar de EIGENAAR over het mediabudget beslist.
 *
 * Dit is de kern van de simpele route: geen AI die bedenkt welke bedrijven
 * interessant zijn, maar een vaste lijst branches waarvan we al weten dat het
 * klopt. Beddenspeciaalzaken, tuincentra, autogarages — consumentgericht, hoge
 * klantwaarde per verkoop, en één iemand die beslist. Precies waar een gesprek
 * over regionale radio kort en concreet kan zijn.
 *
 * Per branche staan er drie dingen in:
 *
 *  1. `osm` — de tags waarmee OpenStreetMap dit soort zaken labelt. Dat is de
 *     bron van de bedrijvenlijst: gratis, geen API-key, en voor lokale winkels
 *     compléter dan een websearch (die vindt vooral ketens en top-10-artikelen).
 *  2. `linkedin_terms` — de branchewoorden voor een LinkedIn-zoekopdracht. De
 *     tool bouwt daar een zoek-URL van; hij scrapet LinkedIn niet en verzint
 *     nooit een profiel-URL.
 *  3. `angle` — waarom radio hier past, in één regel. Statische tekst, geen
 *     modelcall: bij deze branches is de angle een eigenschap van de branche,
 *     niet van het individuele bedrijf.
 *
 * Een branche toevoegen is één item in deze lijst.
 */

/** Eén OSM-selector: tag + waarde. */
export interface OsmSelector {
  key: string;
  value: string;
}

export interface LocalVertical {
  key: string;
  label: string;
  /** OSM-tags die dit soort bedrijf aanduiden. */
  osm: OsmSelector[];
  /** Branchewoorden voor de LinkedIn-zoekopdracht. */
  linkedin_terms: string[];
  /** Segment uit RADIO_SEGMENTS, of null als geen enkel segment echt past. */
  segment: string | null;
  /** Waarom radio bij deze branche past — één regel, voor de notities. */
  angle: string;
}

export const LOCAL_VERTICALS: readonly LocalVertical[] = [
  {
    key: "tuincentrum",
    label: "Tuincentrum",
    osm: [{ key: "shop", value: "garden_centre" }],
    linkedin_terms: ["tuincentrum", "tuincentra"],
    segment: "home_living",
    angle:
      "Sterk seizoensgebonden: voorjaar, moederdag, najaarsplanting. Radio werkt om in een korte piek veel bezoekers naar een fysieke locatie te trekken.",
  },
  {
    key: "beddenzaak",
    label: "Beddenspeciaalzaak",
    osm: [{ key: "shop", value: "bed" }],
    linkedin_terms: ["beddenspeciaalzaak", "beddenwinkel", "slaapcomfort"],
    segment: "home_living",
    angle:
      "Hoge klantwaarde per verkoop en een lange oriëntatie. Radio houdt de naam in het hoofd tot iemand er echt aan toe is.",
  },
  {
    key: "keukenzaak",
    label: "Keukenzaak",
    osm: [{ key: "shop", value: "kitchen" }],
    linkedin_terms: ["keukenzaak", "keukenstudio", "keukens"],
    segment: "home_living",
    angle:
      "Aankoop van duizenden euro's met een showroombezoek als eerste stap. Radio is geschikt om die eerste stap uit te lokken.",
  },
  {
    key: "meubelzaak",
    label: "Meubelzaak",
    osm: [{ key: "shop", value: "furniture" }],
    linkedin_terms: ["meubelzaak", "woonwinkel", "interieurwinkel"],
    segment: "home_living",
    angle:
      "Actie- en opruimingsperiodes met een harde deadline. Radio zet in een week een piek in de showroom.",
  },
  {
    key: "badkamer_sanitair",
    label: "Badkamer & sanitair",
    osm: [{ key: "shop", value: "bathroom_furnishing" }],
    linkedin_terms: ["badkamerspecialist", "sanitair", "badkamers"],
    segment: "home_living",
    angle:
      "Verbouwbeslissing met hoge orderwaarde en veel vergelijken. Bekendheid in de regio bepaalt wie er op de shortlist staat.",
  },
  {
    key: "vloeren",
    label: "Vloerenspecialist",
    osm: [{ key: "shop", value: "flooring" }],
    linkedin_terms: ["vloerenspecialist", "parketzaak", "vloeren"],
    segment: "home_living",
    angle:
      "Wordt gekocht bij een verhuizing of verbouwing — een moment dat je niet kunt targeten, maar wel kunt vóórzijn met bekendheid.",
  },
  {
    key: "zonwering",
    label: "Zonwering",
    osm: [{ key: "shop", value: "window_blind" }],
    linkedin_terms: ["zonwering", "raamdecoratie", "screens rolluiken"],
    segment: "home_living",
    angle:
      "Uitgesproken seizoen: de eerste warme week bepaalt het jaar. Radio is snel in te zetten op precies dat moment.",
  },
  {
    key: "kozijnen",
    label: "Kozijnen & glas",
    osm: [{ key: "craft", value: "window_construction" }],
    linkedin_terms: ["kozijnen", "kunststof kozijnen", "glaszetter"],
    segment: "home_living",
    angle:
      "Hoge orderwaarde, en de keuze valt vaak op de partij die je al kent. Regionale bekendheid is hier het hele verhaal.",
  },
  {
    key: "dakdekker",
    label: "Dakdekker",
    osm: [{ key: "craft", value: "roofer" }],
    linkedin_terms: ["dakdekker", "dakspecialist", "dakwerken"],
    segment: null,
    angle:
      "Wordt gebeld bij schade of onderhoud. Wie in het hoofd zit als het regent, krijgt het telefoontje.",
  },
  {
    key: "hovenier",
    label: "Hovenier",
    osm: [{ key: "craft", value: "gardener" }],
    linkedin_terms: ["hovenier", "hoveniersbedrijf", "tuinaanleg"],
    segment: null,
    angle:
      "Voorjaarspiek in aanvragen, met opdrachten van enkele duizenden euro's. Radio in maart en april vult de agenda voor het seizoen.",
  },
  {
    key: "zwembad_spa",
    label: "Zwembad & spa",
    osm: [{ key: "shop", value: "swimming_pool" }],
    linkedin_terms: ["zwembadbouwer", "zwembaden", "spa wellness"],
    segment: "home_living",
    angle:
      "Zeer hoge orderwaarde en een kort beslismoment aan het begin van de zomer.",
  },
  {
    key: "autogarage",
    label: "Autogarage & onderhoud",
    osm: [
      { key: "shop", value: "car_repair" },
      { key: "shop", value: "tyres" },
    ],
    linkedin_terms: ["autogarage", "autobedrijf", "garagebedrijf"],
    segment: "automotive",
    angle:
      "Terugkerende klanten met vaste momenten (APK, winterwissel). Radio bouwt de naam die iemand kiest als de oude garage tegenvalt.",
  },
  {
    key: "autodealer",
    label: "Autodealer & occasions",
    osm: [{ key: "shop", value: "car" }],
    linkedin_terms: ["autodealer", "autobedrijf", "occasions"],
    segment: "automotive",
    angle:
      "Hoogste klantwaarde van deze lijst en een duidelijk actiemoment. Automotive is bovendien een van de best bewezen radiocategorieën.",
  },
  {
    key: "camper_caravan",
    label: "Camper & caravan",
    osm: [{ key: "shop", value: "caravan" }],
    linkedin_terms: ["campers", "caravans", "recreatievoertuigen"],
    segment: "automotive",
    angle:
      "Grote aankoop met een scherp seizoen rond de voorjaarsbeurzen. Radio werkt om beursbezoek en showroomtraffic te sturen.",
  },
  {
    key: "motoren",
    label: "Motoren & scooters",
    osm: [{ key: "shop", value: "motorcycle" }],
    linkedin_terms: ["motordealer", "motorzaak", "scooters"],
    segment: "automotive",
    angle: "Seizoensstart in het voorjaar, met een duidelijk aan te spreken publiek.",
  },
  {
    key: "fietsenzaak",
    label: "Fietsenzaak & e-bikes",
    osm: [{ key: "shop", value: "bicycle" }],
    linkedin_terms: ["fietsenzaak", "rijwielhandel", "e-bike specialist"],
    segment: "retail",
    angle:
      "E-bikes hebben de orderwaarde van deze branche opgetild naar duizenden euro's, met een voorjaarspiek.",
  },
  {
    key: "sportschool",
    label: "Sportschool & fitness",
    osm: [{ key: "leisure", value: "fitness_centre" }],
    linkedin_terms: ["sportschool", "fitnessclub", "personal training"],
    segment: "fitness",
    angle:
      "Abonnementen met terugkerende omzet en een keiharde piek in januari. Radio is daar het klassieke kanaal voor.",
  },
  {
    key: "rijschool",
    label: "Rijschool",
    osm: [{ key: "amenity", value: "driving_school" }],
    linkedin_terms: ["rijschool", "verkeersschool", "rijopleiding"],
    segment: "education",
    angle:
      "Elk jaar een nieuwe lichting achttienjarigen, en ouders die meebeslissen. Radio bereikt beide.",
  },
  {
    key: "makelaar",
    label: "Makelaar",
    osm: [{ key: "office", value: "estate_agent" }],
    linkedin_terms: ["makelaar", "makelaardij", "NVM makelaar"],
    segment: null,
    angle:
      "Concurreert op bekendheid in een afgebakend gebied: wie de verkoper als eerste bedenkt, krijgt de opdracht.",
  },
  {
    key: "uitvaart",
    label: "Uitvaartonderneming",
    osm: [{ key: "shop", value: "funeral_directors" }],
    linkedin_terms: ["uitvaartonderneming", "uitvaartverzorging"],
    segment: null,
    angle:
      "Wordt nooit gezocht en altijd herinnerd. Vertrouwdheid in de regio is hier de enige marketing die werkt.",
  },
  {
    key: "reisbureau",
    label: "Reisbureau",
    osm: [{ key: "shop", value: "travel_agency" }],
    linkedin_terms: ["reisbureau", "reisorganisatie", "touroperator"],
    segment: "travel",
    angle:
      "Hoge klantwaarde per boeking en een scherp boekingsseizoen (januari, en de weken na een vakantie).",
  },
  {
    key: "dierenspeciaalzaak",
    label: "Dierenspeciaalzaak",
    osm: [{ key: "shop", value: "pet" }],
    linkedin_terms: ["dierenspeciaalzaak", "dierenwinkel"],
    segment: "retail",
    angle: "Trouwe, terugkerende klanten en een duidelijk af te bakenen publiek.",
  },
  {
    key: "opticien",
    label: "Opticien & audicien",
    osm: [
      { key: "shop", value: "optician" },
      { key: "shop", value: "hearing_aids" },
    ],
    linkedin_terms: ["opticien", "optiekzaak", "audicien"],
    segment: "retail",
    angle:
      "Hoge orderwaarde per bril of hoortoestel, en een publiek dat radio nog echt gebruikt.",
  },
  {
    key: "evenementenlocatie",
    label: "Evenementen & locaties",
    osm: [
      { key: "amenity", value: "events_venue" },
      { key: "amenity", value: "conference_centre" },
    ],
    linkedin_terms: ["evenementenlocatie", "partycentrum", "evenementenbureau"],
    segment: "leisure_events",
    angle:
      "Verkoopt tickets of zaalverhuur met een harde datum. Radio is bij een deadline het snelste kanaal dat er is.",
  },
  {
    key: "bouwmarkt",
    label: "Bouwmarkt & tuinhout",
    osm: [
      { key: "shop", value: "doityourself" },
      { key: "shop", value: "hardware" },
    ],
    linkedin_terms: ["bouwmarkt", "houthandel", "bouwmaterialen"],
    segment: "retail",
    angle: "Actieweken en seizoenspieken, met een groot en breed regionaal publiek.",
  },
] as const;

const BY_KEY = new Map(LOCAL_VERTICALS.map((v) => [v.key, v]));

export function findVertical(key: string | null | undefined): LocalVertical | null {
  if (!key) return null;
  return BY_KEY.get(key.trim().toLowerCase()) ?? null;
}

/** Normaliseer een lijst branche-keys; onbekende waarden vallen weg. */
export function normalizeVerticals(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out = new Set<string>();
  for (const value of values) {
    const found = findVertical(typeof value === "string" ? value : null);
    if (found) out.add(found.key);
  }
  return [...out];
}

/**
 * Bij welke branche hoort dit OSM-object?
 *
 * Meerdere branches kunnen dezelfde tag gebruiken (een autogarage met tyres);
 * de eerste match in lijstvolgorde wint, zodat de uitkomst voorspelbaar is.
 */
export function verticalForTags(
  tags: Record<string, string>,
  among: readonly LocalVertical[] = LOCAL_VERTICALS,
): LocalVertical | null {
  for (const vertical of among) {
    for (const selector of vertical.osm) {
      if (tags[selector.key] === selector.value) return vertical;
    }
  }
  return null;
}
