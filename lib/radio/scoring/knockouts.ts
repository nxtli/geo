/**
 * Knock-outcriteria (§4 van de briefing).
 *
 * Levert LEESBARE redenen op waarom een bedrijf op LOW PRIORITY / SKIP hoort.
 * Bewust géén absolute regel: de research mag een `radio_use_case_override`
 * meegeven met een concrete radio-use-case, en dan blijft het bedrijf staan.
 * De redenen én de override blijven altijd zichtbaar in de UI, zodat Eric zelf
 * kan zien waaróm iets is weggezet.
 */

import type { FitComponentKey, FitComponentScore, ResearchResult } from "../types";

/** Drempel waaronder de informatie te dun is om iets zinnigs te zeggen. */
export const MIN_RESEARCH_CONFIDENCE = 25;

export interface KnockoutInput {
  components: FitComponentScore[];
  research_confidence: number;
  purely_specialist_b2b?: ResearchResult["purely_specialist_b2b"];
  serves_dutch_market?: ResearchResult["serves_dutch_market"];
  appears_active?: ResearchResult["appears_active"];
}

function scoreOf(components: FitComponentScore[], key: FitComponentKey): number {
  return components.find((c) => c.key === key)?.score ?? 0;
}

/**
 * Bepaal de knock-outredenen. Leeg = geen knock-out.
 *
 * Let op de `=== false` checks: alleen een expliciet vastgesteld "nee" is een
 * knock-out. `null` (onbekend) is dat niet — dat wordt hooguit afgestraft via
 * de research-confidence.
 */
export function detectKnockouts(input: KnockoutInput): string[] {
  const reasons: string[] = [];
  const { components } = input;

  const b2c = scoreOf(components, "b2c");
  const geographic = scoreOf(components, "geographic");
  const scale = scoreOf(components, "scale");

  if (input.purely_specialist_b2b?.value === true) {
    reasons.push("Puur specialistisch B2B — consumentenbereik via radio is niet relevant.");
  }
  if (input.serves_dutch_market?.value === false) {
    reasons.push("Bedient de Nederlandse markt niet.");
  }
  if (input.appears_active?.value === false) {
    reasons.push("Bedrijf lijkt niet meer actief.");
  }
  if (b2c === 0) {
    reasons.push("Consumenten zijn vrijwel nooit onderdeel van de doelgroep.");
  }
  if (scale === 0) {
    reasons.push("Nauwelijks commerciële schaal.");
  }
  if (geographic <= 3 && scale <= 2) {
    reasons.push(
      "Extreem klein lokaal bedrijf zonder duidelijke radiocase (beperkt bereik én beperkte schaal).",
    );
  }
  if (input.research_confidence < MIN_RESEARCH_CONFIDENCE) {
    reasons.push(
      `Onvoldoende betrouwbare informatie gevonden (research confidence ${input.research_confidence}/100).`,
    );
  }

  return reasons;
}
