import Anthropic from "@anthropic-ai/sdk";
import type {
  DiscoveryInput,
  DiscoveryOutcome,
  DiscoveryProvider,
} from "../provider";
import { discoveryJsonSchema, parseDiscoveryResult } from "../provider";
import type { ResearchUsage } from "../../types";
import { segmentPromptList } from "../../segments";
import { citiesForProvinces, provincesLabel } from "../../provinces";
import { sizeBandLabel, MKB_MAX_EMPLOYEES, MKB_BANDS } from "../../company-size";
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

/**
 * Model voor de zoekstap.
 *
 * Sonnet, niet Opus. De zoekstap doet geen diepe analyse: hij voert
 * zoekopdrachten uit en schrijft op wat er in de resultaten staat. Het
 * commerciële oordeel zit in de scoring-engine (deterministisch) en in de
 * research-stap, niet hier. Opus kostte hier meer dan tien keer zoveel voor
 * hetzelfde lijstje. Override met RADIO_DISCOVERY_MODEL.
 */
export const DEFAULT_DISCOVERY_MODEL = "claude-sonnet-5";
/** Model voor de normalisatiestap: puur tekst → JSON. */
export const DEFAULT_DISCOVERY_FORMAT_MODEL = "claude-sonnet-5";
/**
 * Denkbudget van de zoekstap. Laag, en dat is een kostenkeuze: elk
 * thinking-token is een outputtoken, en outputtokens zijn het duurste deel van
 * een zoekronde. Zoeken-en-opschrijven heeft geen hoog denkbudget nodig.
 */
const DISCOVERY_EFFORT = "low";

/**
 * Maximaal aantal webzoekopdrachten per zoekrichting.
 *
 * Elke zoekopdracht kost $0,01 en is daarmee — nu het model Sonnet is — de
 * grootste kostenpost van een zoekronde. Krap gehouden: één goed
 * overzichtsartikel levert tientallen bedrijven, dus meer zoekopdrachten
 * betekent niet automatisch meer bedrijven. Schaalt wel mee met de gevraagde
 * hoeveelheid, zodat een kleine vraag ook klein betaalt.
 */
export function searchBudget(limit: number): number {
  return Math.min(8, Math.max(3, Math.ceil(limit / 5)));
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
    const usage: ResearchUsage = {
      model: searchModel,
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      web_searches: 0,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [{ role: "user", content: buildSearchPrompt(input) }];
    const maxUses = searchBudget(input.limit);

    for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
      const params = {
        model: searchModel,
        max_tokens: 16000,
        output_config: { effort: DISCOVERY_EFFORT },
        system: buildDiscoverySystemPrompt(input),
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

      addUsage(usage, response?.usage);

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
      usage.web_searches = searchesRun;
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

    const formatUsage: ResearchUsage = {
      model: formatModel,
      input_tokens: 0,
      output_tokens: 0,
    };
    addUsage(formatUsage, formatResponse?.usage);

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

    return {
      candidates,
      rejected_sources,
      searches_run: searchesRun,
      usage,
      format_usage: formatUsage,
    };
  }
}

/** Tel het verbruik van één response bij de lopende telling op. */
function addUsage(total: ResearchUsage, raw: unknown): void {
  const u = (raw ?? {}) as Record<string, unknown>;
  const n = (key: string) => Number(u[key] ?? 0) || 0;
  total.input_tokens += n("input_tokens");
  total.output_tokens += n("output_tokens");
  const created = n("cache_creation_input_tokens");
  const read = n("cache_read_input_tokens");
  if (created) total.cache_creation_input_tokens = (total.cache_creation_input_tokens ?? 0) + created;
  if (read) total.cache_read_input_tokens = (total.cache_read_input_tokens ?? 0) + read;
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

/**
 * Systeemprompt van de zoekstap: de vaste opdracht plus het doelprofiel van deze
 * ronde (regio, grootte, aanleiding). Het profiel stuurt alleen het ZOEKEN —
 * of een bedrijf echt in de regio zit en echt die omvang heeft, stelt de
 * research-stap vast op basis van de eigen website. Wat hier staat is een
 * zoekrichting, geen vastgesteld feit.
 */
function buildDiscoverySystemPrompt(input: DiscoveryInput): string {
  return `${DISCOVERY_SYSTEM_PROMPT}\n\n${buildTargetProfile(input)}`;
}

function buildTargetProfile(input: DiscoveryInput): string {
  const parts: string[] = ["## Doelprofiel van deze ronde"];

  const provinces = input.provinces ?? [];
  if (provinces.length > 0) {
    const cities = citiesForProvinces(provinces);
    parts.push(
      `**Regio.** Zoek bedrijven die klanten hebben in: ${provincesLabel(provinces)}. Gebruik plaatsnamen uit die regio in je zoektermen (bijvoorbeeld: ${cities
        .slice(0, 8)
        .join(", ")}). Een landelijke keten mag, mits die daar ook vestigingen of klanten heeft.`,
    );
  }

  const bands = input.size_bands ?? [];
  if (bands.length > 0) {
    const onlyMkb =
      bands.length === MKB_BANDS.length && bands.every((b) => MKB_BANDS.includes(b as never));
    parts.push(
      onlyMkb
        ? `**Omvang.** MKB: bedrijven tot ongeveer ${MKB_MAX_EMPLOYEES} medewerkers. Dus geen landelijke grootbedrijven of beursgenoteerde ketens — die hebben hun eigen mediabureau. Denk aan regionale ketens, lokale marktleiders en groeiende ondernemingen.`
        : `**Omvang.** Mik op: ${bands.map(sizeBandLabel).join(", ")}. Weet je de omvang niet, dan mag het bedrijf mee — de research stelt het later vast.`,
    );
  }

  switch (input.trigger_mode) {
    case "required":
      parts.push(
        "**Aanleiding verplicht.** Alleen bedrijven waarbij het zoekresultaat een CONCRETE, recente aanleiding noemt: nieuwe vestiging, overname, investering, uitbreiding, veel vacatures, campagne of lancering. Geen aanleiding in de bron = niet rapporteren.",
      );
      break;
    case "none":
      parts.push(
        "**Aanleiding niet nodig.** Beoordeel op profiel: consumentgericht, genoeg schaal en klantwaarde voor paid media. Noem een aanleiding alleen als de bron er een noemt; verzin er geen om de lijst te vullen.",
      );
      break;
    default:
      parts.push(
        "**Aanleiding welkom, niet verplicht.** Noem een aanleiding als de bron er een noemt. Zo niet, dan neem je het bedrijf op met alleen de reden waarom het past.",
      );
  }

  return parts.join("\n\n");
}

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

Lever er zoveel als je kunt onderbouwen tot het gevraagde maximum. Overzichts- en ranglijstartikelen ("grootste ketens van Nederland", "top 50 webshops", brancheverenigingen, regionale ondernemersprijzen) zijn goud: daar staan tientallen bedrijven in die allemaal een echte bron hebben.

Je hebt een beperkt aantal zoekopdrachten. Zet ze dus in op zoekopdrachten die een LIJST opleveren in plaats van één bedrijf, en haal uit elk resultaat alles wat erin zit voordat je een nieuwe zoekopdracht doet. Rek de lijst niet met bedrijven waarvan je de website niet in een zoekresultaat hebt gezien.

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
