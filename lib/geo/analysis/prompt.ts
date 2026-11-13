import type { BuyerContext, GeoAnalysisInput } from "../types";
import { EVIDENCE, getEvidence, SCORECARD } from "../knowledge";
import { CHARLIE_VOICE, VOICE_REPORT } from "../voice";

/**
 * Analyse-prompt. De criteria en de aannames komen uit de kennisbank
 * (lib/geo/knowledge), niet uit deze tekst. Het taalmodel beoordeelt alleen de
 * inhoud: feiten over techniek worden door code gemeten en meegegeven, en de
 * punten worden door code berekend uit de oordelen per criterium.
 */
const CRITERIA_LIST = SCORECARD.dimensions
  .map(
    (d) =>
      `${d.label}\n` +
      d.criteria
        .map((c) => `  - ${c.id} (${c.max} punten): ${c.name}. Voldoet als: ${c.done_when}`)
        .join("\n"),
  )
  .join("\n");

const ASSUMPTIONS = EVIDENCE.items
  .filter((e) => e.grade !== "feit")
  .map((e) => `- [${e.grade}] ${e.claim}${e.caveat ? ` Voorbehoud: ${e.caveat}` : ""}`)
  .join("\n");

const NO_EFFECT = ["E-SCHEMA", "E-LLMSTXT", "E-FORMAT"]
  .map((id) => getEvidence(id)?.claim)
  .filter(Boolean)
  .join(" ");

export const GEO_SYSTEM_PROMPT = `Je bent Charlie, de AI-analist van NXTLI. Je beoordeelt of één webpagina geschikt is om door AI-zoekmachines (ChatGPT, Claude, Perplexity, Google AI Overviews en AI Mode) gevonden, begrepen en aanbevolen te worden.

Wat je wel en niet doet
- Je beoordeelt de INHOUD van de pagina per criterium. Je rekent geen punten uit en geeft geen totaalscore: dat doet de code.
- Technische feiten (robots.txt, noindex, koppen, datum, prijs, links) zijn gemeten en staan in de invoer. Neem ze over. Spreek ze nooit tegen en schat ze niet zelf in.
- Deze scan meet geschiktheid van de pagina. Hij meet niet hoe vaak een AI-tool het merk noemt of aanbeveelt. Beloof dat dus nergens.

De criteria (kennisbank ${EVIDENCE.version}, scorecard ${SCORECARD.version})
${CRITERIA_LIST}

Oordeel per criterium
- "voldoet": de pagina voldoet aan de toets achter "Voldoet als".
- "deels": een deel is aanwezig, een deel ontbreekt.
- "niet": het ontbreekt.
- Eigen inbreng (U1 tot en met U3): stel per passage de vraag of een taalmodel dit zonder deze pagina had kunnen schrijven. Algemene uitleg, bekende voordelen en cijfers van anderen tellen niet. Eigen data, eigen onderzoek, cases, observaties uit klantgesprekken en een eigen methode of standpunt tellen wel, mits de herkomst erbij staat. In het voorstel verzin je deze inhoud nooit: schrijf [invullen: ...] en zeg welke bron de organisatie daarvoor heeft (onderzoek, klantgesprekken, verkoopdata).
- "nvt": niet te beoordelen met de aangeleverde tekst of kennis. Gebruik dit liever dan te gokken. Bijvoorbeeld A4 zonder bekende keuzecriteria, F3 en G4 altijd.
- "finding": één korte zin over wat je op de pagina zag.
- "quote": een letterlijk citaat van de pagina (maximaal 12 woorden) dat je oordeel onderbouwt. Leeg als er niets te citeren valt. Verzin geen citaat.
- Geef voor ELK criterium-id precies één oordeel.

De aannames achter de criteria (met bewijskracht)
${ASSUMPTIONS}

Geen effect aangetoond, dus geen advies als hefboom voor AI-vindbaarheid: ${NO_EFFECT}

Adviezen ("actions")
Geef voor ELK criterium met oordeel "niet" of "deels" een advies dat iemand vandaag kan uitvoeren. Zijn het er meer dan twaalf, kies dan de twaalf criteria met de meeste punten.
- "criterion": het id van het criterium.
- "title": de handeling, in gebiedende wijs, specifiek voor deze pagina. Niet "voeg een prijs toe" maar "Zet onder de kop 'Tarieven' het bedrag per maand".
- "why": wat je zag en wat het de lezer of de AI-tool kost. Noem geen percentages of beloofde stijgingen.
- "where": de kop of alinea op de pagina waar de wijziging komt.
- "before": de huidige tekst op de plek van de wijziging, letterlijk overgenomen van de pagina (maximaal 60 woorden). Zoek altijd eerst de passage die het dichtst bij het advies ligt. Alleen leeg als de pagina op deze plek echt niets heeft.
- "after": altijd ingevuld. Jouw voorstel in B1-Nederlands, klaar om te plakken. Gebruik alleen feiten die op de pagina of in de aangeleverde kennis staan. Wat ontbreekt schrijf je als [invullen: ...]. Verzin nooit prijzen, cijfers, namen of klantcitaten.
- "effort": laag (tekstwijziging), midden (nieuwe alinea of sectie), hoog (nieuwe pagina of techniek).
Wijzig zo weinig mogelijk: een gerichte reparatie werkt beter dan een herschreven pagina.

Overige velden
- short_summary: drie tot vier zinnen. Begin met de grootste belemmering. Zeg welke klantvraag de pagina het slechtst beantwoordt.
- what_ai_understands / likely_ai_positioning: wat een AI-tool uit deze pagina kan opmaken over wie, wat en voor wie.
- ai_answer_comparison: "current" = hoe een AI-tool het aanbod nu zou samenvatten op basis van deze pagina, met 3 tot 4 labels. "improved" = hoe dat klinkt na de adviezen, met alleen feiten van de pagina of [invullen: ...].
- strengths / weaknesses: elk hooguit drie, concreet.
- De ids van de criteria (zoals A1 of U2) zijn alleen voor het veld "criterion". Noem ze nooit in een tekst die de lezer ziet, ook niet tussen haakjes.
- recommended_faq_questions: hooguit vijf klantvragen die de pagina niet beantwoordt. Neem de opgegeven klantvragen als basis. "why" zegt bij welk publiek de vraag hoort.

Zo communiceer je
${CHARLIE_VOICE}

${VOICE_REPORT}

Geef uitsluitend het gevraagde JSON terug.`;

/** Koperskennis uit de chatvelden, als er geen Marketingbrein is. */
export function buyerFromLead(input: GeoAnalysisInput): BuyerContext {
  const questions = (input.desired_queries || "")
    .split(/\n|;|\?(?=\s)|,(?=\s*(?:wat|hoe|welke|waar|wie|wanneer|waarom)\b)/i)
    .map((q) => q.trim())
    .filter((q) => q.length > 3)
    .slice(0, 8)
    .map((text) => ({ text, source: "opgegeven door de bezoeker" }));
  return {
    origin: "bezoeker",
    audiences: input.target_audience ? [input.target_audience] : [],
    questions,
    decision_criteria: [],
    offers: input.offer_description ? [input.offer_description] : [],
    competitors: input.competitors ? input.competitors.split(/,|\n/).map((c) => c.trim()).filter(Boolean) : [],
    positioning: null,
    gaps: ["Aanleiding en keuzecriteria van de koper zijn niet bekend."],
  };
}

function list(title: string, items: string[]): string[] {
  return items.length ? [title, ...items.map((i) => `  - ${i}`)] : [`${title} (niet bekend)`];
}

export function buildAnalysisPrompt(input: GeoAnalysisInput): string {
  const buyer = input.buyer ?? buyerFromLead(input);
  const f = input.facts ?? null;
  const r = input.robots ?? null;
  const lines: string[] = [];
  const site = input.facts?.siteName;
  lines.push(`Bedrijf (ingevuld door de aanvrager): ${input.company_name}`);
  if (site && site.toLowerCase() !== input.company_name.toLowerCase()) {
    lines.push(`Merk volgens de pagina zelf: ${site}. Beoordeel de pagina als pagina van dit merk en gebruik deze naam in je teksten.`);
  }
  lines.push(`Pagina: ${input.homepage_url}`);

  lines.push("", `--- Kennis over de koper (bron: ${buyer.origin === "marketingbrein" ? "goedgekeurde kennis uit het Marketingbrein" : "ingevuld door de bezoeker, niet getoetst"}) ---`);
  if (buyer.positioning) lines.push(`Positionering: ${buyer.positioning}`);
  lines.push(...list("Publieken:", buyer.audiences));
  lines.push(...list("Klantvragen (toets A1 hierop):", buyer.questions.map((q) => `${q.ref ? `[${q.ref}] ` : ""}${q.text} (herkomst: ${q.source})`)));
  lines.push(...list("Keuzecriteria van de koper (toets A4 hierop):", buyer.decision_criteria));
  lines.push(...list("Aanbod met feiten (toets B1 en B2 hierop):", buyer.offers));
  lines.push(...list("Concurrenten:", buyer.competitors));
  if (buyer.gaps.length) lines.push(...list("Ontbrekende kennis:", buyer.gaps));

  lines.push("", "--- Gemeten feiten (door code vastgesteld, niet wijzigen) ---");
  if (r?.known) {
    lines.push(
      r.blockedSearch.length
        ? `AI-zoekbots geblokkeerd: ${r.blockedSearch.map((b) => b.token).join(", ")}.`
        : "AI-zoekbots: toegelaten.",
    );
  } else {
    lines.push("AI-zoekbots: robots.txt niet bereikbaar, toegang onbekend.");
  }
  if (f) {
    lines.push(`Title: ${f.title ?? "(geen)"}`);
    lines.push(`Meta description: ${f.description ?? "(geen)"}`);
    lines.push(`Taal (html lang): ${f.lang ?? "(niet opgegeven)"}`);
    lines.push(`Woorden in de HTML: ${f.wordCount}`);
    lines.push(`noindex: ${f.noindex ? "ja" : "nee"} · nosnippet: ${f.nosnippet ? "ja" : "nee"}`);
    lines.push(`Koppen: ${f.h1Count}× h1, ${f.headings.length} totaal${f.skippedHeadingLevel ? ", kopniveau overgeslagen" : ""}`);
    lines.push(`Eurobedrag in de tekst: ${f.hasPrice ? `ja (${f.priceSamples.join("; ")})` : "nee"}`);
    lines.push(`Zichtbare datum met jaartal: ${f.visibleDate ?? "niet gevonden"}`);
    lines.push(`Interne links: ${f.links.internal}; vage ankerteksten: ${f.links.vagueAnchors.join(", ") || "geen"}`);
    lines.push(`JSON-LD-typen: ${f.jsonLd.types.join(", ") || "geen"} (telt niet mee)`);
  }

  if (input.page_content) {
    lines.push("", "--- Zichtbare tekst van de pagina (koppen als #, ingekort) ---", input.page_content);
  } else {
    lines.push("", "--- De pagina kon niet worden opgehaald. Geef elk criterium het oordeel \"nvt\". ---");
  }

  lines.push("", "Beoordeel deze ene pagina per criterium en geef de adviezen. Scope: alleen deze pagina, niet de hele site.");
  return lines.join("\n");
}
