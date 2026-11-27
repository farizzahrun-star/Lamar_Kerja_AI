-- ===========================================================================
-- 0002_phase2_schema
-- Phase 2: minat & preferensi platform, lowongan & snapshot H-1,
-- cadangan manual, status runner, dan antrean lamaran.
--
-- Diterapkan ke Supabase Postgres (ADR-026). File ini adalah sumber kebenaran
-- migration; jalankan lewat Supabase Dashboard SQL Editor / MCP / CLI.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------------
create type public.job_platform as enum (
  'glints',
  'jobstreet',
  'linkedin',
  'glassdoor',
  'manual',
  'ats'
);

create type public.job_source_type as enum (
  'guest_scrape',
  'feed',
  'api',
  'manual'
);

create type public.work_mode as enum (
  'onsite',
  'hybrid',
  'remote'
);

create type public.apply_channel as enum (
  'email',
  'easy_apply',
  'portal',
  'link'
);

create type public.platform_session_status as enum (
  'none',
  'logged_in',
  'expired'
);

create type public.application_status as enum (
  'queued',
  'preparing',
  'needs_user',
  'ready',
  'sending',
  'sent',
  'replied',
  'failed',
  'cancelled'
);

-- ---------------------------------------------------------------------------
-- Minat, Platform, & Pengaturan User
-- ---------------------------------------------------------------------------
create table public.interests (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index interests_label_lower_unique
  on public.interests (lower(label));

create table public.user_interests (
  user_id uuid not null references auth.users (id) on delete cascade,
  interest_id uuid not null references public.interests (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, interest_id)
);

create table public.user_platforms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform public.job_platform not null,
  enabled boolean not null default true,
  session_status public.platform_session_status not null default 'none',
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  review_before_send boolean not null default true,
  portal_auto_submit boolean not null default false,
  apply_daily_limit integer not null default 10
    check (apply_daily_limit >= 1 and apply_daily_limit <= 25),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sumber Lowongan, Lowongan, URL, Kontak HR, & Snapshot H-1
-- ---------------------------------------------------------------------------
create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  platform public.job_platform not null,
  type public.job_source_type not null,
  name text not null,
  config_json jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, type, name)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.job_sources (id) on delete set null,
  external_id text,
  title text not null,
  company text not null,
  location text,
  work_mode public.work_mode,
  salary_min integer check (salary_min is null or salary_min >= 0),
  salary_max integer check (salary_max is null or salary_max >= 0),
  description text not null,
  url text,
  posted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_hash text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (salary_min is null or salary_max is null or salary_min <= salary_max)
);

create unique index jobs_raw_hash_unique on public.jobs (raw_hash);
create unique index jobs_source_external_unique
  on public.jobs (source_id, external_id)
  where source_id is not null and external_id is not null;
create unique index jobs_url_unique
  on public.jobs (url)
  where url is not null;
create index jobs_posted_at_idx
  on public.jobs (posted_at desc nulls last, first_seen_at desc);

create table public.job_urls (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  platform public.job_platform not null,
  url text not null,
  apply_channel public.apply_channel not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (job_id, platform, url)
);

create index job_urls_job_idx on public.job_urls (job_id);

create table public.job_contacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  hr_email text not null,
  source text not null check (source in ('description', 'manual')),
  created_at timestamptz not null default now()
);

create unique index job_contacts_job_email_unique
  on public.job_contacts (job_id, lower(hr_email));
create index job_contacts_job_idx on public.job_contacts (job_id);

create table public.job_snapshots (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  snapshot_date date not null,
  created_at timestamptz not null default now(),
  unique (job_id, snapshot_date)
);

create index job_snapshots_date_idx
  on public.job_snapshots (snapshot_date desc, job_id);

-- ---------------------------------------------------------------------------
-- Local Runner & Collector Runs
-- ---------------------------------------------------------------------------
create table public.runners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index runners_user_idx on public.runners (user_id, created_at desc);

create table public.collector_runs (
  id uuid primary key default gen_random_uuid(),
  runner_id uuid references public.runners (id) on delete set null,
  platform public.job_platform not null,
  run_date date not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  found integer not null default 0 check (found >= 0),
  new_count integer not null default 0 check (new_count >= 0),
  skipped_known integer not null default 0 check (skipped_known >= 0),
  blocked boolean not null default false,
  error_count integer not null default 0 check (error_count >= 0),
  last_error text,
  created_at timestamptz not null default now()
);

create index collector_runs_date_platform_idx
  on public.collector_runs (run_date desc, platform, started_at desc);

-- ---------------------------------------------------------------------------
-- Antrean Lamaran & Tracking Events
-- ---------------------------------------------------------------------------
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  channel public.apply_channel not null,
  status public.application_status not null default 'queued',
  match_score integer check (match_score is null or (match_score >= 0 and match_score <= 100)),
  resume_id uuid references public.resumes (id) on delete set null,
  -- FK ke drafts ditambahkan pada Phase 4 saat tabel drafts dibuat.
  draft_id uuid,
  recipient_email text,
  last_error text,
  queued_at timestamptz not null default now(),
  ready_at timestamptz,
  sent_at timestamptz,
  replied_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Mencegah lamaran ganda untuk lowongan aktif; status cancelled boleh diantrekan ulang.
create unique index applications_active_unique
  on public.applications (user_id, job_id)
  where status <> 'cancelled';

create index applications_user_created_idx
  on public.applications (user_id, created_at desc);

alter table public.resumes
  drop constraint if exists resumes_application_id_fkey;

alter table public.resumes
  add constraint resumes_application_id_fkey
  foreign key (application_id) references public.applications (id) on delete set null;

create table public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  event_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index tracking_events_app_idx
  on public.tracking_events (application_id, created_at asc);

-- ---------------------------------------------------------------------------
-- Trigger updated_at
-- ---------------------------------------------------------------------------
create trigger user_platforms_set_updated_at
before update on public.user_platforms
for each row execute function public.set_updated_at();

create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

create trigger job_sources_set_updated_at
before update on public.job_sources
for each row execute function public.set_updated_at();

create trigger jobs_set_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();

create trigger runners_set_updated_at
before update on public.runners
for each row execute function public.set_updated_at();

create trigger applications_set_updated_at
before update on public.applications
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.interests enable row level security;
alter table public.user_interests enable row level security;
alter table public.user_platforms enable row level security;
alter table public.user_settings enable row level security;
alter table public.job_sources enable row level security;
alter table public.jobs enable row level security;
alter table public.job_urls enable row level security;
alter table public.job_contacts enable row level security;
alter table public.job_snapshots enable row level security;
alter table public.runners enable row level security;
alter table public.collector_runs enable row level security;
alter table public.applications enable row level security;
alter table public.tracking_events enable row level security;

-- Master interests: semua user login boleh membaca & menambah interest kustom.
create policy interests_select_authenticated on public.interests
  for select to authenticated
  using (true);

create policy interests_insert_custom on public.interests
  for insert to authenticated
  with check (is_default = false);

-- Preferensi user: hanya pemilik.
create policy user_interests_all_own on public.user_interests
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy user_platforms_all_own on public.user_platforms
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy user_settings_all_own on public.user_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Runners: tiap user mengelola token runner miliknya.
create policy runners_all_own on public.runners
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Katalog lowongan & status kolektor: terbaca seluruh user tim, ditulis lewat server (service_role).
create policy job_sources_select_authenticated on public.job_sources
  for select to authenticated
  using (true);

create policy jobs_select_authenticated on public.jobs
  for select to authenticated
  using (true);

create policy job_urls_select_authenticated on public.job_urls
  for select to authenticated
  using (true);

create policy job_contacts_select_authenticated on public.job_contacts
  for select to authenticated
  using (true);

create policy job_snapshots_select_authenticated on public.job_snapshots
  for select to authenticated
  using (true);

create policy collector_runs_select_authenticated on public.collector_runs
  for select to authenticated
  using (true);

-- Antrean lamaran: milik user masing-masing.
create policy applications_select_own on public.applications
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy applications_insert_own on public.applications
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy applications_update_own on public.applications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Tracking events: dibaca pemilik lamaran, ditulis server (service_role).
create policy tracking_events_select_own on public.tracking_events
  for select to authenticated
  using (
    exists (
      select 1
      from public.applications a
      where a.id = application_id
        and a.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Master data awal (idempoten)
-- ---------------------------------------------------------------------------
insert into public.interests (slug, label, is_default) values
  ('frontend-developer', 'Frontend Developer', true),
  ('backend-developer', 'Backend Developer', true),
  ('fullstack-developer', 'Fullstack Developer', true),
  ('mobile-developer', 'Mobile Developer', true),
  ('data-analyst', 'Data Analyst', true),
  ('data-engineer', 'Data Engineer', true),
  ('devops-engineer', 'DevOps Engineer', true),
  ('qa-engineer', 'QA Engineer', true),
  ('ui-ux-designer', 'UI/UX Designer', true),
  ('product-manager', 'Product Manager', true),
  ('digital-marketing', 'Digital Marketing', true),
  ('finance-accounting', 'Finance & Accounting', true),
  ('hr-people-operations', 'HR & People Operations', true),
  ('operations-admin', 'Operations & Admin', true)
on conflict (slug) do nothing;

insert into public.job_sources (platform, type, name, config_json, enabled) values
  ('glints', 'guest_scrape', 'Glints Public Search', '{"dailyLimit":10}'::jsonb, true),
  ('jobstreet', 'guest_scrape', 'Jobstreet Public Search', '{"dailyLimit":10}'::jsonb, true),
  ('linkedin', 'guest_scrape', 'LinkedIn Public Search', '{"dailyLimit":10}'::jsonb, true),
  ('manual', 'manual', 'Manual & CSV Import', '{}'::jsonb, true)
on conflict (platform, type, name) do nothing;

-- ---------------------------------------------------------------------------
-- Grant
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
