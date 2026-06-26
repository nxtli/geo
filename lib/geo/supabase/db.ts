import { Pool, type PoolClient } from "pg";
import { getPgCandidates } from "./schema";

/**
 * Direct Postgres access for the GEO scan.
 *
 * We persist through the Postgres connection the Vercel↔Supabase integration
 * injects (POSTGRES_URL etc.) rather than the Supabase REST client. This is the
 * same connection the migration uses, so if migration works, persistence works
 * — and it removes the dependency on the SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 * REST env vars and the PostgREST schema-cache (a table created out-of-band is
 * invisible to the REST API until it reloads). Server-side only.
 */

let pool: Pool | null | undefined;

function getPool(): Pool | null {
  if (pool !== undefined) return pool;

  const candidate = getPgCandidates()[0];
  if (!candidate) {
    pool = null;
    return null;
  }

  pool = new Pool({
    connectionString: stripSslParams(candidate.value),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    max: 3,
    idleTimeoutMillis: 10_000,
  });
  // Never let an idle-client error crash the serverless function.
  pool.on("error", () => undefined);
  return pool;
}

/** True when a Postgres connection string is available. */
export function isDbConfigured(): boolean {
  return getPool() !== null;
}

/** Run a parameterised query. Returns rows; throws on a real DB error. */
export async function query<T = Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const p = getPool();
  if (!p) return [];
  let client: PoolClient | null = null;
  try {
    client = await p.connect();
    const res = await client.query(text, values);
    return res.rows as T[];
  } finally {
    client?.release();
  }
}

/** Remove sslmode/ssl so our explicit ssl option wins (Supabase pooler cert). */
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
