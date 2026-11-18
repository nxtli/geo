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
