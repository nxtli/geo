import { NextResponse } from "next/server";
import { isReportId, serveReport } from "@/lib/geo/report/serve";

export const runtime = "nodejs";

/**
 * GET /<rapportnummer>: het korte adres van een rapport, zoals
 * geo.marketingaiteam.com/dc59261c-5500-4493-98fd-5cda901a2c66.
 * Alles wat geen rapportnummer is, krijgt een 404.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
): Promise<Response> {
  const { reportId } = await params;
  if (!isReportId(reportId)) {
    return new NextResponse("Pagina niet gevonden.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return serveReport(request, reportId);
}
