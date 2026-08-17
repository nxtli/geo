/**
 * Kosten in euro's.
 *
 * De Anthropic-API rekent in dollars. Eric denkt in euro's, dus rekenen we om
 * met één vaste koers. Bewust GEEN live koers ophalen: dat is een extra
 * afhankelijkheid en een extra faalpunt voor een bedrag dat toch een indicatie
 * is. De koers staat in één constante en is met RADIO_EUR_PER_USD aan te passen
 * als hij te ver afwijkt.
 *
 * De bedragen zijn wat de API-call kost, niet wat een prospect "waard" is —
 * verwar ze niet met een kostprijs per lead.
 */

import { callCostUsd } from "../geo/pricing";

/** Fallback-koers: EUR per USD. Stand medio 2026, ruim afgerond. */
export const DEFAULT_EUR_PER_USD = 0.92;

export function eurPerUsd(): number {
  const raw = process.env.RADIO_EUR_PER_USD;
  if (!raw) return DEFAULT_EUR_PER_USD;
  const parsed = Number(raw.replace(",", "."));
  // Onzin negeren in plaats van een verkeerd bedrag laten zien.
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10) return DEFAULT_EUR_PER_USD;
  return parsed;
}

export function usdToEur(usd: number): number {
  if (!Number.isFinite(usd)) return 0;
  return usd * eurPerUsd();
}

/**
 * Euro's als leesbaar bedrag. Kleine bedragen krijgen extra decimalen: "€ 0,00"
 * bij een echte kostenpost leest als gratis, en dat is misleidend.
 */
export function formatEur(usd: number): string {
  const eur = usdToEur(usd);
  if (eur > 0 && eur < 0.01) return "< € 0,01";
  const digits = eur < 1 ? 3 : 2;
  return `€ ${eur.toFixed(digits).replace(".", ",")}`;
}

/** Dollarbedrag, voor wie het naast de Anthropic-factuur wil leggen. */
export function formatUsd(usd: number): string {
  if (usd > 0 && usd < 0.01) return "< $0.01";
  return `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
}

/** "€ 0,012 ($0.013)" — beide, zodat de factuur te controleren is. */
export function formatCost(usd: number): string {
  return `${formatEur(usd)} (${formatUsd(usd)})`;
}

/* -------------------------------------------------------------------------- */
/* Schatting vooraf                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Wat een ronde ongeveer gaat kosten, vóórdat je hem start.
 *
 * Een SCHATTING, met opzet aan de ruime kant. De aannames staan hieronder
 * expliciet, zodat ze te controleren zijn tegen de werkelijke kosten die na de
 * ronde in de historie staan.
 *
 * De grootste post bij zoeken is niet het model maar de zoekresultaten: die
 * komen als tekst in de context terecht en worden bij élke volgende modelturn
 * opnieuw als input gerekend. Meer zoekopdrachten is dus meer dan lineair
 * duurder — daarom staat er een krappe grens op.
 */

/** Inputtokens die één webzoekopdracht gemiddeld aan context toevoegt (en herhaalt). */
const TOKENS_PER_SEARCH = 8_000;
/** Vaste inputtokens van de zoekstap: systeemprompt, zoektermen, bekende bedrijven. */
const DISCOVERY_BASE_INPUT = 3_000;
/** Outputtokens per gerapporteerd bedrijf, plus een vaste marge voor denkwerk. */
const OUTPUT_PER_CANDIDATE = 60;
const DISCOVERY_BASE_OUTPUT = 1_500;
/** Normalisatiestap: verslag + toegestane URL's erin, JSON eruit. */
const FORMAT_BASE_INPUT = 2_500;
const FORMAT_OUTPUT_PER_CANDIDATE = 70;

/**
 * Research per bedrijf: de instructie zit in de gecachte systeemprompt, de
 * paginateksten in het bericht. Gemeten waarden bij 4 pagina's van 3.500 tekens.
 */
const RESEARCH_INPUT_PER_COMPANY = 6_000;
const RESEARCH_CACHED_INPUT = 3_000;
const RESEARCH_OUTPUT_PER_COMPANY = 1_800;

/** Geschatte kosten van één zoekrichting (USD). */
export function estimateDiscoveryUsd(options: {
  perQuery: number;
  searches: number;
  searchModel: string;
  formatModel: string;
}): number {
  const searchStep = callCostUsd({
    model: options.searchModel,
    input_tokens: DISCOVERY_BASE_INPUT + options.searches * TOKENS_PER_SEARCH,
    output_tokens: DISCOVERY_BASE_OUTPUT + options.perQuery * OUTPUT_PER_CANDIDATE,
    web_searches: options.searches,
  });
  const formatStep = callCostUsd({
    model: options.formatModel,
    input_tokens: FORMAT_BASE_INPUT + options.perQuery * OUTPUT_PER_CANDIDATE,
    output_tokens: options.perQuery * FORMAT_OUTPUT_PER_CANDIDATE,
  });
  return searchStep + formatStep;
}

/**
 * Geschatte kosten van het onderzoeken van N bedrijven (USD).
 * Het eerste bedrijf schrijft de cache, de rest leest hem — daarom is de
 * gemiddelde prijs per bedrijf lager naarmate de batch groter is.
 */
export function estimateResearchUsd(companies: number, model: string): number {
  if (companies <= 0) return 0;
  const first = callCostUsd({
    model,
    input_tokens: RESEARCH_INPUT_PER_COMPANY,
    output_tokens: RESEARCH_OUTPUT_PER_COMPANY,
    cache_creation_input_tokens: RESEARCH_CACHED_INPUT,
  });
  const rest = callCostUsd({
    model,
    input_tokens: RESEARCH_INPUT_PER_COMPANY,
    output_tokens: RESEARCH_OUTPUT_PER_COMPANY,
    cache_read_input_tokens: RESEARCH_CACHED_INPUT,
  });
  return first + rest * (companies - 1);
}
