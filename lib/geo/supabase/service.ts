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
