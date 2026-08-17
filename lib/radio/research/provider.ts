/**
 * Het research-provider-contract, plus de validatielaag.
 *
 * Hier zit de belangrijkste anti-hallucinatiemaatregel van de tool:
 * **elke bron-URL wordt gematcht tegen de set pagina's die we ECHT hebben
 * opgehaald.** Een URL die daar niet in zit, wordt verworpen. Een verzonnen
 * nieuwsbericht kan dus nooit een trigger opleveren, hoe overtuigend het ook
 * klinkt. Dat is een coderegel, niet een promptverzoek.
 */

import { z } from "zod";
import type {
  ClaimKind,
  Confidence,
  Evidence,
  ProspectTrigger,
  ResearchInput,
  ResearchResult,
  ResearchUsage,
} from "../types";
import { FIT_COMPONENTS } from "../scoring/rubric";
import { normalizeTriggerKind } from "../scoring/triggers";
import { normalizeRole } from "../roles";
import { normalizeSegment } from "../segments";
import { canonicalUrl, normalizeDate, truncate } from "../validation";
import { logInfo } from "../../geo/logger";

/** Wat een provider teruggeeft. */
export interface ResearchOutcome {
  result: ResearchResult;
  usage?: ResearchUsage;
  /** Bronnen die zijn verworpen omdat ze niet opgehaald waren. */
  rejected_sources: string[];
}

export interface ResearchProvider {
  readonly id: string;
  isConfigured(): boolean;
  research(input: ResearchInput): Promise<ResearchOutcome>;
}

/* -------------------------------------------------------------------------- */
/* Zod-schema                                                                 */
/* -------------------------------------------------------------------------- */

const claimKind = z.enum(["fact", "inference", "unknown"]).catch("unknown");
const confidence = z.enum(["high", "medium", "low"]).catch("low");

const claim = <T extends z.ZodTypeAny>(inner: T) =>
  z.object({ value: inner, basis: claimKind });

const componentKeys = FIT_COMPONENTS.map((c) => c.key) as [string, ...string[]];

const fitComponentSchema = z.object({
  key: z.enum(componentKeys),
  score: z.coerce.number(),
  rationale: z.string().default(""),
  basis: claimKind,
});

const triggerSchema = z.object({
  kind: z.string().default("other"),
  label: z.string().default(""),
  explanation: z.string().default(""),
  source_url: z.string().default(""),
  date: z.string().nullable().default(null),
  confidence,
});

const evidenceSchema = z.object({
  url: z.string().default(""),
  title: z.string().default(""),
  fact: z.string().default(""),
  date: z.string().nullable().default(null),
  confidence,
});

const salesAngleSchema = z.object({
  kind: z.string().default(""),
  angle: z.string().default(""),
  strength: z.coerce.number().default(5),
});

const personalizationSchema = z.object({
  reason: z.string().default(""),
  trigger: z.string().default(""),
  observation: z.string().default(""),
  angle: z.string().default(""),
  opening_question: z.string().default(""),
});

const contactPersonSchema = z.object({
  first_name: z.string().nullable().default(null),
  last_name: z.string().nullable().default(null),
  title: z.string().nullable().default(null),
  source_url: z.string().default(""),
  confidence,
});

export const researchResultSchema = z.object({
  company_name: z.string().default(""),
  industry: z.string().nullable().default(null),
  segment: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  city: z.string().nullable().default(null),
  country: z.string().nullable().default(null),
  company_size: claim(z.string().nullable()).default({ value: null, basis: "unknown" }),
  number_of_locations: claim(z.coerce.number().nullable()).default({
    value: null,
    basis: "unknown",
  }),
  appears_active: claim(z.boolean().nullable()).default({ value: null, basis: "unknown" }),
  serves_dutch_market: claim(z.boolean().nullable()).default({ value: null, basis: "unknown" }),
  purely_specialist_b2b: claim(z.boolean().nullable()).default({
    value: null,
    basis: "unknown",
  }),
  fit_components: z.array(fitComponentSchema).default([]),
  triggers: z.array(triggerSchema).default([]),
  sales_angles: z.array(salesAngleSchema).default([]),
  why_interesting: z.array(z.string()).default([]),
  recommended_contact_role: z.string().nullable().default(null),
  contact_person: contactPersonSchema.nullable().default(null),
  personalization: personalizationSchema.nullable().default(null),
  evidence: z.array(evidenceSchema).default([]),
  radio_use_case_override: z.string().nullable().default(null),
});

/* -------------------------------------------------------------------------- */
/* Validatie + bronverificatie                                                */
/* -------------------------------------------------------------------------- */

export interface ParseOptions {
  /**
   * URL's die we daadwerkelijk hebben opgehaald. Alleen bewijs dat naar één van
   * deze pagina's verwijst wordt geaccepteerd.
   */
  allowedUrls: string[];
  /** Bedrijfsnaam als fallback wanneer het model die leeg laat. */
  fallbackCompanyName: string;
}

export interface ParsedResearch {
  result: ResearchResult;
  /** URL's uit de modeloutput die we niet konden verifiëren. */
  rejected_sources: string[];
}

/** Index van toegestane bronnen: canonieke vorm → echte URL. */
function buildAllowedIndex(urls: string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const url of urls) {
    const key = canonicalUrl(url);
    if (key) index.set(key, url);
  }
  return index;
}

/**
 * Valideer, normaliseer en ONTDOE de modeloutput van onverifieerbare bronnen.
 *
 * Wat er precies gebeurt:
 *  - evidence met een niet-opgehaalde URL → verwijderd
 *  - trigger met een niet-opgehaalde bron → verwijderd (geen bewijs, geen trigger)
 *  - company_size / number_of_locations die geen `fact` zijn → op null
 *  - contactpersoon zonder verifieerbare bron of zonder voornaam → null
 *  - fit-componenten zonder onderbouwing → basis `unknown`
 */
export function parseResearchResult(value: unknown, options: ParseOptions): ParsedResearch {
  const raw = researchResultSchema.parse(value);
  const allowed = buildAllowedIndex(options.allowedUrls);
  const rejected: string[] = [];

  /** Zet een modelbron om naar de echt opgehaalde URL, of null. */
  const verifySource = (url: string | null | undefined): string | null => {
    if (!url || !url.trim()) return null;
    const key = canonicalUrl(url.trim());
    if (!key) {
      rejected.push(url.trim());
      return null;
    }
    const match = allowed.get(key);
    if (!match) {
      rejected.push(url.trim());
      return null;
    }
    return match;
  };

  /* Bewijs ------------------------------------------------------------- */
  const evidence: Evidence[] = [];
  for (const item of raw.evidence) {
    const url = verifySource(item.url);
    if (!url) continue;
    if (!item.fact.trim()) continue; // bron zonder feit is geen bewijs
    evidence.push({
      url,
      title: item.title.trim() || url,
      fact: truncate(item.fact.trim(), 400),
      date: normalizeDate(item.date),
      confidence: item.confidence as Confidence,
    });
  }

  /* Triggers ----------------------------------------------------------- */
  const triggers: ProspectTrigger[] = [];
  for (const item of raw.triggers) {
    const source = verifySource(item.source_url);
    // Geen verifieerbare bron → geen trigger. Dit is de belangrijkste regel:
    // "waarom nu" mag nooit op een verzonnen nieuwsbericht rusten.
    if (!source) continue;
    if (!item.label.trim()) continue;
    triggers.push({
      kind: normalizeTriggerKind(item.kind),
      label: truncate(item.label.trim(), 160),
      explanation: truncate(item.explanation.trim(), 400),
      source_url: source,
      date: normalizeDate(item.date),
      confidence: item.confidence as Confidence,
    });
  }

  /* Fit-componenten ---------------------------------------------------- */
  const fit_components = raw.fit_components.map((c) => {
    const def = FIT_COMPONENTS.find((d) => d.key === c.key)!;
    const rationale = c.rationale.trim();
    return {
      key: def.key,
      label: def.label,
      max: def.max,
      score: c.score,
      rationale: truncate(rationale, 400),
      // Zonder onderbouwing kan een score geen feit zijn.
      basis: (rationale ? c.basis : "unknown") as ClaimKind,
    };
  });

  /* Sales angles ------------------------------------------------------- */
  // Eerst op sterkte sorteren, DAARNA op 3 kappen: anders sneuvelt een sterkere
  // vierde angle ten gunste van een zwakkere eerste. Doordat de lijst gesorteerd
  // is, is `sales_angles[0]` overal de primaire angle — inclusief het
  // personalisatieblok, dat anders naar een andere angle kon verwijzen dan de
  // tabel toont.
  const sales_angles = raw.sales_angles
    .filter((a) => a.angle.trim().length > 0)
    .map((a) => ({
      kind: truncate(a.kind.trim() || "Algemeen", 60),
      angle: truncate(a.angle.trim(), 400),
      strength: Math.max(1, Math.min(10, Math.round(a.strength))),
    }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3);

  /* Contactpersoon ----------------------------------------------------- */
  const contactSource = raw.contact_person ? verifySource(raw.contact_person.source_url) : null;
  const contact_person =
    raw.contact_person && contactSource && raw.contact_person.first_name?.trim()
      ? {
          first_name: raw.contact_person.first_name.trim(),
          last_name: raw.contact_person.last_name?.trim() || null,
          title: raw.contact_person.title?.trim() || null,
          source_url: contactSource,
          confidence: raw.contact_person.confidence as Confidence,
        }
      : null;

  /* Getallen alleen als vastgesteld feit ------------------------------- */
  const company_size = {
    value: raw.company_size.basis === "fact" ? raw.company_size.value?.trim() || null : null,
    basis: raw.company_size.basis,
  };
  const locations = raw.number_of_locations;
  const number_of_locations = {
    value:
      locations.basis === "fact" && typeof locations.value === "number" && locations.value > 0
        ? Math.round(locations.value)
        : null,
    basis: locations.basis,
  };

  const result: ResearchResult = {
    company_name: raw.company_name.trim() || options.fallbackCompanyName,
    industry: raw.industry?.trim() || null,
    segment: normalizeSegment(raw.segment),
    description: raw.description?.trim() ? truncate(raw.description.trim(), 600) : null,
    city: raw.city?.trim() || null,
    country: raw.country?.trim() || null,
    company_size,
    number_of_locations,
    appears_active: raw.appears_active,
    serves_dutch_market: raw.serves_dutch_market,
    purely_specialist_b2b: raw.purely_specialist_b2b,
    fit_components,
    triggers,
    sales_angles,
    why_interesting: raw.why_interesting
      .map((w) => w.trim())
      .filter(Boolean)
      .slice(0, 5)
      .map((w) => truncate(w, 240)),
    recommended_contact_role: normalizeRole(raw.recommended_contact_role),
    contact_person,
    personalization: raw.personalization
      ? {
          reason: truncate(raw.personalization.reason.trim(), 400),
          trigger: truncate(raw.personalization.trigger.trim(), 240),
          observation: truncate(raw.personalization.observation.trim(), 240),
          angle: truncate(raw.personalization.angle.trim(), 240),
          opening_question: truncate(raw.personalization.opening_question.trim(), 240),
        }
      : null,
    evidence,
    radio_use_case_override: raw.radio_use_case_override?.trim() || null,
  };

  const uniqueRejected = [...new Set(rejected)];
  if (uniqueRejected.length > 0) {
    logInfo(
      "radio.research.validate",
      `${uniqueRejected.length} onverifieerbare bron(nen) verworpen`,
    );
  }

  return { result, rejected_sources: uniqueRejected };
}

/* -------------------------------------------------------------------------- */
/* JSON Schema voor structured outputs                                        */
/* -------------------------------------------------------------------------- */

const claimSchema = (valueSchema: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  properties: {
    value: valueSchema,
    basis: { type: "string", enum: ["fact", "inference", "unknown"] },
  },
  required: ["value", "basis"],
});

/**
 * JSON Schema dat aan Claude wordt meegegeven. Bewust zonder niet-ondersteunde
 * constraints (minLength/maximum) en met additionalProperties:false overal.
 */
export const researchJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    company_name: { type: "string" },
    industry: { type: ["string", "null"] },
    segment: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    city: { type: ["string", "null"] },
    country: { type: ["string", "null"] },
    company_size: claimSchema({ type: ["string", "null"] }),
    number_of_locations: claimSchema({ type: ["integer", "null"] }),
    appears_active: claimSchema({ type: ["boolean", "null"] }),
    serves_dutch_market: claimSchema({ type: ["boolean", "null"] }),
    purely_specialist_b2b: claimSchema({ type: ["boolean", "null"] }),
    fit_components: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string", enum: componentKeys },
          score: { type: "integer" },
          rationale: { type: "string" },
          basis: { type: "string", enum: ["fact", "inference", "unknown"] },
        },
        required: ["key", "score", "rationale", "basis"],
      },
    },
    triggers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string" },
          label: { type: "string" },
          explanation: { type: "string" },
          source_url: { type: "string" },
          date: { type: ["string", "null"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["kind", "label", "explanation", "source_url", "date", "confidence"],
      },
    },
    sales_angles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string" },
          angle: { type: "string" },
          strength: { type: "integer" },
        },
        required: ["kind", "angle", "strength"],
      },
    },
    why_interesting: { type: "array", items: { type: "string" } },
    recommended_contact_role: { type: ["string", "null"] },
    contact_person: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        first_name: { type: ["string", "null"] },
        last_name: { type: ["string", "null"] },
        title: { type: ["string", "null"] },
        source_url: { type: "string" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
      },
      required: ["first_name", "last_name", "title", "source_url", "confidence"],
    },
    personalization: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        reason: { type: "string" },
        trigger: { type: "string" },
        observation: { type: "string" },
        angle: { type: "string" },
        opening_question: { type: "string" },
      },
      required: ["reason", "trigger", "observation", "angle", "opening_question"],
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          url: { type: "string" },
          title: { type: "string" },
          fact: { type: "string" },
          date: { type: ["string", "null"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["url", "title", "fact", "date", "confidence"],
      },
    },
    radio_use_case_override: { type: ["string", "null"] },
  },
  required: [
    "company_name",
    "industry",
    "segment",
    "description",
    "city",
    "country",
    "company_size",
    "number_of_locations",
    "appears_active",
    "serves_dutch_market",
    "purely_specialist_b2b",
    "fit_components",
    "triggers",
    "sales_angles",
    "why_interesting",
    "recommended_contact_role",
    "contact_person",
    "personalization",
    "evidence",
    "radio_use_case_override",
  ],
} as const;
