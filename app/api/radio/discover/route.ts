import { NextResponse } from "next/server";
import {
  discoverProspects,
  isDiscoveryAvailable,
  DISCOVERY_QUERIES,
  type TriggerMode,
} from "@/lib/radio/discovery";
import { normalizeSegment } from "@/lib/radio/segments";
import { PROVINCES, NATIONWIDE } from "@/lib/radio/provinces";
import { SIZE_BANDS, MKB_BANDS } from "@/lib/radio/company-size";
import {
  formatCost,
  formatEur,
  eurPerUsd,
  estimateDiscoveryUsd,
  estimateResearchUsd,
} from "@/lib/radio/cost";
import {
  DEFAULT_DISCOVERY_MODEL,
  DEFAULT_DISCOVERY_FORMAT_MODEL,
  searchBudget,
} from "@/lib/radio/discovery/providers/claude-search";
import { DEFAULT_RESEARCH_MODEL } from "@/lib/radio/research/providers/claude";
import { logError } from "@/lib/geo/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Ruim: elke zoekrichting doet meerdere webzoekopdrachten plus een modelcall. */
export const maxDuration = 800;

/**
 * GET  /api/radio/discover — de beschikbare zoekrichtingen (§18).
 * POST /api/radio/discover — zoek nieuwe bedrijven en sla de bruikbare op.
 *
 * Body: { query_keys?: string[], segment?: string, per_query?: number,
 *          max_queries?: number, provinces?: string[], size_bands?: string[],
 *          trigger_mode?: "required" | "none" | "any" }
 *
 * Deze route ONDERZOEKT nog niet: hij levert kandidaten als prospect met status
 * `New`. De UI start daarna de research via /api/radio/research/batch, zodat de
 * scoring-engine bepaalt wie in de top 10 komt — niet de zoekmachine.
 */
export async function GET(request: Request): Promise<NextResponse> {
  // De schatting hangt af van hoeveel bedrijven per richting gevraagd worden,
  // dus die komt als parameter mee. Zo blijft er één rekenmodel, server-side.
  const perQuery = clamp(
    Number(new URL(request.url).searchParams.get("per_query")) || 25,
    1,
    40,
  );
  const searchModel = process.env.RADIO_DISCOVERY_MODEL || DEFAULT_DISCOVERY_MODEL;
  const formatModel =
    process.env.RADIO_DISCOVERY_FORMAT_MODEL || DEFAULT_DISCOVERY_FORMAT_MODEL;
  const researchModel = process.env.RADIO_RESEARCH_MODEL || DEFAULT_RESEARCH_MODEL;
  const searches = searchBudget(perQuery);
  const perDirection = estimateDiscoveryUsd({ perQuery, searches, searchModel, formatModel });
  const perCompany = estimateResearchUsd(2, researchModel) - estimateResearchUsd(1, researchModel);

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
    provinces: [
      { key: NATIONWIDE, label: "Landelijk" },
      ...PROVINCES.map((p) => ({ key: p.key, label: p.label })),
    ],
    size_bands: SIZE_BANDS.map((b) => ({ key: b.key, label: b.label, mkb: MKB_BANDS.includes(b.key) })),
    estimate: {
      per_query: perQuery,
      searches_per_direction: searches,
      per_direction_usd: perDirection,
      per_direction_label: formatEur(perDirection),
      per_company_usd: perCompany,
      per_company_label: formatEur(perCompany),
      search_model: searchModel,
      research_model: researchModel,
      eur_per_usd: eurPerUsd(),
    },
  });
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
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

  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

  const triggerMode: TriggerMode =
    body.trigger_mode === "required" || body.trigger_mode === "none" ? body.trigger_mode : "any";

  try {
    const summary = await discoverProspects({
      queryKeys,
      segment: typeof body.segment === "string" ? normalizeSegment(body.segment) : null,
      perQuery: typeof body.per_query === "number" ? body.per_query : undefined,
      maxQueries: typeof body.max_queries === "number" ? body.max_queries : undefined,
      provinces: strings(body.provinces),
      sizeBands: strings(body.size_bands),
      triggerMode,
    });

    const parts = [`${summary.added.length} nieuwe bedrijven gevonden`];
    if (summary.duplicates.length) parts.push(`${summary.duplicates.length} stond al in de lijst`);
    if (summary.unreachable.length) {
      parts.push(`${summary.unreachable.length} afgewezen (website bestond niet)`);
    }
    if (summary.withoutTrigger.length) {
      parts.push(`${summary.withoutTrigger.length} zonder aanleiding overgeslagen`);
    }
    parts.push(`kosten ${formatCost(summary.costUsd)}`);

    return NextResponse.json({
      ok: true,
      summary,
      cost: { usd: summary.costUsd, label: formatCost(summary.costUsd) },
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
