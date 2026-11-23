import { hostMatches, hostOf, profileHostOf, reviewSiteOf, type ExternalSources, EXTERNAL_SOURCES_OFF } from "../external";
import type { PageFacts } from "../facts/page";
import type { CheckDefinition, CheckResult } from "./types";
import { notFetched } from "./types";

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((v): v is string => !!v))];
}

/** The review signals on the page: rating schema, Review nodes and links (or sameAs) to review sites. */
function reviewSignals(facts: PageFacts) {
  const { ratingValue, reviewCount, reviewNodes, sameAs } = facts.jsonLd;
  const sites = unique([...facts.externalLinks, ...sameAs].map(reviewSiteOf));
  const hasSchema = ratingValue !== null || reviewNodes > 0;
  return { ratingValue, reviewCount: reviewCount ?? (reviewNodes > 0 ? reviewNodes : null), reviewNodes, sites, present: hasSchema || sites.length > 0 };
}

/** The profile signals: sameAs URLs and links to the listed social or reference profiles. */
function profileSignals(facts: PageFacts) {
  const sameAs = facts.jsonLd.sameAs;
  const linkHosts = unique(facts.externalLinks.map(profileHostOf));
  const hosts = unique([...sameAs.map(profileHostOf), ...linkHosts]);
  const sameAsHosts = unique(sameAs.map(hostOf));
  return { sameAsCount: sameAs.length, sameAsHosts, linkHosts, hosts, present: sameAs.length > 0 || linkHosts.length > 0 };
}

/** Search mentions that are not on the page's own site (or its subdomains). */
function offSiteMentions(sources: ExternalSources, pageHost: string | null): number | null {
  if (sources.search.status !== "ok") return null;
  return sources.search.mentions.filter((mention) => {
    const host = hostOf(mention.url);
    return !!host && !(pageHost && (hostMatches(host, pageHost) || hostMatches(pageHost, host)));
  }).length;
}

function evidenceOf(
  reviews: ReturnType<typeof reviewSignals>,
  profiles: ReturnType<typeof profileSignals>,
  mentions: number | null,
  sources: ExternalSources,
): string | null {
  const parts: string[] = [];
  if (reviews.ratingValue !== null) {
    parts.push(`AggregateRating ${reviews.ratingValue}${reviews.reviewCount !== null ? ` (${reviews.reviewCount} reviews)` : ""}`);
  } else if (reviews.reviewNodes > 0) {
    parts.push(`${reviews.reviewNodes} Review node(s)`);
  }
  if (reviews.sites.length > 0) parts.push(`review sites: ${reviews.sites.join(", ")}`);
  if (profiles.sameAsCount > 0) parts.push(`sameAs: ${profiles.sameAsCount} profile${profiles.sameAsCount === 1 ? "" : "s"}`);
  if (profiles.linkHosts.length > 0) parts.push(`profile links: ${profiles.linkHosts.join(", ")}`);
  if (mentions) parts.push(`search: ${mentions} mention(s) on other sites`);
  if (sources.llmProbe.status === "mentioned") parts.push(`AI probe: ${sources.llmProbe.detail}`);
  return parts.length > 0 ? parts.join("; ") : null;
}

/**
 * Confirmation of the brand outside its own site, from free signals. Three
 * groups: reviews (AggregateRating or Review schema, or a link to a review
 * site), profiles (JSON-LD sameAs, or a link to a social or reference
 * profile) and, only when a search provider is injected, search mentions on
 * other hosts. Pass: two groups or more, attention: one, fail: none. With no
 * search provider that means pass = reviews and profiles. The LLM brand
 * probe is reported in `llm_probe` but never changes the grade. Unknown
 * when the page was not fetched.
 */
export const externalCheck: CheckDefinition = {
  id: "external",
  label: "External mentions",
  run({ url, facts, external }): CheckResult {
    if (!facts) return notFetched("external");
    const sources = external ?? EXTERNAL_SOURCES_OFF;
    const reviews = reviewSignals(facts);
    const profiles = profileSignals(facts);
    const mentions = offSiteMentions(sources, hostOf(url));

    const found: string[] = [];
    const missing: string[] = [];
    (reviews.present ? found : missing).push("reviews (rating schema or a review-site link)");
    (profiles.present ? found : missing).push("profiles (sameAs or a profile link)");
    if (mentions !== null) (mentions > 0 ? found : missing).push("search mentions on other sites");

    const result = {
      rating_value: reviews.ratingValue,
      review_count: reviews.reviewCount,
      review_sites: reviews.sites,
      same_as_count: profiles.sameAsCount,
      same_as_hosts: profiles.sameAsHosts,
      profile_hosts: profiles.hosts,
      search: sources.search.status,
      search_mentions: mentions,
      llm_probe: sources.llmProbe.status,
    };
    const status = found.length >= 2 ? "pass" : found.length === 1 ? "attention" : "fail";
    const summary =
      status === "pass"
        ? `Outside confirmation found: ${found.join(", ")}.`
        : status === "attention"
          ? `Only one kind of outside confirmation found: ${found[0]}. Missing: ${missing.join(", ")}.`
          : `No outside confirmation found: no ${missing.join(", no ")}.`;
    return { id: "external", status, summary, facts: result, evidence: evidenceOf(reviews, profiles, mentions, sources) };
  },
};
