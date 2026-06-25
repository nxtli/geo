import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  GeoAnalysisResult,
  GeoLeadInput,
  GeoScanReport,
  GeoScanStatus,
} from "../types";
import { buildReportRecord } from "../report/service";
import { logError } from "../logger";

/**
 * Server-side Supabase access for the GEO scan.
 *
 * SECURITY: this module must only run on the server. It uses the
 * service-role key (SUPABASE_SERVICE_ROLE_KEY) which bypasses RLS and must
 * NEVER be exposed to the client. The chat client never imports this file.
 *
 * If Supabase env vars are absent the service degrades gracefully: it logs a
 * warning and returns nulls so the scan flow still completes for the visitor
 * (persistence is simply skipped). Wire the env vars to enable storage.
 */

let cached: SupabaseClient | null | undefined;

function getClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    cached = null;
    return null;
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return getClient() !== null;
}

export interface PersistedLead {
  id: string;
}

export async function insertLead(
  input: GeoLeadInput,
  source = "geo.nxtli.com",
): Promise<PersistedLead | null> {
  const db = getClient();
  if (!db) return null;

  const { data, error } = await db
    .from("geo_leads")
    .insert({
      name: input.name,
      email: input.email,
      phone: input.phone,
      job_title: input.job_title,
      company_name: input.company_name,
      homepage_url: input.homepage_url,
      offer_description: input.offer_description,
      target_audience: input.target_audience,
      desired_queries: input.desired_queries,
      competitors: input.competitors ?? null,
      consent: input.consent,
      source,
    })
    .select("id")
    .single();

  if (error) {
    logError("supabase.insertLead", error);
    return null;
  }
  return { id: data.id as string };
}

export async function createScanRequest(params: {
  leadId: string | null;
  homepageUrl: string;
  rawInput: GeoLeadInput;
}): Promise<{ id: string } | null> {
  const db = getClient();
  if (!db) return null;

  const { data, error } = await db
    .from("geo_scan_requests")
    .insert({
      lead_id: params.leadId,
      status: "pending" satisfies GeoScanStatus,
      homepage_url: params.homepageUrl,
      raw_input: params.rawInput,
    })
    .select("id")
    .single();

  if (error) {
    logError("supabase.createScanRequest", error);
    return null;
  }
  return { id: data.id as string };
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
  const db = getClient();
  if (!db) return;

  const { error } = await db
    .from("geo_scan_requests")
    .update(patch)
    .eq("id", id);

  if (error) logError("supabase.updateScanRequest", error);
}

export async function insertReport(params: {
  scanRequestId: string | null;
  leadId: string | null;
  analysis: GeoAnalysisResult;
  reportHtml: string;
  pdfUrl?: string | null;
}): Promise<{ id: string } | null> {
  const db = getClient();
  if (!db) return null;

  const record: Record<string, unknown> = buildReportRecord({
      scanRequestId: params.scanRequestId,
      leadId: params.leadId,
      analysis: params.analysis,
      reportHtml: params.reportHtml,
      pdfUrl: params.pdfUrl ?? null,
    });

  const { data, error } = await db
    .from("geo_scan_reports")
    .insert(record)
    .select("id")
    .single();

  if (error) {
    logError("supabase.insertReport", error);
    return null;
  }
  return { id: data.id as string };
}

/**
 * Abuse protection: find this email's most recent COMPLETED scan (if any), so
 * we can return the earlier result instead of burning credits on a re-scan.
 * Returns null when Supabase is off or no prior completed scan exists.
 */
export async function findCompletedScanByEmail(
  email: string,
): Promise<{ id: string; analysis_result: unknown } | null> {
  const db = getClient();
  if (!db) return null;

  const { data, error } = await db
    .from("geo_scan_requests")
    .select("id, analysis_result, geo_leads!inner(email)")
    .eq("geo_leads.email", email)
    .eq("status", "completed")
    .not("analysis_result", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logError("supabase.findCompletedScanByEmail", error);
    return null;
  }
  if (!data) return null;
  return { id: data.id as string, analysis_result: data.analysis_result };
}

/** Count completed scans since a timestamp — for the global daily cap. */
export async function countCompletedScansSince(sinceIso: string): Promise<number> {
  const db = getClient();
  if (!db) return 0;

  const { count, error } = await db
    .from("geo_scan_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed")
    .gte("created_at", sinceIso);

  if (error) {
    logError("supabase.countCompletedScansSince", error);
    return 0;
  }
  return count ?? 0;
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

/** List recent scans with lead details for the admin dashboard. */
export async function listScansForAdmin(limit = 500): Promise<AdminScanRow[]> {
  const db = getClient();
  if (!db) return [];

  const { data, error } = await db
    .from("geo_scan_requests")
    .select(
      "id, created_at, status, homepage_url, visibility_score, model, input_tokens, output_tokens, geo_leads!left(name, email, company_name, phone, job_title)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logError("supabase.listScansForAdmin", error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const lead = normalizeEmbedded(row.geo_leads);
    return {
      id: row.id as string,
      created_at: row.created_at as string,
      status: row.status as GeoScanStatus,
      homepage_url: row.homepage_url as string,
      visibility_score: (row.visibility_score as number | null) ?? null,
      model: (row.model as string | null) ?? null,
      input_tokens: (row.input_tokens as number | null) ?? null,
      output_tokens: (row.output_tokens as number | null) ?? null,
      name: (lead?.name as string | null) ?? null,
      email: (lead?.email as string | null) ?? null,
      company_name: (lead?.company_name as string | null) ?? null,
      phone: (lead?.phone as string | null) ?? null,
      job_title: (lead?.job_title as string | null) ?? null,
    };
  });
}

/** PostgREST returns an embedded relation as an object or a single-item array. */
function normalizeEmbedded(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown>) ?? null;
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return null;
}

/** Read a stored report (used by the report/PDF route). */
export async function getReportByScanRequest(
  scanRequestId: string,
): Promise<GeoScanReport | null> {
  const db = getClient();
  if (!db) return null;

  const { data, error } = await db
    .from("geo_scan_reports")
    .select("*")
    .eq("scan_request_id", scanRequestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logError("supabase.getReportByScanRequest", error);
    return null;
  }
  return (data as GeoScanReport | null) ?? null;
}
