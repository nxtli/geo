import type { PageCheckDeps } from "./page-check";
import { measureSpeed, SPEED_TIMEOUT_MS } from "./speed";
import { selectSearchProvider } from "./external";
import { llmBrandProbe } from "./external-llm-probe";

/**
 * The environment the page check reads from. Typed as a plain string record so
 * `process.env` is accepted as is; the keys it reads are listed below.
 */
export type PageCheckEnv = Readonly<Record<string, string | undefined>>;

/**
 * The network deps for `runPageCheck`, built from the environment. Shared by
 * the HTTP route (app/api/geo/page-check) and the MCP route (app/api/geo/mcp)
 * so both answer the same for the same input.
 *
 * - PAGESPEED_API_KEY: read here only; unset means a keyless PSI call.
 * - GEO_EXTERNAL_SEARCH_PROVIDER: picks the external check's search source;
 *   no provider ships yet, so every value (unset, "none" or other) is off.
 * - GEO_EXTERNAL_LLM_PROBE: "1" turns on the LLM brand probe (supporting only).
 */
export function pageCheckDepsFromEnv(env: PageCheckEnv = process.env): PageCheckDeps {
  const apiKey = env.PAGESPEED_API_KEY || undefined;
  const measure = (url: string) =>
    measureSpeed(url, { fetch, timeoutMs: SPEED_TIMEOUT_MS, ...(apiKey ? { apiKey } : {}) });
  const searchProvider = selectSearchProvider(env.GEO_EXTERNAL_SEARCH_PROVIDER);
  const brandProbe = env.GEO_EXTERNAL_LLM_PROBE === "1" ? llmBrandProbe : undefined;
  return {
    measureSpeed: measure,
    ...(searchProvider ? { searchProvider } : {}),
    ...(brandProbe ? { brandProbe } : {}),
  };
}
