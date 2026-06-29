import type {
  GeoAnalysisResult,
  GeoLeadInput,
  GeoScanReport,
  GeoScanStatus,
} from "../types";
import { buildReportRecord } from "../report/service";
import { logError } from "../logger";
import { isDbConfigured, query } from "./db";

/**
 * Server-side persistence for the GEO scan, over a DIRECT Postgres connection
 * (see ./db). We deliberately do NOT use the Supabase REST client: it needs the
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars (often missing when only the
 * Postgres connection is wired) and its PostgREST schema cache doesn't see
 * tables created out-of-band. The Postgres connection is the same one the
 * migration uses, so persistence works whenever migration does.
 *
 * SECURITY: server-only. The chat client never imports this file.
 *
 * Degrades gracefully: with no connection string configured every function
 * is a no-op (returns null/empty) so the scan still completes for the visitor.
 */

export function isSupabaseConfigured(): boolean {
  return isDbConfigured();
}

export interface PersistedLead {
  id: string;
}

export async function insertLead(
  input: GeoLeadInput,
  source = "geo.nxtli.com",
): Promise<PersistedLead | null> {
  if (!isDbConfigured()) return null;
  try {
    const rows = await query<{ id: string }>(
      `insert into public.geo_leads
         (name, email, phone, job_title, company_name, homepage_url,
          offer_description, target_audience, desired_queries, competitors,
          consent, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       returning id`,
      [
        input.name,
        input.email,
        input.phone,
        input.job_title,
        input.company_name,
        input.homepage_url,
        input.offer_description,
        input.target_audience,
        input.desired_queries,
        input.competitors ?? null,
        input.consent,
        source,
      ],
    );
    return rows[0] ? { id: rows[0].id } : null;
  } catch (error) {
    logError("supabase.insertLead", error);
    return null;
  }
}

export async function createScanRequest(params: {
  leadId: string | null;
  homepageUrl: string;
  rawInput: GeoLeadInput;
}): Promise<{ id: string } | null> {
  if (!isDbConfigured()) return null;
  try {
    const rows = await query<{ id: string }>(
      `insert into public.geo_scan_requests (lead_id, status, homepage_url, raw_input)
       values ($1, $2, $3, $4::jsonb)
       returning id`,
      [
        params.leadId,
        "pending" satisfies GeoScanStatus,
        params.homepageUrl,
        JSON.stringify(params.rawInput),
      ],
    );
    return rows[0] ? { id: rows[0].id } : null;
  } catch (error) {
    logError("supabase.createScanRequest", error);
    return null;
  }
}

export async function updateScanRequest(
  id: string,
  patch: {
    status?: GeoScanStatus;
    analysis_result?: GeoAnalysisResult | null;
    report_url?: string | null;
    pdf_url?: string | null;
    email_sent_at?: string | null;
    error_message?: string | null;
    visibility_score?: number | null;
    model?: string | null;
    input_tokens?: number | null;
    output_tokens?: number | null;
  },
): Promise<void> {
  if (!isDbConfigured()) return;

  // jsonb columns must be cast explicitly.
  const jsonbCols = new Set(["analysis_result"]);
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (jsonbCols.has(key)) {
      sets.push(`${key} = $${i}::jsonb`);
      values.push(value === null ? null : JSON.stringify(value));
    } else {
      sets.push(`${key} = $${i}`);
      values.push(value);
    }
    i++;
  }
  if (sets.length === 0) return;
  values.push(id);

  try {
    await query(
      `update public.geo_scan_requests set ${sets.join(", ")} where id = $${i}`,
      values,
    );
  } catch (error) {
    logError("supabase.updateScanRequest", error);
  }
}

export async function insertReport(params: {
  scanRequestId: string | null;
  leadId: string | null;
  analysis: GeoAnalysisResult;
  reportHtml: string;
  pdfUrl?: string | null;
}): Promise<{ id: string } | null> {
  if (!isDbConfigured()) return null;

  const record = buildReportRecord({
    scanRequestId: params.scanRequestId,
    leadId: params.leadId,
    analysis: params.analysis,
    reportHtml: params.reportHtml,
    pdfUrl: params.pdfUrl ?? null,
  });

  // jsonb array/object columns need an explicit cast + serialisation.
  const jsonbCols = new Set([
    "strengths",
    "weaknesses",
    "recommendations",
    "content_gaps",
    "priority_actions",
  ]);
  const cols = Object.keys(record);
  const placeholders = cols.map((c, idx) =>
    jsonbCols.has(c) ? `$${idx + 1}::jsonb` : `$${idx + 1}`,
  );
  const values = cols.map((c) =>
    jsonbCols.has(c) ? JSON.stringify(record[c] ?? []) : record[c],
  );

  try {
    const rows = await query<{ id: string }>(
      `insert into public.geo_scan_reports (${cols.join(", ")})
       values (${placeholders.join(", ")})
       returning id`,
      values,
    );
    return rows[0] ? { id: rows[0].id } : null;
  } catch (error) {
    logError("supabase.insertReport", error);
    return null;
  }
}

/**
 * Account-level gate: one free scan per email address. Returns this email's most
 * recent COMPLETED scan (across ANY page) if it has one, so the scan endpoint
 * can block a second scan and surface the earlier report instead of burning
 * credits — and instead of confusingly returning an unrelated page's report.
 */
export async function findCompletedScanByEmail(
  email: string,
): Promise<{ id: string; analysis_result: unknown; homepage_url: string } | null> {
  if (!isDbConfigured()) return null;
  try {
    const rows = await query<{
      id: string;
      analysis_result: unknown;
      homepage_url: string;
    }>(
      `select r.id, r.analysis_result, r.homepage_url
         from public.geo_scan_requests r
         join public.geo_leads l on l.id = r.lead_id
        where l.email = $1
          and r.status = 'completed'
          and r.analysis_result is not null
        order by r.created_at desc
        limit 1`,
      [email],
    );
    return rows[0] ?? null;
  } catch (error) {
    logError("supabase.findCompletedScanByEmail", error);
    return null;
  }
}

/** Count completed scans since a timestamp — for the global daily cap. */
export async function countCompletedScansSince(sinceIso: string): Promise<number> {
  if (!isDbConfigured()) return 0;
  try {
    const rows = await query<{ count: string }>(
      `select count(*)::text as count
         from public.geo_scan_requests
        where status = 'completed' and created_at >= $1`,
      [sinceIso],
    );
    return Number(rows[0]?.count ?? 0);
  } catch (error) {
    logError("supabase.countCompletedScansSince", error);
    return 0;
  }
}

/** A row for the admin overview (scan + its lead). */
export interface AdminScanRow {
  id: string;
  created_at: string;
  status: GeoScanStatus;
  homepage_url: string;
  visibility_score: number | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  name: string | null;
  email: string | null;
  company_name: string | null;
  phone: string | null;
  job_title: string | null;
}

export interface AdminScanList {
  rows: AdminScanRow[];
  /** Non-null when the query failed (e.g. missing table) — shown in admin. */
  error: string | null;
  /** Raw counts, to distinguish "empty" from "broken". */
  counts: { scans: number | null; leads: number | null };
}

/** List recent scans with lead details for the admin dashboard. */
export async function listScansForAdmin(limit = 500): Promise<AdminScanList> {
  if (!isDbConfigured()) {
    return { rows: [], error: null, counts: { scans: null, leads: null } };
  }

  let counts = { scans: null as number | null, leads: null as number | null };
  try {
    const c = await query<{ scans: string; leads: string }>(
      `select
         (select count(*) from public.geo_scan_requests)::text as scans,
         (select count(*) from public.geo_leads)::text as leads`,
    );
    counts = {
      scans: c[0] ? Number(c[0].scans) : null,
      leads: c[0] ? Number(c[0].leads) : null,
    };
  } catch (error) {
    logError("supabase.listScansForAdmin.count", error);
  }

  try {
    const rows = await query<AdminScanRow>(
      `select
         r.id, r.created_at, r.status, r.homepage_url, r.visibility_score,
         r.model, r.input_tokens, r.output_tokens,
         l.name, l.email, l.company_name, l.phone, l.job_title
       from public.geo_scan_requests r
       left join public.geo_leads l on l.id = r.lead_id
       order by r.created_at desc
       limit $1`,
      [limit],
    );
    return {
      rows: rows.map((r) => {
        const created = r.created_at as unknown;
        return {
          ...r,
          created_at:
            created instanceof Date ? created.toISOString() : String(created),
          visibility_score: r.visibility_score ?? null,
          input_tokens: r.input_tokens ?? null,
          output_tokens: r.output_tokens ?? null,
        };
      }),
      error: null,
      counts,
    };
  } catch (error) {
    logError("supabase.listScansForAdmin", error);
    return {
      rows: [],
      error: error instanceof Error ? error.message : "query mislukt",
      counts,
    };
  }
}

/** Read a stored report (used by the report/PDF route). */
export async function getReportByScanRequest(
  scanRequestId: string,
): Promise<GeoScanReport | null> {
  if (!isDbConfigured()) return null;
  try {
    const rows = await query<GeoScanReport>(
      `select * from public.geo_scan_reports
        where scan_request_id = $1
        order by created_at desc
        limit 1`,
      [scanRequestId],
    );
    return rows[0] ?? null;
  } catch (error) {
    logError("supabase.getReportByScanRequest", error);
    return null;
  }
}
