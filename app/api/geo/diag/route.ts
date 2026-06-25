import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { selectProvider } from "@/lib/geo/analysis";
import { isSupabaseConfigured } from "@/lib/geo/supabase/service";
import { logError } from "@/lib/geo/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Secret-protected configuration diagnostics for the GEO scan.
 *
 * Tells you, without running a full scan or reading logs:
 *  - which analysis provider is selected (geo-skill / claude / mock)
 *  - whether ANTHROPIC_API_KEY + Supabase are configured
 *  - whether the `geo-page-checker` skill is visible to this API key, its id,
 *    and (if not) which skills ARE available — so name mismatches are obvious.
 *
 * Enable by setting GEO_DIAG_SECRET in Vercel; open:
 *   https://geo.nxtli.com/api/geo/diag?secret=YOUR_SECRET
 * Remove GEO_DIAG_SECRET afterwards to disable (returns 404).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const expected = process.env.GEO_DIAG_SECRET;
  if (!expected) return NextResponse.json({ error: "not found" }, { status: 404 });

  const provided =
    new URL(request.url).searchParams.get("secret") ??
    request.headers.get("x-diag-secret") ??
    "";
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const wantedName = (process.env.GEO_SKILL_NAME || "geo-page-checker").toLowerCase();
  const model = process.env.GEO_ANALYSIS_MODEL || "claude-opus-4-8";

  const skill = await inspectSkill(hasKey, wantedName);

  return NextResponse.json({
    ok: true,
    provider_selected: selectProvider().id,
    provider_override: process.env.GEO_ANALYSIS_PROVIDER ?? null,
    anthropic_api_key: hasKey,
    model,
    supabase_configured: isSupabaseConfigured(),
    skill,
  });
}

async function inspectSkill(hasKey: boolean, wantedName: string) {
  if (process.env.GEO_SKILL_ID) {
    return { mode: "explicit_id", skill_id: process.env.GEO_SKILL_ID };
  }
  if (!hasKey) {
    return {
      mode: "name_lookup",
      requested_name: wantedName,
      found: false,
      error: "ANTHROPIC_API_KEY niet gezet — kan de skill niet opzoeken.",
    };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/skills?limit=100", {
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY as string,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "skills-2025-10-02",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        mode: "name_lookup",
        requested_name: wantedName,
        found: false,
        error: `Skills API gaf ${res.status}: ${body.slice(0, 200)}`,
      };
    }

    const json = await res.json();
    const items: Array<Record<string, unknown>> = Array.isArray(json?.data)
      ? json.data
      : [];

    const nameOf = (s: Record<string, unknown>) =>
      [s.name, s.display_name, s.title, s.slug]
        .filter((v): v is string => typeof v === "string")[0] ?? "(naamloos)";

    const match = items.find((s) => {
      const cands = [s.name, s.display_name, s.title, s.slug, s.id]
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.toLowerCase());
      return cands.includes(wantedName);
    });

    return {
      mode: "name_lookup",
      requested_name: wantedName,
      found: Boolean(match),
      skill_id: (match?.id as string) ?? null,
      available: items.map((s) => ({ name: nameOf(s), id: s.id })),
    };
  } catch (error) {
    logError("api.geo.diag", error);
    return {
      mode: "name_lookup",
      requested_name: wantedName,
      found: false,
      error: "Kon de Skills API niet bereiken.",
    };
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
