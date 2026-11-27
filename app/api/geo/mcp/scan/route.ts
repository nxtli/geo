import { runGeoAnalysis } from "@/lib/geo/analysis";
import { getServerBrand } from "@/lib/geo/brand-server";
import { handleMcpNotAllowed, handleMcpPost } from "@/lib/geo/mcp";
import { pageCheckGuard } from "@/lib/geo/page-check";
import { generatePdf } from "@/lib/geo/report/pdf";
import { createScanRateLimit, dailyScanCapReached, scanMaxPerHour, scanPage } from "@/lib/geo/scan-page";
import { countCompletedScansSince } from "@/lib/geo/supabase/service";
import { fetchPage } from "@/lib/geo/scrape";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The site scan's budget (app/api/geo/scan): the analysis alone may take up to 230 s.
export const maxDuration = 300;

const HOUR_MS = 60 * 60 * 1000;
const rateLimit = createScanRateLimit(scanMaxPerHour(process.env.GEO_MCP_SCAN_MAX_PER_HOUR), HOUR_MS);

/**
 * MCP endpoint serving the full site scan as the tool `geo_scan_page`, apart
 * from the page check at /api/geo/mcp so each keeps its own time budget.
 *
 * Auth is the page check's: `Authorization: Bearer <GEO_MACHINE_TOKEN>`, 404
 * when GEO_MACHINE_TOKEN is unset, 401 on a wrong token. At most
 * GEO_MCP_SCAN_MAX_PER_HOUR scans (default 30) per instance per hour, and
 * none once the site's GEO_MAX_SCANS_PER_DAY cap is reached (when it is set).
 */
export async function POST(request: Request): Promise<Response> {
  const brand = await getServerBrand();
  return handleMcpPost(request, process.env.GEO_MACHINE_TOKEN, {
    scanPage: async (args) => {
      if (await dailyScanCapReached(process.env.GEO_MAX_SCANS_PER_DAY, countCompletedScansSince)) {
        return { ok: false, dailyCap: true };
      }
      const slot = rateLimit.take();
      if (!slot.ok) return { ok: false, retryAfterSeconds: slot.retryAfterSeconds };
      const result = await scanPage(args, {
        fetchPage,
        guard: pageCheckGuard(),
        analyze: (input) => runGeoAnalysis(input),
        makePdf: generatePdf,
        brand,
        now: () => new Date(),
      });
      return { ok: true, result };
    },
  });
}

export function GET(request: Request): Response {
  return handleMcpNotAllowed(request, process.env.GEO_MACHINE_TOKEN);
}

export function DELETE(request: Request): Response {
  return handleMcpNotAllowed(request, process.env.GEO_MACHINE_TOKEN);
}
