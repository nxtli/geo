/**
 * Radio Fit Score — de canonieke rubric (§3 van de briefing).
 *
 * Tien componenten waarvan de maxima optellen tot exact 100. Dit bestand is de
 * enige bron van waarheid: de research-prompt wordt eruit gegenereerd, de
 * scoring-engine klemt ertegen, en de UI leest de labels hieruit. Een model kan
 * de schaal dus niet stilletjes verschuiven.
 *
 * Elke component heeft vaste ANKERWAARDEN uit de briefing. Een teruggegeven
 * score wordt naar het dichtstbijzijnde anker geklemd (bij gelijke afstand naar
 * beneden — bewust conservatief, een prospecttool mag niet opblazen).
 */

import type { FitComponentKey } from "../types";

export interface FitAnchor {
  score: number;
  /** Wanneer deze score van toepassing is. Gaat mee in de prompt. */
  when: string;
}

export interface FitComponentDef {
  key: FitComponentKey;
  /** Letter uit de briefing (A–J), voor herkenbaarheid in UI en prompt. */
  letter: string;
  label: string;
  max: number;
  /** Wat deze component meet. Gaat mee in de prompt. */
  description: string;
  anchors: readonly FitAnchor[];
}

export const FIT_COMPONENTS: readonly FitComponentDef[] = [
  {
    key: "b2c",
    letter: "A",
    label: "B2C / consumentenrelevantie",
    max: 20,
    description:
      "Hoe relevant is een breed consumentenpubliek voor dit bedrijf? Radio is massamedium: hoe breder de consumentendoelgroep, hoe hoger.",
    anchors: [
      { score: 20, when: "duidelijk consumentenmerk/product/dienst met grote potentiële doelgroep" },
      { score: 15, when: "sterk B2C, maar doelgroep enigszins beperkt" },
      { score: 10, when: "mix B2B/B2C" },
      { score: 5, when: "voornamelijk niche" },
      { score: 0, when: "puur specialistisch B2B" },
    ],
  },
  {
    key: "geographic",
    letter: "B",
    label: "Geografisch bereik",
    max: 15,
    description:
      "Hoe groot is het verzorgingsgebied? Regionale spelers blijven interessant omdat regionale radio relevant kan zijn.",
    anchors: [
      { score: 15, when: "landelijk actief" },
      { score: 12, when: "meerdere regio's" },
      { score: 8, when: "sterke regionale speler" },
      { score: 3, when: "één lokaal verzorgingsgebied" },
      { score: 0, when: "hyperlokaal / nauwelijks schaalbaar" },
    ],
  },
  {
    key: "marketing",
    letter: "C",
    label: "Marketing maturity",
    max: 15,
    description:
      "Signalen van marketingvolwassenheid: actieve campagnes, professionele website, actieve socials, advertenties, branding, acties, sponsorships, video, performance marketing, marketingteam, marketingvacatures.",
    anchors: [
      { score: 15, when: "duidelijk volwassen adverteerder" },
      { score: 10, when: "actief met marketing" },
      { score: 5, when: "beperkte marketingactiviteit" },
      { score: 0, when: "nauwelijks signalen" },
    ],
  },
  {
    key: "scale",
    letter: "D",
    label: "Schaal / meerdere vestigingen",
    max: 10,
    description: "Omvang van de organisatie en het aantal vestigingen of de grootte van de markt.",
    anchors: [
      { score: 10, when: "grote keten / veel vestigingen / zeer grote markt" },
      { score: 8, when: "meerdere vestigingen of grote landelijke operatie" },
      { score: 5, when: "groeiende organisatie" },
      { score: 2, when: "kleine organisatie" },
      { score: 0, when: "microbedrijf zonder schaalpotentie" },
    ],
  },
  {
    key: "customer_value",
    letter: "E",
    label: "Customer value",
    max: 10,
    description:
      "Hebben extra klanten voldoende economische waarde om paid media interessant te maken? Relatief hoge waarde: automotive, wonen, energie, telecom, financiële diensten, opleidingen, reizen, recruitment, abonnementen, grote e-commerce orders.",
    anchors: [
      { score: 10, when: "zeer hoge klantwaarde" },
      { score: 7, when: "goede klantwaarde" },
      { score: 4, when: "gemiddelde klantwaarde" },
      { score: 1, when: "zeer lage orderwaarde/marge" },
      // 0 is geen briefing-anker maar wel nodig: gebruik het alleen als er
      // werkelijk geen enkel signaal over klantwaarde is.
      { score: 0, when: "geen enkel signaal over klantwaarde beschikbaar" },
    ],
  },
  {
    key: "growth",
    letter: "F",
    label: "Groei / expansie",
    max: 10,
    description:
      "Signalen van groei: nieuwe locaties, uitbreiding, nieuwe markt, recente investering, sterke groei, franchising, nieuwe productcategorie, nieuwe website/branding, uitbreiding team.",
    anchors: [
      { score: 10, when: "sterke actuele groei" },
      { score: 5, when: "algemene groei-indicaties" },
      { score: 0, when: "geen signaal" },
    ],
  },
  {
    key: "recruitment",
    letter: "G",
    label: "Recruitment-potentieel",
    max: 5,
    description: "Openstaande vacatures en structurele wervingsbehoefte. Recruitment is een aparte radio-angle.",
    anchors: [
      { score: 5, when: "veel openstaande vacatures / structurele recruitmentbehoefte" },
      { score: 3, when: "enkele vacatures" },
      { score: 0, when: "geen duidelijke recruitmentbehoefte" },
    ],
  },
  {
    key: "campaign",
    letter: "H",
    label: "Campagne / seizoen / actiepotentieel",
    max: 5,
    description:
      "Concrete campagne-aanleidingen: vakanties, Black Friday, kerst, zomer, festival, sale, nieuwe collectie, evenement, productlaunch, opening, verkiezing, abonnementscampagne.",
    anchors: [
      { score: 5, when: "sterke campagne-aanleiding" },
      { score: 3, when: "redelijke campagne-aanleiding" },
      { score: 0, when: "geen duidelijk moment" },
    ],
  },
  {
    key: "awareness",
    letter: "I",
    label: "Awareness-afhankelijkheid",
    max: 5,
    description: "Hoe belangrijk zijn merkbekendheid en top-of-mind voor de aankoopbeslissing?",
    anchors: [
      { score: 5, when: "merkbekendheid en top-of-mind zijn zeer belangrijk" },
      { score: 3, when: "gedeeltelijk belangrijk" },
      { score: 0, when: "puur rationele/niche aankoop" },
    ],
  },
  {
    key: "budget",
    letter: "J",
    label: "Waarschijnlijk mediabudget",
    max: 5,
    description:
      "Alleen op basis van ZICHTBARE bedrijfs- en marketingsignalen. Verzin geen omzetcijfers; bij onbekend budget expliciet als inschatting markeren.",
    anchors: [
      { score: 5, when: "duidelijk waarschijnlijk serieus mediabudget" },
      { score: 3, when: "waarschijnlijk enig marketingbudget" },
      { score: 1, when: "klein budget" },
      { score: 0, when: "zeer onwaarschijnlijk dat er mediabudget is" },
    ],
  },
] as const;

/** Maximale fit-score. Moet 100 zijn — bewaakt door een unit test. */
export const FIT_MAX_SCORE = FIT_COMPONENTS.reduce((sum, c) => sum + c.max, 0);

const BY_KEY = new Map(FIT_COMPONENTS.map((c) => [c.key, c]));

export function fitComponent(key: FitComponentKey): FitComponentDef | undefined {
  return BY_KEY.get(key);
}

/**
 * Klem een score binnen [0, max] en snap naar het dichtstbijzijnde anker.
 * Bij gelijke afstand wint het LAGERE anker (conservatief).
 */
export function snapToAnchor(def: FitComponentDef, raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  const clamped = Math.max(0, Math.min(def.max, raw));
  let best = def.anchors[0].score;
  let bestDistance = Number.POSITIVE_INFINITY;
  // Loop van laag naar hoog zodat een gelijke afstand het lagere anker houdt.
  const ascending = [...def.anchors].sort((a, b) => a.score - b.score);
  for (const anchor of ascending) {
    const distance = Math.abs(anchor.score - clamped);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = anchor.score;
    }
  }
  return best;
}

/** De rubric als tekst voor de research-prompt. */
export function fitRubricPrompt(): string {
  return FIT_COMPONENTS.map((c) => {
    const anchors = c.anchors
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((a) => `      ${a.score} = ${a.when}`)
      .join("\n");
    return `${c.letter}. ${c.label} (key: "${c.key}", 0-${c.max})\n   ${c.description}\n   Toegestane scores (gebruik EXACT een van deze waarden):\n${anchors}`;
  }).join("\n\n");
}
