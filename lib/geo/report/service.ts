import type {
  GeoAnalysisResult,
  GeoLeadInput,
  GeoScanResponse,
} from "../types";
import { renderReportHtml } from "./template";

/**
 * Report service — turns a raw AI analysis into the stored report record, the
 * branded HTML, and the short chat preview.
 */

export function buildReportHtml(params: {
  lead: Pick<GeoLeadInput, "company_name" | "homepage_url" | "name">;
  analysis: GeoAnalysisResult;
  now?: Date;
}): string {
  const date = formatDate(params.now ?? new Date());
  return renderReportHtml({ lead: params.lead, analysis: params.analysis, date });
}

/** Maps an analysis onto the `geo_scan_reports` columns. */
export function buildReportRecord(params: {
  scanRequestId: string | null;
  leadId: string | null;
  analysis: GeoAnalysisResult;
  reportHtml: string;
  pdfUrl: string | null;
}): Record<string, unknown> {
  const a = params.analysis;
  return {
    scan_request_id: params.scanRequestId,
    lead_id: params.leadId,
    visibility_score: a.visibility_score,
    summary: a.short_summary,
    strengths: a.strengths,
    weaknesses: a.weaknesses,
    recommendations: a.quick_wins,
    content_gaps: a.content_gaps,
    priority_actions: a.thirty_day_action_plan,
    report_html: params.reportHtml,
    pdf_url: params.pdfUrl,
  };
}

/** The compact summary Brian shows in the chat. */
export function buildPreview(
  analysis: GeoAnalysisResult,
): NonNullable<GeoScanResponse["preview"]> {
  return {
    visibility_score: analysis.visibility_score,
    short_summary: analysis.short_summary,
    strengths: analysis.strengths.slice(0, 3),
    quick_wins: analysis.quick_wins.slice(0, 3),
  };
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
