-- ============================================================================
-- Handball Training Management – RLS Policies & Club Onboarding RPCs
-- Run this migration AFTER 0001_initial_schema.sql in Supabase SQL Editor.
-- ============================================================================

-- 1. Security-definer helper functions (prevent recursive RLS evaluation)
create or replace function public.is_club_member(target_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.club_members cm
    where cm.club_id = target_club_id
      and cm.user_id = auth.uid()
  );
$$;

create or replace function public.is_club_admin(target_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.club_members cm
    where cm.club_id = target_club_id
      and cm.user_id = auth.uid()
      and cm.club_role = 'CLUB_ADMIN'
  );
$$;

create or replace function public.get_club_id_for_team(target_team_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.club_id from public.teams t where t.id = target_team_id limit 1;
$$;

create or replace function public.get_club_id_for_plan(target_plan_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.club_id
  from public.multi_week_plans p
  join public.teams t on t.id = p.team_id
  where p.id = target_plan_id
  limit 1;
$$;

create or replace function public.get_club_id_for_session(target_session_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.club_id
  from public.training_sessions s
  join public.teams t on t.id = s.team_id
  where s.id = target_session_id
  limit 1;
$$;

create or replace function public.get_club_id_for_phase(target_phase_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.club_id
  from public.session_phases sp
  join public.training_sessions s on s.id = sp.training_session_id
  join public.teams t on t.id = s.team_id
  where sp.id = target_phase_id
  limit 1;
$$;

-- 2. Onboarding RPC: Create a new club + first CLUB_ADMIN + initial team
create or replace function public.create_club_with_admin(
  p_club_name text,
  p_display_name text,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_club_id uuid := uuid_generate_v4();
  v_member_id uuid := uuid_generate_v4();
  v_team_id uuid := uuid_generate_v4();
  v_prefix text;
  v_invite_code text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  v_prefix := upper(regexp_replace(coalesce(nullif(trim(p_club_name), ''), 'CLUB'), '[^a-zA-Z0-9]', '', 'g'));
  v_prefix := left(coalesce(nullif(v_prefix, ''), 'CLUB'), 4);
  v_invite_code := v_prefix || '-' || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');

  insert into public.clubs (id, name, invite_code)
  values (v_club_id, trim(p_club_name), v_invite_code);

  insert into public.club_members (id, club_id, user_id, club_role, display_name, email)
  values (
    v_member_id,
    v_club_id,
    v_user_id,
    'CLUB_ADMIN',
    coalesce(nullif(trim(p_display_name), ''), 'Vereins-Admin'),
    nullif(trim(coalesce(p_email, '')), '')
  );

  insert into public.teams (id, club_id, name, age_group, season)
  values (v_team_id, v_club_id, '1. Mannschaft', 'Senioren', '2026/27');

  insert into public.team_members (team_id, club_member_id, team_role)
  values (v_team_id, v_member_id, 'HEAD_COACH');

  return jsonb_build_object(
    'club_id', v_club_id,
    'member_id', v_member_id,
    'team_id', v_team_id,
    'invite_code', v_invite_code
  );
end;
$$;

-- 3. Onboarding RPC: Join existing club via invite_code
create or replace function public.join_club_by_invite_code(
  p_invite_code text,
  p_display_name text,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_club public.clubs%rowtype;
  v_member_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_club
  from public.clubs
  where upper(trim(invite_code)) = upper(trim(p_invite_code))
  limit 1;

  if v_club.id is null then
    raise exception 'Einladungscode nicht gefunden';
  end if;

  -- Check if user is already a member
  select id into v_member_id
  from public.club_members
  where club_id = v_club.id and user_id = v_user_id
  limit 1;

  if v_member_id is not null then
    return jsonb_build_object('club_id', v_club.id, 'member_id', v_member_id);
  end if;

  -- Link pre-created unlinked member if email matches
  if nullif(trim(coalesce(p_email, '')), '') is not null then
    select id into v_member_id
    from public.club_members
    where club_id = v_club.id
      and user_id is null
      and lower(trim(email)) = lower(trim(p_email))
    limit 1;

    if v_member_id is not null then
      update public.club_members
      set user_id = v_user_id,
          display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
          updated_at = now()
      where id = v_member_id;

      return jsonb_build_object('club_id', v_club.id, 'member_id', v_member_id);
    end if;
  end if;

  -- Otherwise create a new COACH member
  v_member_id := uuid_generate_v4();
  insert into public.club_members (id, club_id, user_id, club_role, display_name, email)
  values (
    v_member_id,
    v_club.id,
    v_user_id,
    'COACH',
    coalesce(nullif(trim(p_display_name), ''), 'Trainer'),
    nullif(trim(coalesce(p_email, '')), '')
  );

  return jsonb_build_object('club_id', v_club.id, 'member_id', v_member_id);
end;
$$;

-- 4. RLS Policies for all 12 tables
-- CLUBS
drop policy if exists "clubs_select_member" on public.clubs;
create policy "clubs_select_member" on public.clubs
  for select using (public.is_club_member(id));

drop policy if exists "clubs_update_admin" on public.clubs;
create policy "clubs_update_admin" on public.clubs
  for update using (public.is_club_admin(id));

-- CLUB MEMBERS
drop policy if exists "club_members_select_member" on public.club_members;
create policy "club_members_select_member" on public.club_members
  for select using (public.is_club_member(club_id));

drop policy if exists "club_members_write_admin" on public.club_members;
create policy "club_members_write_admin" on public.club_members
  for all using (public.is_club_admin(club_id))
  with check (public.is_club_admin(club_id));

-- TEAMS
drop policy if exists "teams_select_member" on public.teams;
create policy "teams_select_member" on public.teams
  for select using (public.is_club_member(club_id));

drop policy if exists "teams_write_member" on public.teams;
create policy "teams_write_member" on public.teams
  for all using (public.is_club_member(club_id))
  with check (public.is_club_member(club_id));

-- TEAM MEMBERS
drop policy if exists "team_members_all_member" on public.team_members;
create policy "team_members_all_member" on public.team_members
  for all using (public.is_club_member(public.get_club_id_for_team(team_id)))
  with check (public.is_club_member(public.get_club_id_for_team(team_id)));

-- EXERCISES
drop policy if exists "exercises_select_member_or_public" on public.exercises;
create policy "exercises_select_member_or_public" on public.exercises
  for select using (visibility = 'PUBLIC' or public.is_club_member(club_id));

drop policy if exists "exercises_write_member" on public.exercises;
create policy "exercises_write_member" on public.exercises
  for all using (public.is_club_member(club_id))
  with check (public.is_club_member(club_id));

-- SESSION TEMPLATES
drop policy if exists "session_templates_all_member" on public.session_templates;
create policy "session_templates_all_member" on public.session_templates
  for all using (public.is_club_member(club_id))
  with check (public.is_club_member(club_id));

-- MULTI WEEK PLANS
drop policy if exists "multi_week_plans_all_member" on public.multi_week_plans;
create policy "multi_week_plans_all_member" on public.multi_week_plans
  for all using (public.is_club_member(public.get_club_id_for_team(team_id)))
  with check (public.is_club_member(public.get_club_id_for_team(team_id)));

-- PLAN WEEKS
drop policy if exists "plan_weeks_all_member" on public.plan_weeks;
create policy "plan_weeks_all_member" on public.plan_weeks
  for all using (public.is_club_member(public.get_club_id_for_plan(multi_week_plan_id)))
  with check (public.is_club_member(public.get_club_id_for_plan(multi_week_plan_id)));

-- TRAINING SESSIONS
drop policy if exists "training_sessions_all_member" on public.training_sessions;
create policy "training_sessions_all_member" on public.training_sessions
  for all using (public.is_club_member(public.get_club_id_for_team(team_id)))
  with check (public.is_club_member(public.get_club_id_for_team(team_id)));

-- SESSION PHASES
drop policy if exists "session_phases_all_member" on public.session_phases;
create policy "session_phases_all_member" on public.session_phases
  for all using (public.is_club_member(public.get_club_id_for_session(training_session_id)))
  with check (public.is_club_member(public.get_club_id_for_session(training_session_id)));

-- SESSION BLOCKS
drop policy if exists "session_blocks_all_member" on public.session_blocks;
create policy "session_blocks_all_member" on public.session_blocks
  for all using (public.is_club_member(public.get_club_id_for_phase(session_phase_id)))
  with check (public.is_club_member(public.get_club_id_for_phase(session_phase_id)));

-- SESSION NOTES
drop policy if exists "session_notes_all_member" on public.session_notes;
create policy "session_notes_all_member" on public.session_notes
  for all using (public.is_club_member(public.get_club_id_for_session(training_session_id)))
  with check (public.is_club_member(public.get_club_id_for_session(training_session_id)));
