import { NextResponse } from "next/server";
import { getReportHtml } from "@/lib/geo/report/store";
import { buildReportHtml } from "@/lib/geo/report/service";
import { parseAnalysisResult } from "@/lib/geo/analysis/provider";
import { getReportByScanRequest, getScanForReport } from "@/lib/geo/supabase/service";
import { logError } from "@/lib/geo/logger";

export const runtime = "nodejs";

/**
 * GET /api/geo/report/[id]
 *
 * Serves the NXTLI-branded HTML report for a scan. The visitor can read it in
 * the browser or use "Print → Save as PDF".
 *
 * The report is re-rendered LIVE from the stored analysis, so existing links
 * always reflect the current report template (design changes apply retroactively).
 * Falls back to the process-local cache, then the stored HTML, for rows without
 * a parsed analysis (or when no DB is configured).
 *
 * `?download=1` sets a Content-Disposition attachment header.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  const { id } = await params;

  let html: string | null = null;

  // Preferred: re-render from the stored analysis using the current template.
  try {
    const scan = await getScanForReport(id);
    if (scan?.analysis_result) {
      const analysis = parseAnalysisResult(scan.analysis_result);
      html = buildReportHtml({
        lead: leadFromRawInput(scan.raw_input),
        analysis,
        now: toDate(scan.created_at),
      });
    }
  } catch (error) {
    logError("api.geo.report.render", error);
  }

  // Fallbacks: process-local cache, then the stored HTML.
  if (!html) html = getReportHtml(id);
  if (!html) {
    const stored = await getReportByScanRequest(id);
    html = stored?.report_html ?? null;
  }

  if (!html) {
    return NextResponse.json(
      { ok: false, message: "Rapport niet gevonden of verlopen." },
      { status: 404 },
    );
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, max-age=0, no-store",
  };
  if (download) {
    headers["Content-Disposition"] =
      `attachment; filename="nxtli-geo-scan-${id}.html"`;
  }

  return new Response(html, { headers });
}

/** Pull the fields the report needs out of the stored raw_input jsonb. */
function leadFromRawInput(
  raw: unknown,
): { company_name: string; homepage_url: string; name: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    company_name: s(r.company_name),
    homepage_url: s(r.homepage_url),
    name: s(r.name),
  };
}

/** created_at from Postgres may arrive as a Date or an ISO string. */
function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
}
