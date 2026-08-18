import { NextResponse } from "next/server";
import {
  LOCAL_VERTICALS,
  MAX_LIMIT,
  overpassUrl,
  sourceLocalProspects,
} from "@/lib/radio/local";
import { PROVINCES } from "@/lib/radio/provinces";
import { verticalSearchQuery, verticalSearchUrl, OWNER_ROLE_TERMS } from "@/lib/radio/linkedin-search";
import { logError } from "@/lib/geo/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Eén request per provincie naar een gratis dienst, met pauzes ertussen. */
export const maxDuration = 800;

/**
 * GET  /api/radio/local — branches, provincies en de LinkedIn-zoeklinks.
 * POST /api/radio/local — haal de bedrijven op en sla ze op.
 *
 * Body: { verticals?: string[], provinces?: string[], exclude_chains?: boolean,
 *         require_website?: boolean, limit?: number }
 *
 * Deze route doet GEEN modelcalls: de bron is openbare kaartdata. Kosten: nul.
 */
export async function GET(request: Request): Promise<NextResponse> {
  // Met ?provinces= erbij komen de kant-en-klare LinkedIn-zoeklinks mee, per
  // branche × provincie. Dat is de lijst die je in Waalaxy gebruikt.
  const requested = new URL(request.url).searchParams.getAll("provinces");
  const provinces = PROVINCES.filter((p) => requested.includes(p.key));

  const searches = provinces.flatMap((province) =>
    LOCAL_VERTICALS.map((vertical) => ({
      vertical: vertical.key,
      vertical_label: vertical.label,
      province: province.key,
      province_label: province.label,
      url: verticalSearchUrl({ terms: vertical.linkedin_terms, region: province.label }),
      query: verticalSearchQuery({ terms: vertical.linkedin_terms, region: province.label }),
    })),
  );

  return NextResponse.json({
    ok: true,
    source: { id: "openstreetmap", url: overpassUrl(), cost: "gratis" },
    roles: OWNER_ROLE_TERMS,
    verticals: LOCAL_VERTICALS.map((v) => ({
      key: v.key,
      label: v.label,
      segment: v.segment,
      angle: v.angle,
      linkedin_terms: v.linkedin_terms,
    })),
    provinces: PROVINCES.map((p) => ({ key: p.key, label: p.label })),
    searches,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Ongeldige JSON." }, { status: 400 });
  }

  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

  const provinces = strings(body.provinces);
  if (provinces.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Kies minstens één provincie." },
      { status: 400 },
    );
  }

  try {
    const summary = await sourceLocalProspects({
      verticals: strings(body.verticals),
      provinces,
      excludeChains: body.exclude_chains !== false,
      requireWebsite: body.require_website === true,
      limit:
        typeof body.limit === "number" ? Math.min(MAX_LIMIT, Math.max(1, body.limit)) : undefined,
    });

    const parts = [`${summary.added.length} bedrijven toegevoegd`];
    if (summary.duplicates > 0) parts.push(`${summary.duplicates} stond al in de lijst`);
    if (summary.chains.length > 0) parts.push(`${summary.chains.length} filialen van ketens overgeslagen`);
    if (summary.withoutWebsite > 0) parts.push(`${summary.withoutWebsite} zonder website overgeslagen`);
    parts.push("kosten: € 0,00");

    return NextResponse.json({
      ok: true,
      summary,
      new_ids: summary.added.map((a) => a.id),
      message: parts.join(", ") + ".",
    });
  } catch (error) {
    logError("radio.api.local", error);
    return NextResponse.json(
      { ok: false, error: "Het ophalen uit de kaartdata is mislukt." },
      { status: 500 },
    );
  }
}
