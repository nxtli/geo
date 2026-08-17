import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getStore } from "@/lib/radio/store";
import { PostgresStoreDriver } from "@/lib/radio/store/postgres-driver";
import { logError } from "@/lib/geo/logger";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/radio/migrate — expliciete schema-migratie voor `radio_prospects`.
 *
 * Zelden nodig: de Postgres-driver migreert zichzelf idempotent bij het eerste
 * gebruik. Deze route bestaat om het handmatig te kunnen forceren en om te zien
 * of het lukt. Beveiligd met MIGRATE_SECRET (404 als die niet is gezet), net als
 * de GEO-migratieroute.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const expected = process.env.MIGRATE_SECRET;
  if (!expected) return NextResponse.json({ error: "not found" }, { status: 404 });

  const provided =
    new URL(request.url).searchParams.get("secret") ??
    request.headers.get("x-migrate-secret") ??
    "";
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const store = getStore();
  if (store.id !== "postgres") {
    return NextResponse.json({
      ok: true,
      skipped: true,
      driver: store.id,
      message: `De actieve opslag is "${store.describe()}" — die heeft geen migratie nodig.`,
    });
  }

  if (!PostgresStoreDriver.isAvailable()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Geen Postgres-connectiestring gevonden. Zet POSTGRES_URL (of DATABASE_URL), of gebruik RADIO_STORE_DRIVER=file.",
      },
      { status: 500 },
    );
  }

  try {
    await store.init();
    return NextResponse.json({
      ok: true,
      driver: store.id,
      message: "Tabel radio_prospects is gemigreerd.",
    });
  } catch (error) {
    logError("radio.api.migrate", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Migratie mislukt.",
      },
      { status: 500 },
    );
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
