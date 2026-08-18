/**
 * LinkedIn-ZOEKLINKS bouwen.
 *
 * Dit is de brug van "bedrijf" naar "persoon", en hij is bewust zo gemaakt:
 *
 *   de tool bouwt een zoek-URL → jij opent hem in LinkedIn → Waalaxy importeert
 *   de mensen uit dat zoekresultaat
 *
 * Er wordt dus niets gescrapet en er wordt NOOIT een profiel-URL geconstrueerd.
 * Een URL naar een zoekpagina is geen bewering over een persoon; een verzonnen
 * `linkedin.com/in/jan-jansen` is dat wel, en die belandt zo in een
 * connectieverzoek naar de verkeerde persoon.
 *
 * Waarom dit ook praktisch de snelste route is: Waalaxy importeert per campagne
 * uit een LinkedIn-zoekresultaat dat jij open hebt staan. De zoekopdracht is dus
 * precies het formaat dat de volgende stap nodig heeft — een lijst losse
 * profiel-URL's zou eerst weer omgezet moeten worden.
 *
 * LinkedIn ondersteunt booleaanse operatoren in het trefwoordveld (AND, OR, NOT,
 * aanhalingstekens, haakjes). Daar maken we gebruik van.
 */

const PEOPLE_SEARCH = "https://www.linkedin.com/search/results/people/";

/**
 * Functietitels van wie in het MKB over het mediabudget beslist.
 *
 * Kort gehouden: LinkedIn weegt lange trefwoordreeksen slechter, en dit zijn de
 * termen die in het Nederlandse MKB daadwerkelijk in profielen staan.
 */
export const OWNER_ROLE_TERMS: readonly string[] = [
  "eigenaar",
  "directeur",
  "mede-eigenaar",
  "bedrijfsleider",
] as const;

/** Bouw een people-search-URL uit een booleaanse zoekstring. */
export function peopleSearchUrl(keywords: string): string {
  const trimmed = keywords.trim();
  if (!trimmed) return PEOPLE_SEARCH;
  return `${PEOPLE_SEARCH}?keywords=${encodeURIComponent(trimmed)}`;
}

/** `("a" OR "b")` — of alleen `"a"` als er één term is. Leeg bij geen termen. */
function orGroup(terms: readonly string[]): string {
  const cleaned = terms.map((t) => t.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  const quoted = cleaned.map((t) => `"${t.replace(/"/g, "")}"`);
  return quoted.length === 1 ? quoted[0] : `(${quoted.join(" OR ")})`;
}

/**
 * Zoek de beslisser BIJ ÉÉN BEDRIJF.
 *
 * De praktische versie voor de prospectlijst: één klik per rij, en je ziet wie
 * er bij dat bedrijf werkt met een beslissersfunctie.
 */
export function ownerSearchUrl(
  companyName: string,
  options: { city?: string | null; roles?: readonly string[] } = {},
): string {
  const name = companyName.trim();
  if (!name) return PEOPLE_SEARCH;

  const parts = [`"${name.replace(/"/g, "")}"`, orGroup(options.roles ?? OWNER_ROLE_TERMS)];
  // De plaats erbij helpt bij een generieke bedrijfsnaam ("Autobedrijf Jansen").
  if (options.city?.trim()) parts.push(`"${options.city.trim().replace(/"/g, "")}"`);

  return peopleSearchUrl(parts.filter(Boolean).join(" AND "));
}

/**
 * Zoek beslissers in een hele BRANCHE binnen een REGIO.
 *
 * Dit is de link die je in Waalaxy gebruikt: één zoekresultaat met tientallen
 * eigenaren van tuincentra in Limburg, in één importactie.
 */
export function verticalSearchUrl(options: {
  /** Branchewoorden, bijv. ["tuincentrum", "tuincentra"]. */
  terms: readonly string[];
  /** Regionaam zoals die in profielen voorkomt, bijv. "Limburg". */
  region?: string | null;
  roles?: readonly string[];
}): string {
  const parts = [
    orGroup(options.roles ?? OWNER_ROLE_TERMS),
    orGroup(options.terms),
  ].filter(Boolean);

  if (options.region?.trim()) {
    parts.push(`"${options.region.trim().replace(/"/g, "")}"`);
  }

  return peopleSearchUrl(parts.join(" AND "));
}

/**
 * De zoekstring zelf, zonder URL.
 *
 * Handig om te laten kopiëren: wie Sales Navigator gebruikt, plakt hem daar in
 * plaats van in de gewone zoekbalk.
 */
export function verticalSearchQuery(options: {
  terms: readonly string[];
  region?: string | null;
  roles?: readonly string[];
}): string {
  const url = new URL(verticalSearchUrl(options));
  return url.searchParams.get("keywords") ?? "";
}
