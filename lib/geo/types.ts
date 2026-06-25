/**
 * NXTLI GEO — domain types.
 *
 * These mirror the Supabase tables (see supabase/migrations) and the contract
 * of the AI analysis layer. Keep them in sync with the SQL schema.
 */

export type GeoScanStatus =
  | "pending"
  | "scanning"
  | "completed"
  | "failed";

/** A lead captured by Brian during the chat. Maps to `geo_leads`. */
export interface GeoLead {
  id: string;
  created_at: string;
  name: string;
  email: string;
  company_name: string;
  homepage_url: string;
  offer_description: string;
  target_audience: string;
  desired_queries: string;
  competitors: string | null;
  consent: boolean;
  source: string;
}

/** Everything Brian collected, before persistence. */
export interface GeoLeadInput {
  name: string;
  email: string;
  company_name: string;
  homepage_url: string;
  offer_description: string;
  target_audience: string;
  desired_queries: string;
  competitors?: string | null;
  consent: boolean;
}

/** A scan run. Maps to `geo_scan_requests`. */
export interface GeoScanRequest {
  id: string;
  created_at: string;
  lead_id: string;
  status: GeoScanStatus;
  homepage_url: string;
  raw_input: GeoLeadInput;
  analysis_result: GeoAnalysisResult | null;
  report_url: string | null;
  pdf_url: string | null;
  email_sent_at: string | null;
  error_message: string | null;
}

/** The structured report. Maps to `geo_scan_reports`. */
export interface GeoScanReport {
  id: string;
  created_at: string;
  scan_request_id: string;
  lead_id: string;
  visibility_score: number | null;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  content_gaps: string[];
  priority_actions: PriorityAction[];
  report_html: string | null;
  pdf_url: string | null;
}

export interface PriorityAction {
  title: string;
  why: string;
  effort: "laag" | "midden" | "hoog";
}

export interface RecommendedFaq {
  question: string;
  why: string;
}

/**
 * Input handed to the AI analysis layer.
 * `page_content` / `metadata` are optional — populated only if homepage
 * fetching succeeded server-side.
 */
export interface GeoAnalysisInput {
  homepage_url: string;
  company_name: string;
  offer_description: string;
  target_audience: string;
  desired_queries: string;
  competitors?: string | null;
  page_content?: string | null;
  metadata?: GeoPageMetadata | null;
}

export interface GeoPageMetadata {
  title?: string | null;
  description?: string | null;
  fetched: boolean;
  status?: number | null;
  word_count?: number | null;
}

/**
 * Structured output of the AI analysis. This is the canonical contract any
 * analysis provider (Claude, mock, or the existing NXTLI skill) must return.
 */
export interface GeoAnalysisResult {
  visibility_score: number; // 0-100
  short_summary: string;
  what_ai_understands: string;
  likely_ai_positioning: string;
  strengths: string[];
  weaknesses: string[];
  missing_signals: string[];
  content_gaps: string[];
  recommended_pages: string[];
  recommended_faq_questions: RecommendedFaq[];
  quick_wins: string[];
  thirty_day_action_plan: PriorityAction[];
  suggested_homepage_copy_improvements: string[];
}

/** What the /api/geo/scan endpoint returns to the chat client. */
export interface GeoScanResponse {
  ok: boolean;
  scan_request_id?: string;
  status: GeoScanStatus;
  /** Short preview Brian shows in the chat. */
  preview?: {
    visibility_score: number;
    short_summary: string;
    strengths: string[];
    quick_wins: string[];
  };
  report_url?: string | null;
  email_queued?: boolean;
  /** User-safe message. Never contains technical/internal detail. */
  message?: string;
}
