/**
 * Doelfuncties voor de outreach, in prioriteitsvolgorde (§8 van de briefing).
 *
 * De tool beveelt een ROL aan wanneer er geen betrouwbare persoon gevonden is.
 * Een persoon verzinnen mag nooit — dan blijft de contactpersoon leeg en toont
 * de UI "not yet identified" bij de aanbevolen rol.
 */

import type { RecommendedRole } from "./types";

export const RECOMMENDED_ROLES: readonly RecommendedRole[] = [
  "CMO",
  "Marketing Director",
  "Head of Marketing",
  "Marketing Manager",
  "Brand Manager",
  "Head of Growth",
  "Growth Manager",
  "Managing Director / eigenaar",
  "Recruitment / Employer Branding",
] as const;

const ROLE_SET = new Set<string>(RECOMMENDED_ROLES);

/** Normaliseer een rolwaarde naar een bekende rol, of null. */
export function normalizeRole(value: string | null | undefined): RecommendedRole | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  if (ROLE_SET.has(raw)) return raw as RecommendedRole;

  const needle = raw.toLowerCase();
  const exact = RECOMMENDED_ROLES.find((r) => r.toLowerCase() === needle);
  if (exact) return exact;

  // Veelvoorkomende varianten en afkortingen.
  const aliases: Array<[RegExp, RecommendedRole]> = [
    [/^(chief marketing officer|cmo)$/, "CMO"],
    [/marketing\s*director|directeur\s*marketing/, "Marketing Director"],
    [/head\s*of\s*marketing|hoofd\s*marketing/, "Head of Marketing"],
    [/marketing\s*manager/, "Marketing Manager"],
    [/brand\s*manager|merkmanager/, "Brand Manager"],
    [/head\s*of\s*growth/, "Head of Growth"],
    [/growth\s*manager/, "Growth Manager"],
    [/managing\s*director|algemeen\s*directeur|eigenaar|owner|founder|oprichter/, "Managing Director / eigenaar"],
    [/recruit|employer\s*brand|corporate\s*recruiter|talent\s*acquisition/, "Recruitment / Employer Branding"],
  ];
  for (const [re, role] of aliases) {
    if (re.test(needle)) return role;
  }
  return null;
}

/**
 * Kies de aanbevolen rol op basis van bedrijfsgrootte en primaire angle.
 * Fallback voor wanneer de research geen rol teruggeeft.
 *
 * - Recruitment als primaire angle → recruitment-verantwoordelijke.
 * - Kleine organisatie → eigenaar/MD (daar zit de beslissing).
 * - Anders → Head of Marketing als veilige middenweg.
 */
export function defaultRoleFor(opts: {
  recruitmentIsPrimaryAngle?: boolean;
  /** Score op fit-component D (schaal), 0–10. */
  scaleScore?: number | null;
}): RecommendedRole {
  if (opts.recruitmentIsPrimaryAngle) return "Recruitment / Employer Branding";
  if (typeof opts.scaleScore === "number" && opts.scaleScore <= 2) {
    return "Managing Director / eigenaar";
  }
  return "Head of Marketing";
}

/** Prioriteit van een rol (0 = hoogst). Onbekende rollen sorteren achteraan. */
export function rolePriority(role: string | null | undefined): number {
  const normalized = normalizeRole(role);
  if (!normalized) return RECOMMENDED_ROLES.length;
  return RECOMMENDED_ROLES.indexOf(normalized);
}

/** Compacte rollijst voor de research-prompt. */
export function rolePromptList(): string {
  return RECOMMENDED_ROLES.map((r, i) => `${i + 1}. ${r}`).join("\n");
}
