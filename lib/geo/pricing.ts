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
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-fable-5": { input: 10, output: 50 },
};

const DEFAULT_PRICE: Price = PRICES["claude-opus-4-8"];

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
