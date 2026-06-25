import type { GeoAnalysisInput, GeoAnalysisResult } from "../types";
import { logInfo } from "../logger";
import type { GeoAnalysisProvider } from "./provider";
import { MockAnalysisProvider } from "./providers/mock";
import { ClaudeAnalysisProvider } from "./providers/claude";
import { ExistingSkillAnalysisProvider } from "./providers/existing-skill";

/**
 * Analysis provider registry + selection.
 *
 * Selection order:
 *   1. GEO_ANALYSIS_PROVIDER env (explicit: "existing-skill" | "claude" | "mock")
 *   2. The existing NXTLI skill, if configured (the intended primary engine)
 *   3. The direct Claude API, if ANTHROPIC_API_KEY is set
 *   4. The deterministic mock (always available — keeps the flow working)
 *
 * Add a new engine by implementing GeoAnalysisProvider and registering it here.
 */
const registry: Record<string, GeoAnalysisProvider> = {};

function register(provider: GeoAnalysisProvider) {
  registry[provider.id] = provider;
}

register(new ExistingSkillAnalysisProvider());
register(new ClaudeAnalysisProvider());
register(new MockAnalysisProvider());

export function selectProvider(): GeoAnalysisProvider {
  const explicit = process.env.GEO_ANALYSIS_PROVIDER?.trim();
  if (explicit && registry[explicit]) return registry[explicit];

  const order = ["existing-skill", "claude", "mock"];
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
