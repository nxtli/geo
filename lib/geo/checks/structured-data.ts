import type { PageFacts } from "../facts/page";
import type { CheckDefinition, CheckResult } from "./types";
import { notFetched } from "./types";

export type PageType = "home" | "product" | "article" | "faq" | "other";

/**
 * The common article types, reported in `expected_types`. Matching is wider
 * (`isArticleType`): any type ending in "Article" or "Posting", and Report.
 */
export const ARTICLE_TYPES = ["Article", "BlogPosting", "NewsArticle"] as const;

/** Product-family types that satisfy (and infer) a product page besides `Product` itself. */
export const PRODUCT_SUBTYPES = ["ProductGroup", "IndividualProduct", "ProductModel", "SomeProducts"] as const;

/**
 * Organization subtypes accepted on a home page besides `Organization`
 * itself (and `WebSite`). Any type ending in "Organization" or "Business"
 * is accepted too (`isOrganizationType`); this list holds the rest of the
 * LocalBusiness family and Brand.
 */
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
  "Restaurant",
  "Hotel",
  "LodgingBusiness",
  "Dentist",
  "Physician",
  "MedicalClinic",
  "AutoRepair",
  "AutoDealer",
  "RealEstateAgent",
  "LegalService",
  "Attorney",
  "AccountingService",
  "FinancialService",
  "InsuranceAgency",
  "TravelAgency",
  "FoodEstablishment",
  "CafeOrCoffeeShop",
  "Bakery",
  "HairSalon",
  "BeautySalon",
  "HealthClub",
  "SportsActivityLocation",
  "EntertainmentBusiness",
  "HomeAndConstructionBusiness",
  "Electrician",
  "Plumber",
  "Brand",
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
  home: "Organization (or a subtype, including a LocalBusiness type) or WebSite",
  product: "Product (or a product type)",
  article: "an Article type (Article, BlogPosting, NewsArticle, …)",
  faq: "FAQPage",
  other: "any type",
};

/** "schema:Product" and "https://schema.org/Product" both become "Product". */
function bareType(type: string): string {
  return type.replace(/^.*[/:#]/, "");
}

function isOrganizationType(type: string): boolean {
  return /(Organization|Business)$/.test(type) || (ORGANIZATION_SUBTYPES as readonly string[]).includes(type);
}

/** Any type ending in "Article" or "Posting" (ScholarlyArticle, DiscussionForumPosting, …), and Report. */
function isArticleType(type: string): boolean {
  return /(Article|Posting)$/.test(type) || type === "Report";
}

function isProductType(type: string): boolean {
  return type === "Product" || (PRODUCT_SUBTYPES as readonly string[]).includes(type);
}

/** og:type "product", or a product subtype such as "product.item" or "og:product". */
function isProductOgType(ogType: string | null): boolean {
  return !!ogType && (ogType === "product" || ogType.startsWith("product.") || ogType.startsWith("og:product"));
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
 * product (or "product.…", "og:product…"), a product-type or an Offer node is
 * `product`; og:type article, an article-type node (`isArticleType`) or
 * article:published_time is `article`; an FAQPage node or at least FAQ_MIN_QUESTION_HEADINGS headings
 * ending in "?" is `faq`; anything else is `other`.
 */
export function inferPageType(url: string, facts: PageFacts): PageType {
  const path = pathOf(url);
  if (path === "" || path === "/") return "home";
  const types = facts.jsonLd.types.map(bareType);
  if (isProductOgType(facts.ogType) || types.some(isProductType) || types.includes("Offer")) return "product";
  if (facts.ogType === "article" || types.some(isArticleType) || facts.articlePublishedTime) {
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
  if (pageType === "article") return types.some(isArticleType);
  if (pageType === "product") return types.some(isProductType);
  return types.some((t) => EXPECTED[pageType].includes(t));
}

/**
 * JSON-LD presence and validity, scored against the page type (`blocks`
 * counts every block, valid or not). Pass: valid blocks with at least one
 * @type, including the type the page type expects, declared at the top level
 * of a block or as a top-level @graph member (`jsonLd.topLevelTypes`; a
 * publisher Organization nested in a Review does not count). Home:
 * Organization, WebSite, a type ending in "Organization" or "Business", or a
 * listed LocalBusiness type or Brand; product: Product or a product type;
 * article: a type ending in "Article" or "Posting", or Report; faq: FAQPage;
 * other: any. Attention: an invalid block, no
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
    const { blocks, invalid, types, topLevelTypes } = facts.jsonLd;
    const pageType = inferPageType(url, facts);
    // `other` accepts any type at any depth; the named expectations must be top-level.
    const expectedPresent = hasExpectedType(pageType, pageType === "other" ? types : topLevelTypes);
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
      const declared = topLevelTypes.length > 0 ? `only declares ${topLevelTypes.join(", ")}` : `declares no type (nested only: ${types.join(", ")})`;
      return attention(`Page type ${pageType} should declare ${EXPECTED_TEXT[pageType]} at the top level, but the top level ${declared}.`);
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
