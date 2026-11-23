import { NextResponse } from "next/server";
import { checkMachineAuth, pageCheckBodySchema, runPageCheck } from "@/lib/geo/page-check";
import { logError } from "@/lib/geo/logger";
import { measureSpeed, SPEED_TIMEOUT_MS } from "@/lib/geo/speed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// PageSpeed Insights takes roughly 10-30 s per page (capped at SPEED_TIMEOUT_MS)
// on top of the page fetch, with three pages in flight at once; 60 s is not
// enough for a batch of ten that includes the speed check.
export const maxDuration = 120;

/**
 * Machine endpoint: measured page checks for up to 10 URLs.
 *
 * Auth: `Authorization: Bearer <GEO_MACHINE_TOKEN>`. With GEO_MACHINE_TOKEN
 * unset the endpoint answers 404. This route only fetches pages, asks
 * PageSpeed Insights for the speed check, and runs the pure checks; it never
 * touches the scan flow (no lead, mail, CRM, database or model call). The
 * logic lives in lib/geo/page-check.ts.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = checkMachineAuth(request.headers.get("authorization"), process.env.GEO_MACHINE_TOKEN);
  if (auth === "not_found") return NextResponse.json({ error: "not found" }, { status: 404 });
  if (auth === "unauthorized") return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = pageCheckBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    // PAGESPEED_API_KEY is read here only; unset means a keyless PSI call.
    const apiKey = process.env.PAGESPEED_API_KEY || undefined;
    const measure = (url: string) =>
      measureSpeed(url, { fetch, timeoutMs: SPEED_TIMEOUT_MS, ...(apiKey ? { apiKey } : {}) });
    return NextResponse.json(await runPageCheck(parsed.data, { measureSpeed: measure }));
  } catch (error) {
    // runPageCheck catches per URL; this only guards against the unexpected.
    logError("page-check", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
