/**
 * Trigger Score (§5 van de briefing) — "waarom zou Eric dit bedrijf NÚ bellen?"
 *
 * Puur en deterministisch. Elke trigger krijgt:
 *
 *     bijdrage = basisgewicht(soort) × recency(datum) × confidence
 *
 * Daarna worden de bijdragen aflopend gesorteerd en met AFNEMENDE OPBRENGST
 * opgeteld, zodat het sterkste, meest recente signaal domineert en een stapel
 * vage signalen nooit hetzelfde gewicht krijgt als één concrete aanleiding.
 * Dat is precies de eis uit de briefing.
 */

import type { Confidence, ProspectTrigger, TriggerKind } from "../types";

/**
 * Basisgewicht per triggersoort: wat één trigger van deze soort oplevert bij
 * perfecte recency (≤30 dagen) en high confidence.
 */
const BASE_WEIGHT: Record<TriggerKind, number> = {
  funding: 58,
  new_location: 58,
  expansion: 55,
  product_launch: 55,
  acquisition: 52,
  new_market: 52,
  new_marketing_lead: 50,
  hiring_surge: 48,
  strong_growth: 48,
  new_campaign: 45,
  rebranding: 45,
  major_promotion: 42,
  event: 38,
  sponsorship: 36,
  anniversary: 32,
  new_season: 30,
  other: 20,
};

/** Nederlandse labels voor de UI. */
export const TRIGGER_KIND_LABELS: Record<TriggerKind, string> = {
  funding: "Funding / investering",
  new_location: "Nieuwe vestiging",
  expansion: "Expansie",
  product_launch: "Productlancering",
  acquisition: "Overname",
  new_market: "Nieuwe markt",
  new_marketing_lead: "Nieuwe marketingverantwoordelijke",
  hiring_surge: "Veel vacatures",
  strong_growth: "Sterke groei",
  new_campaign: "Nieuwe campagne",
  rebranding: "Rebranding",
  major_promotion: "Grote actie",
  event: "Evenement",
  sponsorship: "Sponsoractiviteit",
  anniversary: "Jubileum",
  new_season: "Nieuw seizoen",
  other: "Overig signaal",
};

/** Recency-factor. Datum onbekend = 0.5: algemene info weegt lichter. */
export function recencyFactor(date: string | null, now: number): number {
  if (!date) return 0.5;
  const parsed = Date.parse(date);
  if (!Number.isFinite(parsed)) return 0.5;
  const days = (now - parsed) / 86_400_000;
  // Een datum in de (nabije) toekomst is een aangekondigd moment — dat is een
  // volwaardige aanleiding, dus even zwaar als "deze maand".
  if (days < 0) return 1;
  if (days <= 30) return 1;
  if (days <= 90) return 0.85;
  if (days <= 180) return 0.65;
  if (days <= 365) return 0.4;
  return 0.15;
}

const CONFIDENCE_FACTOR: Record<Confidence, number> = {
  high: 1,
  medium: 0.75,
  low: 0.45,
};

/** Afnemende opbrengst per positie in de aflopend gesorteerde lijst. */
const DIMINISHING = [1, 0.6, 0.4, 0.25];
const DIMINISHING_TAIL = 0.15;

export interface TriggerScoreResult {
  score: number;
  /** Dezelfde triggers, met `weight` gevuld en aflopend gesorteerd. */
  triggers: ProspectTrigger[];
  /** De zwaarst wegende trigger, of null bij geen triggers. */
  primary: ProspectTrigger | null;
}

/**
 * Bereken de trigger-score (0–100).
 *
 * @param triggers Gevalideerde triggers (elk met een echte bron-URL).
 * @param now      Referentietijdstip in ms. Injecteerbaar voor tests.
 */
export function computeTriggerScore(
  triggers: ProspectTrigger[],
  now: number = Date.now(),
): TriggerScoreResult {
  if (triggers.length === 0) {
    return { score: 0, triggers: [], primary: null };
  }

  const weighted = triggers.map((t) => {
    const base = BASE_WEIGHT[t.kind] ?? BASE_WEIGHT.other;
    const weight = base * recencyFactor(t.date, now) * CONFIDENCE_FACTOR[t.confidence];
    return { ...t, weight: Math.round(weight * 10) / 10 };
  });

  weighted.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));

  let total = 0;
  weighted.forEach((t, index) => {
    const factor = DIMINISHING[index] ?? DIMINISHING_TAIL;
    total += (t.weight ?? 0) * factor;
  });

  const score = Math.max(0, Math.min(100, Math.round(total)));
  return { score, triggers: weighted, primary: weighted[0] ?? null };
}

/** Normaliseer een vrije triggersoort naar een bekende kind. */
export function normalizeTriggerKind(value: string | null | undefined): TriggerKind {
  if (!value) return "other";
  const needle = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (needle in BASE_WEIGHT) return needle as TriggerKind;

  const aliases: Array<[RegExp, TriggerKind]> = [
    [/funding|investering|investment|kapitaal|financiering/, "funding"],
    [/new_location|nieuwe_vestiging|vestiging|opening|filiaal|store_opening/, "new_location"],
    [/expansion|expansie|uitbreiding|franchis/, "expansion"],
    [/product_launch|launch|lancering|nieuwe_collectie|nieuw_product/, "product_launch"],
    [/acquisition|overname|acquisitie|merger|fusie/, "acquisition"],
    [/new_market|nieuwe_markt|internationaal|export/, "new_market"],
    [/marketing_lead|cmo|marketingdirecteur|marketing_director|nieuwe_marketing/, "new_marketing_lead"],
    [/hiring|vacature|vacancies|recruit|personeel/, "hiring_surge"],
    [/growth|groei|omzetstijging/, "strong_growth"],
    [/campaign|campagne/, "new_campaign"],
    [/rebrand|nieuwe_huisstijl|restyl|nieuwe_website/, "rebranding"],
    [/promotion|actie|sale|black_friday|korting/, "major_promotion"],
    [/event|evenement|festival|beurs/, "event"],
    [/sponsor/, "sponsorship"],
    [/anniversary|jubileum|bestaat_\d+_jaar/, "anniversary"],
    [/season|seizoen/, "new_season"],
  ];
  for (const [re, kind] of aliases) {
    if (re.test(needle)) return kind;
  }
  return "other";
}
