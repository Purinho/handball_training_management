-- ============================================================================
-- Handball Training Management – Phase 2 Security Hardening (Migration 0004)
-- 1. Cryptographic 10-char invite codes (upgrades existing weak 4-digit codes)
-- 2. Registration ONLY with valid invite_code (BEFORE/AFTER INSERT on auth.users)
-- 3. Restrict new club creation (create_club_with_admin) strictly to existing CLUB_ADMIN
-- 4. Fix p_email spoofing in join_club_by_invite_code (use verified auth.jwt() email)
-- 5. Tighter RLS policies & payload size constraints against DB flooding
-- ============================================================================

-- 1. Helper: Generate cryptographically strong invite code (e.g. TSVH-9F3A7C2E1B)
create or replace function public.generate_secure_invite_code(p_club_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_random text;
begin
  v_prefix := upper(regexp_replace(coalesce(nullif(trim(p_club_name), ''), 'CLUB'), '[^a-zA-Z0-9]', '', 'g'));
  v_prefix := left(coalesce(nullif(v_prefix, ''), 'CLUB'), 4);
  v_random := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  return v_prefix || '-' || v_random;
end;
$$;

-- Upgrade any existing weak 4-digit invite codes (e.g. XXXX-1234) immediately
update public.clubs
set invite_code = public.generate_secure_invite_code(name),
    updated_at = now()
where invite_code ~ '^[A-Z0-9]{1,4}-[0-9]{4}$';

-- 2. Enforce valid invite_code on user registration (blocks uninvited signups)
create or replace function public.enforce_invite_code_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite_code text;
begin
  -- Allow initial bootstrap if no club exists in the entire database yet
  if not exists (select 1 from public.clubs) then
    return new;
  end if;

  v_invite_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));

  if v_invite_code = '' or not exists (
    select 1
    from public.clubs c
    where upper(trim(c.invite_code)) = v_invite_code
  ) then
    raise exception 'Registrierung nur mit gültigem Vereins-Freischaltcode möglich.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_invite_code_on_signup on auth.users;
create trigger trg_enforce_invite_code_on_signup
  before insert on auth.users
  for each row
  execute function public.enforce_invite_code_on_signup();

-- Automatically link newly registered user to the club matching their invite_code
create or replace function public.auto_join_club_after_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite_code text;
  v_display_name text;
  v_club_id uuid;
  v_member_id uuid;
begin
  v_invite_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  if v_invite_code = '' then
    return new;
  end if;

  select id into v_club_id
  from public.clubs
  where upper(trim(invite_code)) = v_invite_code
  limit 1;

  if v_club_id is null then
    return new;
  end if;

  v_display_name := coalesce(
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
    split_part(coalesce(new.email, 'Trainer'), '@', 1),
    'Trainer'
  );

  -- Link pre-created member if verified user email matches
  if nullif(trim(coalesce(new.email, '')), '') is not null then
    select id into v_member_id
    from public.club_members
    where club_id = v_club_id
      and user_id is null
      and lower(trim(email)) = lower(trim(new.email))
    limit 1;

    if v_member_id is not null then
      update public.club_members
      set user_id = new.id,
          display_name = coalesce(nullif(v_display_name, ''), display_name),
          updated_at = now()
      where id = v_member_id;
      return new;
    end if;
  end if;

  -- Otherwise insert as COACH
  insert into public.club_members (id, club_id, user_id, club_role, display_name, email)
  values (
    gen_random_uuid(),
    v_club_id,
    new.id,
    'COACH',
    v_display_name,
    nullif(trim(coalesce(new.email, '')), '')
  );

  return new;
end;
$$;

drop trigger if exists trg_auto_join_club_after_signup on auth.users;
create trigger trg_auto_join_club_after_signup
  after insert on auth.users
  for each row
  execute function public.auto_join_club_after_signup();

-- 3. Restrict create_club_with_admin strictly to existing CLUB_ADMIN (or initial empty DB)
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
  v_jwt_email text := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
  v_club_id uuid := gen_random_uuid();
  v_member_id uuid := gen_random_uuid();
  v_team_id uuid := gen_random_uuid();
  v_invite_code text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Only allow creating a new club if no club exists yet OR caller is already a CLUB_ADMIN
  if exists (select 1 from public.clubs) and not exists (
    select 1
    from public.club_members cm
    where cm.user_id = v_user_id
      and cm.club_role = 'CLUB_ADMIN'
  ) then
    raise exception 'Keine Berechtigung: Nur der Administrator darf neue Vereine gründen.';
  end if;

  if (
    select count(*)
    from public.club_members cm
    where cm.user_id = v_user_id
      and cm.club_role = 'CLUB_ADMIN'
  ) >= 10 then
    raise exception 'Maximale Anzahl an Vereinen erreicht.';
  end if;

  if nullif(trim(coalesce(p_club_name, '')), '') is null then
    raise exception 'Bitte einen gültigen Vereinsnamen angeben.';
  end if;

  v_invite_code := public.generate_secure_invite_code(p_club_name);

  insert into public.clubs (id, name, invite_code)
  values (v_club_id, left(trim(p_club_name), 150), v_invite_code);

  insert into public.club_members (id, club_id, user_id, club_role, display_name, email)
  values (
    v_member_id,
    v_club_id,
    v_user_id,
    'CLUB_ADMIN',
    left(coalesce(nullif(trim(p_display_name), ''), 'Vereins-Admin'), 120),
    coalesce(v_jwt_email, nullif(lower(trim(coalesce(p_email, ''))), ''))
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

-- 4. Harden join_club_by_invite_code: Never trust client-supplied p_email for account linking
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
  v_jwt_email text := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
  v_club public.clubs%rowtype;
  v_member_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_club
  from public.clubs
  where upper(trim(invite_code)) = upper(trim(coalesce(p_invite_code, '')))
  limit 1;

  if v_club.id is null then
    raise exception 'Ungültiger Vereins-Freischaltcode.';
  end if;

  -- Check if user is already a member of this club
  select id into v_member_id
  from public.club_members
  where club_id = v_club.id and user_id = v_user_id
  limit 1;

  if v_member_id is not null then
    return jsonb_build_object('club_id', v_club.id, 'member_id', v_member_id);
  end if;

  -- Link pre-created unlinked member ONLY via verified JWT email (never client p_email!)
  if v_jwt_email is not null then
    select id into v_member_id
    from public.club_members
    where club_id = v_club.id
      and user_id is null
      and lower(trim(email)) = v_jwt_email
    limit 1;

    if v_member_id is not null then
      update public.club_members
      set user_id = v_user_id,
          display_name = left(coalesce(nullif(trim(p_display_name), ''), display_name), 120),
          updated_at = now()
      where id = v_member_id;

      return jsonb_build_object('club_id', v_club.id, 'member_id', v_member_id);
    end if;
  end if;

  -- Otherwise create a new COACH member
  v_member_id := gen_random_uuid();
  insert into public.club_members (id, club_id, user_id, club_role, display_name, email)
  values (
    v_member_id,
    v_club.id,
    v_user_id,
    'COACH',
    left(coalesce(nullif(trim(p_display_name), ''), 'Trainer'), 120),
    v_jwt_email
  );

  return jsonb_build_object('club_id', v_club.id, 'member_id', v_member_id);
end;
$$;

-- 5. Tighter RLS Policies & Size Constraints
-- Prevent non-admins from deleting teams
drop policy if exists "teams_write_member" on public.teams;
drop policy if exists "teams_insert_update_member" on public.teams;
create policy "teams_insert_update_member" on public.teams
  for insert with check (public.is_club_member(club_id));

drop policy if exists "teams_update_member" on public.teams;
create policy "teams_update_member" on public.teams
  for update using (public.is_club_member(club_id))
  with check (public.is_club_member(club_id));

drop policy if exists "teams_delete_admin" on public.teams;
create policy "teams_delete_admin" on public.teams
  for delete using (public.is_club_admin(club_id));

-- Prevent arbitrary cross-club PUBLIC exercise publishing in MVP
drop policy if exists "exercises_write_member" on public.exercises;
create policy "exercises_write_member" on public.exercises
  for all using (public.is_club_member(club_id))
  with check (public.is_club_member(club_id) and visibility in ('CLUB', 'TEAM'));

-- Payload size constraints against database storage exhaustion
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_exercises_ref_image_size'
  ) then
    alter table public.exercises
      add constraint chk_exercises_ref_image_size
      check (reference_image_data is null or octet_length(reference_image_data) <= 1000000);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'chk_exercises_title_len'
  ) then
    alter table public.exercises
      add constraint chk_exercises_title_len
      check (char_length(title) <= 250);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'chk_clubs_name_len'
  ) then
    alter table public.clubs
      add constraint chk_clubs_name_len
      check (char_length(name) <= 150);
  end if;
end $$;
