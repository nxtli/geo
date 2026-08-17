/**
 * Canoniek schema van de prospect-database (Postgres-driver).
 *
 * Idempotent, in dezelfde stijl als het GEO-schema: `create table if not
 * exists` + `add column if not exists`, zodat het veilig herhaald kan worden en
 * zichzelf op een nieuwe deploy repareert.
 *
 * De vlakke scorekolommen (b2c_score, …) zijn GEDENORMALISEERD: `fit_components`
 * (jsonb) is de bron, de kolommen bestaan om in SQL op te kunnen filteren en
 * sorteren. Beide worden uit één functie geschreven (flattenProspect).
 */
export const RADIO_SCHEMA_SQL = `
create extension if not exists "pgcrypto";

create table if not exists public.radio_prospects (
  id                       uuid primary key default gen_random_uuid(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  company_name             text not null,
  website                  text,
  industry                 text,
  segment                  text,
  description              text,
  city                     text,
  country                  text,
  company_size             text,
  -- Afgeleide grootteband (micro/klein/middel/groot/zeer_groot) plus de
  -- claim-basis. Alleen een filter: de band beïnvloedt de scores niet.
  size_band                text,
  size_band_basis          text,
  number_of_locations      integer,

  fit_score                integer,
  trigger_score            integer,
  priority_score           integer,
  tier                     text,

  b2c_score                integer,
  geographic_score         integer,
  marketing_score          integer,
  scale_score              integer,
  customer_value_score     integer,
  growth_score             integer,
  recruitment_score        integer,
  campaign_score           integer,
  awareness_score          integer,
  budget_score             integer,

  primary_trigger          text,
  trigger_date             text,
  primary_sales_angle      text,
  angle_strength           integer,

  recommended_contact_role text,
  contact_first_name       text,
  contact_last_name        text,
  contact_title            text,
  linkedin_url             text,
  contact_source           text,
  contact_confidence       text,

  personalization_context  text,
  opening_question         text,

  research_confidence      integer,
  confidence               text,
  date_researched          text,
  research_provider        text,
  demo                     boolean not null default false,

  status                   text not null default 'New',
  notes                    text,

  -- Verzorgingsgebied: provincies waar het bedrijf klanten heeft (of
  -- ['landelijk']). Leeg = onbekend, niet "nergens".
  coverage_provinces       jsonb not null default '[]'::jsonb,
  fit_components           jsonb not null default '[]'::jsonb,
  knockouts                jsonb not null default '[]'::jsonb,
  knockout_override        text,
  why_interesting          jsonb not null default '[]'::jsonb,
  triggers                 jsonb not null default '[]'::jsonb,
  sales_angles             jsonb not null default '[]'::jsonb,
  evidence                 jsonb not null default '[]'::jsonb,
  personalization          jsonb
);

-- Kolommen die na de eerste release zijn toegevoegd; los herhaald zodat een
-- bestaande tabel zichzelf bijwerkt in plaats van te breken op de insert.
alter table public.radio_prospects add column if not exists size_band text;
alter table public.radio_prospects add column if not exists size_band_basis text;
alter table public.radio_prospects
  add column if not exists coverage_provinces jsonb not null default '[]'::jsonb;

create index if not exists radio_prospects_priority_idx
  on public.radio_prospects (priority_score desc nulls last);
create index if not exists radio_prospects_tier_idx on public.radio_prospects (tier);
create index if not exists radio_prospects_status_idx on public.radio_prospects (status);
create index if not exists radio_prospects_segment_idx on public.radio_prospects (segment);
create index if not exists radio_prospects_size_band_idx
  on public.radio_prospects (size_band);
create index if not exists radio_prospects_created_idx
  on public.radio_prospects (created_at desc);
-- Dedupe-lookup op bedrijfsnaam (case-insensitive).
create index if not exists radio_prospects_name_idx
  on public.radio_prospects (lower(company_name));

-- Run-historie: één rij per afgeronde zoek- of researchronde. Append-only, dus
-- geen updated_at en geen update-tak in de insert.
create table if not exists public.radio_runs (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz not null default now(),
  settings          text not null default '',
  targets           jsonb not null default '[]'::jsonb,
  added             integer not null default 0,
  duplicates        integer not null default 0,
  skipped           integer not null default 0,
  searches          integer not null default 0,
  input_tokens      integer not null default 0,
  output_tokens     integer not null default 0,
  cache_read_tokens integer not null default 0,
  -- numeric, niet float: bedragen mogen niet gaan afronden in de opslag.
  cost_usd          numeric(12, 6) not null default 0,
  model             text not null default '',
  warnings          jsonb not null default '[]'::jsonb
);

create index if not exists radio_runs_started_idx
  on public.radio_runs (started_at desc);

-- Server-side only: RLS aan, geen publieke policies. De service-role key
-- (en de directe Postgres-verbinding) omzeilen RLS.
alter table public.radio_prospects enable row level security;
alter table public.radio_runs enable row level security;

-- PostgREST-schemacache verversen, zodat een via directe Postgres-verbinding
-- aangemaakte tabel ook voor de REST-client zichtbaar is.
notify pgrst, 'reload schema';
`;
