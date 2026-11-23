import { describe, it, expect } from "vitest";
import { extractPageFacts } from "../facts/page";
import { analyzeRobots } from "../facts/robots";
import type { ScrapeResult } from "../scrape";
import { runChecks } from "../checks";
import { inferPageType } from "../checks/structured-data";

const NOW = new Date("2026-11-23T12:00:00Z");
const HOME = "https://voorbeeld.example/";
const INNER = "https://voorbeeld.example/diensten/lease";

function ld(...nodes: unknown[]): string {
  return nodes.map((node) => `<script type="application/ld+json">${JSON.stringify(node)}</script>`).join("");
}

function page(head: string, body = "<h1>Pagina</h1><p>tekst</p>"): string {
  return `<html><head><title>Pagina</title>${head}</head><body>${body}</body></html>`;
}

function scrapeOf(html: string, url: string): ScrapeResult {
  return {
    text: null,
    metadata: { fetched: true, status: 200 },
    robotsTxt: "",
    llmsTxtPresent: false,
    facts: extractPageFacts(html, url),
    robots: analyzeRobots("", url),
  };
}

function structuredData(html: string, url = INNER) {
  const [result] = runChecks(scrapeOf(html, url), url, ["structured_data"], NOW);
  return result;
}

function typeOf(html: string, url = INNER) {
  return inferPageType(url, extractPageFacts(html, url));
}

const QUESTIONS = "<h1>Vragen</h1><h2>Wat kost het?</h2><h2>Hoe lang duurt het?</h2><h2>Kan ik opzeggen?</h2>";

describe("inferPageType", () => {
  it.each([
    ["the site root", HOME],
    ["an empty path", "https://voorbeeld.example"],
  ])("is home for %s, whatever the page declares", (_label, url) => {
    expect(typeOf(page(`<meta property="og:type" content="article">${ld({ "@type": "Product" })}`), url)).toBe("home");
  });

  it.each([
    ["og:type product", page('<meta property="og:type" content="product">')],
    ["a Product node", page(ld({ "@type": "Product", name: "Fiets" }))],
    ["an Offer node", page(ld({ "@type": "Offer", price: "10" }))],
  ])("is product for %s", (_label, html) => {
    expect(typeOf(html)).toBe("product");
  });

  it.each([
    ["og:type article", page('<meta property="og:type" content="article">')],
    ["a BlogPosting node", page(ld({ "@type": "BlogPosting" }))],
    ["a NewsArticle node", page(ld({ "@type": "NewsArticle" }))],
    ["article:published_time", page('<meta property="article:published_time" content="2026-10-01">')],
  ])("is article for %s", (_label, html) => {
    expect(typeOf(html)).toBe("article");
  });

  it("is faq for an FAQPage node", () => {
    expect(typeOf(page(ld({ "@type": "FAQPage" })))).toBe("faq");
  });

  it("is faq for three headings that end in a question mark", () => {
    expect(typeOf(page("", QUESTIONS))).toBe("faq");
  });

  it("is other for two question headings", () => {
    expect(typeOf(page("", "<h1>Vragen</h1><h2>Wat kost het?</h2><h2>Hoe lang duurt het?</h2>"))).toBe("other");
  });

  it("prefers product over article when both signals are present", () => {
    expect(typeOf(page(`<meta property="og:type" content="article">${ld({ "@type": "Product" })}`))).toBe("product");
  });

  it("reads prefixed types such as schema:Product", () => {
    expect(typeOf(page(ld({ "@type": "schema:Product" })))).toBe("product");
  });
});

describe("structured_data per page type", () => {
  it.each([
    ["Organization", { "@type": "Organization", name: "Voorbeeld BV" }],
    ["a LocalBusiness subtype", { "@type": "LocalBusiness", name: "Voorbeeld" }],
    ["an EducationalOrganization", { "@type": "EducationalOrganization", name: "School" }],
    ["WebSite", { "@type": "WebSite", url: HOME }],
  ])("passes a home page that declares %s", (_label, node) => {
    expect(structuredData(page(ld(node)), HOME).status).toBe("pass");
  });

  it("needs attention on a home page with only a BreadcrumbList, naming the page type and the missing type", () => {
    const result = structuredData(page(ld({ "@type": "BreadcrumbList" })), HOME);
    expect({ status: result.status, expected: result.facts.expected_present }).toEqual({ status: "attention", expected: false });
    expect(result.summary).toBe("Page type home should declare Organization (or a subtype, including a LocalBusiness type) or WebSite at the top level, but the top level only declares BreadcrumbList.");
  });

  it("passes a product page that declares Product", () => {
    expect(structuredData(page(ld({ "@type": "Product", offers: { "@type": "Offer", price: "10" } }))).status).toBe("pass");
  });

  it("needs attention on a product page (og:type product) without a Product node", () => {
    const result = structuredData(page(`<meta property="og:type" content="product">${ld({ "@type": "Organization", name: "X" })}`));
    expect({ status: result.status, page_type: result.facts.page_type }).toEqual({ status: "attention", page_type: "product" });
    expect(result.summary).toMatch(/Page type product should declare Product/);
  });

  it("passes an article page that declares Article", () => {
    expect(structuredData(page(ld({ "@type": "Article", headline: "Nieuws" }))).status).toBe("pass");
  });

  it("needs attention on an article page without an article type", () => {
    const html = page(`<meta property="og:type" content="article">${ld({ "@type": "Organization", name: "X" }, { "@type": "BreadcrumbList" })}`);
    const result = structuredData(html);
    expect({ status: result.status, evidence: result.evidence }).toEqual({
      status: "attention",
      evidence: "page type: article; types: Organization, BreadcrumbList",
    });
  });

  it("passes an FAQ page that declares FAQPage", () => {
    expect(structuredData(page(ld({ "@type": "FAQPage" }), QUESTIONS)).status).toBe("pass");
  });

  it("needs attention on a question-heading FAQ page without FAQPage", () => {
    const result = structuredData(page(ld({ "@type": "Organization", name: "X" }), QUESTIONS));
    expect({ status: result.status, page_type: result.facts.page_type }).toEqual({ status: "attention", page_type: "faq" });
  });

  it("passes an other page with any type", () => {
    const result = structuredData(page(ld({ "@type": "BreadcrumbList" })));
    expect({ status: result.status, page_type: result.facts.page_type, expected: result.facts.expected_types }).toEqual({
      status: "pass",
      page_type: "other",
      expected: [],
    });
  });

  it("reports page_type, expected_types and expected_present next to blocks, invalid_blocks and types", () => {
    const result = structuredData(page(ld({ "@type": "Article" }, { "@type": "Organization", name: "X" })));
    expect(result.facts).toEqual({
      blocks: 2,
      invalid_blocks: 0,
      types: ["Article", "Organization"],
      page_type: "article",
      expected_types: ["Article", "BlogPosting", "NewsArticle"],
      expected_present: true,
    });
  });

  it("lists Review and AggregateRating only as types, without changing the grade", () => {
    const node = { "@type": "Organization", name: "X", aggregateRating: { "@type": "AggregateRating", ratingValue: 4.6 }, review: { "@type": "Review" } };
    const result = structuredData(page(ld(node)), HOME);
    expect({ status: result.status, types: result.facts.types }).toEqual({
      status: "pass",
      types: ["Organization", "AggregateRating", "Review"],
    });
  });

  it("needs attention for an invalid block, even when the expected type is present", () => {
    const html = page(`${ld({ "@type": "Organization", name: "X" })}<script type="application/ld+json">{oops</script>`);
    expect(structuredData(html, HOME).status).toBe("attention");
  });

  it("needs attention with null evidence when there is no JSON-LD", () => {
    const result = structuredData(page(""));
    expect({ status: result.status, evidence: result.evidence, expected: result.facts.expected_present }).toEqual({
      status: "attention",
      evidence: null,
      expected: false,
    });
  });

  it("needs attention when the blocks declare no @type", () => {
    expect(structuredData(page(ld({ name: "X" }))).summary).toMatch(/no types declared/);
  });

  it.each([
    ["home", HOME, ld({ "@type": "BreadcrumbList" })],
    ["product", INNER, `<meta property="og:type" content="product">${ld({ "@type": "BreadcrumbList" })}`],
    ["article", INNER, `<meta property="og:type" content="article">`],
    ["faq", INNER, ""],
  ])("never fails on a %s page", (_label, url, head) => {
    expect(structuredData(page(head, QUESTIONS), url).status).not.toBe("fail");
  });

  it("is unknown when the page was not fetched", () => {
    const scrape: ScrapeResult = { text: null, metadata: { fetched: false, status: 404 }, robotsTxt: null, facts: null, robots: analyzeRobots(null, INNER) };
    expect(runChecks(scrape, INNER, ["structured_data"], NOW)[0]?.status).toBe("unknown");
  });
});

describe("structured_data type families", () => {
  it.each(["Restaurant", "Hotel", "Dentist", "Attorney", "Plumber", "CafeOrCoffeeShop", "HomeAndConstructionBusiness", "AutomotiveBusiness", "Brand", "Organization"])(
    "passes a home page that declares %s",
    (type) => {
      expect(structuredData(page(ld({ "@type": type, name: "Voorbeeld" })), HOME).status).toBe("pass");
    },
  );

  it.each(["ScholarlyArticle", "TechArticle", "DiscussionForumPosting", "SocialMediaPosting", "Report"])(
    "infers and passes an article page that declares %s",
    (type) => {
      const result = structuredData(page(ld({ "@type": type, headline: "Nieuws" })));
      expect({ status: result.status, page_type: result.facts.page_type }).toEqual({ status: "pass", page_type: "article" });
    },
  );

  it.each(["ProductGroup", "IndividualProduct", "ProductModel", "SomeProducts"])("infers and passes a product page that declares %s", (type) => {
    const result = structuredData(page(ld({ "@type": type, name: "Fiets" })));
    expect({ status: result.status, page_type: result.facts.page_type }).toEqual({ status: "pass", page_type: "product" });
  });

  it.each(["product.item", "og:product", "product.group"])("infers a product page from og:type %s", (ogType) => {
    expect(typeOf(page(`<meta property="og:type" content="${ogType}">`))).toBe("product");
  });
});

describe("structured_data expectation at the top level", () => {
  it("does not let a publisher Organization nested in a Review satisfy a home page", () => {
    const html = page(ld({ "@type": "Review", publisher: { "@type": "Organization", name: "Voorbeeld" } }));
    const result = structuredData(html, HOME);
    expect({ status: result.status, expected: result.facts.expected_present, types: result.facts.types }).toEqual({
      status: "attention",
      expected: false,
      types: ["Review", "Organization"],
    });
  });

  it("does not let an Organization nested in a WebPage satisfy a home page, and says so", () => {
    const result = structuredData(page(ld({ publisher: { "@type": "Organization", name: "Voorbeeld" } })), HOME);
    expect(result.summary).toBe(
      "Page type home should declare Organization (or a subtype, including a LocalBusiness type) or WebSite at the top level, but the top level declares no type (nested only: Organization).",
    );
  });

  it("accepts the expected type as a top-level @graph member", () => {
    const html = page(ld({ "@context": "https://schema.org", "@graph": [{ "@type": "WebPage" }, { "@type": "Organization", name: "Voorbeeld" }] }));
    expect(structuredData(html, HOME).status).toBe("pass");
  });

  it("accepts the expected type in a top-level list of nodes", () => {
    expect(structuredData(page(ld([{ "@type": "BreadcrumbList" }, { "@type": "WebSite", url: HOME }])), HOME).status).toBe("pass");
  });

  it("records topLevelTypes next to every type in the facts, with a mainEntity one level down", () => {
    const html = page(
      ld({
        "@graph": [
          { "@type": "WebPage", mainEntity: { "@type": "FAQPage", author: { "@type": "Person", name: "P" } } },
          { "@type": "Organization", name: "X" },
        ],
      }),
    );
    const { types, topLevelTypes } = extractPageFacts(html, HOME).jsonLd;
    expect({ types, topLevelTypes }).toEqual({
      types: ["WebPage", "FAQPage", "Person", "Organization"],
      topLevelTypes: ["WebPage", "Organization", "FAQPage"],
    });
  });

  it.each([
    ["mainEntity: Product", { "@type": "WebPage", mainEntity: { "@type": "Product", name: "Fiets" } }, "product"],
    ["mainEntity: [Article]", { "@type": "WebPage", mainEntity: [{ "@type": "Article", headline: "Nieuws" }] }, "article"],
    ["mainEntityOfPage: FAQPage", { "@type": "WebPage", mainEntityOfPage: { "@type": "FAQPage" } }, "faq"],
  ])("passes a WebPage whose %s satisfies the page type", (_label, node, pageType) => {
    const result = structuredData(page(ld(node)));
    expect({ status: result.status, page_type: result.facts.page_type }).toEqual({ status: "pass", page_type: pageType });
  });

  it("does not count a type two levels down, under a mainEntity", () => {
    const html = page(ld({ "@type": "WebPage", mainEntity: { "@type": "ItemList", itemListElement: { "@type": "Product", name: "Fiets" } } }));
    const result = structuredData(html);
    expect({ status: result.status, page_type: result.facts.page_type }).toEqual({ status: "attention", page_type: "product" });
  });

  it("still passes an other page whose only types are nested", () => {
    const result = structuredData(page(ld({ about: { "@type": "Thing", name: "X" } })));
    expect({ status: result.status, page_type: result.facts.page_type }).toEqual({ status: "pass", page_type: "other" });
  });
});

describe("clarity stays independent of structured_data", () => {
  it("returns the same clarity verdict whether or not the expected type is present", () => {
    const body = "<h1>Pagina</h1><p>tekst</p>";
    const [withType] = runChecks(scrapeOf(page(ld({ "@type": "Organization", name: "X" }), body), HOME), HOME, ["clarity"], NOW);
    const [without] = runChecks(scrapeOf(page(ld({ "@type": "BreadcrumbList" }), body), HOME), HOME, ["clarity"], NOW);
    expect(withType).toEqual(without);
  });
});
