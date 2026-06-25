import type {
  GeoAnalysisInput,
  GeoAnalysisResult,
  TechnicalCheck,
} from "../../types";
import type { GeoAnalysisOutcome, GeoAnalysisProvider } from "../provider";
import { GEO_CATEGORIES } from "../rubric";

/**
 * Deterministic fallback provider. Always configured, never calls the network.
 * Produces a believable, structured report from the visitor's own answers so
 * the full flow works end-to-end without any AI credentials. The score is
 * derived deterministically from the richness of the inputs.
 */
export class MockAnalysisProvider implements GeoAnalysisProvider {
  readonly id = "mock";

  isConfigured(): boolean {
    return true;
  }

  async analyze(input: GeoAnalysisInput): Promise<GeoAnalysisOutcome> {
    const company = input.company_name || "je bedrijf";
    const fetched = input.metadata?.fetched ?? false;

    // Cheap heuristic score: reward concrete, detailed inputs + a reachable page.
    let score = 42;
    if (fetched) score += 14;
    if ((input.offer_description?.length ?? 0) > 120) score += 8;
    if ((input.target_audience?.length ?? 0) > 60) score += 6;
    if ((input.desired_queries?.length ?? 0) > 60) score += 8;
    if (input.metadata?.description) score += 6;
    score = Math.max(28, Math.min(82, score));

    // Break the total down across the rubric so the breakdown sums to the total.
    const frac = score / 100;
    const category_scores = GEO_CATEGORIES.map((c) => ({
      key: c.key,
      label: c.label,
      max: c.max,
      score: Math.round(c.max * frac),
      summary: "Voorlopige inschatting op basis van je antwoorden (mock).",
    }));
    const total = category_scores.reduce((s, c) => s + c.score, 0);

    const technical_checks: TechnicalCheck[] = [
      {
        label: "AI-crawler-toegang (robots.txt)",
        status: input.robots_txt == null ? "onbekend" : "goed",
        detail:
          input.robots_txt == null
            ? "robots.txt niet opgehaald — toegang niet geverifieerd."
            : "Geen blokkade voor AI-search-bots aangetroffen.",
      },
      {
        label: "Indexeerbaarheid (noindex/nofollow)",
        status: fetched ? "goed" : "onbekend",
        detail: fetched ? "Geen noindex aangetroffen." : "Niet gecontroleerd.",
      },
      {
        label: "Content-rendering (zonder JavaScript leesbaar)",
        status: fetched ? "goed" : "aandacht",
        detail: fetched
          ? "Tekst staat in de HTML."
          : "Pagina kon niet automatisch worden opgehaald.",
      },
      {
        label: "Structured data (schema / JSON-LD)",
        status: "onbekend",
        detail: "Niet te verifiëren zonder browser.",
      },
      {
        label: "Semantische HTML (koppenstructuur)",
        status: "onbekend",
        detail: "Niet automatisch beoordeeld in deze voorlopige scan.",
      },
      {
        label: "llms.txt",
        status:
          input.llms_txt_present === true
            ? "goed"
            : input.llms_txt_present === false
              ? "aandacht"
              : "onbekend",
        detail:
          input.llms_txt_present === true
            ? "Aanwezig."
            : input.llms_txt_present === false
              ? "Niet gevonden."
              : "Niet gecontroleerd.",
      },
    ];

    const result: GeoAnalysisResult = {
      visibility_score: total,
      category_scores,
      technical_checks,
      short_summary: fetched
        ? `${company} is herkenbaar online aanwezig, maar de homepage maakt voor AI-systemen nog niet scherp genoeg duidelijk wat je precies aanbiedt en voor wie. Met een paar gerichte aanpassingen word je makkelijker samengevat en aanbevolen.`
        : `Op basis van je antwoorden heeft ${company} een duidelijk aanbod, maar we konden de homepage niet automatisch ophalen. De grootste kans ligt in het concreter en gestructureerder maken van je content zodat AI-systemen je expertise herkennen.`,
      what_ai_understands: `AI-systemen kunnen waarschijnlijk afleiden dat ${company} actief is rond "${truncate(input.offer_description, 80)}", maar de koppeling met je doelgroep en de concrete vragen die zij stellen is nog niet expliciet genoeg.`,
      likely_ai_positioning: `Op dit moment word je waarschijnlijk gezien als een algemene speler in je categorie, niet als hét antwoord op specifieke vragen van ${truncate(input.target_audience, 60)}.`,
      strengths: [
        "Er is een helder kernaanbod om op voort te bouwen.",
        fetched
          ? "De homepage is technisch bereikbaar voor AI-crawlers."
          : "Je hebt een duidelijk beeld van je doelgroep en aanbod.",
        "De gewenste zoekthema's zijn concreet genoeg om content omheen te bouwen.",
      ],
      weaknesses: [
        "Expertise en autoriteit worden nog niet met bewijs onderbouwd (cases, cijfers, referenties).",
        "De homepage beantwoordt de concrete vragen van de doelgroep nog niet expliciet.",
        "Content is nog niet gestructureerd in citeerbare, op zichzelf staande antwoorden.",
      ],
      missing_signals: [
        "Duidelijke 'wat wij doen / voor wie'-statement bovenaan",
        "Bewijs van autoriteit (klantcases, resultaten, beoordelingen)",
        "Gestructureerde FAQ die echte zoekvragen beantwoordt",
      ],
      content_gaps: deriveQueries(input.desired_queries).map(
        (q) => `Een pagina of sectie die de vraag "${q}" concreet beantwoordt.`,
      ),
      recommended_pages: [
        "Een heldere 'Wat we doen'-pagina per dienst",
        "Een cases-/resultatenpagina met concrete cijfers",
        "Een FAQ-pagina die de belangrijkste klantvragen beantwoordt",
      ],
      recommended_faq_questions: deriveQueries(input.desired_queries).map(
        (q) => ({
          question: capitalize(q.endsWith("?") ? q : `${q}?`),
          why: "Deze vraag sluit aan op wat je doelgroep aan AI vraagt en is goed citeerbaar.",
        }),
      ),
      quick_wins: [
        "Zet bovenaan je homepage één heldere zin: wat je doet, voor wie, en wat het oplevert.",
        "Voeg een korte FAQ toe met 3–5 echte klantvragen en bondige antwoorden.",
        "Maak je expertise concreet met minimaal één cijfer of klantresultaat.",
      ],
      thirty_day_action_plan: [
        {
          title: "Herschrijf de homepage-introductie naar een concreet aanbod-statement",
          why: "AI-systemen citeren content die in één oogopslag duidelijk maakt wat je doet en voor wie.",
          effort: "laag",
        },
        {
          title: "Bouw een FAQ rond de belangrijkste zoekvragen van je doelgroep",
          why: "Gestructureerde vraag-antwoordcontent wordt vaker letterlijk overgenomen in AI-antwoorden.",
          effort: "midden",
        },
        {
          title: "Voeg autoriteitssignalen toe (cases, cijfers, referenties)",
          why: "Betrouwbaarheidssignalen vergroten de kans dat AI jou aanbeveelt boven concurrenten.",
          effort: "midden",
        },
      ],
      suggested_homepage_copy_improvements: [
        `Vervang vage taglines door een concrete belofte voor ${truncate(input.target_audience, 50)}.`,
        "Gebruik koppen die echte vragen beantwoorden in plaats van merkslogans.",
        "Voeg een korte, scanbare opsomming toe van je belangrijkste diensten.",
      ],
    };
    return { result };
  }
}

function deriveQueries(raw: string): string[] {
  const parts = (raw || "")
    .split(/[\n,;•·]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  return parts.length ? parts : ["hoe kies ik de juiste partner hiervoor"];
}

function truncate(s: string, n: number): string {
  const t = (s || "").trim();
  return t.length > n ? `${t.slice(0, n).trim()}…` : t;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
