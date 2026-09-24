-- 0013_finalize_master_seed.sql
-- Safe, idempotent migration for the next state.
-- This should not conflict with already-applied remote migration versions.

create table if not exists public.example_table (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
