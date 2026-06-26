-- NXTLI GEO Scan — schema
-- Run in the Supabase SQL editor or via the Supabase CLI.
-- The app writes with the service-role key (server-side only), so RLS is
-- enabled with no public policies: anon/auth clients get no access by default.

create extension if not exists "pgcrypto";

-- Leads captured by Brian during the chat ---------------------------------
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
alter table public.geo_leads add column if not exists phone text;
alter table public.geo_leads add column if not exists job_title text;

create index if not exists geo_leads_email_idx on public.geo_leads (email);
create index if not exists geo_leads_created_at_idx on public.geo_leads (created_at desc);

-- One scan run per request -------------------------------------------------
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

create index if not exists geo_scan_requests_lead_idx on public.geo_scan_requests (lead_id);
create index if not exists geo_scan_requests_status_idx on public.geo_scan_requests (status);

-- The structured report ----------------------------------------------------
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

-- Lock down: RLS on, no public policies. The service-role key bypasses RLS.
alter table public.geo_leads          enable row level security;
alter table public.geo_scan_requests  enable row level security;
alter table public.geo_scan_reports   enable row level security;

-- Reload the PostgREST schema cache so the supabase-js REST client sees these
-- tables immediately (otherwise REST inserts/selects fail with
-- "Could not find the table in the schema cache").
notify pgrst, 'reload schema';
