import { afterEach, describe, it, expect, vi } from "vitest";
import { MAX_CLASSIFIED_LINKS, MAX_EXTERNAL_LINKS, MAX_SAME_AS, extractPageFacts } from "../facts/page";
import { MAX_SAME_AS_HOSTS } from "../checks/external";
import { analyzeRobots } from "../facts/robots";
import type { ScrapeResult } from "../scrape";
import { runChecks } from "../checks";
import {
  BRAND_PROBE_TIMEOUT_MS,
  EXTERNAL_SOURCES_OFF,
  MAX_BRAND_LENGTH,
  SEARCH_TIMEOUT_MS,
  brandOf,
  profileHostOf,
  reviewSiteOf,
  runSearch,
  selectSearchProvider,
  sendableBrand,
  type BrandProbe,
  type ExternalSources,
  type SearchMention,
  type SearchProvider,
} from "../external";
import { pageCheckBodySchema, runPageCheck, type PageCheckFetched, type PageCheckResult } from "../page-check";

const NOW = new Date("2026-11-23T12:00:00Z");
const PAGE_URL = "https://voorbeeld.example/over-ons";

function ld(node: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(node)}</script>`;
}

function link(href: string): string {
  return `<a href="${href}">link</a>`;
}

function page(head = "", body = ""): string {
  return `<html><head><title>Over ons</title>${head}</head><body><h1>Over ons</h1><p>tekst</p>${body}</body></html>`;
}

function scrapeOf(html: string, url = PAGE_URL): ScrapeResult {
  return {
    text: null,
    metadata: { fetched: true, status: 200 },
    robotsTxt: "",
    llmsTxtPresent: false,
    facts: extractPageFacts(html, url),
    robots: analyzeRobots("", url),
  };
}

function external(html: string, sources: ExternalSources | null = null, url = PAGE_URL) {
  const [result] = runChecks(scrapeOf(html, url), url, ["external"], NOW, null, sources);
  return result;
}

const RATING = ld({
  "@type": "Organization",
  name: "Voorbeeld BV",
  aggregateRating: { "@type": "AggregateRating", ratingValue: "4.6", reviewCount: "212" },
});
const SAME_AS = ld({
  "@type": "Organization",
  name: "Voorbeeld BV",
  sameAs: [
    "https://www.linkedin.com/company/voorbeeld",
    "https://www.facebook.com/voorbeeld",
    "https://www.instagram.com/voorbeeld",
    "https://www.kvk.nl/zoeken/?q=voorbeeld",
  ],
});
const TRUSTPILOT = link("https://nl.trustpilot.com/review/voorbeeld.example");
const LINKEDIN = link("https://www.linkedin.com/company/voorbeeld");

describe("review-site and profile matching", () => {
  it.each([
    ["https://nl.trustpilot.com/review/x", "trustpilot.com"],
    ["https://www.kiyoh.com/reviews/1/x", "kiyoh.com"],
    ["https://www.klantenvertellen.nl/reviews/1/x", "klantenvertellen.nl"],
    ["https://www.tripadvisor.nl/Restaurant_Review-x", "tripadvisor.nl"],
    ["https://www.tripadvisor.co.uk/Hotel_Review-x", "tripadvisor.co.uk"],
    ["https://www.trustedshops.de/bewertung/x", "trustedshops.de"],
    ["https://www.capterra.com/p/1/x", "capterra.com"],
    ["https://www.g2.com/products/x", "g2.com"],
    ["https://www.yelp.com/biz/x", "yelp.com"],
    ["https://www.feedbackcompany.com/nl-nl/reviews/x", "feedbackcompany.com"],
    ["https://g.page/voorbeeld", "g.page"],
    ["https://maps.app.goo.gl/abc", "maps.app.goo.gl"],
    ["https://www.google.com/maps/place/Voorbeeld", "google.com/maps"],
    ["https://maps.google.nl/maps/place/Voorbeeld", "google.nl/maps"],
    ["https://www.google.co.uk/maps/place/Voorbeeld/@52,4,17z", "google.co.uk/maps"],
    ["https://www.tripadvisor.com.au/Hotel_Review-x", "tripadvisor.com.au"],
    ["https://www.yelp.ie/biz/x", "yelp.ie"],
  ])("matches %s as %s", (url, site) => {
    expect(reviewSiteOf(url)).toBe(site);
  });

  it.each([
    "https://trustpilot.com.evil.example/review/x",
    "https://nottrustpilot.com/review/x",
    "https://tripadvisor.evil.example/x",
    "https://www.google.com/search?q=voorbeeld",
    "https://evil.example/maps.google.com",
    "mailto:info@trustpilot.com",
    "https://maps.google.nl/?cid=1",
    "https://www.google.com/maps",
    "https://www.google.com/maps/dir/Amsterdam/Utrecht",
    "https://www.google.com/maps?q=voorbeeld",
    "https://news.google.com/maps/place/Voorbeeld",
    "https://www.tripadvisor.xyz/Hotel_Review-x",
    "https://www.capterra.co.jp/p/1/x",
    "https://www.google.xyz/maps/place/Voorbeeld",
  ])("does not match the look-alike %s as a review site", (url) => {
    expect(reviewSiteOf(url)).toBeNull();
  });

  it.each([
    ["https://nl.linkedin.com/company/x", "linkedin.com"],
    ["https://m.facebook.com/x", "facebook.com"],
    ["https://x.com/voorbeeld", "x.com"],
    ["https://twitter.com/voorbeeld", "twitter.com"],
    ["https://nl.wikipedia.org/wiki/Voorbeeld", "wikipedia.org"],
    ["https://www.wikidata.org/wiki/Q1", "wikidata.org"],
    ["https://www.youtube.com/@voorbeeld", "youtube.com"],
    ["https://www.facebook.com/voorbeeld.share", "facebook.com"],
  ])("matches %s as the profile host %s", (url, host) => {
    expect(profileHostOf(url)).toBe(host);
  });

  it.each(["https://mylinkedin.com/x", "https://box.com/x", "https://linkedin.com.evil.example/x"])(
    "does not match the look-alike %s as a profile",
    (url) => {
      expect(profileHostOf(url)).toBeNull();
    },
  );

  it.each([
    "https://twitter.com/intent/tweet?text=x",
    "https://x.com/intent/post?text=x",
    "https://x.com/share?url=https://voorbeeld.example",
    "https://www.facebook.com/sharer/sharer.php?u=x",
    "https://www.facebook.com/sharer.php?u=x",
    "https://www.facebook.com/share.php?u=x",
    "https://www.facebook.com/dialog/share?app_id=1",
    "https://www.linkedin.com/shareArticle?mini=true&url=x",
    "https://www.linkedin.com/sharing/share-offsite/?url=x",
    "https://www.youtube.com/watch?v=abc",
    "https://www.youtube.com/embed/abc",
    "https://www.youtube.com/shorts/abc",
    "https://youtu.be/abc",
    "https://www.linkedin.com/",
    "https://www.facebook.com",
  ])("does not count the share, intent, video or bare-host link %s as a profile", (url) => {
    expect(profileHostOf(url)).toBeNull();
  });

  it("fails a page whose only outside links are share buttons, a video and a Maps route", () => {
    const html = page(
      "",
      link("https://twitter.com/intent/tweet?text=x") +
        link("https://www.facebook.com/sharer/sharer.php?u=x") +
        link("https://www.linkedin.com/shareArticle?url=x") +
        link("https://www.youtube.com/watch?v=abc") +
        link("https://www.google.com/maps/dir/Amsterdam/Utrecht"),
    );
    expect(external(html).status).toBe("fail");
  });

  it("grades a page linking only to look-alike hosts as fail", () => {
    const html = page("", link("https://trustpilot.com.evil.example/x") + link("https://mylinkedin.com/x"));
    expect(external(html).status).toBe("fail");
  });
});

describe("external signals", () => {
  it("reads an AggregateRating alone as the review group, so attention", () => {
    const result = external(page(RATING));
    expect({ status: result.status, rating: result.facts.rating_value, count: result.facts.review_count }).toEqual({
      status: "attention",
      rating: 4.6,
      count: 212,
    });
  });

  it("reads a review-site link alone as the review group, so attention", () => {
    const result = external(page("", TRUSTPILOT));
    expect({ status: result.status, sites: result.facts.review_sites }).toEqual({ status: "attention", sites: ["trustpilot.com"] });
  });

  it("reads Review nodes alone as the review group and counts them", () => {
    const result = external(page(ld({ "@type": "LocalBusiness", name: "X", review: [{ "@type": "Review" }, { "@type": "Review" }] })));
    expect({ status: result.status, count: result.facts.review_count, evidence: result.evidence }).toEqual({
      status: "attention",
      count: 2,
      evidence: "2 Review node(s)",
    });
  });

  it("reads sameAs alone as the profile group, so attention", () => {
    const result = external(page(SAME_AS));
    expect({ status: result.status, sameAs: result.facts.same_as_count, hosts: result.facts.profile_hosts }).toEqual({
      status: "attention",
      sameAs: 3,
      hosts: ["linkedin.com", "facebook.com", "instagram.com"],
    });
  });

  it("reads a profile link alone as the profile group, so attention", () => {
    const result = external(page("", LINKEDIN));
    expect({ status: result.status, hosts: result.facts.profile_hosts, evidence: result.evidence }).toEqual({
      status: "attention",
      hosts: ["linkedin.com"],
      evidence: "profile links: linkedin.com",
    });
  });

  it("passes with reviews and profiles together, and quotes both", () => {
    const result = external(page(RATING + SAME_AS, TRUSTPILOT));
    expect({ status: result.status, evidence: result.evidence }).toEqual({
      status: "pass",
      evidence: "AggregateRating 4.6 (212 reviews); review sites: trustpilot.com; sameAs: 3 profiles",
    });
  });

  it("passes with a review-site link and a profile link", () => {
    expect(external(page("", TRUSTPILOT + LINKEDIN)).status).toBe("pass");
  });

  it("fails a fetched page with no signal at all, with null evidence", () => {
    const result = external(page());
    expect({ status: result.status, evidence: result.evidence }).toEqual({ status: "fail", evidence: null });
  });

  it("does not count links to the page's own site", () => {
    expect(external(page("", link("https://www.voorbeeld.example/contact"))).status).toBe("fail");
  });

  it("reports every fact key, with both sources off by default", () => {
    expect(external(page()).facts).toEqual({
      rating_value: null,
      review_count: null,
      review_sites: [],
      same_as_count: 0,
      same_as_hosts: [],
      profile_hosts: [],
      search: "off",
      search_mentions: null,
      llm_probe: "off",
    });
  });

  it("is unknown when the page was not fetched", () => {
    const scrape: ScrapeResult = { text: null, metadata: { fetched: false, status: 404 }, robotsTxt: null, facts: null, robots: analyzeRobots(null, PAGE_URL) };
    const [result] = runChecks(scrape, PAGE_URL, ["external"], NOW);
    expect({ status: result?.status, evidence: result?.evidence }).toEqual({ status: "unknown", evidence: null });
  });
});

describe("nested ratings", () => {
  it("finds an AggregateRating nested in a Product inside @graph", () => {
    const html = page(ld({ "@graph": [{ "@type": "WebPage" }, { "@type": "Product", name: "Fiets", aggregateRating: { "@type": "AggregateRating", ratingValue: 4.2, ratingCount: 31 } }] }));
    expect([external(html).facts.rating_value, external(html).facts.review_count]).toEqual([4.2, 31]);
  });

  it("finds an untyped aggregateRating on a LocalBusiness", () => {
    const html = page(ld({ "@type": "LocalBusiness", name: "X", aggregateRating: { ratingValue: "4,8", reviewCount: 9 } }));
    expect([external(html).facts.rating_value, external(html).facts.review_count]).toEqual([4.8, 9]);
  });

  it("finds Review nodes nested in a Product's review list", () => {
    const html = page(ld({ "@type": "Product", name: "Fiets", review: { "@type": "Review", author: "Piet" } }));
    expect(external(html).facts.review_count).toBe(1);
  });
});

describe("search provider", () => {
  const OWN_AND_OTHER = [
    { url: "https://nieuws.example/artikel", title: "Voorbeeld in het nieuws" },
    { url: "https://blog.voorbeeld.example/post", title: "Eigen blog" },
  ];

  function withSearch(search: ExternalSources["search"]): ExternalSources {
    return { ...EXTERNAL_SOURCES_OFF, search };
  }

  it("counts mentions on other hosts as a third group, so profiles plus mentions pass", () => {
    const result = external(page(SAME_AS), withSearch({ status: "ok", mentions: OWN_AND_OTHER }));
    expect({ status: result.status, search: result.facts.search, mentions: result.facts.search_mentions }).toEqual({
      status: "pass",
      search: "ok",
      mentions: 1,
    });
  });

  it("names the missing search group when it found nothing", () => {
    const result = external(page(SAME_AS), withSearch({ status: "ok", mentions: [] }));
    expect({ status: result.status, summary: result.summary }).toEqual({
      status: "attention",
      summary:
        "Only one kind of outside confirmation found: profiles (sameAs or a profile link). Missing: reviews (rating schema or a review-site link), search mentions on other sites.",
    });
  });

  it("selects no provider for any GEO_EXTERNAL_SEARCH_PROVIDER value today", () => {
    expect([undefined, "", "none", "NONE", "brave"].map(selectSearchProvider)).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });
});

describe("runPageCheck external sources", () => {
  /** A page with only the profile group (sameAs), so search or the probe decide the rest. */
  const HTML = page(SAME_AS);

  afterEach(() => {
    vi.useRealTimers();
  });

  function externalOf(result: PageCheckResult) {
    return (result as PageCheckFetched).checks.find((c) => c.id === "external");
  }

  function runWith(urls: string[], deps: { searchProvider?: SearchProvider; brandProbe?: BrandProbe }, checks?: string[]) {
    const fetchPage = vi.fn(async (url: string) => scrapeOf(HTML, url));
    return runPageCheck(pageCheckBodySchema.parse({ urls, checks }), { fetchPage, now: () => NOW, ...deps });
  }

  function provider(search: SearchProvider["search"]) {
    return { name: "fake", search: vi.fn<SearchProvider["search"]>(search) };
  }

  it("leaves search off without a provider", async () => {
    const { results } = await runWith([PAGE_URL], {});
    expect([externalOf(results[0]!)?.facts.search, externalOf(results[0]!)?.facts.llm_probe]).toEqual(["off", "off"]);
  });

  it("asks the provider with the stated brand and the hostname, and uses its mentions", async () => {
    const fake = provider(async () => ({ mentions: [{ url: "https://nieuws.example/a", title: "Nieuws" }] }));
    const { results } = await runWith([PAGE_URL], { searchProvider: fake });
    expect({ calls: fake.search.mock.calls, status: externalOf(results[0]!)?.status, mentions: externalOf(results[0]!)?.facts.search_mentions }).toEqual({
      calls: [[{ brand: "Voorbeeld BV", hostname: "voorbeeld.example" }]],
      status: "pass",
      mentions: 1,
    });
  });

  it("asks the provider once per hostname, not once per page", async () => {
    const fake = provider(async () => ({ mentions: [] }));
    await runWith(["https://voorbeeld.example/a", "https://voorbeeld.example/b", "https://voorbeeld.example/c"], { searchProvider: fake });
    expect(fake.search).toHaveBeenCalledTimes(1);
  });

  it("reports a provider that throws as search error, without failing the check", async () => {
    const fake = provider(async () => {
      throw new Error("boom");
    });
    const { results } = await runWith([PAGE_URL], { searchProvider: fake });
    expect({ search: externalOf(results[0]!)?.facts.search, status: externalOf(results[0]!)?.status, fetched: results[0]?.fetched }).toEqual({
      search: "error",
      status: "attention",
      fetched: true,
    });
  });

  it(`reports a provider that takes longer than ${SEARCH_TIMEOUT_MS} ms as search error`, async () => {
    vi.useFakeTimers();
    const fake = provider(() => new Promise(() => {}));
    const pending = runWith([PAGE_URL], { searchProvider: fake });
    await vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS);
    const { results } = await pending;
    expect(externalOf(results[0]!)?.facts.search).toBe("error");
  });

  it("does not ask the provider or the probe when the external check is not requested", async () => {
    const fake = provider(async () => ({ mentions: [] }));
    const probe = vi.fn<BrandProbe>(async () => ({ mentioned: true, detail: "x" }));
    await runWith([PAGE_URL], { searchProvider: fake, brandProbe: probe }, ["clarity"]);
    expect([fake.search.mock.calls.length, probe.mock.calls.length]).toEqual([0, 0]);
  });

  it("reports a mentioned brand from the probe without changing the grade", async () => {
    const probe = vi.fn<BrandProbe>(async () => ({ mentioned: true, detail: "recognised by ChatGPT" }));
    const { results } = await runWith([PAGE_URL], { brandProbe: probe });
    const result = externalOf(results[0]!);
    expect({ probe: result?.facts.llm_probe, status: result?.status, evidence: result?.evidence }).toEqual({
      probe: "mentioned",
      status: "attention",
      evidence: "sameAs: 3 profiles; AI probe: recognised by ChatGPT",
    });
  });

  it("reports a brand the probe did not find as not_mentioned", async () => {
    const probe = vi.fn<BrandProbe>(async () => ({ mentioned: false, detail: "not recognised by ChatGPT" }));
    const { results } = await runWith([PAGE_URL], { brandProbe: probe });
    expect([externalOf(results[0]!)?.facts.llm_probe, externalOf(results[0]!)?.status]).toEqual(["not_mentioned", "attention"]);
  });

  it("reports a probe that throws as error, and keeps the page result", async () => {
    const probe = vi.fn<BrandProbe>(async () => {
      throw new Error("no LLM engine answered");
    });
    const { results } = await runWith([PAGE_URL], { brandProbe: probe });
    expect([externalOf(results[0]!)?.facts.llm_probe, results[0]?.fetched]).toEqual(["error", true]);
  });

  it(`reports a probe that takes longer than ${BRAND_PROBE_TIMEOUT_MS} ms as error`, async () => {
    vi.useFakeTimers();
    const probe = vi.fn<BrandProbe>(() => new Promise(() => {}));
    const pending = runWith([PAGE_URL], { brandProbe: probe });
    await vi.advanceTimersByTimeAsync(BRAND_PROBE_TIMEOUT_MS);
    const { results } = await pending;
    expect(externalOf(results[0]!)?.facts.llm_probe).toBe("error");
  });

  it("calls the probe once for a three-page request and gives every page its outcome", async () => {
    const probe = vi.fn<BrandProbe>(async () => ({ mentioned: true, detail: "recognised by Gemini" }));
    const { results } = await runWith(["https://voorbeeld.example/a", "https://voorbeeld.example/b", "https://voorbeeld.example/c"], { brandProbe: probe });
    expect({ calls: probe.mock.calls, outcomes: results.map((r) => externalOf(r)?.facts.llm_probe) }).toEqual({
      calls: [["Voorbeeld BV", "voorbeeld.example"]],
      outcomes: ["mentioned", "mentioned", "mentioned"],
    });
  });
});

describe("brandOf", () => {
  it("prefers the stated site name and falls back to the first hostname label", () => {
    expect([brandOf(extractPageFacts(page(SAME_AS), PAGE_URL), "voorbeeld.example"), brandOf(null, "voorbeeld.example")]).toEqual([
      "Voorbeeld BV",
      "voorbeeld",
    ]);
  });
});

describe("sameAs filter", () => {
  it("counts only sameAs URLs on a listed profile or review-site host, and reports only their hosts", () => {
    const result = external(page(SAME_AS));
    expect([result.facts.same_as_count, result.facts.same_as_hosts]).toEqual([3, ["linkedin.com", "facebook.com", "instagram.com"]]);
  });

  it("fails a page whose only sameAs points to an unlisted host", () => {
    const result = external(page(ld({ "@type": "Organization", name: "X", sameAs: ["https://www.kvk.nl/zoeken/?q=x", "https://example.org/x"] })));
    expect({ status: result.status, count: result.facts.same_as_count }).toEqual({ status: "fail", count: 0 });
  });

  it("does not count a sameAs on the page's own host", () => {
    const html = page(ld({ "@type": "Organization", name: "X", sameAs: "https://linkedin.com/company/x" }));
    const [result] = runChecks(scrapeOf(html, "https://www.linkedin.com/over"), "https://www.linkedin.com/over", ["external"], NOW);
    expect(result?.facts.same_as_count).toBe(0);
  });

  it("counts a review-site sameAs toward reviews and toward profiles", () => {
    const result = external(page(ld({ "@type": "Organization", name: "X", sameAs: ["https://nl.trustpilot.com/review/voorbeeld.example"] })));
    expect({ status: result.status, sites: result.facts.review_sites, count: result.facts.same_as_count, hosts: result.facts.profile_hosts }).toEqual({
      status: "pass",
      sites: ["trustpilot.com"],
      count: 1,
      hosts: [],
    });
  });
});

describe("caps", () => {
  const unrelated = (n: number) => Array.from({ length: n }, (_v, i) => link(`https://ander${i}.example/x`)).join("");

  it(`keeps review-site and profile links after ${MAX_EXTERNAL_LINKS} unrelated outbound links`, () => {
    const html = page("", unrelated(MAX_EXTERNAL_LINKS) + TRUSTPILOT + LINKEDIN);
    const facts = extractPageFacts(html, PAGE_URL);
    expect({
      external: facts.externalLinks.length,
      reviews: facts.reviewLinks,
      profiles: facts.profileLinks,
      status: external(html).status,
    }).toEqual({
      external: MAX_EXTERNAL_LINKS,
      reviews: ["https://nl.trustpilot.com/review/voorbeeld.example"],
      profiles: ["https://www.linkedin.com/company/voorbeeld"],
      status: "pass",
    });
  });

  it(`caps review-site links at ${MAX_CLASSIFIED_LINKS}`, () => {
    const links = Array.from({ length: MAX_CLASSIFIED_LINKS + 10 }, (_v, i) => link(`https://nl.trustpilot.com/review/x${i}`)).join("");
    expect(extractPageFacts(page("", links), PAGE_URL).reviewLinks).toHaveLength(MAX_CLASSIFIED_LINKS);
  });

  it(`caps profile links at ${MAX_CLASSIFIED_LINKS}`, () => {
    const links = Array.from({ length: MAX_CLASSIFIED_LINKS + 10 }, (_v, i) => link(`https://www.linkedin.com/company/x${i}`)).join("");
    expect(extractPageFacts(page("", links), PAGE_URL).profileLinks).toHaveLength(MAX_CLASSIFIED_LINKS);
  });

  it(`keeps at most ${MAX_SAME_AS} sameAs URLs, listed hosts first`, () => {
    const unlisted = Array.from({ length: MAX_SAME_AS + 5 }, (_v, i) => `https://register${i}.example/x`);
    const facts = extractPageFacts(page(ld({ "@type": "Organization", name: "X", sameAs: [...unlisted, "https://www.linkedin.com/company/x"] })), PAGE_URL);
    expect({ length: facts.jsonLd.sameAs.length, first: facts.jsonLd.sameAs[0] }).toEqual({
      length: MAX_SAME_AS,
      first: "https://www.linkedin.com/company/x",
    });
  });

  it(`reports at most ${MAX_SAME_AS_HOSTS} same_as_hosts`, () => {
    const sameAs = Array.from({ length: MAX_SAME_AS_HOSTS + 5 }, (_v, i) => `https://c${i}.linkedin.com/company/x`);
    const result = external(page(ld({ "@type": "Organization", name: "X", sameAs })));
    expect([(result.facts.same_as_hosts as string[]).length, result.facts.same_as_count]).toEqual([MAX_SAME_AS_HOSTS, MAX_SAME_AS_HOSTS + 5]);
  });
});

describe("rating parsing", () => {
  it("skips an AggregateRating without a usable ratingValue and reads a later real one", () => {
    const html = page(
      ld({
        "@graph": [
          { "@type": "Organization", name: "X", aggregateRating: { "@type": "AggregateRating", ratingValue: "" } },
          { "@type": "Product", name: "Fiets", aggregateRating: { "@type": "AggregateRating", ratingValue: "4.5", reviewCount: 10 } },
        ],
      }),
    );
    expect([external(html).facts.rating_value, external(html).facts.review_count]).toEqual([4.5, 10]);
  });

  it.each([
    ["empty", ""],
    ["non-numeric", "n/a"],
    ["whitespace", "  "],
  ])("reads a %s ratingValue as no rating, not 0", (_label, ratingValue) => {
    const result = external(page(ld({ "@type": "Organization", name: "X", aggregateRating: { ratingValue, reviewCount: 3 } })));
    expect({ rating: result.facts.rating_value, status: result.status }).toEqual({ rating: null, status: "fail" });
  });

  it.each([
    ["empty", ""],
    ["non-numeric", "veel"],
  ])("reads a %s reviewCount as null, not 0", (_label, reviewCount) => {
    const result = external(page(ld({ "@type": "Organization", name: "X", aggregateRating: { ratingValue: 4, reviewCount } })));
    expect([result.facts.rating_value, result.facts.review_count]).toEqual([4, null]);
  });
});

describe("malformed search results", () => {
  it("skips null and garbage mention elements", () => {
    const mentions = [null, "https://nieuws.example/a", { url: 3 }, { url: "https://nieuws.example/b", title: "Nieuws" }] as unknown as SearchMention[];
    const result = external(page(SAME_AS), { ...EXTERNAL_SOURCES_OFF, search: { status: "ok", mentions } });
    expect({ status: result.status, mentions: result.facts.search_mentions }).toEqual({ status: "pass", mentions: 1 });
  });

  it.each([
    ["null", null],
    ["a string", "nothing"],
    ["mentions not a list", { mentions: "x" }],
    ["no mentions", {}],
  ])("reports a provider result that is %s as search error", async (_label, value) => {
    const provider = { name: "fake", search: async () => value as unknown as { mentions: [] } };
    expect(await runSearch(provider, "Voorbeeld", "voorbeeld.example")).toEqual({ status: "error" });
  });

  it("keeps only mention elements with a string url", async () => {
    const provider = { name: "fake", search: async () => ({ mentions: [null, { title: "geen url" }, { url: "https://nieuws.example/a" }] }) as unknown as { mentions: [] } };
    expect(await runSearch(provider, "Voorbeeld", "voorbeeld.example")).toEqual({ status: "ok", mentions: [{ url: "https://nieuws.example/a", title: "" }] });
  });

  it("keeps the page fetched when the provider returns garbage", async () => {
    const fetchPage = vi.fn(async (url: string) => scrapeOf(page(SAME_AS), url));
    const searchProvider = { name: "fake", search: async () => ({ mentions: [null, 7] }) as unknown as { mentions: [] } };
    const { results } = await runPageCheck(pageCheckBodySchema.parse({ urls: [PAGE_URL] }), { fetchPage, now: () => NOW, searchProvider });
    const result = (results[0] as PageCheckFetched).checks.find((c) => c.id === "external");
    expect({ fetched: results[0]?.fetched, search: result?.facts.search, mentions: result?.facts.search_mentions }).toEqual({
      fetched: true,
      search: "ok",
      mentions: 0,
    });
  });
});

describe("sendableBrand", () => {
  it("collapses whitespace to one trimmed line", () => {
    expect(sendableBrand("  Voorbeeld \n\t BV  ")).toBe("Voorbeeld BV");
  });

  it(`keeps a brand of exactly ${MAX_BRAND_LENGTH} characters`, () => {
    expect(sendableBrand("b".repeat(MAX_BRAND_LENGTH))).toBe("b".repeat(MAX_BRAND_LENGTH));
  });

  it.each([
    ["empty", ""],
    ["only whitespace", " \n "],
    ["over the cap", "b".repeat(MAX_BRAND_LENGTH + 1)],
  ])("refuses a brand that is %s", (_label, brand) => {
    expect(sendableBrand(brand)).toBeNull();
  });
});

describe("runPageCheck sources per hostname", () => {
  function siteNamed(name: string): string {
    return page(`<meta property="og:site_name" content="${name}">${SAME_AS}`);
  }

  function externalOf(result: PageCheckResult) {
    return (result as PageCheckFetched).checks.find((c) => c.id === "external");
  }

  it("asks the probe once per hostname and gives each page the outcome for its own site", async () => {
    const fetchPage = vi.fn(async (url: string) => scrapeOf(siteNamed(new URL(url).hostname), url));
    const brandProbe = vi.fn<BrandProbe>(async (_brand, hostname) => ({ mentioned: hostname === "a.example", detail: hostname }));
    const { results } = await runPageCheck(pageCheckBodySchema.parse({ urls: ["https://a.example/1", "https://b.example/1", "https://a.example/2"] }), {
      fetchPage,
      now: () => NOW,
      brandProbe,
    });
    expect({ calls: brandProbe.mock.calls.length, outcomes: results.map((r) => externalOf(r)?.facts.llm_probe) }).toEqual({
      calls: 2,
      outcomes: ["mentioned", "not_mentioned", "mentioned"],
    });
  });

  it("uses the brand of the first URL in input order for a hostname, even when a later one loads first", async () => {
    const fetchPage = vi.fn(async (url: string) => {
      if (url.endsWith("/eerst")) await new Promise((resolve) => setTimeout(resolve, 20));
      return scrapeOf(siteNamed(url.endsWith("/eerst") ? "Eerste Merk" : "Tweede Merk"), url);
    });
    const brandProbe = vi.fn<BrandProbe>(async () => ({ mentioned: true, detail: "x" }));
    await runPageCheck(pageCheckBodySchema.parse({ urls: ["https://voorbeeld.example/eerst", "https://voorbeeld.example/later"] }), {
      fetchPage,
      now: () => NOW,
      brandProbe,
    });
    expect(brandProbe.mock.calls).toEqual([["Eerste Merk", "voorbeeld.example"]]);
  });

  it("skips an earlier URL on the same hostname that did not load", async () => {
    const fetchPage = vi.fn(async (url: string): Promise<ScrapeResult> => {
      if (url.endsWith("/weg")) return { text: null, metadata: { fetched: false, status: 404 }, robotsTxt: null, facts: null, robots: analyzeRobots(null, url) };
      return scrapeOf(siteNamed("Tweede Merk"), url);
    });
    const brandProbe = vi.fn<BrandProbe>(async () => ({ mentioned: true, detail: "x" }));
    await runPageCheck(pageCheckBodySchema.parse({ urls: ["https://voorbeeld.example/weg", "https://voorbeeld.example/later"] }), {
      fetchPage,
      now: () => NOW,
      brandProbe,
    });
    expect(brandProbe.mock.calls).toEqual([["Tweede Merk", "voorbeeld.example"]]);
  });

  it("sends the brand collapsed to one line", async () => {
    const fetchPage = vi.fn(async (url: string) => scrapeOf(siteNamed("Voorbeeld\n    BV"), url));
    const search = vi.fn<SearchProvider["search"]>(async () => ({ mentions: [] }));
    await runPageCheck(pageCheckBodySchema.parse({ urls: [PAGE_URL] }), { fetchPage, now: () => NOW, searchProvider: { name: "fake", search } });
    expect(search.mock.calls).toEqual([[{ brand: "Voorbeeld BV", hostname: "voorbeeld.example" }]]);
  });

  it(`turns search and probe off for a brand over ${MAX_BRAND_LENGTH} characters, without calling either`, async () => {
    const fetchPage = vi.fn(async (url: string) => scrapeOf(siteNamed("Merk ".repeat(30)), url));
    const search = vi.fn<SearchProvider["search"]>(async () => ({ mentions: [] }));
    const brandProbe = vi.fn<BrandProbe>(async () => ({ mentioned: true, detail: "x" }));
    const { results } = await runPageCheck(pageCheckBodySchema.parse({ urls: [PAGE_URL] }), {
      fetchPage,
      now: () => NOW,
      searchProvider: { name: "fake", search },
      brandProbe,
    });
    const result = externalOf(results[0]!);
    expect({ calls: [search.mock.calls.length, brandProbe.mock.calls.length], search: result?.facts.search, probe: result?.facts.llm_probe }).toEqual({
      calls: [0, 0],
      search: "off",
      probe: "off",
    });
  });
});
