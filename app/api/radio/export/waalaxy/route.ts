import { NextResponse } from "next/server";
import { listProspects, setStatusMany } from "@/lib/radio/store";
import { buildWaalaxyExport } from "@/lib/radio/csv";
import { logError } from "@/lib/geo/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/radio/export/waalaxy
 *
 * Body: { ids: string[], format?: "csv" | "json", mark_exported?: boolean }
 *
 * `format: "csv"` (default) levert het bestand direct als download.
 * `format: "json"` geeft de export plus de "Missing LinkedIn URL"-groep terug,
 * zodat de UI eerst kan laten zien wie er níet meekan vóórdat er gedownload
 * wordt. Prospects zonder LinkedIn-profiel komen nooit stilzwijgend in de CSV
 * en er wordt nooit een URL verzonnen.
 */
export async function POST(request: Request): Promise<NextResponse | Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Ongeldige JSON." }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((v): v is string => typeof v === "string")
    : [];

  if (ids.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Selecteer eerst een of meer prospects." },
      { status: 400 },
    );
  }

  try {
    const all = await listProspects();
    const byId = new Map(all.map((p) => [p.id, p]));
    const selected = ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);

    if (selected.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Geen van de geselecteerde prospects bestaat nog." },
        { status: 404 },
      );
    }

    const result = buildWaalaxyExport(selected);

    // Alleen de daadwerkelijk geëxporteerde prospects op "Exported to Waalaxy"
    // zetten — wie niet meekon houdt zijn status.
    if (body.mark_exported === true && result.exported > 0) {
      const exportedIds = selected
        .filter((p) => !result.missingLinkedIn.some((m) => m.id === p.id))
        .map((p) => p.id);
      await setStatusMany(exportedIds, "Exported to Waalaxy");
    }

    if (body.format === "json") {
      return NextResponse.json({
        ok: true,
        exported: result.exported,
        missing_linkedin: result.missingLinkedIn,
        csv: result.csv,
        missing_csv: result.missingCsv,
      });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(result.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="waalaxy-prospects-${stamp}.csv"`,
        "X-Radio-Exported": String(result.exported),
        "X-Radio-Missing-Linkedin": String(result.missingLinkedIn.length),
      },
    });
  } catch (error) {
    logError("radio.api.export", error);
    return NextResponse.json({ ok: false, error: "Export mislukt." }, { status: 500 });
  }
}
