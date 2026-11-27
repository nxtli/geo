import { describe, it, expect } from "vitest";
import { analyzeRobots } from "../facts/robots";
import { extractPageFacts, htmlToOutlineText } from "../facts/page";
import { buildFactLayer } from "../facts/checks";

const URL_ = "https://voorbeeld.example/diensten/lease";

describe("analyzeRobots", () => {
  it("geen robots.txt = alles toegestaan; onbereikbaar = onbekend", () => {
    expect(analyzeRobots("", URL_).blockedSearch).toHaveLength(0);
    expect(analyzeRobots(null, URL_).known).toBe(false);
  });

  it("ClaudeBot en GPTBot zijn trainingsbots: blokkeren is geen blokkade voor zoeken", () => {
    const r = analyzeRobots("User-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /", URL_);
    expect(r.blockedSearch).toHaveLength(0);
    expect(r.blockedTraining.map((b) => b.token)).toEqual(["GPTBot", "ClaudeBot"]);
  });

  it("een eigen groep gaat voor de sterretje-groep", () => {
    const r = analyzeRobots("User-agent: *\nDisallow: /\n\nUser-agent: OAI-SearchBot\nAllow: /", URL_);
    const blocked = r.blockedSearch.map((b) => b.token);
    expect(blocked).not.toContain("OAI-SearchBot");
    expect(blocked).toContain("PerplexityBot");
  });

  it("langste regel wint, lege Disallow staat alles toe, meerdere agents delen een groep", () => {
    const txt = "User-agent: PerplexityBot\nUser-agent: Claude-SearchBot\nDisallow: /diensten/\nAllow: /diensten/lease\n\nUser-agent: Googlebot\nDisallow:";
    const r = analyzeRobots(txt, URL_);
    expect(r.blockedSearch).toHaveLength(0);
    expect(analyzeRobots(txt, "https://voorbeeld.example/diensten/koop").blockedSearch.map((b) => b.token)).toEqual([
      "Claude-SearchBot",
      "PerplexityBot",
    ]);
  });

  it("ondersteunt * en $ in paden", () => {
    const r = analyzeRobots("User-agent: *\nDisallow: /*.pdf$\nDisallow: /intern*", "https://voorbeeld.example/gids.pdf");
    expect(r.blockedSearch.length).toBeGreaterThan(0);
    expect(analyzeRobots("User-agent: *\nDisallow: /*.pdf$", URL_).blockedSearch).toHaveLength(0);
  });
});

const HTML = `<!doctype html><html lang="nl"><head><title>Fietslease voor werkgevers | Voorbeeld</title>
<meta name="description" content="Lease e-bikes voor je medewerkers.">
<link rel="canonical" href="https://voorbeeld.example/diensten/lease">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Voorbeeld"},{"@type":["Product","Service"],"dateModified":"2026-10-01"}]}</script>
<script type="application/ld+json">{ kapot </script></head>
<body><h1>Fietslease voor werkgevers</h1><p>Een lease e-bike kost vanaf &euro; 59 per maand.</p>
<h3>Hoe werkt het?</h3><p>Bijgewerkt op 3 oktober 2026.</p>
<a href="/contact">Lees meer</a> <a href="https://www.voorbeeld.example/prijzen">Bekijk alle prijzen per fiets</a> <a href="https://elders.example/">extern</a>
<img src="a.jpg"><img src="b.jpg" alt=""></body></html>`;

describe("extractPageFacts", () => {
  const f = extractPageFacts(HTML, URL_);
  it("leest koppen, prijs, datum, links, afbeeldingen en JSON-LD", () => {
    expect(f.h1Count).toBe(1);
    expect(f.skippedHeadingLevel).toBe(true);
    expect(f.hasPrice).toBe(true);
    expect(f.visibleDate).toBe("3 oktober 2026");
    expect(f.links.internal).toBe(2);
    expect(f.links.vagueAnchors).toEqual(["lees meer"]);
    expect(f.images).toEqual({ total: 2, missingAlt: 1 });
    expect(f.jsonLd.blocks).toBe(2);
    expect(f.jsonLd.invalid).toBe(1);
    expect(f.jsonLd.types.sort()).toEqual(["Organization", "Product", "Service"]);
    expect(f.lang).toBe("nl");
    expect(f.noindex).toBe(false);
  });
  it("ziet noindex in de header en nosnippet in de meta-tag", () => {
    expect(extractPageFacts(HTML, URL_, { xRobotsTag: "noindex" }).noindex).toBe(true);
    expect(extractPageFacts('<meta content="max-snippet:0" name="robots">', URL_).nosnippet).toBe(true);
  });
  it("herkent een lege JavaScript-shell", () => {
    expect(extractPageFacts('<html><body><div id="root"></div><script>x()</script></body></html>', URL_).jsShell).toBe(true);
    expect(f.jsShell).toBe(false);
  });
  it("houdt koppen herkenbaar in de tekst voor het model", () => {
    expect(htmlToOutlineText(HTML)).toContain("# Fietslease voor werkgevers");
    expect(htmlToOutlineText(HTML)).toContain("### Hoe werkt het?");
    expect(htmlToOutlineText(HTML)).not.toContain("schema.org");
  });
});

describe("buildFactLayer", () => {
  const input = { homepage_url: URL_, company_name: "V", offer_description: "", target_audience: "", desired_queries: "" };
  it("geblokkeerde zoekbot = blokkade met plak-klaar advies", () => {
    const layer = buildFactLayer({ ...input, facts: extractPageFacts(HTML, URL_), robots: analyzeRobots("User-agent: OAI-SearchBot\nDisallow: /", URL_) });
    expect(layer.blocked).toBe(true);
    expect(layer.gateActions[0].criterion).toBe("P1");
    expect(layer.gateActions[0].after).toBe("User-agent: OAI-SearchBot\nAllow: /");
    expect(layer.gateActions[0].done_when).not.toBe("");
  });
  it("llms.txt en schema geven nooit een aandachtspunt voor de score", () => {
    const layer = buildFactLayer({ ...input, facts: extractPageFacts("<h1>x</h1>", URL_), robots: analyzeRobots("", URL_), llms_txt_present: false });
    expect(layer.blocked).toBe(false);
    expect(layer.technical_checks.some((c) => /llms|JSON-LD/.test(c.label))).toBe(false);
    expect(layer.hygiene.find((h) => h.label === "llms.txt")!.status).toBe("onbekend");
  });
  it("feiten beslissen G1, G3 en E1; snelheid en off-page zijn niet te beoordelen", () => {
    const layer = buildFactLayer({ ...input, facts: extractPageFacts(HTML, URL_), robots: analyzeRobots("", URL_) });
    const v = Object.fromEntries(layer.forced.map((c) => [c.id, c.verdict]));
    expect(v).toMatchObject({ G1: "deels", G3: "deels", E1: "voldoet", G4: "nvt", F3: "nvt" });
  });
});

describe("snippets, datum en afzender volgens de Google-richtlijn voor bronvermelding", () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `woord${i}`).join(" ");
  const layerFor = (html: string) =>
    buildFactLayer({ homepage_url: URL_, company_name: "Voorbeeld", facts: extractPageFacts(html, URL_), robots: analyzeRobots("", URL_) } as never);
  const snippetCheck = (html: string) => layerFor(html).technical_checks.find((c) => c.label === "Indexeerbaar en snippets toegestaan");

  it("telt de woorden binnen data-nosnippet, ook bij geneste elementen", () => {
    const html = `<body><div data-nosnippet><p>${words(10)}</p><div>${words(5)}</div></div><p>${words(85)}</p></body>`;
    const f = extractPageFacts(html, URL_);
    expect(f.dataNosnippet.words).toBe(15);
    expect(f.dataNosnippet.share).toBeCloseTo(0.15, 2);
  });

  it("kerntekst binnen data-nosnippet is een blokker, een klein deel een aandachtspunt", () => {
    expect(snippetCheck(`<body><section data-nosnippet>${words(90)}</section><p>${words(10)}</p></body>`)?.status).toBe("blokker");
    expect(snippetCheck(`<body><span data-nosnippet>${words(20)}</span><p>${words(80)}</p></body>`)?.status).toBe("aandacht");
    expect(snippetCheck(`<body><p>${words(100)}</p></body>`)?.status).toBe("goed");
    expect(layerFor(`<body><section data-nosnippet>${words(90)}</section></body>`).blocked).toBe(true);
  });

  it("een lage max-snippet is een aandachtspunt, geen limiet en een ruime limiet niet", () => {
    const page = (robots: string) => `<head><meta name="robots" content="${robots}"></head><body><p>${words(100)}</p></body>`;
    expect(extractPageFacts(page("max-snippet:20"), URL_).maxSnippet).toBe(20);
    expect(snippetCheck(page("max-snippet:20"))?.status).toBe("aandacht");
    expect(snippetCheck(page("max-snippet:-1"))?.status).toBe("goed");
    expect(snippetCheck(page("max-snippet:160"))?.status).toBe("goed");
    expect(snippetCheck(page("max-snippet:0"))?.status).toBe("blokker");
  });

  it("een zichtbare datum die ver afwijkt van de datum in de code telt maar half", () => {
    const page = (modified: string) =>
      `<head><script type="application/ld+json">{"@type":"Article","dateModified":"${modified}"}</script></head><body><p>Bijgewerkt op 20 november 2026. ${words(100)}</p></body>`;
    const e1 = (html: string) => layerFor(html).forced.find((c) => c.id === "E1");
    expect(e1(page("2026-11-18"))?.verdict).toBe("voldoet");
    expect(e1(page("2025-03-01"))?.verdict).toBe("deels");
  });

  it("vindt links naar een auteurs- of Over ons-pagina en meldt sitenaam en favicon zonder punten", () => {
    const html = `<head><link rel="icon" href="/favicon.ico"><meta property="og:site_name" content="Voorbeeld"></head><body><a href="/over-ons">Wie we zijn</a><a href="/blog/x">Over ons</a><a href="/diensten">Diensten</a><p>${words(100)}</p></body>`;
    const f = extractPageFacts(html, URL_);
    expect(f.links.about).toEqual(["/over-ons", "/blog/x"]);
    expect(f.faviconLink).toBe(true);
    const hygiene = layerFor(html).hygiene.find((h) => h.label === "Sitenaam en favicon");
    expect(hygiene?.status).toBe("goed");
    expect(layerFor(`<body><p>${words(100)}</p></body>`).hygiene.find((h) => h.label === "Sitenaam en favicon")?.status).toBe("aandacht");
  });
});
