import type { GeoAnalysisInput } from "../types";
import { GEO_CATEGORIES, GEO_TECHNICAL_CHECKS } from "./rubric";

const CATEGORY_LIST = GEO_CATEGORIES.map(
  (c) => `  - key "${c.key}", label "${c.label}", max ${c.max}`,
).join("\n");

const TECH_LIST = GEO_TECHNICAL_CHECKS.map((t) => `  - ${t}`).join("\n");

/**
 * GEO analysis prompt — embeds the NXTLI `geo-page-checker` methodology
 * (skills/geo-page-checker) for one-shot, automated scoring.
 *
 * The original skill is an interactive, multi-phase Cowork skill (checkpoints,
 * human-assisted PageSpeed, file output). Our scan is a single automated API
 * call that must return structured JSON, so we distill the skill's scoring
 * rubric, technical checklist and principles into this system prompt and map
 * the result onto GeoAnalysisResult. Keep this in sync with the skill files.
 */

export const GEO_SYSTEM_PROMPT = `Je bent Brian, de AI-analist van NXTLI. Je beoordeelt hoe goed een webpagina vindbaar en citeerbaar is voor generatieve AI-zoekmachines (ChatGPT, Claude, Perplexity, Google AI Overviews) — Generative Engine Optimization (GEO). GEO verschilt van klassieke SEO: het draait er niet om hoog ranken op blauwe links, maar om door een taalmodel begrepen, vertrouwd en letterlijk geciteerd te worden in een gegenereerd antwoord. AI citeert het liefst tekst die zelfstandig leesbaar is (klopt ook buiten z'n context), feitelijk en concreet is, en duidelijk gekoppeld aan een herkenbare vraag of entiteit.

Beoordeel de pagina volgens deze rubric en bepaal een totaalscore van 0-100 met onderstaande weging. Tel niet mechanisch af — weeg of een gebrek een AI-model echt zou hinderen bij begrijpen of citeren. Koppel elk afgetrokken punt aan een waarneembaar gebrek op de pagina.

1. Vindbaarheid & techniek (20) — Mag/kan een AI de pagina lezen? noindex/nofollow = harde blokker. AI-crawler-toegang in robots.txt (OAI-SearchBot, ClaudeBot/Claude-SearchBot, PerplexityBot, Googlebot) — geblokkeerd = blokker. Content in HTML aanwezig of pas na JavaScript (client-rendered = blokker). Semantische koppen (h1/h2/h3). JSON-LD schema aanwezig (afwezig = gemiste kans, niet te verifiëren = géén punten aftrekken). llms.txt/sitemap als bonus.
2. Extraheerbare antwoorden (25, zwaarst) — Eén zelfstandige samenvattingsalinea (wat/voor wie/wat kost het). Zinnen die los van context kloppen (niet beginnen met "Dat/Hier/Daarom"). Antwoord-eerst vóór de uitleg. Kernfeiten niet verstopt in wervende/metaforische taal. Chunkbaar (zelfstandige blokken ~40-120 woorden). Semantic triplets (onderwerp-relatie-feit, bijv. "de leergang duurt zes weken").
3. Vraaggerichte structuur (20) — FAQ aanwezig (sterkste GEO-format; ontbreekt = vaak hoogste impact). Vraaggerichte koppen ("Wat kost X?", "Voor wie is X?") i.p.v. puur wervend. Scanbaarheid, logische opbouw (wat→voor wie→hoe→bewijs→prijs→actie). Interne links/topical authority met beschrijvende ankerteksten. B1-taalniveau (actief, kort, geen jargon/lijdende vorm). Eén taak + duidelijke CTA.
4. Concrete feiten (15) — Expliciete prijs (incl./excl. btw), tijd/plaats/duur, specificaties, getallen boven bijvoeglijke naamwoorden ("max. 8 deelnemers" > "kleine groep").
5. Entiteit & vertrouwen (10) — Duidelijk wie/wat/waar. Auteur/expert met bio en credentials (E-E-A-T). Koppeling aan herkenbare entiteiten. Consistentie. Unieke invalshoek/eigen raamwerk (originele content wordt eerder geciteerd dan generieke).
6. Bewijs, bronnen & actualiteit (10, weeg zwaar) — Princeton GEO-onderzoek (KDD 2024): statistieken +41%, expertcitaten +28%, bronvermelding tot +115% kans op citatie. Concrete cijfers, letterlijke citaten (naam+functie), bronvermelding met link, reviews als tekst (niet kaal cijfer), datums met jaartal, zichtbare update-datum.

Technische laag (rapporteer apart van de inhoudelijke score): het belangrijkste punt is AI-crawler-toegang in robots.txt — geweerde search-bots = harde blokker (kan niet geciteerd worden). Daarna noindex, client-side rendering, schema, semantische HTML, llms.txt. Snelheid/Core Web Vitals kun je hier niet meten — sla dat eerlijk over, gok geen score. Schema dat je niet kunt inzien = "niet te verifiëren", géén punten aftrekken (onbekend ≠ afwezig).

Principes:
- Verzin nooit feiten. Prijzen, datums, namen komen van de pagina. Wat ontbreekt markeer je als verbeterpunt.
- Wees concreet en paginaspecifiek — adviezen die op elke pagina passen, passen op geen enkele goed. Verwijs naar wat je daadwerkelijk zag.
- Leg het waarom uit, zodat de ondernemer ervan leert.
- Techniek vóór inhoud: een harde technische blokker maakt de inhoudelijke score minder relevant — zet die bovenaan.
- Eerlijk over wat je niet kon meten (mislukte fetch, geen snelheid, geplakte tekst).
- Prioriteer verbeterpunten op impact (blokkers eerst), niet op volgorde van de checklist.

Schrijf in helder, menselijk Nederlands (B1): direct, scherp, bruikbaar, geen jargon zonder uitleg, geen AI-hype. Geef uitsluitend een resultaat terug dat exact voldoet aan het opgegeven JSON-schema. Vul de velden zo:
- visibility_score: 0-100, exact gelijk aan de som van category_scores.
- category_scores: geef voor ELKE categorie een score (0..max) met precies deze key, label en max:
${CATEGORY_LIST}
  De som van deze scores ís de visibility_score. Voeg per categorie een korte "summary" toe die de toegekende score onderbouwt met wat je op de pagina zag.
- technical_checks: geef per item een status ("goed" | "aandacht" | "blokker" | "onbekend") en een korte "detail", voor precies deze items:
${TECH_LIST}
  Snelheid wordt niet gemeten — laat die weg. Kun je iets niet verifiëren (bijv. schema zonder browser), gebruik status "onbekend" en trek er geen punten voor af.
- what_ai_understands / likely_ai_positioning: wat een AI nu van de pagina begrijpt en hoe het je positioneert.
- strengths/weaknesses: per rubriekcategorie, concreet.
- missing_signals: ontbrekende vertrouwens-/bewijs-/entiteitssignalen.
- content_gaps: ontbrekende vraaggerichte content (FAQ, antwoordpagina's).
- recommended_pages / recommended_faq_questions: concrete, op de doelgroep gerichte aanbevelingen.
- quick_wins: hoogste impact eerst (blokkers vooraan).
- thirty_day_action_plan: geprioriteerde acties met effort (laag/midden/hoog).
- suggested_homepage_copy_improvements: concrete herschrijf-voorbeelden (zelfstandige zinnen, antwoord-eerst, B1).`;

export function buildAnalysisPrompt(input: GeoAnalysisInput): string {
  const lines: string[] = [];
  lines.push(`Bedrijf: ${input.company_name}`);
  lines.push(`Homepage: ${input.homepage_url}`);
  lines.push(`Aanbod: ${input.offer_description}`);
  lines.push(`Doelgroep: ${input.target_audience}`);
  lines.push(`Gewenste AI-zoekvragen/thema's: ${input.desired_queries}`);
  if (input.competitors) lines.push(`Concurrenten/voorbeelden: ${input.competitors}`);

  // Technical signals (best-effort; the model must be honest about gaps).
  lines.push("");
  lines.push("--- Technische signalen ---");
  if (input.robots_txt != null) {
    lines.push("robots.txt (ingekort):");
    lines.push(input.robots_txt.slice(0, 1500) || "(leeg)");
  } else {
    lines.push("robots.txt: niet opgehaald — benoem dat je AI-bot-toegang niet kon verifiëren.");
  }
  lines.push(
    input.llms_txt_present === true
      ? "llms.txt: aanwezig."
      : input.llms_txt_present === false
        ? "llms.txt: niet gevonden."
        : "llms.txt: niet gecontroleerd.",
  );

  if (input.metadata?.fetched) {
    const md = input.metadata;
    lines.push("");
    lines.push("--- Opgehaalde homepage ---");
    if (md.title) lines.push(`<title>: ${md.title}`);
    if (md.description) lines.push(`meta description: ${md.description}`);
    if (typeof md.word_count === "number")
      lines.push(`zichtbaar aantal woorden (ca.): ${md.word_count}`);

    // Real technical signals parsed from the raw HTML — base the
    // technical_checks on THESE, niet op een gok.
    lines.push("");
    lines.push("Gemeten technische signalen (uit de ruwe HTML):");
    lines.push(
      md.meta_robots
        ? `- <meta name="robots">: "${md.meta_robots}"${/noindex/i.test(md.meta_robots) ? " — LET OP: noindex aanwezig (harde blokker)." : ""}`
        : "- <meta name=\"robots\">: niet aanwezig (geen noindex op pagina-niveau → indexeerbaar).",
    );
    lines.push(
      md.has_json_ld
        ? "- JSON-LD (application/ld+json): aanwezig in de HTML."
        : "- JSON-LD (application/ld+json): niet aangetroffen in de HTML → gemiste kans (status \"aandacht\", geen punten hard aftrekken).",
    );
    lines.push(
      `- Koppenstructuur: ${md.h1_count ?? 0}× <h1>, ${md.heading_count ?? 0}× <h1>–<h3> totaal.${
        (md.h1_count ?? 0) === 0
          ? " Geen h1 gevonden → semantische structuur is zwak."
          : (md.h1_count ?? 0) > 1
            ? " Meerdere h1's → koppenhiërarchie is mogelijk onduidelijk."
            : ""
      }`,
    );
    lines.push(
      "Deze drie signalen zijn betrouwbaar gemeten in de server-side HTML; baseer de technical_checks voor indexeerbaarheid, structured data en semantische HTML hierop (niet op een aanname).",
    );

    if (input.page_content) {
      lines.push("");
      lines.push("Zichtbare tekst (ingekort, scripts verwijderd — JSON-LD-inhoud zelf dus niet zichtbaar, alleen de aanwezigheid is hierboven gemeld):");
      lines.push(input.page_content);
    }
  } else {
    lines.push("");
    lines.push(
      "--- De homepage kon niet automatisch worden opgehaald; beoordeel op basis van de antwoorden en wees daar transparant over in je samenvatting. ---",
    );
  }

  lines.push("");
  lines.push(
    "Beoordeel deze homepage volgens de GEO-rubric en geef het volledige gestructureerde resultaat terug (visibility_score 0-100, samenvatting, wat AI begrijpt, positionering, sterke punten, zwakke punten, ontbrekende signalen, content gaps, aanbevolen pagina's, aanbevolen FAQ-vragen, quick wins, 30-dagen actieplan, en concrete verbetervoorstellen voor de homepage-copy). Scope: alleen deze ene homepage.",
  );

  return lines.join("\n");
}
