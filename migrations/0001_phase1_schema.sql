-- ===========================================================================
-- 0001_phase1_schema
-- Phase 1: profil, consent, CV upload/parsing, dan resume.
--
-- Diterapkan ke Supabase Postgres (ADR-026). File ini adalah sumber kebenaran
-- migration; jalankan lewat Supabase MCP / CLI, bukan drizzle-kit.
-- ===========================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------------
create type public.consent_kind as enum ('privacy', 'cv_ai_processing', 'ai_training_opt_in');
create type public.employment_type as enum ('full_time', 'part_time', 'contract', 'internship', 'freelance');
create type public.education_level as enum ('SMA', 'SMK', 'D3', 'S1', 'S2', 'S3');
create type public.skill_level as enum ('beginner', 'intermediate', 'advanced');
create type public.cv_status as enum ('uploaded', 'extracted', 'skipped');
create type public.parse_run_status as enum ('pending', 'running', 'parsed', 'failed', 'skipped');
create type public.parse_section as enum ('identity', 'experiences', 'educations', 'skills');
create type public.suggestion_status as enum ('pending', 'accepted', 'rejected');
create type public.resume_template as enum ('A', 'B');

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Cek kepemilikan tanpa memicu rekursi RLS pada profiles.
create or replace function public.is_owner(profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = profile
      and p.user_id = auth.uid()
  );
$$;

revoke all on function public.is_owner(uuid) from public;
grant execute on function public.is_owner(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Profil
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  headline text,
  summary text,
  phone text,
  address text,
  birth_date date,
  linkedin_url text,
  portfolio_url text,
  expected_salary integer,
  availability text,
  onboarding_step text not null default 'identity',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create table public.educations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (user_id) on delete cascade,
  level public.education_level,
  institution text not null,
  major text,
  gpa numeric(3, 2) check (gpa is null or (gpa >= 0 and gpa <= 4)),
  start_year integer check (start_year is null or (start_year >= 1950 and start_year <= 2100)),
  end_year integer check (end_year is null or (end_year >= 1950 and end_year <= 2100)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_year is null or end_year is null or start_year <= end_year)
);

create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (user_id) on delete cascade,
  company text not null,
  title text not null,
  employment_type public.employment_type,
  start_date date,
  end_date date,
  is_current boolean not null default false,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date is null or end_date is null or start_date <= end_date),
  check (is_current = false or end_date is null)
);

create table public.experience_points (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences (id) on delete cascade,
  content text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (user_id) on delete cascade,
  name text not null,
  level public.skill_level,
  years numeric(4, 1) check (years is null or (years >= 0 and years <= 60)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.certifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (user_id) on delete cascade,
  name text not null,
  issuer text,
  year integer check (year is null or (year >= 1950 and year <= 2100)),
  credential_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.languages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (user_id) on delete cascade,
  name text not null,
  proficiency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Consent
-- ---------------------------------------------------------------------------
create table public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.consent_kind not null,
  version text not null,
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz,
  user_agent_hash text,
  created_at timestamptz not null default now()
);

create unique index user_consents_active_unique
  on public.user_consents (user_id, kind)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- CV upload & parsing
-- ---------------------------------------------------------------------------
create table public.uploaded_cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file_path text not null,
  original_filename text not null,
  mime text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null,
  text_content text,
  status public.cv_status not null default 'uploaded',
  created_at timestamptz not null default now(),
  delete_after timestamptz not null default (now() + interval '30 days')
);

create table public.cv_parse_runs (
  id uuid primary key default gen_random_uuid(),
  uploaded_cv_id uuid not null references public.uploaded_cvs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  section public.parse_section not null,
  model text not null default 'qwen3:4b',
  consent_version text not null,
  status public.parse_run_status not null default 'pending',
  duration_ms integer,
  output_json jsonb,
  error_code text,
  attempts smallint not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table public.cv_parse_suggestions (
  id uuid primary key default gen_random_uuid(),
  parse_run_id uuid not null references public.cv_parse_runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  section public.parse_section not null,
  field_path text not null,
  value_json jsonb not null,
  confidence numeric(3, 2) not null default 0 check (confidence >= 0 and confidence <= 1),
  source_snippet text,
  status public.suggestion_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Resume (PDF hasil render template)
-- ---------------------------------------------------------------------------
create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null check (version > 0),
  -- FK ke applications ditambahkan pada Phase 4 saat tabel itu ada.
  application_id uuid,
  data_json jsonb not null,
  pdf_path text not null,
  template public.resume_template not null,
  created_at timestamptz not null default now(),
  unique (user_id, version)
);

-- ---------------------------------------------------------------------------
-- Audit log (khusus server)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  meta_json jsonb not null default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------------
create index educations_profile_idx on public.educations (profile_id);
create index experiences_profile_idx on public.experiences (profile_id);
create index experience_points_experience_idx
  on public.experience_points (experience_id, sort_order);
create index skills_profile_idx on public.skills (profile_id);
create unique index skills_profile_name_unique on public.skills (profile_id, lower(name));
create index certifications_profile_idx on public.certifications (profile_id);
create index languages_profile_idx on public.languages (profile_id);

create index user_consents_user_idx on public.user_consents (user_id, kind);
create index uploaded_cvs_user_idx on public.uploaded_cvs (user_id, created_at desc);
create index uploaded_cvs_delete_after_idx on public.uploaded_cvs (delete_after);
create index cv_parse_runs_status_idx
  on public.cv_parse_runs (status, created_at)
  where status = 'pending';
create index cv_parse_runs_cv_idx on public.cv_parse_runs (uploaded_cv_id);
create index cv_parse_suggestions_user_idx on public.cv_parse_suggestions (user_id, status);
create index cv_parse_suggestions_run_idx on public.cv_parse_suggestions (parse_run_id);

create index resumes_user_idx on public.resumes (user_id, version desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Trigger updated_at
-- ---------------------------------------------------------------------------
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger educations_set_updated_at
before update on public.educations
for each row execute function public.set_updated_at();

create trigger experiences_set_updated_at
before update on public.experiences
for each row execute function public.set_updated_at();

create trigger skills_set_updated_at
before update on public.skills
for each row execute function public.set_updated_at();

create trigger certifications_set_updated_at
before update on public.certifications
for each row execute function public.set_updated_at();

create trigger languages_set_updated_at
before update on public.languages
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.educations enable row level security;
alter table public.experiences enable row level security;
alter table public.experience_points enable row level security;
alter table public.skills enable row level security;
alter table public.certifications enable row level security;
alter table public.languages enable row level security;
alter table public.user_consents enable row level security;
alter table public.uploaded_cvs enable row level security;
alter table public.cv_parse_runs enable row level security;
alter table public.cv_parse_suggestions enable row level security;
alter table public.resumes enable row level security;
alter table public.audit_log enable row level security;

-- Profil: user hanya boleh melihat dan mengubah miliknya sendiri.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Tabel anak: akses penuh bila profilnya milik user.
create policy educations_all_own on public.educations
  for all to authenticated
  using (public.is_owner(profile_id))
  with check (public.is_owner(profile_id));

create policy experiences_all_own on public.experiences
  for all to authenticated
  using (public.is_owner(profile_id))
  with check (public.is_owner(profile_id));

create policy experience_points_all_own on public.experience_points
  for all to authenticated
  using (
    exists (
      select 1 from public.experiences e
      where e.id = experience_id and public.is_owner(e.profile_id)
    )
  )
  with check (
    exists (
      select 1 from public.experiences e
      where e.id = experience_id and public.is_owner(e.profile_id)
    )
  );

create policy skills_all_own on public.skills
  for all to authenticated
  using (public.is_owner(profile_id))
  with check (public.is_owner(profile_id));

create policy certifications_all_own on public.certifications
  for all to authenticated
  using (public.is_owner(profile_id))
  with check (public.is_owner(profile_id));

create policy languages_all_own on public.languages
  for all to authenticated
  using (public.is_owner(profile_id))
  with check (public.is_owner(profile_id));

-- Consent: user boleh mencatat dan mencabut persetujuannya sendiri.
create policy user_consents_select_own on public.user_consents
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy user_consents_insert_own on public.user_consents
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_consents_update_own on public.user_consents
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- CV & parsing: user hanya membaca. Penulisan dilakukan server (secret key).
create policy uploaded_cvs_select_own on public.uploaded_cvs
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy cv_parse_runs_select_own on public.cv_parse_runs
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy cv_parse_suggestions_select_own on public.cv_parse_suggestions
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy resumes_select_own on public.resumes
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- audit_log: RLS aktif tanpa policy → hanya service_role.

-- ---------------------------------------------------------------------------
-- Grant
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
