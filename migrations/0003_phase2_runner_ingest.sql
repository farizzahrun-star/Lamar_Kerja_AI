-- ===========================================================================
-- 0003_phase2_runner_ingest
-- Phase 2 M2.1: runner_tasks (rencana scraping harian & task portal) dan
-- job_ingest_batches (antrean normalisasi/dedupe jobs.ingest di worker).
--
-- Diterapkan ke Supabase Postgres (ADR-026) setelah 0002_phase2_schema.sql.
-- ===========================================================================

create type public.runner_task_type as enum (
  'scrape.daily',
  'portal.apply'
);

create type public.runner_task_status as enum (
  'pending',
  'claimed',
  'completed',
  'failed',
  'blocked'
);

create type public.job_ingest_status as enum (
  'pending',
  'processing',
  'completed',
  'failed'
);

-- ---------------------------------------------------------------------------
-- Runner Tasks (scrape.daily & portal.apply)
-- ---------------------------------------------------------------------------
create table public.runner_tasks (
  id uuid primary key default gen_random_uuid(),
  runner_id uuid references public.runners (id) on delete set null,
  application_id uuid references public.applications (id) on delete cascade,
  type public.runner_task_type not null,
  run_date date not null,
  status public.runner_task_status not null default 'pending',
  payload_json jsonb not null default '{}'::jsonb,
  result_json jsonb,
  error_message text,
  claimed_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Satu rencana scrape.daily per tanggal kalender WIB.
create unique index runner_tasks_scrape_daily_date_unique
  on public.runner_tasks (run_date)
  where type = 'scrape.daily';

create index runner_tasks_status_type_idx
  on public.runner_tasks (status, type, run_date desc);

-- ---------------------------------------------------------------------------
-- Job Ingest Batches (antrean worker jobs.ingest)
-- ---------------------------------------------------------------------------
create table public.job_ingest_batches (
  id uuid primary key default gen_random_uuid(),
  runner_id uuid references public.runners (id) on delete set null,
  collector_run_id uuid references public.collector_runs (id) on delete set null,
  platform public.job_platform not null,
  run_date date not null,
  status public.job_ingest_status not null default 'pending',
  payload_json jsonb not null,
  summary_json jsonb,
  error_message text,
  attempts smallint not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index job_ingest_batches_status_idx
  on public.job_ingest_batches (status, created_at asc)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Trigger updated_at
-- ---------------------------------------------------------------------------
create trigger runner_tasks_set_updated_at
before update on public.runner_tasks
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.runner_tasks enable row level security;
alter table public.job_ingest_batches enable row level security;

create policy runner_tasks_select_authenticated on public.runner_tasks
  for select to authenticated
  using (true);

create policy job_ingest_batches_select_authenticated on public.job_ingest_batches
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Grant
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
