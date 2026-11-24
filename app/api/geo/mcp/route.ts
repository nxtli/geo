import { handleMcpNotAllowed, handleMcpPost } from "@/lib/geo/mcp";
import { runPageCheck } from "@/lib/geo/page-check";
import { pageCheckDepsFromEnv } from "@/lib/geo/page-check-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Same budget as the page-check route: ten pages with the speed check need more than 60 s.
export const maxDuration = 120;

/**
 * MCP endpoint (Streamable HTTP, stateless, JSON responses only) serving the
 * page check as the tools `geo_check_pages` and `geo_list_checks`.
 *
 * Auth is the page-check route's: `Authorization: Bearer <GEO_MACHINE_TOKEN>`,
 * 404 when GEO_MACHINE_TOKEN is unset, 401 on a wrong token. A tool call
 * returns exactly what POST /api/geo/page-check returns for the same body.
 * The protocol handling lives in lib/geo/mcp.ts.
 */
export async function POST(request: Request): Promise<Response> {
  return handleMcpPost(request, process.env.GEO_MACHINE_TOKEN, {
    checkPages: (body) => runPageCheck(body, pageCheckDepsFromEnv()),
  });
}

export function GET(request: Request): Response {
  return handleMcpNotAllowed(request, process.env.GEO_MACHINE_TOKEN);
}

export function DELETE(request: Request): Response {
  return handleMcpNotAllowed(request, process.env.GEO_MACHINE_TOKEN);
}
