import type { PageFacts } from "../facts/page";
import type { CheckDefinition, CheckResult } from "./types";
import { notFetched } from "./types";

export type PageType = "home" | "product" | "article" | "faq" | "other";

/** Schema.org types that make a page an article, and that an article page is expected to declare. */
export const ARTICLE_TYPES = ["Article", "BlogPosting", "NewsArticle"] as const;

/** Organization subtypes accepted on a home page besides `Organization` itself (and `WebSite`). */
export const ORGANIZATION_SUBTYPES = [
  "Corporation",
  "LocalBusiness",
  "OnlineBusiness",
  "OnlineStore",
  "Store",
  "ProfessionalService",
  "EducationalOrganization",
  "GovernmentOrganization",
  "MedicalOrganization",
  "NewsMediaOrganization",
  "NGO",
  "SportsOrganization",
  "PerformingGroup",
  "Airline",
] as const;

/** A page counts as an FAQ without FAQPage markup when at least this many headings end in "?". */
export const FAQ_MIN_QUESTION_HEADINGS = 3;

/** What each page type is expected to declare, as reported in `expected_types`. */
const EXPECTED: Record<PageType, string[]> = {
  home: ["Organization", "WebSite"],
  product: ["Product"],
  article: [...ARTICLE_TYPES],
  faq: ["FAQPage"],
  other: [],
};

/** The same expectation in words, for the attention summary. */
const EXPECTED_TEXT: Record<PageType, string> = {
  home: "Organization (or a subtype) or WebSite",
  product: "Product",
  article: "Article, BlogPosting or NewsArticle",
  faq: "FAQPage",
  other: "any type",
};

/** "schema:Product" and "https://schema.org/Product" both become "Product". */
function bareType(type: string): string {
  return type.replace(/^.*[/:#]/, "");
}

function isOrganizationType(type: string): boolean {
  return type === "Organization" || /Organization$/.test(type) || (ORGANIZATION_SUBTYPES as readonly string[]).includes(type);
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

/**
 * The kind of page, first match wins: the site root is `home`; og:type
 * product or a Product/Offer node is `product`; og:type article, an
 * Article/BlogPosting/NewsArticle node or article:published_time is
 * `article`; an FAQPage node or at least FAQ_MIN_QUESTION_HEADINGS headings
 * ending in "?" is `faq`; anything else is `other`.
 */
export function inferPageType(url: string, facts: PageFacts): PageType {
  const path = pathOf(url);
  if (path === "" || path === "/") return "home";
  const types = facts.jsonLd.types.map(bareType);
  if (facts.ogType === "product" || types.includes("Product") || types.includes("Offer")) return "product";
  if (facts.ogType === "article" || types.some((t) => (ARTICLE_TYPES as readonly string[]).includes(t)) || facts.articlePublishedTime) {
    return "article";
  }
  const questions = facts.headings.filter((h) => h.text.trim().endsWith("?")).length;
  if (types.includes("FAQPage") || questions >= FAQ_MIN_QUESTION_HEADINGS) return "faq";
  return "other";
}

/** Whether the declared types include what the page type expects; any type will do for `other`. */
export function hasExpectedType(pageType: PageType, declared: string[]): boolean {
  const types = declared.map(bareType);
  if (pageType === "other") return types.length > 0;
  if (pageType === "home") return types.includes("WebSite") || types.some(isOrganizationType);
  return types.some((t) => EXPECTED[pageType].includes(t));
}

/**
 * JSON-LD presence and validity, scored against the page type (`blocks`
 * counts every block, valid or not). Pass: valid blocks with at least one
 * @type, including the type the page type expects (home: Organization or a
 * subtype, or WebSite; product: Product; article: Article/BlogPosting/
 * NewsArticle; faq: FAQPage; other: any). Attention: an invalid block, no
 * JSON-LD, blocks without any @type, or types without the expected one.
 * Never fail. Review and AggregateRating only show up in `types`; they are
 * graded by the external check. Evidence: the page type and the types
 * found, or null when no type was found.
 */
export const structuredDataCheck: CheckDefinition = {
  id: "structured_data",
  label: "Structured data",
  run({ url, facts }): CheckResult {
    if (!facts) return notFetched("structured_data");
    const { blocks, invalid, types } = facts.jsonLd;
    const pageType = inferPageType(url, facts);
    const expectedPresent = hasExpectedType(pageType, types);
    const result = {
      blocks,
      invalid_blocks: invalid,
      types,
      page_type: pageType,
      expected_types: [...EXPECTED[pageType]],
      expected_present: expectedPresent,
    };
    const evidence = types.length > 0 ? `page type: ${pageType}; types: ${types.join(", ")}` : null;
    const attention = (summary: string): CheckResult => ({ id: "structured_data", status: "attention", summary, facts: result, evidence });

    if (invalid > 0) return attention(`${invalid} of ${blocks} JSON-LD block(s) are invalid JSON and are ignored.`);
    if (blocks === 0) return attention("No JSON-LD found on the page.");
    if (types.length === 0) return attention(`${blocks} JSON-LD block(s), but no types declared (no @type).`);
    if (!expectedPresent) {
      return attention(`Page type ${pageType} should declare ${EXPECTED_TEXT[pageType]}, but the JSON-LD only declares ${types.join(", ")}.`);
    }
    return {
      id: "structured_data",
      status: "pass",
      summary: `Page type ${pageType}: ${blocks} JSON-LD block(s), types: ${types.join(", ")}.`,
      facts: result,
      evidence,
    };
  },
};
