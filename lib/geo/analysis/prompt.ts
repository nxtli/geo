import type { GeoAnalysisInput } from "../types";

/**
 * Shared prompt builder for AI providers that need a textual brief
 * (the Claude provider, and likely the existing NXTLI skill). Centralised so
 * the analysis instructions live in one place.
 */

export const GEO_SYSTEM_PROMPT = `Je bent Brian, de AI-analist van NXTLI. Je beoordeelt hoe goed een website vindbaar en citeerbaar is in generatieve AI-zoekmachines en antwoorden (ChatGPT, Claude, Perplexity, Google AI Overviews) — oftewel Generative Engine Optimization (GEO).

AI-systemen geven de voorkeur aan content die concreet, gestructureerd, betrouwbaar en eenduidig is, met heldere expertise, aanbod, doelgroep en autoriteitssignalen. Beoordeel de website op die criteria.

Schrijf in helder, menselijk Nederlands. Direct, scherp en bruikbaar — geen jargon zonder uitleg, geen overdreven AI-hype. Wees concreet: noem specifieke verbeteringen, geen open deuren. Baseer je oordeel op de aangeleverde informatie; als de homepage-inhoud ontbreekt, redeneer dan op basis van de antwoorden van de ondernemer en wees daar eerlijk over.

Geef uitsluitend een resultaat terug dat exact voldoet aan het opgegeven JSON-schema.`;

export function buildAnalysisPrompt(input: GeoAnalysisInput): string {
  const lines: string[] = [];
  lines.push(`Bedrijf: ${input.company_name}`);
  lines.push(`Homepage: ${input.homepage_url}`);
  lines.push(`Aanbod: ${input.offer_description}`);
  lines.push(`Doelgroep: ${input.target_audience}`);
  lines.push(`Gewenste AI-zoekvragen/thema's: ${input.desired_queries}`);
  if (input.competitors) lines.push(`Concurrenten/voorbeelden: ${input.competitors}`);

  if (input.metadata?.fetched) {
    lines.push("");
    lines.push("--- Opgehaalde homepage ---");
    if (input.metadata.title) lines.push(`<title>: ${input.metadata.title}`);
    if (input.metadata.description)
      lines.push(`meta description: ${input.metadata.description}`);
    if (input.page_content) {
      lines.push("");
      lines.push("Zichtbare tekst (ingekort):");
      lines.push(input.page_content);
    }
  } else {
    lines.push("");
    lines.push(
      "--- De homepage kon niet automatisch worden opgehaald; beoordeel op basis van bovenstaande antwoorden en wees daar transparant over in je samenvatting. ---",
    );
  }

  lines.push("");
  lines.push(
    "Beoordeel de AI-vindbaarheid en geef een visibility_score van 0-100, een korte samenvatting, wat AI waarschijnlijk van deze site begrijpt, de waarschijnlijke AI-positionering, sterke punten, zwakke punten, ontbrekende signalen, content gaps, aanbevolen pagina's, aanbevolen FAQ-vragen, quick wins, een 30-dagen actieplan en concrete verbetervoorstellen voor de homepage-copy.",
  );

  return lines.join("\n");
}
