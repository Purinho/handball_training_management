-- Phase 2 (v1.1): Add is_favorite flag to exercises
alter table public.exercises
  add column if not exists is_favorite boolean not null default false;
