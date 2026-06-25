import type { GeoAnalysisInput, GeoAnalysisResult } from "../types";
import { logInfo } from "../logger";
import type { GeoAnalysisProvider } from "./provider";
import { MockAnalysisProvider } from "./providers/mock";
import { ClaudeAnalysisProvider } from "./providers/claude";
import { GeoSkillAnalysisProvider } from "./providers/geo-skill";

/**
 * Analysis provider registry + selection.
 *
 * Default (auto) selection order:
 *   1. GEO_ANALYSIS_PROVIDER env (explicit: "claude" | "geo-skill" | "mock")
 *   2. The Claude provider, which runs the NXTLI `geo-page-checker` methodology
 *      one-shot (see lib/geo/analysis/prompt.ts) — needs ANTHROPIC_API_KEY.
 *   3. The deterministic mock (always available — keeps the flow working).
 *
 * `geo-skill` (invoking the interactive geo-page-checker skill via the Messages
 * API container.skills) is registered but NOT auto-selected: that skill is
 * built for interactive Cowork use (checkpoints, human-assisted PageSpeed, no
 * container internet) and is a poor fit for a one-shot automated scan. Use it
 * only via an explicit GEO_ANALYSIS_PROVIDER=geo-skill override.
 */
const registry: Record<string, GeoAnalysisProvider> = {};

function register(provider: GeoAnalysisProvider) {
  registry[provider.id] = provider;
}

register(new GeoSkillAnalysisProvider());
register(new ClaudeAnalysisProvider());
register(new MockAnalysisProvider());

export function selectProvider(): GeoAnalysisProvider {
  const explicit = process.env.GEO_ANALYSIS_PROVIDER?.trim();
  if (explicit && registry[explicit]) return registry[explicit];

  const order = ["claude", "mock"];
  for (const id of order) {
    const p = registry[id];
    if (p?.isConfigured()) return p;
  }
  return registry["mock"];
}

export interface RunAnalysisOutcome {
  result: GeoAnalysisResult;
  providerId: string;
  /** True when we fell back to the mock because the real engine failed. */
  degraded: boolean;
}

/**
 * Run the GEO analysis with the selected provider. On a hard failure of a
 * real provider, fall back to the mock so the visitor always gets a result —
 * the caller learns via `degraded` so it can flag a manual follow-up.
 */
export async function runGeoAnalysis(
  input: GeoAnalysisInput,
): Promise<RunAnalysisOutcome> {
  const provider = selectProvider();
  logInfo("analysis", `using provider "${provider.id}"`);

  try {
    const result = await provider.analyze(input);
    return { result, providerId: provider.id, degraded: false };
  } catch {
    if (provider.id === "mock") throw new Error("analysis_failed");
    logInfo("analysis", `provider "${provider.id}" failed — falling back to mock`);
    const result = await registry["mock"].analyze(input);
    return { result, providerId: "mock", degraded: true };
  }
}

export type { GeoAnalysisProvider };
