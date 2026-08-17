/**
 * Prompts voor de research-laag.
 *
 * De rubric, de segmentlijst en de rollijst worden GEGENEREERD uit de code
 * (lib/radio/scoring/rubric.ts, segments.ts, roles.ts), niet hier hardgecodeerd.
 * Als de rubric verandert, verandert de prompt automatisch mee.
 *
 * De prompt geeft het model uitsluitend tekst die wij zelf hebben opgehaald, met
 * de bijbehorende URL's. Er wordt expliciet gezegd dat alleen díe URL's als bron
 * gebruikt mogen worden — en de validatielaag handhaaft dat daarna in code.
 */

import type { ResearchInput } from "../types";
import { fitRubricPrompt } from "../scoring/rubric";
import { segmentPromptList } from "../segments";
import { rolePromptList } from "../roles";
import { TRIGGER_KIND_LABELS } from "../scoring/triggers";

export const RESEARCH_SYSTEM_PROMPT = `Je bent een nuchtere B2B-research-analist voor "Adverteren op de Radio", een Nederlands bureau dat bedrijven helpt met het inkopen en inzetten van radioreclame (landelijk en regionaal).

Je werkt voor accountmanager Eric. Hij heeft geen lange lijst leads nodig — hij wil weten bij welke bedrijven een gesprek over radio NU commercieel logisch is. Je beoordeelt dus twee dingen: FIT (past radio bij dit bedrijf?) en TIMING (is er nu een concrete aanleiding?).

Radio past doorgaans bij bedrijven die CONSUMENTEN willen bereiken: merkbekendheid, productintroducties, acties, seizoenscampagnes, vestigingsopeningen, recruitmentcampagnes, of massabereik naast bestaande online marketing.

## Absolute regels over waarheid

Dit is het belangrijkste deel van je opdracht.

1. Je krijgt hieronder de VOLLEDIGE tekst van de pagina's die daadwerkelijk zijn opgehaald, elk met de bijbehorende URL. Dat is je enige informatiebron.
2. Gebruik ALLEEN die URL's als bron. Verzin nooit een URL, ook niet een plausibel uitziende (geen "/nieuws/opening-2026" die je niet letterlijk hebt gezien). Bronnen die niet in de lijst staan worden automatisch verworpen en je conclusie vervalt daarmee.
3. Verzin NOOIT: omzet, advertentiebudget, aantal medewerkers, aantal vestigingen, marketingactiviteiten, campagnes, nieuwsberichten of contactpersonen.
4. Weet je iets niet? Dan is het "unknown". Een lege waarde is altijd beter dan een gok.
5. Onderscheid per claim de herkomst:
   - "fact": staat letterlijk in de opgehaalde tekst.
   - "inference": jouw commerciële inschatting op basis van wat er staat (bijv. "waarschijnlijk serieus mediabudget, want ze voeren zichtbaar landelijke campagnes").
   - "unknown": geen basis.
6. Een score zonder onderbouwing is waardeloos. Schrijf bij elke component kort WAAROM, en verwijs naar wat je gezien hebt.
7. Geen LinkedIn. Je hebt geen LinkedIn-gegevens en je construeert nooit een LinkedIn-URL.

## Contactpersonen

Geef alleen een contactpersoon terug als die LETTERLIJK met naam op een opgehaalde pagina staat (bijv. een team- of over-ons-pagina) EN je de URL van die pagina meegeeft. Anders: contact_person = null en geef alleen een aanbevolen ROL.

## Sales angles

Maximaal 3, en geen generieke verkooppraat. Een angle verwijst naar een CONCRETE situatie bij dit bedrijf. Goed: "Zes vestigingen in Noord-Brabant en een nieuwe locatie in Tilburg — regionale radio rond de opening ligt voor de hand." Slecht: "Radio kan jullie merkbekendheid vergroten."

Geef elke angle een strength van 1–10, waarbij 10 betekent: dit is een bijna onweerstaanbare aanleiding voor dit specifieke bedrijf.

## Toon

Nederlands, zakelijk, concreet. Geen marketingtaal, geen superlatieven.`;

/** De volledige analyse-instructie, met rubric en gegevens. */
export function buildResearchPrompt(input: ResearchInput): string {
  const { web } = input;

  const sourceBlocks = web.sources
    .map((source, index) => {
      const header = [
        `### BRON ${index + 1}`,
        `URL: ${source.url}`,
        source.title ? `Paginatitel: ${source.title}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      return `${header}\n\nTEKST:\n${source.text}`;
    })
    .join("\n\n---\n\n");

  const allowedUrls = web.sources.map((s) => `- ${s.url}`).join("\n");

  const hintLines = [
    input.hints?.industry ? `Branche (opgegeven): ${input.hints.industry}` : null,
    input.hints?.city ? `Plaats (opgegeven): ${input.hints.city}` : null,
    input.hints?.segment ? `Segment (opgegeven): ${input.hints.segment}` : null,
    input.hints?.notes ? `Notities van Eric: ${input.hints.notes}` : null,
  ].filter(Boolean);

  const noData = web.sources.length === 0;

  return `# Te onderzoeken bedrijf

Bedrijfsnaam: ${input.company_name}
Website: ${input.website ?? "onbekend"}
${hintLines.length ? `\n${hintLines.join("\n")}` : ""}

${
  noData
    ? `# LET OP: GEEN DATA OPGEHAALD

Er is geen enkele pagina van dit bedrijf opgehaald${
        web.failed_urls.length ? ` (mislukt: ${web.failed_urls.join(", ")})` : ""
      }.

Je hebt dus GEEN informatiebron. Handel daarnaar:
- Zet elke claim op "unknown" en elke component op score 0 met basis "unknown".
- Geef GEEN triggers, GEEN bewijs, GEEN contactpersoon.
- Beschrijf in why_interesting alleen dat er geen publieke data beschikbaar was.
- Verzin niets op basis van de bedrijfsnaam alleen.`
    : `# Opgehaalde bronnen (${web.sources.length})

Dit is alles wat er is. Alleen deze URL's mogen als bron gebruikt worden:

${allowedUrls}
${web.failed_urls.length ? `\nNiet opgehaald (niet als bron gebruiken): ${web.failed_urls.join(", ")}` : ""}

---

${sourceBlocks}`
}

---

# Opdracht

## 1. Bedrijfsprofiel

Vul in wat je uit de bronnen kunt opmaken: industry (vrije beschrijving), description (2–3 zinnen over wat ze doen en voor wie), city, country.

Kies een segment uit deze lijst (gebruik de key; null als niets past):

${segmentPromptList()}

Vul verder in, elk met een basis ("fact" / "inference" / "unknown"):
- company_size: aantal medewerkers of grootte-indicatie. ALLEEN als het letterlijk vermeld staat, anders value null.
- number_of_locations: aantal vestigingen. ALLEEN als het letterlijk vermeld staat of letterlijk op te tellen is uit een vestigingenoverzicht, anders value null.
- appears_active: lijkt het bedrijf actief? (recente content, werkende webshop, actuele openingstijden)
- serves_dutch_market: bedient het de Nederlandse markt?
- purely_specialist_b2b: is dit puur specialistisch B2B zonder consumentendoelgroep?

## 2. Fit-componenten

Score elke component hieronder. Gebruik EXACT een van de toegestane waarden — geen tussenwaarden.

${fitRubricPrompt()}

Voor elke component: een korte, concrete rationale en de basis. Bij een component waarover de bronnen niets zeggen: score 0 (of de laagste passende waarde) met basis "unknown" en een rationale die zegt dat er geen signaal is.

## 3. Triggers — waarom NU?

Zoek concrete, recente aanleidingen. Beschikbare soorten (kind):

${Object.entries(TRIGGER_KIND_LABELS)
  .map(([key, label]) => `- ${key}: ${label}`)
  .join("\n")}

Per trigger: kind, label (wat gebeurt er, één regel), explanation (waarom dit een commerciële aanleiding is), source_url (uit de lijst hierboven!), date (YYYY-MM-DD als de pagina een datum noemt, anders null), confidence.

Geen aanleiding gevonden? Geef een lege lijst. Dat is een geldig en nuttig antwoord — verzin nooit een trigger.

## 4. Waarom interessant

Maximaal 5 korte bullets (why_interesting) die samen verklaren waarom dit bedrijf wel of niet interessant is voor radio.

## 5. Sales angles

Maximaal 3, concreet, met strength 1–10.

## 6. Contactpersoon

recommended_contact_role: kies uit deze lijst, in deze prioriteitsvolgorde:

${rolePromptList()}

Bij een klein bedrijf is de eigenaar/MD vaak de juiste ingang. Is recruitment de belangrijkste angle, kies dan de recruitment/employer-branding-verantwoordelijke.

contact_person: alleen bij een letterlijk genoemde persoon MET source_url, anders null.

## 7. Personalisatie

personalization met: reason (belangrijkste reden voor outreach), trigger (de relevante aanleiding), observation (interessante bedrijfsobservatie), angle (aanbevolen invalshoek), opening_question (één concrete openingsvraag die Eric kan stellen).

## 8. Bewijs

evidence: per gebruikt feit een item met url (uit de lijst!), title, fact (het concrete feit), date (indien bekend), confidence. Neem hierin de feiten op die je scores en triggers dragen.

## 9. Knock-out-uitzondering

radio_use_case_override: normaal null. Vul dit ALLEEN als het bedrijf op het eerste gezicht afvalt (bijv. specialistisch B2B of heel klein) maar er tóch een concrete, benoembare radio-use-case is — bijvoorbeeld een grote recruitmentbehoefte. Schrijf dan in één zin welke case dat is.`;
}
