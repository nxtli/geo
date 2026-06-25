import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { Client } from "pg";
import {
  GEO_SCHEMA_SQL,
  PG_CONNECTION_ENV_VARS,
  getPgCandidates,
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

  const candidates = getPgCandidates();
  if (candidates.length === 0) {
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

  // Try each connection string (pooler first) until one connects + applies.
  const attempts: Array<{ source: string; host: string; error: string }> = [];

  for (const candidate of candidates) {
    const client = new Client({
      connectionString: candidate.value,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10_000,
    });
    try {
      await client.connect();
      await client.query(GEO_SCHEMA_SQL);
      const { rows } = await client.query(
        `select table_name from information_schema.tables
         where table_schema = 'public' and table_name like 'geo_%'
         order by table_name`,
      );
      logInfo("api.geo.migrate", `schema applied via ${candidate.source}`);
      await client.end().catch(() => undefined);
      return NextResponse.json({
        ok: true,
        message: "Migratie uitgevoerd.",
        via: candidate.source,
        tables: rows.map((r: { table_name: string }) => r.table_name),
      });
    } catch (error) {
      logError(`api.geo.migrate(${candidate.source})`, error);
      attempts.push({
        source: candidate.source,
        host: safeHost(candidate.value),
        error: describeError(error),
      });
      await client.end().catch(() => undefined);
    }
  }

  // All candidates failed — return diagnostics (route is secret-protected).
  return NextResponse.json(
    {
      ok: false,
      error: "Migratie mislukt op alle beschikbare connection strings.",
      attempts,
      hint:
        "De pooler-URL (POSTGRES_URL) is vanaf Vercel bereikbaar; de directe " +
        "POSTGRES_URL_NON_POOLING is vaak IPv6-only en faalt. Controleer of " +
        "POSTGRES_URL in Vercel staat en naar de Supabase-pooler wijst.",
    },
    { status: 500 },
  );
}

/** Hostname only — never echo the password from the connection string. */
function safeHost(connectionString: string): string {
  try {
    const u = new URL(connectionString);
    return u.port ? `${u.hostname}:${u.port}` : u.hostname;
  } catch {
    return "onbekend";
  }
}

function describeError(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { code?: string; message?: string };
    return [e.code, e.message].filter(Boolean).join(" — ") || String(error);
  }
  return String(error);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
