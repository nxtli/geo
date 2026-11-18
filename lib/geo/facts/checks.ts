import type { CriterionResult, GeoAction, GeoAnalysisInput, TechnicalCheck } from "../types";
import { getEvidence, OWNER_LABEL, SCORECARD } from "../knowledge";
import { robotsFixSnippet } from "./robots";

/**
 * De feitenlaag: alles wat de scan zonder taalmodel vaststelt. Levert de
 * technische checks, de poortwachters, de hygiëne en de adviezen die daar
 * direct uit volgen.
 */
export interface FactLayer {
  technical_checks: TechnicalCheck[];
  hygiene: TechnicalCheck[];
  blocked: boolean;
  gateActions: GeoAction[];
  /** Oordelen die een feit beslist; gaan vóór het oordeel van het taalmodel. */
  forced: CriterionResult[];
}

function gateAction(id: string, a: Pick<GeoAction, "title" | "why" | "where" | "before" | "after" | "effort">): GeoAction {
  const gate = SCORECARD.gates.find((g) => g.id === id)!;
  const ev = getEvidence(gate.evidence[0]);
  return {
    ...a,
    criterion: id,
    owner: OWNER_LABEL[gate.owner],
    done_when: gate.done_when,
    points: 0,
    evidence_grade: ev?.grade ?? "feit",
    source: ev?.sources[0]?.title ?? "",
  };
}

export function buildFactLayer(input: GeoAnalysisInput): FactLayer {
  const f = input.facts ?? null;
  const r = input.robots ?? null;
  const checks: TechnicalCheck[] = [];
  const hygiene: TechnicalCheck[] = [];
  const gateActions: GeoAction[] = [];
  const forced: CriterionResult[] = [];

  // P1 — AI-zoekbots
  if (!r || !r.known) {
    checks.push({ label: "AI-zoekbots (robots.txt)", status: "onbekend", detail: "robots.txt was niet bereikbaar. Toegang is niet vastgesteld." });
  } else if (r.blockedSearch.length) {
    const names = r.blockedSearch.map((b) => `${b.token} (${b.engine})`).join(", ");
    checks.push({ label: "AI-zoekbots (robots.txt)", status: "blokker", detail: `Geblokkeerd voor deze pagina: ${names}. Deze AI-tools mogen de pagina niet ophalen.` });
    gateActions.push(
      gateAction("P1", {
        title: `Laat ${r.blockedSearch.map((b) => b.token).join(", ")} toe in robots.txt`,
        why: `robots.txt weert ${names}. Zolang dat zo is, gebruikt die AI-tool de pagina niet in antwoorden.`,
        where: "/robots.txt",
        before: r.blockedSearch.map((b) => `User-agent: ${b.matchedGroup === "*" ? "*" : b.token}\n${b.rule ?? ""}`).join("\n\n"),
        after: robotsFixSnippet(r.blockedSearch),
        effort: "laag",
      }),
    );
  } else {
    const training = r.blockedTraining.map((b) => b.token);
    checks.push({
      label: "AI-zoekbots (robots.txt)",
      status: "goed",
      detail:
        "OAI-SearchBot, Claude-SearchBot, PerplexityBot, Googlebot en Bingbot mogen de pagina ophalen." +
        (training.length ? ` Trainingsbots geweerd: ${training.join(", ")}. Dat is een keuze en geen fout.` : "") +
        " Een firewall of CDN kan bots alsnog weren. Dat ziet deze scan niet.",
    });
  }

  if (!f) {
    for (const label of ["Indexeerbaar en snippets toegestaan", "Tekst in de HTML (zonder JavaScript)", "Koppenstructuur", "Titel en beschrijving"]) {
      checks.push({ label, status: "onbekend", detail: "De pagina kon niet worden opgehaald." });
    }
  } else {
    // P2 — indexeerbaar
    if (f.noindex || f.nosnippet) {
      const what = [f.noindex ? "noindex" : "", f.nosnippet ? "nosnippet" : ""].filter(Boolean).join(" en ");
      const src = f.xRobotsTag && /noindex|nosnippet|none|max-snippet/i.test(f.xRobotsTag) ? `X-Robots-Tag: ${f.xRobotsTag}` : `<meta name="robots" content="${f.metaRobots ?? ""}">`;
      checks.push({ label: "Indexeerbaar en snippets toegestaan", status: "blokker", detail: `De pagina bevat ${what} (${src}).` });
      gateActions.push(
        gateAction("P2", {
          title: `Verwijder ${what} van deze pagina`,
          why: "Een pagina die niet geïndexeerd mag worden of niet in snippets mag, verschijnt niet in de AI-functies van Google.",
          where: f.xRobotsTag ? "HTTP-header X-Robots-Tag" : "<head> van de pagina",
          before: src,
          after: f.xRobotsTag ? "X-Robots-Tag: index, follow (of de header verwijderen)" : '<meta name="robots" content="index, follow">',
          effort: "laag",
        }),
      );
    } else {
      checks.push({ label: "Indexeerbaar en snippets toegestaan", status: "goed", detail: "Geen noindex of nosnippet in de meta-tag of de HTTP-header." });
    }
    // P3 — rendering
    if (f.jsShell) {
      checks.push({ label: "Tekst in de HTML (zonder JavaScript)", status: "blokker", detail: `De server geeft ${f.wordCount} woorden terug. De inhoud verschijnt pas na JavaScript.` });
      gateActions.push(
        gateAction("P3", {
          title: "Lever de kerntekst mee in de HTML van de server",
          why: "Veel AI-crawlers voeren geen JavaScript uit. Zij zien nu een lege pagina.",
          where: "Rendering van de site (server-side rendering of statische generatie)",
          before: `${f.wordCount} woorden in de HTML van de server`,
          after: "Koppen en kerntekst staan in de eerste HTML-respons.",
          effort: "hoog",
        }),
      );
    } else {
      checks.push({
        label: "Tekst in de HTML (zonder JavaScript)",
        status: f.wordCount < 150 ? "aandacht" : "goed",
        detail: `${f.wordCount} woorden in de HTML van de server.${f.wordCount < 150 ? " Dat is weinig. Controleer of een deel pas na JavaScript verschijnt." : ""}`,
      });
    }
    // Koppen (ook criterium G1)
    const headingOk = f.h1Count === 1 && !f.skippedHeadingLevel;
    const headingDetail = `${f.h1Count}× h1, ${f.headings.length} koppen in totaal.${f.skippedHeadingLevel ? " Er is een kopniveau overgeslagen." : ""}`;
    checks.push({ label: "Koppenstructuur", status: headingOk ? "goed" : "aandacht", detail: headingDetail });
    forced.push({ id: "G1", verdict: headingOk ? "voldoet" : f.h1Count === 1 ? "deels" : "niet", finding: headingDetail, quote: f.headings.find((h) => h.level === 1)?.text ?? "" });
    // Titel en beschrijving
    checks.push({
      label: "Titel en beschrijving",
      status: f.title && f.description ? "goed" : "aandacht",
      detail: `${f.title ? `Title: "${f.title.slice(0, 90)}".` : "Geen title."} ${f.description ? "Meta description aanwezig." : "Geen meta description."}`,
    });
    if (f.images.total) {
      checks.push({
        label: "Afbeeldingen met alt-tekst",
        status: f.images.missingAlt ? "aandacht" : "goed",
        detail: `${f.images.missingAlt} van ${f.images.total} afbeeldingen zonder alt-attribuut.`,
      });
    }
    // G3 — ankerteksten
    if (f.links.internal > 0) {
      const n = f.links.vagueAnchors.length;
      forced.push({
        id: "G3",
        verdict: n === 0 ? "voldoet" : n <= 2 ? "deels" : "niet",
        finding: n === 0 ? `${f.links.internal} interne links, geen vage ankerteksten.` : `Vage ankerteksten gevonden: ${f.links.vagueAnchors.join(", ")}.`,
        quote: f.links.vagueAnchors[0] ?? "",
      });
    }
    // E1 — zichtbare datum (alleen een gevonden datum is een feit)
    if (f.visibleDate) {
      forced.push({ id: "E1", verdict: "voldoet", finding: `Zichtbare datum gevonden: ${f.visibleDate}.`, quote: f.visibleDate });
    }
    // Hygiëne — gemeld, geen punten
    hygiene.push({
      label: "Structured data (JSON-LD)",
      status: f.jsonLd.invalid ? "aandacht" : f.jsonLd.blocks ? "goed" : "onbekend",
      detail: f.jsonLd.blocks
        ? `${f.jsonLd.blocks} blok(ken), typen: ${f.jsonLd.types.join(", ") || "geen @type"}.${f.jsonLd.invalid ? ` ${f.jsonLd.invalid} blok(ken) met ongeldige JSON: die worden genegeerd.` : ""} Telt niet mee: geen aangetoond effect op AI-citaties.`
        : "Niet aanwezig. Telt niet mee: geen aangetoond effect op AI-citaties. Wel nuttig voor gewone zoekresultaten.",
    });
    hygiene.push({ label: "Canonical", status: f.canonical ? "goed" : "aandacht", detail: f.canonical ? f.canonical : "Geen canonical-link gevonden." });
  }
  hygiene.push({
    label: "llms.txt",
    status: "onbekend",
    detail: `${input.llms_txt_present === true ? "Aanwezig." : input.llms_txt_present === false ? "Niet aanwezig." : "Niet gecontroleerd."} Telt niet mee en vraagt geen actie: geen aangetoond effect op AI-citaties.`,
  });

  // Criteria die deze scan niet kan meten.
  forced.push({ id: "G4", verdict: "nvt", finding: "Laadsnelheid is in deze scan niet gemeten.", quote: "" });
  forced.push({ id: "F3", verdict: "nvt", finding: "Vermeldingen buiten de eigen site zijn in deze scan niet onderzocht.", quote: "" });

  return { technical_checks: checks, hygiene, blocked: gateActions.length > 0, gateActions, forced };
}
