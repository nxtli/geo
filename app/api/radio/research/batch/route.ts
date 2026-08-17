import { NextResponse } from "next/server";
import { listProspects } from "@/lib/radio/store";
import { researchMany } from "@/lib/radio/research";
import { logError } from "@/lib/geo/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * POST /api/radio/research/batch
 *
 * Onderzoekt meerdere prospects met een concurrency-cap. Body:
 *   { ids: string[] }            — expliciete selectie
 *   { scope: "unresearched" }    — alles wat nog geen score heeft
 *
 * Er zit een bovengrens op het aantal bedrijven per aanroep: een enkele request
 * die honderden modelcalls doet loopt tegen de platform-timeout aan. De UI
 * verwerkt een grote batch daarom in meerdere rondes.
 */
const MAX_PER_CALL = 25;

export async function POST(request: Request): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Ongeldige JSON." }, { status: 400 });
  }

  let ids: string[] = [];

  if (Array.isArray(body.ids)) {
    ids = body.ids.filter((v): v is string => typeof v === "string");
  } else if (body.scope === "unresearched") {
    const all = await listProspects();
    ids = all.filter((p) => p.fit_score === null).map((p) => p.id);
  } else {
    return NextResponse.json(
      { ok: false, error: 'Geef "ids" of scope "unresearched" mee.' },
      { status: 400 },
    );
  }

  if (ids.length === 0) {
    return NextResponse.json({
      ok: true,
      summary: { researched: 0, failed: 0, results: [], totalUsage: null },
      remaining: 0,
      message: "Er was niets om te onderzoeken.",
    });
  }

  const batch = ids.slice(0, MAX_PER_CALL);
  const remaining = Math.max(0, ids.length - batch.length);

  try {
    const summary = await researchMany(batch);
    return NextResponse.json({
      ok: true,
      summary,
      remaining,
      message:
        remaining > 0
          ? `${summary.researched} bedrijven onderzocht. Nog ${remaining} te gaan.`
          : `${summary.researched} bedrijven onderzocht.`,
    });
  } catch (error) {
    logError("radio.api.research.batch", error);
    return NextResponse.json(
      { ok: false, error: "De batch-analyse is mislukt." },
      { status: 500 },
    );
  }
}
