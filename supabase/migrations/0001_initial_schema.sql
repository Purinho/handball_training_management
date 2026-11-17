-- ============================================================================
-- Handball Training Management – Initial PostgreSQL / Supabase Schema (MVP)
-- Supports Multi-Tenant Clubs, Teams, Exercises (with Variants & TacticBoard),
-- Multi-Week Plans, Training Sessions (with Parallel Tracks) & Session Notes.
-- ============================================================================

-- Uses PostgreSQL built-in gen_random_uuid() (no extension required)

-- 1. CLUBS (Mandanten / Vereine)
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. CLUB MEMBERS (Trainer im Verein)
create table if not exists public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  club_role text not null default 'COACH' check (club_role in ('CLUB_ADMIN', 'COACH')),
  display_name text not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. TEAMS (Mannschaften eines Vereins)
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  age_group text not null,
  season text not null default '2026/27',
  default_schedule jsonb not null default '[]'::jsonb,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. TEAM MEMBERS (Zuordnung Trainer -> Mannschaft)
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  club_member_id uuid not null references public.club_members(id) on delete cascade,
  team_role text not null default 'HEAD_COACH' check (team_role in ('HEAD_COACH', 'ASSISTANT_COACH')),
  unique (team_id, club_member_id)
);

-- 5. EXERCISES (Übungsdatenbank inkl. Varianten, Web-Referenzen & Taktikboard-JSON)
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  created_by_member_id uuid references public.club_members(id) on delete set null,
  parent_exercise_id uuid references public.exercises(id) on delete set null,
  visibility text not null default 'CLUB' check (visibility in ('TEAM', 'CLUB', 'PUBLIC')),
  owner_team_id uuid references public.teams(id) on delete set null,
  title text not null,
  default_duration_min integer not null default 15,
  min_players integer not null default 6,
  max_players integer not null default 14,
  goalkeepers integer not null default 1,
  categories jsonb not null default '{"phases":[],"focus":[],"level":"BASIC"}'::jsonb,
  materials jsonb not null default '[]'::jsonb,
  setup_description text not null default '',
  flow_description text not null default '',
  coaching_points text not null default '',
  variations_text text not null default '',
  source_url text,
  reference_image_data text,
  external_links jsonb not null default '[]'::jsonb,
  tactic_board_data jsonb,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6. SESSION TEMPLATES (Wiederverwendbare Trainings-Vorlagen)
create table if not exists public.session_templates (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null,
  description text not null default '',
  default_duration_min integer not null default 90,
  phases_template jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- 7. MULTI-WEEK PLANS (Mehrwöchige Trainingspläne / Mesozyklen)
create table if not exists public.multi_week_plans (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null,
  start_date date not null,
  end_date date not null,
  goals text not null default '',
  updated_at timestamptz not null default now()
);

-- 8. PLAN WEEKS (Wochen-Schwerpunkte / Mikrozyklen innerhalb eines Mehrwochenplans)
create table if not exists public.plan_weeks (
  id uuid primary key default gen_random_uuid(),
  multi_week_plan_id uuid not null references public.multi_week_plans(id) on delete cascade,
  week_number integer not null,
  start_date date not null,
  focus_theme text not null default '',
  focus_tags jsonb not null default '[]'::jsonb,
  color_hex text not null default '#2563EB',
  notes text not null default '',
  updated_at timestamptz not null default now()
);

-- 9. TRAINING SESSIONS (Konkrete Trainingseinheiten)
create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  plan_week_id uuid references public.plan_weeks(id) on delete set null,
  session_date date not null,
  start_time text not null default '18:30',
  end_time text not null default '20:00',
  planned_duration_min integer not null default 90,
  title text not null,
  custom_materials_override jsonb not null default '[]'::jsonb,
  status text not null default 'PLANNED' check (status in ('PLANNED', 'READY', 'COMPLETED', 'CANCELLED')),
  updated_at timestamptz not null default now()
);

-- 10. SESSION PHASES (Chronologische Phasen innerhalb einer Trainingseinheit)
create table if not exists public.session_phases (
  id uuid primary key default gen_random_uuid(),
  training_session_id uuid not null references public.training_sessions(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  target_duration_min integer not null default 15,
  updated_at timestamptz not null default now()
);

-- 11. SESSION BLOCKS (Übungsblöcke / Parallele Spuren innerhalb einer Phase)
create table if not exists public.session_blocks (
  id uuid primary key default gen_random_uuid(),
  session_phase_id uuid not null references public.session_phases(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  quick_block_title text,
  quick_block_description text,
  time_slot_index integer not null default 0,
  track_label text not null default 'Alle',
  assigned_member_id uuid references public.club_members(id) on delete set null,
  custom_duration_min integer not null default 15,
  updated_at timestamptz not null default now()
);

-- 12. SESSION NOTES (Konfliktfreie Einzel-Notizen pro Trainer & Block/Training)
create table if not exists public.session_notes (
  id uuid primary key default gen_random_uuid(),
  training_session_id uuid not null references public.training_sessions(id) on delete cascade,
  session_block_id uuid references public.session_blocks(id) on delete cascade,
  author_member_id uuid references public.club_members(id) on delete set null,
  author_name text not null default 'Trainer',
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security (RLS) on all tables
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.exercises enable row level security;
alter table public.session_templates enable row level security;
alter table public.multi_week_plans enable row level security;
alter table public.plan_weeks enable row level security;
alter table public.training_sessions enable row level security;
alter table public.session_phases enable row level security;
alter table public.session_blocks enable row level security;
alter table public.session_notes enable row level security;
