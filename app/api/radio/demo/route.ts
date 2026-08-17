import { NextResponse } from "next/server";
import { deleteProspect, getStore, listProspects } from "@/lib/radio/store";
import { buildDemoProspects, DEMO_PREFIX } from "@/lib/radio/demo";
import { logError } from "@/lib/geo/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST   /api/radio/demo — zet de DEMO DATA-fixtures neer.
 * DELETE /api/radio/demo — haalt ze allemaal weg.
 *
 * De fixtures zijn onmiskenbaar nep (naam begint met "DEMO —", `.invalid`-URL's)
 * en staan met `demo: true` in de database, zodat ze in de UI een DEMO-badge
 * krijgen en met één klik weg kunnen.
 */
export async function POST(): Promise<NextResponse> {
  try {
    const store = getStore();
    await store.init();

    const existing = await listProspects();
    const existingNames = new Set(existing.map((p) => p.company_name));

    const created: string[] = [];
    for (const prospect of buildDemoProspects()) {
      if (existingNames.has(prospect.company_name)) continue;
      await store.insert(prospect);
      created.push(prospect.company_name);
    }

    return NextResponse.json({
      ok: true,
      created: created.length,
      message:
        created.length > 0
          ? `${created.length} DEMO DATA-prospects toegevoegd.`
          : "De demo-prospects stonden er al.",
    });
  } catch (error) {
    logError("radio.api.demo.create", error);
    return NextResponse.json(
      { ok: false, error: "Kon de demo-data niet plaatsen." },
      { status: 500 },
    );
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
    const all = await listProspects();
    const demo = all.filter((p) => p.demo || p.company_name.startsWith(DEMO_PREFIX));
    let removed = 0;
    for (const prospect of demo) {
      if (await deleteProspect(prospect.id)) removed++;
    }
    return NextResponse.json({
      ok: true,
      removed,
      message: `${removed} DEMO DATA-prospect(s) verwijderd.`,
    });
  } catch (error) {
    logError("radio.api.demo.delete", error);
    return NextResponse.json(
      { ok: false, error: "Kon de demo-data niet verwijderen." },
      { status: 500 },
    );
  }
}
