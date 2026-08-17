import { NextResponse } from "next/server";
import { discoverProspects, isDiscoveryAvailable, DISCOVERY_QUERIES } from "@/lib/radio/discovery";
import { normalizeSegment } from "@/lib/radio/segments";
import { logError } from "@/lib/geo/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Ruim: elke zoekrichting doet meerdere webzoekopdrachten plus een modelcall. */
export const maxDuration = 800;

/**
 * GET  /api/radio/discover — de beschikbare zoekrichtingen (§18).
 * POST /api/radio/discover — zoek nieuwe bedrijven en sla de bruikbare op.
 *
 * Body: { query_keys?: string[], segment?: string, per_query?: number, max_queries?: number }
 *
 * Deze route ONDERZOEKT nog niet: hij levert kandidaten als prospect met status
 * `New`. De UI start daarna de research via /api/radio/research/batch, zodat de
 * scoring-engine bepaalt wie in de top 10 komt — niet de zoekmachine.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    available: isDiscoveryAvailable(),
    queries: DISCOVERY_QUERIES.map((q) => ({
      key: q.key,
      label: q.label,
      kind: q.kind,
      segment: q.segment,
      searches: q.searches,
    })),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isDiscoveryAvailable()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Zoeken naar bedrijven vereist een ANTHROPIC_API_KEY met toegang tot web search. Zet die in .env.local en herstart.",
      },
      { status: 400 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Lege body is prima: dan kiest de tool zelf de zoekrichtingen.
  }

  const queryKeys = Array.isArray(body.query_keys)
    ? body.query_keys.filter((v): v is string => typeof v === "string")
    : undefined;

  try {
    const summary = await discoverProspects({
      queryKeys,
      segment: typeof body.segment === "string" ? normalizeSegment(body.segment) : null,
      perQuery: typeof body.per_query === "number" ? body.per_query : undefined,
      maxQueries: typeof body.max_queries === "number" ? body.max_queries : undefined,
    });

    const parts = [`${summary.added.length} nieuwe bedrijven gevonden`];
    if (summary.duplicates.length) parts.push(`${summary.duplicates.length} stond al in de lijst`);
    if (summary.unreachable.length) {
      parts.push(`${summary.unreachable.length} afgewezen (website bestond niet)`);
    }

    return NextResponse.json({
      ok: true,
      summary,
      new_ids: summary.added.map((a) => a.id),
      message: parts.join(", ") + ".",
    });
  } catch (error) {
    logError("radio.api.discover", error);
    return NextResponse.json(
      { ok: false, error: "Het zoeken is mislukt. Probeer het opnieuw." },
      { status: 500 },
    );
  }
}
