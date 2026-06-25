import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { Client } from "pg";
import {
  GEO_SCHEMA_SQL,
  PG_CONNECTION_ENV_VARS,
  resolvePgConnectionString,
} from "@/lib/geo/supabase/schema";
import { logError, logInfo } from "@/lib/geo/logger";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * One-shot, secret-protected schema migration.
 *
 * Runs the canonical GEO schema against the Postgres connection that the
 * Vercel↔Supabase integration injects (POSTGRES_URL_NON_POOLING / POSTGRES_URL).
 * Designed for the case where nobody can open the Supabase dashboard but the
 * deployment already holds the DB credentials.
 *
 * Usage (after deploy):
 *   1. Set MIGRATE_SECRET to any random string in the Vercel project env.
 *   2. Open:  https://geo.nxtli.com/api/geo/migrate?secret=YOUR_SECRET
 *      (or POST with header `x-migrate-secret: YOUR_SECRET`)
 *   3. Remove MIGRATE_SECRET afterwards — the route then returns 404 (disabled).
 *
 * Safety: only runs fixed, idempotent DDL (create … if not exists). No
 * user-supplied SQL. Disabled entirely unless MIGRATE_SECRET is set.
 */
export async function POST(request: Request) {
  return run(request);
}

export async function GET(request: Request) {
  return run(request);
}

async function run(request: Request): Promise<NextResponse> {
  const expected = process.env.MIGRATE_SECRET;
  if (!expected) {
    // Disabled: no secret configured. Don't reveal the route exists.
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const provided =
    new URL(request.url).searchParams.get("secret") ??
    request.headers.get("x-migrate-secret") ??
    "";

  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const connectionString = resolvePgConnectionString();
  if (!connectionString) {
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

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query(GEO_SCHEMA_SQL);
    const { rows } = await client.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name like 'geo_%'
       order by table_name`,
    );
    logInfo("api.geo.migrate", "schema applied");
    return NextResponse.json({
      ok: true,
      message: "Migratie uitgevoerd.",
      tables: rows.map((r: { table_name: string }) => r.table_name),
    });
  } catch (error) {
    logError("api.geo.migrate", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Migratie mislukt. Controleer de Postgres-connection string in Vercel.",
      },
      { status: 500 },
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
