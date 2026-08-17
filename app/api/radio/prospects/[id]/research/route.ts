import { NextResponse } from "next/server";
import { researchProspect } from "@/lib/radio/research";
import { logError } from "@/lib/geo/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Ruim: een bedrijf kost meerdere HTTP-requests plus een modelcall. */
export const maxDuration = 180;

/**
 * POST /api/radio/prospects/[id]/research
 *
 * Haalt publieke data op, laat die analyseren en rekent de scores door.
 * Geeft naast de prospect ook terug hoeveel bronnen er waren en welke bronnen
 * zijn verworpen, zodat de UI eerlijk kan tonen waarop de score rust.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  try {
    const outcome = await researchProspect(id);
    if (!outcome) {
      return NextResponse.json({ ok: false, error: "Prospect niet gevonden." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      prospect: outcome.prospect,
      provider: outcome.providerId,
      degraded: outcome.degraded,
      source_count: outcome.sourceCount,
      rejected_sources: outcome.rejectedSources,
      warning: outcome.warning,
    });
  } catch (error) {
    logError("radio.api.research", error);
    return NextResponse.json(
      { ok: false, error: "De analyse is mislukt. Probeer het opnieuw." },
      { status: 500 },
    );
  }
}
