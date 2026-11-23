import { probeLlmVisibility } from "./analysis/llm-visibility";
import type { BrandProbe } from "./external";

/**
 * The brand probe for the external check, built on the scan's multi-LLM
 * visibility probe (lib/geo/analysis/llm-visibility.ts), which is called
 * as-is: it only reads the company name, asks every engine whose API key is
 * set, and honours GEO_AI_SEARCH=off. No engine answering (no keys, or the
 * probe switched off) is an error, not "not mentioned". Every call costs one
 * API call per configured engine.
 */
export const llmBrandProbe: BrandProbe = async (brand, hostname) => {
  const rows = await probeLlmVisibility({
    homepage_url: `https://${hostname}/`,
    company_name: brand,
    offer_description: "",
    target_audience: "",
    desired_queries: "",
  });
  if (rows.length === 0) throw new Error("no LLM engine answered");
  const recognisedBy = rows.filter((row) => row.found).map((row) => row.engine);
  return recognisedBy.length > 0
    ? { mentioned: true, detail: `recognised by ${recognisedBy.join(", ")}` }
    : { mentioned: false, detail: `not recognised by ${rows.map((row) => row.engine).join(", ")}` };
};
