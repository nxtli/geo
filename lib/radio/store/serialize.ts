/**
 * Prospect ↔ opslag-conversies.
 *
 * `flattenProspect` is de ENIGE plek waar de vlakke scorekolommen (fit_score,
 * b2c_score, …) uit `fit_components` worden afgeleid. Zowel de SQL-insert als
 * de CSV-export gebruiken die functie, dus de gedenormaliseerde kolommen kunnen
 * niet uit de pas lopen met de bron.
 */

import type {
  Evidence,
  FitComponentKey,
  FitComponentScore,
  PersonalizationContext,
  Prospect,
  ProspectContact,
  ProspectInput,
  ProspectStatus,
  ProspectTrigger,
  RunRecord,
  SalesAngle,
  Tier,
} from "../types";
import { FIT_COMPONENTS } from "../scoring/rubric";
import { normalizeSegment } from "../segments";
import { normalizeRole } from "../roles";
import { sanitizeLinkedInUrl, normalizeWebsite } from "../validation";
import { normalizeProvinces } from "../provinces";
import { normalizeSizeBand } from "../company-size";

const EMPTY_CONTACT: ProspectContact = {
  first_name: null,
  last_name: null,
  title: null,
  linkedin_url: null,
  source: null,
  confidence: null,
};

/** Maak een nieuwe prospect met veilige defaults. Nog niet gescoord. */
export function createProspect(input: ProspectInput, now = new Date()): Prospect {
  const iso = now.toISOString();
  return {
    id: crypto.randomUUID(),
    created_at: iso,
    updated_at: iso,

    company_name: input.company_name.trim(),
    website: normalizeWebsite(input.website ?? null),
    industry: input.industry?.trim() || null,
    segment: normalizeSegment(input.segment),
    description: null,
    city: input.city?.trim() || null,
    country: null,
    coverage_provinces: [],
    company_size: null,
    size_band: null,
    size_band_basis: null,
    number_of_locations: null,

    fit_score: null,
    trigger_score: null,
    priority_score: null,
    tier: null,
    fit_components: [],
    knockouts: [],
    knockout_override: null,

    why_interesting: [],

    triggers: [],
    primary_trigger: null,
    trigger_date: null,

    sales_angles: [],
    primary_sales_angle: null,
    angle_strength: null,

    recommended_contact_role: null,
    contact: {
      first_name: input.contact_first_name?.trim() || null,
      last_name: input.contact_last_name?.trim() || null,
      title: input.contact_title?.trim() || null,
      // Een LinkedIn-URL komt uitsluitend van buiten (mens/CSV) en wordt
      // gevalideerd — nooit geconstrueerd.
      linkedin_url: sanitizeLinkedInUrl(input.linkedin_url ?? null),
      source: input.contact_source?.trim() || null,
      confidence: null,
    },

    personalization: null,

    evidence: [],
    research_confidence: null,
    confidence: null,
    date_researched: null,
    research_provider: null,
    demo: false,

    status: "New",
    notes: input.notes?.trim() || null,
  };
}

/** De vlakke scorekolom per fit-component, in briefing-volgorde. */
export const FIT_SCORE_COLUMNS: ReadonlyArray<{ column: string; key: FitComponentKey }> = [
  { column: "b2c_score", key: "b2c" },
  { column: "geographic_score", key: "geographic" },
  { column: "marketing_score", key: "marketing" },
  { column: "scale_score", key: "scale" },
  { column: "customer_value_score", key: "customer_value" },
  { column: "growth_score", key: "growth" },
  { column: "recruitment_score", key: "recruitment" },
  { column: "campaign_score", key: "campaign" },
  { column: "awareness_score", key: "awareness" },
  { column: "budget_score", key: "budget" },
] as const;

/** Score van één component, of null als de prospect nog niet gescoord is. */
export function componentScore(
  prospect: Pick<Prospect, "fit_components">,
  key: FitComponentKey,
): number | null {
  const match = prospect.fit_components.find((c) => c.key === key);
  return match ? match.score : null;
}

/**
 * Vlakke weergave van een prospect: alle kolommen uit §11 van de briefing.
 * Gebruikt door de SQL-insert én de CSV-export.
 */
export function flattenProspect(p: Prospect): Record<string, unknown> {
  const flatComponents: Record<string, number | null> = {};
  for (const { column, key } of FIT_SCORE_COLUMNS) {
    flatComponents[column] = componentScore(p, key);
  }

  return {
    id: p.id,
    created_at: p.created_at,
    updated_at: p.updated_at,
    company_name: p.company_name,
    website: p.website,
    industry: p.industry,
    segment: p.segment,
    description: p.description,
    city: p.city,
    country: p.country,
    company_size: p.company_size,
    size_band: p.size_band,
    size_band_basis: p.size_band_basis,
    number_of_locations: p.number_of_locations,
    fit_score: p.fit_score,
    trigger_score: p.trigger_score,
    priority_score: p.priority_score,
    tier: p.tier,
    ...flatComponents,
    primary_trigger: p.primary_trigger,
    trigger_date: p.trigger_date,
    primary_sales_angle: p.primary_sales_angle,
    angle_strength: p.angle_strength,
    recommended_contact_role: p.recommended_contact_role,
    contact_first_name: p.contact.first_name,
    contact_last_name: p.contact.last_name,
    contact_title: p.contact.title,
    linkedin_url: p.contact.linkedin_url,
    contact_source: p.contact.source,
    contact_confidence: p.contact.confidence,
    personalization_context: p.personalization
      ? formatPersonalization(p.personalization)
      : null,
    opening_question: p.personalization?.opening_question ?? null,
    research_confidence: p.research_confidence,
    confidence: p.confidence,
    date_researched: p.date_researched,
    research_provider: p.research_provider,
    demo: p.demo,
    status: p.status,
    notes: p.notes,
    /* jsonb-kolommen */
    coverage_provinces: p.coverage_provinces,
    fit_components: p.fit_components,
    knockouts: p.knockouts,
    knockout_override: p.knockout_override,
    why_interesting: p.why_interesting,
    triggers: p.triggers,
    sales_angles: p.sales_angles,
    evidence: p.evidence,
    personalization: p.personalization,
  };
}

/** Personalisatieblok als één leesbare tekst (voor CSV en Waalaxy). */
export function formatPersonalization(ctx: PersonalizationContext): string {
  return [
    `Reden: ${ctx.reason}`,
    ctx.trigger ? `Trigger: ${ctx.trigger}` : null,
    ctx.observation ? `Observatie: ${ctx.observation}` : null,
    ctx.angle ? `Angle: ${ctx.angle}` : null,
    ctx.opening_question ? `Openingsvraag: ${ctx.opening_question}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

/* -------------------------------------------------------------------------- */
/* Inlezen                                                                    */
/* -------------------------------------------------------------------------- */

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asObject<T>(value: unknown): T | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as T;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as T) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asIsoString(value: unknown, fallback: string): string {
  if (value instanceof Date) return value.toISOString();
  const s = asString(value);
  return s ?? fallback;
}

/**
 * Bouw een Prospect uit een opslagrecord (SQL-rij of JSON-object).
 * Tolerant: een record dat een oudere vorm heeft, mag niet de hele lijst breken.
 */
export function toProspect(row: Record<string, unknown>): Prospect {
  const nowIso = new Date().toISOString();
  const contact = asObject<Record<string, unknown>>(row.contact);

  const fit_components = asArray<FitComponentScore>(row.fit_components);
  const rawTier = asString(row.tier);
  const tier: Tier | null =
    rawTier === "A" || rawTier === "B" || rawTier === "C" || rawTier === "D" ? rawTier : null;

  return {
    id: String(row.id ?? crypto.randomUUID()),
    created_at: asIsoString(row.created_at, nowIso),
    updated_at: asIsoString(row.updated_at, nowIso),

    company_name: asString(row.company_name) ?? "(naamloos)",
    website: asString(row.website),
    industry: asString(row.industry),
    segment: asString(row.segment),
    description: asString(row.description),
    city: asString(row.city),
    country: asString(row.country),
    coverage_provinces: normalizeProvinces(asArray<string>(row.coverage_provinces)),
    company_size: asString(row.company_size),
    size_band: normalizeSizeBand(asString(row.size_band)),
    size_band_basis: asClaimKind(row.size_band_basis),
    number_of_locations: asNumber(row.number_of_locations),

    fit_score: asNumber(row.fit_score),
    trigger_score: asNumber(row.trigger_score),
    priority_score: asNumber(row.priority_score),
    tier,
    fit_components,
    knockouts: asArray<string>(row.knockouts),
    knockout_override: asString(row.knockout_override),

    why_interesting: asArray<string>(row.why_interesting),

    triggers: asArray<ProspectTrigger>(row.triggers),
    primary_trigger: asString(row.primary_trigger),
    trigger_date: asString(row.trigger_date),

    sales_angles: asArray<SalesAngle>(row.sales_angles),
    primary_sales_angle: asString(row.primary_sales_angle),
    angle_strength: asNumber(row.angle_strength),

    recommended_contact_role: normalizeRole(asString(row.recommended_contact_role)),
    contact: contact
      ? {
          first_name: asString(contact.first_name),
          last_name: asString(contact.last_name),
          title: asString(contact.title),
          linkedin_url: sanitizeLinkedInUrl(asString(contact.linkedin_url)),
          source: asString(contact.source),
          confidence: asConfidence(contact.confidence),
        }
      : {
          // Postgres bewaart de contactvelden vlak; val daarop terug.
          first_name: asString(row.contact_first_name),
          last_name: asString(row.contact_last_name),
          title: asString(row.contact_title),
          linkedin_url: sanitizeLinkedInUrl(asString(row.linkedin_url)),
          source: asString(row.contact_source),
          confidence: asConfidence(row.contact_confidence),
        },

    personalization: asObject<PersonalizationContext>(row.personalization),

    evidence: asArray<Evidence>(row.evidence),
    research_confidence: asNumber(row.research_confidence),
    confidence: asConfidence(row.confidence),
    date_researched: asString(row.date_researched),
    research_provider: asString(row.research_provider),
    demo: row.demo === true || row.demo === "true",

    status: asStatus(row.status),
    notes: asString(row.notes),
  };
}

/* -------------------------------------------------------------------------- */
/* Run-historie                                                               */
/* -------------------------------------------------------------------------- */

/** Vlakke weergave van een run, voor de SQL-insert. */
export function flattenRun(run: RunRecord): Record<string, unknown> {
  return {
    id: run.id,
    kind: run.kind,
    started_at: run.started_at,
    finished_at: run.finished_at,
    settings: run.settings,
    targets: run.targets,
    added: run.added,
    duplicates: run.duplicates,
    skipped: run.skipped,
    searches: run.searches,
    input_tokens: run.input_tokens,
    output_tokens: run.output_tokens,
    cache_read_tokens: run.cache_read_tokens,
    cost_usd: run.cost_usd,
    model: run.model,
    warnings: run.warnings,
  };
}

/** Bouw een RunRecord uit een opslagrecord. Tolerant voor oudere vormen. */
export function toRunRecord(row: Record<string, unknown>): RunRecord {
  const started = asIsoString(row.started_at, new Date().toISOString());
  const kind: RunRecord["kind"] =
    row.kind === "research" || row.kind === "local" ? row.kind : "discovery";
  return {
    id: String(row.id ?? crypto.randomUUID()),
    kind,
    started_at: started,
    finished_at: asIsoString(row.finished_at, started),
    settings: asString(row.settings) ?? "",
    targets: asArray<string>(row.targets).map((t) => String(t)),
    added: asNumber(row.added) ?? 0,
    duplicates: asNumber(row.duplicates) ?? 0,
    skipped: asNumber(row.skipped) ?? 0,
    searches: asNumber(row.searches) ?? 0,
    input_tokens: asNumber(row.input_tokens) ?? 0,
    output_tokens: asNumber(row.output_tokens) ?? 0,
    cache_read_tokens: asNumber(row.cache_read_tokens) ?? 0,
    cost_usd: asNumber(row.cost_usd) ?? 0,
    model: asString(row.model) ?? "",
    warnings: asArray<string>(row.warnings).map((w) => String(w)),
  };
}

function asClaimKind(value: unknown): Prospect["size_band_basis"] {
  return value === "fact" || value === "inference" || value === "unknown" ? value : null;
}

function asConfidence(value: unknown): Prospect["confidence"] {
  return value === "high" || value === "medium" || value === "low" ? value : null;
}

const STATUS_SET = new Set<string>([
  "New",
  "Researched",
  "Tier A",
  "Tier B",
  "Tier C",
  "Skip",
  "Exported to Waalaxy",
  "Contacted",
  "Replied",
  "Qualified",
  "Meeting",
  "Won",
  "Lost",
]);

function asStatus(value: unknown): ProspectStatus {
  const s = asString(value);
  return s && STATUS_SET.has(s) ? (s as ProspectStatus) : "New";
}

/** Label van een fit-component (voor UI-tabellen). */
export function fitComponentLabel(key: FitComponentKey): string {
  return FIT_COMPONENTS.find((c) => c.key === key)?.label ?? key;
}

export { EMPTY_CONTACT };
