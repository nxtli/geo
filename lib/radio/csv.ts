/**
 * CSV lezen en schrijven — zonder dependency.
 *
 * Twee dingen die in de praktijk misgaan en hier expliciet goed gaan:
 *
 *  1. **Scheidingsteken.** Nederlands Excel schrijft CSV met puntkomma's. De
 *     parser detecteert `,` `;` en tab op basis van de kopregel, zodat een
 *     export uit Excel gewoon werkt.
 *  2. **Excel + UTF-8.** Bij export gaat er een BOM voorop, anders maakt Excel
 *     van "Café" → "CafÃ©".
 */

import type { Prospect } from "./types";
import type { ProspectInput } from "./types";
import { formatPersonalization } from "./store/serialize";
import { isLinkedInProfileUrl, sanitizeLinkedInUrl, normalizeWebsite } from "./validation";

/* -------------------------------------------------------------------------- */
/* Lezen                                                                      */
/* -------------------------------------------------------------------------- */

/** Detecteer het scheidingsteken uit de eerste (niet-lege) regel. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  for (const candidate of candidates) {
    // Tel alleen buiten aanhalingstekens.
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const char = firstLine[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === candidate && !inQuotes) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

/**
 * Parse CSV naar rijen van velden. Ondersteunt aanhalingstekens, ingesloten
 * scheidingstekens, `""`-escapes en regeleindes binnen een veld.
 */
export function parseCsv(text: string, delimiter?: string): string[][] {
  // Strip een UTF-8 BOM: die zou anders in de eerste kolomnaam blijven zitten.
  const input = text.replace(/^﻿/, "");
  const sep = delimiter ?? detectDelimiter(input);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === sep) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // Genegeerd; de \n erna sluit de regel af.
    } else {
      field += char;
    }
  }
  // Laatste veld/regel, als het bestand niet op een newline eindigt.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/** Normaliseer een kolomnaam: lowercase, spaties/streepjes → underscore. */
function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/^﻿/, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** Aliassen zodat een net iets andere kopregel gewoon werkt. */
const HEADER_ALIASES: Record<string, string> = {
  company: "company_name",
  companyname: "company_name",
  bedrijf: "company_name",
  bedrijfsnaam: "company_name",
  naam: "company_name",
  name: "company_name",
  url: "website",
  domain: "website",
  domein: "website",
  site: "website",
  webseite: "website",
  linkedin: "linkedin_url",
  linkedinurl: "linkedin_url",
  linkedin_profile: "linkedin_url",
  first_name: "contact_first_name",
  firstname: "contact_first_name",
  voornaam: "contact_first_name",
  last_name: "contact_last_name",
  lastname: "contact_last_name",
  achternaam: "contact_last_name",
  job_title: "contact_title",
  jobtitle: "contact_title",
  title: "contact_title",
  functie: "contact_title",
  branche: "industry",
  sector: "industry",
  stad: "city",
  plaats: "city",
  notes: "notes",
  notities: "notes",
  opmerkingen: "notes",
};

function resolveHeader(header: string): string {
  const normalized = normalizeHeader(header);
  return HEADER_ALIASES[normalized] ?? normalized;
}

export interface CsvImportResult {
  rows: ProspectInput[];
  /** Regels die zijn overgeslagen, met uitleg (regelnummer 1-based incl. kop). */
  errors: Array<{ line: number; reason: string }>;
  /** De herkende kolommen. */
  headers: string[];
}

/**
 * Lees een prospect-CSV.
 *
 * Minimaal `company_name`; alle andere kolommen zijn optioneel. Een rij zonder
 * bedrijfsnaam wordt overgeslagen met een leesbare reden in plaats van
 * stilzwijgend genegeerd — anders verdwijnen er regels zonder dat iemand het
 * merkt.
 */
export function parseProspectCsv(text: string): CsvImportResult {
  const rows = parseCsv(text);
  const errors: CsvImportResult["errors"] = [];

  if (rows.length === 0) {
    return { rows: [], errors: [{ line: 0, reason: "Het bestand is leeg." }], headers: [] };
  }

  const headers = rows[0].map(resolveHeader);
  if (!headers.includes("company_name") && !headers.includes("website")) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          reason:
            'Kopregel niet herkend. Verwacht minimaal een kolom "company_name" (of "website").',
        },
      ],
      headers,
    };
  }

  const out: ProspectInput[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      const value = (cells[index] ?? "").trim();
      if (value) record[header] = value;
    });

    // Alleen een website? Dan is de host een bruikbare voorlopige naam.
    let companyName = record.company_name;
    if (!companyName && record.website) {
      const normalized = normalizeWebsite(record.website);
      if (normalized) {
        try {
          companyName = new URL(normalized).hostname.replace(/^www\./, "");
        } catch {
          companyName = record.website;
        }
      }
    }

    if (!companyName) {
      errors.push({ line: i + 1, reason: "Geen bedrijfsnaam of website in deze regel." });
      continue;
    }

    const linkedin = record.linkedin_url ? sanitizeLinkedInUrl(record.linkedin_url) : null;
    if (record.linkedin_url && !linkedin) {
      // De rij blijft, maar de onbruikbare URL wordt niet overgenomen: liever
      // leeg dan een kapotte URL in de Waalaxy-export.
      errors.push({
        line: i + 1,
        reason: `LinkedIn-URL niet herkend en daarom overgeslagen: "${record.linkedin_url}"`,
      });
    }

    out.push({
      company_name: companyName,
      website: record.website ?? null,
      linkedin_url: linkedin,
      contact_first_name: record.contact_first_name ?? null,
      contact_last_name: record.contact_last_name ?? null,
      contact_title: record.contact_title ?? null,
      city: record.city ?? null,
      industry: record.industry ?? null,
      segment: record.segment ?? null,
      notes: record.notes ?? null,
      contact_source: "csv-import",
    });
  }

  return { rows: out, errors, headers };
}

/**
 * Lees een batch losse websites/namen (één per regel, §13C).
 * Accepteert ook "Naam, website" per regel.
 */
export function parseBatchList(text: string): ProspectInput[] {
  const out: ProspectInput[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    let name: string | null = null;
    let website: string | null = null;

    // "Naam, website" of "Naam; website"
    const parts = line.split(/[,;]\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      name = parts[0];
      website = normalizeWebsite(parts[1]);
      if (!website) {
        // Misschien stond de website vooraan.
        website = normalizeWebsite(parts[0]);
        if (website) name = parts[1];
      }
    } else {
      website = normalizeWebsite(line);
      if (!website) name = line;
    }

    if (!name && website) {
      try {
        name = new URL(website).hostname.replace(/^www\./, "");
      } catch {
        name = website;
      }
    }
    if (!name) continue;

    const key = (website ?? name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ company_name: name, website, contact_source: "batch-import" });
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Schrijven                                                                  */
/* -------------------------------------------------------------------------- */

/** Escape één veld volgens RFC 4180. */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/["\n\r,;\t]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Serialiseer rijen naar CSV. Met UTF-8 BOM zodat Excel de accenten goed leest.
 */
export function toCsv(
  headers: string[],
  rows: Array<Record<string, unknown>>,
  delimiter = ",",
): string {
  const lines = [headers.join(delimiter)];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCell(row[header])).join(delimiter));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

/* -------------------------------------------------------------------------- */
/* Waalaxy-export                                                             */
/* -------------------------------------------------------------------------- */

/** Kolommen van de Waalaxy-export (§14 van de briefing). */
export const WAALAXY_HEADERS = [
  "first_name",
  "last_name",
  "company_name",
  "job_title",
  "linkedin_url",
  "tier",
  "fit_score",
  "trigger_score",
  "priority_score",
  "primary_sales_angle",
  "personalization_context",
] as const;

export interface WaalaxyExport {
  /** CSV met de prospects die geïmporteerd kunnen worden. */
  csv: string;
  /** Aantal rijen in de export. */
  exported: number;
  /**
   * Prospects die NIET mee kunnen omdat er geen LinkedIn-profiel-URL is.
   * Deze worden apart gerapporteerd — er wordt nooit een URL verzonnen.
   */
  missingLinkedIn: Array<{
    id: string;
    company_name: string;
    contact_name: string | null;
    recommended_role: string | null;
    reason: string;
  }>;
  /** CSV van de missende groep, zodat Eric die apart kan oppakken. */
  missingCsv: string;
}

const MISSING_HEADERS = [
  "company_name",
  "contact_name",
  "recommended_contact_role",
  "tier",
  "priority_score",
  "reason",
] as const;

/**
 * Bouw de Waalaxy-export voor een selectie prospects.
 *
 * Waalaxy heeft per prospect een LinkedIn-PROFIEL nodig (`/in/…`). Ontbreekt
 * die, dan komt de prospect onder "Missing LinkedIn URL" te staan in plaats van
 * in de export — en er wordt met opzet geen URL geconstrueerd.
 */
export function buildWaalaxyExport(prospects: Prospect[]): WaalaxyExport {
  const rows: Array<Record<string, unknown>> = [];
  const missing: WaalaxyExport["missingLinkedIn"] = [];

  for (const p of prospects) {
    const linkedin = p.contact.linkedin_url;
    const contactName = [p.contact.first_name, p.contact.last_name].filter(Boolean).join(" ") || null;

    let reason: string | null = null;
    if (!linkedin) {
      reason = "Geen LinkedIn-URL bekend.";
    } else if (!isLinkedInProfileUrl(linkedin)) {
      reason = "Alleen een LinkedIn-bedrijfspagina bekend, geen persoonsprofiel.";
    } else if (!p.contact.first_name) {
      reason = "LinkedIn-profiel bekend, maar geen naam van de contactpersoon.";
    }

    if (reason) {
      missing.push({
        id: p.id,
        company_name: p.company_name,
        contact_name: contactName,
        recommended_role: p.recommended_contact_role,
        reason,
      });
      continue;
    }

    rows.push({
      first_name: p.contact.first_name,
      last_name: p.contact.last_name ?? "",
      company_name: p.company_name,
      job_title: p.contact.title ?? p.recommended_contact_role ?? "",
      linkedin_url: linkedin,
      tier: p.tier ?? "",
      fit_score: p.fit_score ?? "",
      trigger_score: p.trigger_score ?? "",
      priority_score: p.priority_score ?? "",
      primary_sales_angle: p.primary_sales_angle ?? "",
      personalization_context: p.personalization ? formatPersonalization(p.personalization) : "",
    });
  }

  return {
    csv: toCsv([...WAALAXY_HEADERS], rows),
    exported: rows.length,
    missingLinkedIn: missing,
    missingCsv: toCsv(
      [...MISSING_HEADERS],
      missing.map((m) => {
        const prospect = prospects.find((p) => p.id === m.id);
        return {
          company_name: m.company_name,
          contact_name: m.contact_name ?? "",
          recommended_contact_role: m.recommended_role ?? "",
          tier: prospect?.tier ?? "",
          priority_score: prospect?.priority_score ?? "",
          reason: m.reason,
        };
      }),
    ),
  };
}
