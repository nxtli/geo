/**
 * Model pricing for cost reporting (USD per 1M tokens).
 * Source: Anthropic model pricing. Update when prices change — costs are
 * computed from stored token counts, so changes apply without backfilling.
 */
interface Price {
  input: number;
  output: number;
}

const PRICES: Record<string, Price> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-fable-5": { input: 10, output: 50 },
};

const DEFAULT_PRICE: Price = PRICES["claude-opus-4-8"];

/**
 * Kosten van gecachte input.
 *
 * Een cache-write kost 1,25× de normale inputprijs, een cache-read 0,1×. Bij een
 * prompt die bij elk bedrijf hetzelfde begin heeft, betaal je de eerste keer een
 * kwart extra en daarna een tiende — dat is de hele reden om te cachen.
 */
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

/** Prijs van één webzoekopdracht via de server-side web-search tool (USD). */
export const WEB_SEARCH_COST_USD = 10 / 1000;

/** Resolve a price by model id, tolerating date suffixes / unknown models. */
function priceFor(model: string | null): Price {
  if (!model) return DEFAULT_PRICE;
  if (PRICES[model]) return PRICES[model];
  const match = Object.keys(PRICES).find((k) => model.startsWith(k));
  return match ? PRICES[match] : DEFAULT_PRICE;
}

/** USD cost of one analysis call. */
export function costUsd(
  model: string | null,
  inputTokens: number | null,
  outputTokens: number | null,
): number {
  const p = priceFor(model);
  const inTok = inputTokens ?? 0;
  const outTok = outputTokens ?? 0;
  return (inTok / 1_000_000) * p.input + (outTok / 1_000_000) * p.output;
}

/**
 * USD-kosten van één call, inclusief cache-effect en webzoekopdrachten.
 *
 * Uitbreiding van `costUsd` voor de radio-tool, die caching gebruikt en
 * webzoekopdrachten doet. `inputTokens` is bij een cache-hit alleen het
 * ONGECACHTE deel — dat is ook hoe de API het rapporteert.
 */
export function callCostUsd(usage: {
  model: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  web_searches?: number | null;
}): number {
  const p = priceFor(usage.model);
  const perMillion = (tokens: number, price: number) => (tokens / 1_000_000) * price;

  return (
    perMillion(usage.input_tokens ?? 0, p.input) +
    perMillion(usage.output_tokens ?? 0, p.output) +
    perMillion((usage.cache_creation_input_tokens ?? 0) * CACHE_WRITE_MULTIPLIER, p.input) +
    perMillion((usage.cache_read_input_tokens ?? 0) * CACHE_READ_MULTIPLIER, p.input) +
    (usage.web_searches ?? 0) * WEB_SEARCH_COST_USD
  );
}

/** USD → EUR using ADMIN_EUR_PER_USD (default 0.92). */
export function usdToEur(usd: number): number {
  const rate = Number(process.env.ADMIN_EUR_PER_USD) || 0.92;
  return usd * rate;
}

export function fmtUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

export function fmtEur(usd: number): string {
  return `€${usdToEur(usd).toFixed(2)}`;
}
