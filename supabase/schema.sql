-- ═══════════════════════════════════════════════════════════════════
-- SlopShield AI · Supabase schema
-- Run this file in the Supabase Dashboard → SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── scans ────────────────────────────────────────────────────────────
-- One row per analyzed Pull Request. Raw GitHub telemetry, the crunched
-- behavioral metrics, and the Gemini audit verdict are persisted together
-- so historical analytics never need to re-hit external APIs.

create table if not exists public.scans (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,

  -- Pull Request identity
  pr_url              text not null,
  repo_full_name      text not null,
  pr_number           integer not null,
  pr_title            text not null,
  pr_author           text not null,

  -- Raw GitHub telemetry
  additions           integer not null default 0,
  deletions           integer not null default 0,
  changed_files       integer not null default 0,
  commit_count        integer not null default 0,
  first_commit_at     timestamptz,
  pr_created_at       timestamptz not null,

  -- Crunched behavioral metrics
  code_velocity       numeric(12, 2) not null default 0,   -- lines added / hour
  churn_per_file      numeric(12, 2) not null default 0,   -- (adds+dels) / file
  addition_dominance  numeric(5, 4)  not null default 0,   -- adds / (adds+dels)
  test_file_ratio     numeric(5, 4)  not null default 0,   -- test files / files

  -- Gemini audit verdict
  risk_score          integer not null check (risk_score between 0 and 100),
  risk_level          text not null check (risk_level in ('LOW', 'MODERATE', 'HIGH', 'CRITICAL')),
  reviewer_warning    text not null,
  fragility_score     integer not null check (fragility_score between 0 and 100),
  key_signals         jsonb not null default '[]'::jsonb,

  created_at          timestamptz not null default now()
);

alter table public.scans enable row level security;

create policy "scans_select_own"
  on public.scans for select
  to authenticated
  using (auth.uid() = user_id);

create policy "scans_insert_own"
  on public.scans for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "scans_delete_own"
  on public.scans for delete
  to authenticated
  using (auth.uid() = user_id);

create index if not exists scans_user_created_idx
  on public.scans (user_id, created_at desc);

create index if not exists scans_repo_created_idx
  on public.scans (repo_full_name, created_at desc);

-- Backs the re-scan cooldown lookup in analyzePullRequest (app/actions.ts):
-- "did this user already scan this exact PR recently?"
create index if not exists scans_user_pr_idx
  on public.scans (user_id, pr_url, created_at desc);

-- ── repo_health_snapshots ────────────────────────────────────────────
-- Daily per-repository aggregates materialized by the secured cron job
-- (app/api/cron/route.ts) using the service-role key, which bypasses RLS.
-- Authenticated users may read; no user-facing write policy exists, so
-- only the service role can write.

create table if not exists public.repo_health_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  repo_full_name      text not null,
  snapshot_date       date not null default current_date,
  scan_count          integer not null default 0,
  avg_risk_score      numeric(5, 2) not null default 0,
  max_risk_score      integer not null default 0,
  avg_fragility_score numeric(5, 2) not null default 0,
  created_at          timestamptz not null default now(),
  unique (repo_full_name, snapshot_date)
);

alter table public.repo_health_snapshots enable row level security;

create policy "snapshots_select_authenticated"
  on public.repo_health_snapshots for select
  to authenticated
  using (true);

create index if not exists snapshots_repo_date_idx
  on public.repo_health_snapshots (repo_full_name, snapshot_date desc);

-- ── badge_scans ──────────────────────────────────────────────────────
-- Cache backing the public, unauthenticated README badge
-- (app/api/badge/[owner]/[repo]/[number]/route.ts). Deliberately separate
-- from `scans`: badge results are not tied to any signed-in user and must
-- be readable by anyone (that's the point — it's embedded in READMEs), so
-- this table carries no user_id and no per-user RLS. Only the service-role
-- client (bypasses RLS) ever writes to it; anon/authenticated may only
-- select, which the policy below enforces.

create table if not exists public.badge_scans (
  pr_url          text primary key,
  repo_full_name  text not null,
  pr_number       integer not null,
  risk_score      integer not null check (risk_score between 0 and 100),
  risk_level      text not null check (risk_level in ('LOW', 'MODERATE', 'HIGH', 'CRITICAL')),
  updated_at      timestamptz not null default now()
);

alter table public.badge_scans enable row level security;

create policy "badge_scans_select_anyone"
  on public.badge_scans for select
  to anon, authenticated
  using (true);

create index if not exists badge_scans_repo_idx
  on public.badge_scans (repo_full_name, pr_number);
