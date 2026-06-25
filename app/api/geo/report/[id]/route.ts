import { NextResponse } from "next/server";
import { getReportHtml } from "@/lib/geo/report/store";
import { getReportByScanRequest } from "@/lib/geo/supabase/service";

export const runtime = "nodejs";

/**
 * GET /api/geo/report/[id]
 *
 * Serves the NXTLI-branded HTML report for a scan. The visitor can read it in
 * the browser or use "Print → Save as PDF". Source of truth is Supabase;
 * falls back to the process-local cache for the current instance.
 *
 * `?download=1` sets a Content-Disposition attachment header.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse | Response> {
  const id = params.id;

  let html = getReportHtml(id);
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
