import Anthropic from "@anthropic-ai/sdk";
import type {
  DiscoveryInput,
  DiscoveryOutcome,
  DiscoveryProvider,
} from "../provider";
import { discoveryJsonSchema, parseDiscoveryResult } from "../provider";
import { segmentPromptList } from "../../segments";
import { logError, logInfo } from "../../../geo/logger";

/**
 * Bedrijven ontdekken met Claude + de server-side web-search tool.
 *
 * Gebruikt dezelfde ANTHROPIC_API_KEY als de research-laag — geen extra dienst
 * om aan te melden. Het zoeken gebeurt aan Anthropic's kant; wij krijgen de
 * zoekresultaten mét de echte URL's terug, en juist die URL's vormen de
 * toegestane bronnenset voor de validatie.
 *
 * ── Waarom TWEE calls ──────────────────────────────────────────────────────
 * Stap 1 zoekt en schrijft de bevindingen als gewone tekst. Stap 2 zet die
 * tekst om in gevalideerde JSON, zonder tools.
 *
 * Dat is bewust: de web-search tool voorziet zijn tekst van citaties, en
 * citaties gaan niet samen met structured outputs. Door het te splitsen gebruikt
 * elke call een combinatie die op zichzelf gewoon werkt — zoeken mét tool en
 * tekst, normaliseren mét schema en zonder tool. Het kost één extra (goedkope)
 * call en levert een aanzienlijk kleinere kans op een harde fout.
 *
 * Stap 2 krijgt de lijst met ECHT gevonden URL's mee en mag alleen daaruit
 * citeren; daarna handhaaft `parseDiscoveryResult` dat nog eens in code.
 */

/** Model voor de zoekstap: dit vraagt commercieel inzicht, niet alleen samenvatten. */
export const DEFAULT_DISCOVERY_MODEL = "claude-opus-5";
/** Model voor de normalisatiestap: puur tekst → JSON. */
export const DEFAULT_DISCOVERY_FORMAT_MODEL = "claude-sonnet-5";

/**
 * Maximaal aantal webzoekopdrachten per zoekrichting, meeschalend met hoeveel
 * bedrijven er gevraagd zijn. Wie de lijst wil vullen heeft meer zoekopdrachten
 * nodig dan wie een handvol wil; wie een handvol wil, betaalt niet voor twaalf.
 */
function searchBudget(limit: number): number {
  return Math.min(12, Math.max(4, Math.ceil(limit / 3)));
}
/** Hoe vaak we een `pause_turn` mogen hervatten voordat we stoppen. */
const MAX_CONTINUATIONS = 4;
const REQUEST_TIMEOUT_MS = 180_000;

export class ClaudeSearchDiscoveryProvider implements DiscoveryProvider {
  readonly id = "claude-search";

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async discover(input: DiscoveryInput): Promise<DiscoveryOutcome> {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 1,
    });

    const searchModel = process.env.RADIO_DISCOVERY_MODEL || DEFAULT_DISCOVERY_MODEL;
    const formatModel =
      process.env.RADIO_DISCOVERY_FORMAT_MODEL || DEFAULT_DISCOVERY_FORMAT_MODEL;

    /* ── Stap 1: zoeken ─────────────────────────────────────────────────── */
    const foundUrls: string[] = [];
    let searchesRun = 0;
    let findings = "";
    const usage = { model: searchModel, input_tokens: 0, output_tokens: 0 };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [{ role: "user", content: buildSearchPrompt(input) }];
    const maxUses = searchBudget(input.limit);

    for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
      const params = {
        model: searchModel,
        max_tokens: 32000,
        output_config: { effort: "high" },
        system: DISCOVERY_SYSTEM_PROMPT,
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: maxUses,
          },
        ],
        messages,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream = client.messages.stream(params as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: any = await stream.finalMessage();

      usage.input_tokens += Number(response?.usage?.input_tokens ?? 0);
      usage.output_tokens += Number(response?.usage?.output_tokens ?? 0);

      // Een geweigerd verzoek geeft HTTP 200 met stop_reason "refusal" — eerst
      // checken, want `content` kan dan leeg zijn.
      if (response?.stop_reason === "refusal") {
        logError("radio.discovery", "zoekstap geweigerd door het model");
        return {
          candidates: [],
          rejected_sources: [],
          searches_run: searchesRun,
          usage,
          warning: "De zoekopdracht is door het model geweigerd. Pas de zoekrichting aan.",
        };
      }

      const blocks: unknown[] = Array.isArray(response?.content) ? response.content : [];
      const harvest = harvestSearchResults(blocks);
      foundUrls.push(...harvest.urls);
      searchesRun += harvest.searchCount;
      findings += textOf(blocks);

      // De server-side zoeklus heeft haar iteratielimiet geraakt: assistant-turn
      // terugsturen en doorgaan. Geen extra "Continue"-bericht toevoegen.
      if (response?.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      break;
    }

    const uniqueUrls = [...new Set(foundUrls)];

    if (uniqueUrls.length === 0) {
      return {
        candidates: [],
        rejected_sources: [],
        searches_run: searchesRun,
        usage,
        warning:
          "De webzoekopdracht leverde geen bruikbare resultaten op. Mogelijk is de web-search tool niet beschikbaar voor deze API-key.",
      };
    }

    if (!findings.trim()) {
      return {
        candidates: [],
        rejected_sources: [],
        searches_run: searchesRun,
        usage,
        warning: "Er zijn zoekresultaten gevonden, maar het model rapporteerde geen bedrijven.",
      };
    }

    logInfo(
      "radio.discovery",
      `"${input.label}": ${searchesRun} zoekopdracht(en), ${uniqueUrls.length} bron-URL(s)`,
    );

    /* ── Stap 2: normaliseren naar JSON ─────────────────────────────────── */
    const formatParams = {
      model: formatModel,
      // Ruim: bij een volle zoekronde zijn dit tientallen kandidaten in JSON.
      max_tokens: 16000,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: discoveryJsonSchema },
      },
      system: FORMAT_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildFormatPrompt(input, findings, uniqueUrls) },
      ],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatStream = client.messages.stream(formatParams as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatResponse: any = await formatStream.finalMessage();

    usage.input_tokens += Number(formatResponse?.usage?.input_tokens ?? 0);
    usage.output_tokens += Number(formatResponse?.usage?.output_tokens ?? 0);

    if (formatResponse?.stop_reason === "refusal") {
      throw new Error("discovery_format_refused");
    }

    const json = textOf(
      Array.isArray(formatResponse?.content) ? formatResponse.content : [],
    ).trim();
    if (!json) throw new Error("empty_discovery_response");

    const { candidates, rejected_sources } = parseDiscoveryResult(
      JSON.parse(stripCodeFence(json)),
      {
        allowedUrls: uniqueUrls,
        knownCompanies: input.known_companies,
        limit: input.limit,
      },
    );

    return { candidates, rejected_sources, searches_run: searchesRun, usage };
  }
}

/* -------------------------------------------------------------------------- */
/* Zoekresultaten uit de response halen                                       */
/* -------------------------------------------------------------------------- */

/**
 * Verzamel de URL's uit de `web_search_tool_result`-blokken.
 *
 * Let op de vorm: bij succes is `content` een LIJST met resultaten, bij een fout
 * een OBJECT met een `error_code`. Server-tool-fouten komen als HTTP 200 terug en
 * gooien dus niets — vandaar de expliciete check voordat we itereren.
 */
function harvestSearchResults(blocks: unknown[]): { urls: string[]; searchCount: number } {
  const urls: string[] = [];
  let searchCount = 0;

  for (const raw of blocks) {
    const block = raw as { type?: string; content?: unknown };
    if (block.type !== "web_search_tool_result") continue;
    searchCount++;

    const content = block.content;
    if (!Array.isArray(content)) {
      // Foutobject in plaats van een resultatenlijst.
      const error = content as { error_code?: string } | null;
      if (error?.error_code) {
        logError("radio.discovery.search", `web_search fout: ${error.error_code}`);
      }
      continue;
    }

    for (const entry of content) {
      const result = entry as { type?: string; url?: string };
      if (result?.type === "web_search_result" && typeof result.url === "string") {
        urls.push(result.url);
      }
    }
  }

  return { urls, searchCount };
}

function textOf(blocks: unknown[]): string {
  return blocks
    .map((raw) => raw as { type?: string; text?: string })
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");
}

function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

/* -------------------------------------------------------------------------- */
/* Prompts                                                                    */
/* -------------------------------------------------------------------------- */

const DISCOVERY_SYSTEM_PROMPT = `Je zoekt Nederlandse bedrijven voor "Adverteren op de Radio", een bureau dat radioreclame inkoopt en inzet (landelijk en regionaal).

Je werkt voor accountmanager Eric. Hij wil geen lange lijst, maar bedrijven waarbij een gesprek over radio commercieel logisch is: bedrijven die CONSUMENTEN willen bereiken, met genoeg schaal en klantwaarde om paid media te rechtvaardigen. Denk aan merkbekendheid, productintroducties, acties, seizoenscampagnes, vestigingsopeningen en recruitmentcampagnes.

## Wat je doet

Zoek met de web-search tool en rapporteer de bedrijven die je vindt. Per bedrijf:

- de bedrijfsnaam zoals die echt luidt;
- de website (het domein dat je in het zoekresultaat zag);
- in één of twee regels waarom dit bedrijf voor radio interessant kan zijn;
- als het zoekresultaat een concrete aanleiding noemde (nieuwe vestiging, groei, investering, veel vacatures, campagne, lancering): die aanleiding en de datum als die erbij stond;
- de URL van het zoekresultaat waar je het vond.

## Absolute regels

1. Alleen bedrijven die je in de zoekresultaten bent tegengekomen. Verzin geen bedrijven en vul niet aan uit je eigen kennis.
2. Alleen URL's die je in de zoekresultaten hebt gezien. Construeer nooit een adres omdat het waarschijnlijk klopt.
3. Weet je een website niet zeker? Laat het bedrijf dan weg. Een verkeerd domein kost meer tijd dan een gemist bedrijf.
4. Geen bedrijven die uitsluitend aan andere bedrijven leveren (specialistisch B2B) — radio is een consumentenmedium.
5. Nederlandse markt.
6. Vind je weinig? Rapporteer dan weinig. Een korte, kloppende lijst is beter dan een lange met ruis.

## Hoeveel

Lever er zoveel als je kunt onderbouwen tot het gevraagde maximum. Overzichts- en ranglijstartikelen ("grootste ketens van Nederland", "top 50 webshops") zijn goud: daar staan tientallen bedrijven in die allemaal een echte bron hebben. Blijf zoeken tot je het maximum haalt of je bronnen uitgeput zijn — maar rek de lijst niet met bedrijven waarvan je de website niet in een zoekresultaat hebt gezien.

Schrijf zakelijk en concreet in het Nederlands. Geen marketingtaal.`;

const FORMAT_SYSTEM_PROMPT = `Je zet een zoekverslag om in gestructureerde JSON. Je voegt niets toe en je laat niets weg dat in het verslag staat.

Regels:
- Neem alleen bedrijven op die letterlijk in het verslag staan.
- Gebruik alleen bron-URL's uit de meegegeven lijst met toegestane URL's. Staat de bron van een bedrijf niet in die lijst, kies dan de URL uit de lijst die het verslag voor dat bedrijf noemt; kun je die niet vinden, laat het bedrijf dan weg.
- Verzin geen websites. Alleen wat in het verslag staat.
- Een datum alleen als het verslag er een noemt, in de vorm YYYY-MM-DD.`;

function buildSearchPrompt(input: DiscoveryInput): string {
  const known =
    input.known_companies.length > 0
      ? `\n\n## Al in de lijst (niet opnieuw aandragen)\n\n${input.known_companies
          .slice(0, 200)
          .map((n) => `- ${n}`)
          .join("\n")}`
      : "";

  return `# Zoekrichting

${input.label}

## Zoektermen om te gebruiken

${input.searches.map((s) => `- ${s}`).join("\n")}

Gebruik deze als startpunt. Wijk af of zoek aanvullend als dat betere resultaten geeft, maar blijf binnen deze richting.

${
  input.segment
    ? `## Segment\n\nMik op het segment "${input.segment}". Beschikbare segmenten:\n\n${segmentPromptList()}\n`
    : `## Segment\n\nGeen vast segment. Kies per bedrijf het passende segment uit:\n\n${segmentPromptList()}\n`
}

## Doel

Lever tot ${input.limit} bedrijven — zoveel als je met een echte bron kunt onderbouwen.${known}

Rapporteer je bevindingen als een leesbare lijst. Voor elk bedrijf: naam, website, waarom interessant, eventuele aanleiding met datum, en de bron-URL.`;
}

function buildFormatPrompt(
  input: DiscoveryInput,
  findings: string,
  allowedUrls: string[],
): string {
  return `# Zoekverslag

${findings}

---

# Toegestane bron-URL's

Dit zijn de URL's die daadwerkelijk in de zoekresultaten voorkwamen. Alleen deze mogen als \`source_url\` gebruikt worden:

${allowedUrls.map((u) => `- ${u}`).join("\n")}

---

# Opdracht

Zet het verslag om in JSON met maximaal ${input.limit} kandidaten. Per kandidaat:

- company_name: de bedrijfsnaam
- website: het domein of de volledige URL van de bedrijfswebsite zoals in het verslag
- segment: een van de segment-keys, of null
- why: waarom dit bedrijf voor radio interessant kan zijn
- signal: de concrete aanleiding, of null
- signal_date: YYYY-MM-DD als het verslag een datum noemt, anders null
- source_url: een URL uit de lijst hierboven
- confidence: high / medium / low`;
}
