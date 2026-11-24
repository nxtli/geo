import { serveReport } from "@/lib/geo/report/serve";

export const runtime = "nodejs";

/** GET /api/geo/report/[id]: het oude adres van het rapport. Zie lib/geo/report/serve.ts. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return serveReport(request, id);
}
