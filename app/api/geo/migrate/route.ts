import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runMigration } from "@/lib/geo/supabase/migrate";
import { PG_CONNECTION_ENV_VARS } from "@/lib/geo/supabase/schema";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Manual, secret-protected schema migration.
 *
 * Note: the schema also auto-migrates on deploy (ensureSchemaOnce runs at the
 * start of the scan/admin paths), so this route is rarely needed — it's kept
 * for an explicit, on-demand run. Guarded by MIGRATE_SECRET (404 when unset).
 */
export async function POST(request: Request) {
  return run(request);
}
export async function GET(request: Request) {
  return run(request);
}

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.MIGRATE_SECRET;
  if (!expected) return NextResponse.json({ error: "not found" }, { status: 404 });

  const provided =
    new URL(request.url).searchParams.get("secret") ??
    request.headers.get("x-migrate-secret") ??
    "";
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runMigration();

  if (result.ok) {
    return NextResponse.json({ ok: true, message: "Migratie uitgevoerd.", via: result.via, tables: result.tables });
  }
  if (result.error === "no_connection_string") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Geen Postgres-connection string gevonden. Verwacht één van: " +
          PG_CONNECTION_ENV_VARS.join(", ") +
          " (gezet door de Vercel↔Supabase-integratie).",
      },
      { status: 500 },
    );
  }
  return NextResponse.json(
    { ok: false, error: "Migratie mislukt op alle connection strings.", attempts: result.attempts },
    { status: 500 },
  );
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
