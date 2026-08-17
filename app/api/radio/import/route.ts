import { NextResponse } from "next/server";
import { addProspect } from "@/lib/radio/store";
import { parseBatchList, parseProspectCsv } from "@/lib/radio/csv";
import type { ProspectInput } from "@/lib/radio/types";
import { logError } from "@/lib/geo/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/radio/import
 *
 * Body: { mode: "csv" | "batch", text: string }
 *
 * Importeert alleen — er wordt NIET automatisch onderzocht. Zo ziet Eric eerst
 * wat er binnenkwam (en wat er dubbel was) en start hij de research daarna zelf,
 * in plaats van meteen honderden modelcalls te veroorzaken.
 */
const MAX_ROWS = 500;

export async function POST(request: Request): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Ongeldige JSON." }, { status: 400 });
  }

  const mode = body.mode === "batch" ? "batch" : "csv";
  const text = typeof body.text === "string" ? body.text : "";

  if (!text.trim()) {
    return NextResponse.json({ ok: false, error: "Er is geen inhoud meegegeven." }, { status: 400 });
  }

  let rows: ProspectInput[] = [];
  let parseErrors: Array<{ line: number; reason: string }> = [];

  if (mode === "csv") {
    const parsed = parseProspectCsv(text);
    rows = parsed.rows;
    parseErrors = parsed.errors;
    if (rows.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: parseErrors[0]?.reason ?? "Geen bruikbare regels gevonden.",
          parse_errors: parseErrors,
        },
        { status: 400 },
      );
    }
  } else {
    rows = parseBatchList(text);
    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Geen bruikbare regels gevonden." },
        { status: 400 },
      );
    }
  }

  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      {
        ok: false,
        error: `Dit zijn ${rows.length} regels; maximaal ${MAX_ROWS} per import. Splits de lijst op.`,
      },
      { status: 400 },
    );
  }

  const added: Array<{ id: string; company_name: string }> = [];
  const duplicates: Array<{ id: string; company_name: string }> = [];
  const failed: Array<{ company_name: string; reason: string }> = [];

  for (const row of rows) {
    try {
      const { prospect, duplicate } = await addProspect(row);
      if (duplicate) {
        duplicates.push({ id: prospect.id, company_name: prospect.company_name });
      } else {
        added.push({ id: prospect.id, company_name: prospect.company_name });
      }
    } catch (error) {
      logError("radio.api.import", error);
      failed.push({ company_name: row.company_name, reason: "Opslaan mislukt." });
    }
  }

  const parts = [`${added.length} toegevoegd`];
  if (duplicates.length) parts.push(`${duplicates.length} stond al in de lijst`);
  if (failed.length) parts.push(`${failed.length} mislukt`);
  if (parseErrors.length) parts.push(`${parseErrors.length} regel(s) overgeslagen`);

  return NextResponse.json({
    ok: true,
    added,
    duplicates,
    failed,
    parse_errors: parseErrors,
    // De id's die nog geen score hebben, zodat de UI direct research kan starten.
    new_ids: added.map((a) => a.id),
    message: parts.join(", ") + ".",
  });
}
