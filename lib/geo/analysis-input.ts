import type { ScrapeResult } from "./scrape";
import type { GeoAnalysisInput } from "./types";

/** The lead fields the analysis reads. */
export type AnalysisLead = Pick<
  GeoAnalysisInput,
  "homepage_url" | "company_name" | "offer_description" | "target_audience" | "desired_queries" | "competitors"
>;

/**
 * The analysis input for one lead and its fetched page, as the site scan
 * (POST /api/geo/scan) and the `geo_scan_page` tool both build it, so the two
 * cannot drift apart.
 */
export function analysisInputFor(lead: AnalysisLead, page: ScrapeResult): GeoAnalysisInput {
  return {
    homepage_url: lead.homepage_url,
    company_name: lead.company_name,
    offer_description: lead.offer_description,
    target_audience: lead.target_audience,
    desired_queries: lead.desired_queries,
    competitors: lead.competitors,
    page_content: page.text,
    metadata: page.metadata,
    robots_txt: page.robotsTxt,
    llms_txt_present: page.llmsTxtPresent,
    facts: page.facts,
    robots: page.robots,
  };
}
