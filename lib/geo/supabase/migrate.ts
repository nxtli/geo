import { Client } from "pg";
import { GEO_SCHEMA_SQL, getPgCandidates } from "./schema";
import { logError, logInfo } from "../logger";

/**
 * Schema migration runner. Applies the canonical, idempotent GEO schema using
 * the Postgres connection the Vercel↔Supabase integration injects.
 *
 * Used two ways:
 *  - runMigration(): explicit run (the secret-gated /api/geo/migrate route).
 *  - ensureSchemaOnce(): best-effort auto-migrate, cached per process, called
 *    at the start of the scan/admin paths so the schema self-heals on deploy
 *    without anyone running a manual migration.
 */
export interface MigrationResult {
  ok: boolean;
  via?: string;
  tables?: string[];
  attempts?: Array<{ source: string; host: string; error: string }>;
  error?: string;
}

export async function runMigration(): Promise<MigrationResult> {
  const candidates = getPgCandidates();
  if (candidates.length === 0) {
    return { ok: false, error: "no_connection_string", attempts: [] };
  }

  const attempts: NonNullable<MigrationResult["attempts"]> = [];

  for (const candidate of candidates) {
    const client = new Client({
      connectionString: stripSslParams(candidate.value),
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
      await client.end().catch(() => undefined);
      return {
        ok: true,
        via: candidate.source,
        tables: rows.map((r: { table_name: string }) => r.table_name),
      };
    } catch (error) {
      attempts.push({
        source: candidate.source,
        host: safeHost(candidate.value),
        error: describeError(error),
      });
      await client.end().catch(() => undefined);
    }
  }

  return { ok: false, error: "all_connection_strings_failed", attempts };
}

let ensured: Promise<void> | null = null;

/** Run the idempotent schema migration once per process (best-effort). */
export function ensureSchemaOnce(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      if (getPgCandidates().length === 0) return; // no DB configured — skip
      try {
        const result = await runMigration();
        if (result.ok) logInfo("migrate.ensure", `schema ensured via ${result.via}`);
        else logError("migrate.ensure", result.error ?? "failed");
      } catch (error) {
        logError("migrate.ensure", error);
      }
    })();
  }
  return ensured;
}

/** Remove sslmode/ssl so the explicit ssl Client option wins (Supabase pooler cert). */
function stripSslParams(connectionString: string): string {
  try {
    const u = new URL(connectionString);
    u.searchParams.delete("sslmode");
    u.searchParams.delete("ssl");
    return u.toString();
  } catch {
    return connectionString;
  }
}

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
