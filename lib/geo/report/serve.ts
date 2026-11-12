import { NextResponse } from "next/server";
import { getReportHtml } from "./store";
import { buildReportHtml } from "./service";
import { parseAnalysisResult } from "../analysis/provider";
import { getReportByScanRequest, getScanForReport } from "../supabase/service";
import { logError } from "../logger";
import { getServerBrand } from "../brand-server";

/**
 * Toont het rapport van een scan. Twee adressen gebruiken dit:
 *  - /<id>                  het korte adres, in de mail, de chat en HubSpot
 *  - /api/geo/report/<id>   het oude adres, blijft werken voor bestaande links
 *
 * Het rapport wordt opnieuw opgebouwd uit de opgeslagen analyse. Een bestaande
 * link toont dus altijd de huidige opmaak. Zonder opgeslagen analyse volgt het
 * geheugen van de server en daarna de opgeslagen HTML.
 *
 * `?download=1` biedt het rapport aan als bestand.
 */
const REPORT_ID = /^(local-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Is dit een geldig rapportnummer? Houdt willekeurige paden weg bij de database. */
export function isReportId(id: string): boolean {
  return REPORT_ID.test(id);
}

/** Het korte adres van een rapport. */
export function reportPath(id: string): string {
  return `/${id}`;
}

export async function serveReport(request: Request, id: string): Promise<Response> {
  let html: string | null = null;
  const brand = await getServerBrand();

  // Preferred: re-render from the stored analysis using the current template.
  try {
    const scan = await getScanForReport(id);
    if (scan?.analysis_result) {
      const analysis = parseAnalysisResult(scan.analysis_result);
      html = buildReportHtml({
        lead: leadFromRawInput(scan.raw_input),
        analysis,
        now: toDate(scan.created_at),
        brand,
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
      {
        ok: false,
        message:
          "Rapport niet gevonden of verlopen. Zonder database bewaart deze omgeving rapporten alleen tijdelijk. Open het rapport vanuit de chat direct na de scan.",
      },
      { status: 404 },
    );
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, max-age=0, no-store",
    // Een rapport is van één bezoeker en hoort niet in een zoekmachine.
    "X-Robots-Tag": "noindex, nofollow",
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
