/**
 * Canonical GEO database schema (single source of truth).
 *
 * Mirrored to supabase/migrations/0001_geo_tables.sql for the SQL-editor path.
 * The /api/geo/migrate route applies this against the Postgres connection that
 * the Vercel↔Supabase integration injects. Idempotent — safe to run repeatedly.
 */
export const GEO_SCHEMA_SQL = `
create extension if not exists "pgcrypto";

create table if not exists public.geo_leads (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  name             text not null,
  email            text not null,
  phone            text,
  job_title        text,
  company_name     text not null,
  homepage_url     text not null,
  offer_description text not null,
  target_audience  text not null,
  desired_queries  text not null,
  competitors      text,
  consent          boolean not null default false,
  source           text not null default 'geo.nxtli.com'
);
-- Backfill columns on tables created before phone/job_title existed.
alter table public.geo_leads add column if not exists phone text;
alter table public.geo_leads add column if not exists job_title text;
create index if not exists geo_leads_email_idx on public.geo_leads (email);
create index if not exists geo_leads_created_at_idx on public.geo_leads (created_at desc);

create table if not exists public.geo_scan_requests (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  lead_id          uuid references public.geo_leads (id) on delete set null,
  status           text not null default 'pending',
  homepage_url     text not null,
  raw_input        jsonb not null,
  analysis_result  jsonb,
  report_url       text,
  pdf_url          text,
  email_sent_at    timestamptz,
  error_message    text,
  visibility_score integer,
  model            text,
  input_tokens     integer,
  output_tokens    integer
);
alter table public.geo_scan_requests add column if not exists visibility_score integer;
alter table public.geo_scan_requests add column if not exists model text;
alter table public.geo_scan_requests add column if not exists input_tokens integer;
alter table public.geo_scan_requests add column if not exists output_tokens integer;
-- Denormalized email so the one-scan-per-email gate doesn't depend on the
-- lead JOIN (a failed lead insert would otherwise make a completed scan invisible).
alter table public.geo_scan_requests add column if not exists email text;
update public.geo_scan_requests r set email = lower(l.email)
  from public.geo_leads l where r.email is null and r.lead_id = l.id;
create index if not exists geo_scan_requests_lead_idx on public.geo_scan_requests (lead_id);
create index if not exists geo_scan_requests_status_idx on public.geo_scan_requests (status);
create index if not exists geo_scan_requests_email_idx on public.geo_scan_requests (lower(email));

create table if not exists public.geo_scan_reports (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  scan_request_id  uuid references public.geo_scan_requests (id) on delete cascade,
  lead_id          uuid references public.geo_leads (id) on delete set null,
  visibility_score integer,
  summary          text,
  strengths        jsonb not null default '[]'::jsonb,
  weaknesses       jsonb not null default '[]'::jsonb,
  recommendations  jsonb not null default '[]'::jsonb,
  content_gaps     jsonb not null default '[]'::jsonb,
  priority_actions jsonb not null default '[]'::jsonb,
  report_html      text,
  pdf_url          text
);
create index if not exists geo_scan_reports_scan_idx on public.geo_scan_reports (scan_request_id);

alter table public.geo_leads          enable row level security;
alter table public.geo_scan_requests  enable row level security;
alter table public.geo_scan_reports   enable row level security;

-- Tell PostgREST (the Supabase REST API) to reload its schema cache. Tables
-- created here via a direct Postgres connection are otherwise invisible to the
-- supabase-js client until PostgREST reloads — which makes every REST
-- insert/select fail with "Could not find the table in the schema cache".
notify pgrst, 'reload schema';
`;

/**
 * Connection-string env vars set by the Vercel↔Supabase integration.
 *
 * Order matters: the POOLER connections (POSTGRES_URL / POSTGRES_PRISMA_URL)
 * are reachable over IPv4 from Vercel serverless. The DIRECT connection
 * (POSTGRES_URL_NON_POOLING → db.<ref>.supabase.co) is IPv6-only and typically
 * NOT reachable from Vercel functions, so it's tried last.
 */
export const PG_CONNECTION_ENV_VARS = [
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "DATABASE_URL",
  "SUPABASE_DB_URL",
  "POSTGRES_URL_NON_POOLING",
] as const;

export interface PgCandidate {
  source: string;
  value: string;
}

/** All present connection strings, in preference order (pooler first). */
export function getPgCandidates(): PgCandidate[] {
  const out: PgCandidate[] = [];
  for (const key of PG_CONNECTION_ENV_VARS) {
    const v = process.env[key];
    if (v && v.trim()) out.push({ source: key, value: v.trim() });
  }
  return out;
}

export function resolvePgConnectionString(): string | null {
  return getPgCandidates()[0]?.value ?? null;
}
