-- ============================================================================
-- Handball Training Management – Vereins-Reset (Migration 0005)
-- Run this migration AFTER 0004_security_hardening.sql in Supabase SQL Editor.
--
-- Admin-only RPC to selectively reset club data:
--   a) (Vereins-)Übungen löschen   (CLUB + TEAM, PUBLIC bleibt erhalten)
--   b) Trainingstage löschen       (inkl. Phasen, Blöcke, Notizen)
--   c) Mesozyklen löschen          (inkl. Planwochen)
--   d) Trainer etc. löschen        (alle anderen Mitglieder + Team-Zuordnungen,
--                                   Einladungscode wird automatisch erneuert)
-- The executing CLUB_ADMIN, the club itself and its teams always remain intact.
-- auth.users accounts are NOT deleted (only the club membership is removed).
-- ============================================================================

create or replace function public.reset_club_data(
  p_club_id uuid,
  p_delete_exercises boolean default false,
  p_delete_sessions boolean default false,
  p_delete_plans boolean default false,
  p_delete_members boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_club public.clubs%rowtype;
  v_caller_member_id uuid;
  v_team_ids uuid[];
  v_deleted_exercise_ids uuid[];
  v_deleted_member_ids uuid[];
  v_deleted_exercises integer := 0;
  v_deleted_sessions integer := 0;
  v_deleted_plans integer := 0;
  v_deleted_members integer := 0;
  v_deleted_team_members integer := 0;
  v_new_invite_code text;
  v_attempts integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_club from public.clubs where id = p_club_id;
  if v_club.id is null then
    raise exception 'Verein nicht gefunden.';
  end if;

  if not public.is_club_admin(p_club_id) then
    raise exception 'Keine Berechtigung: Nur Vereins-Administratoren dürfen den Vereins-Reset ausführen.';
  end if;

  select cm.id into v_caller_member_id
  from public.club_members cm
  where cm.club_id = p_club_id
    and cm.user_id = v_user_id
    and cm.club_role = 'CLUB_ADMIN'
  order by cm.created_at
  limit 1;

  if v_caller_member_id is null then
    raise exception 'Keine Berechtigung: Vereins-Admin-Mitgliedschaft nicht gefunden.';
  end if;

  if not (
    coalesce(p_delete_exercises, false)
    or coalesce(p_delete_sessions, false)
    or coalesce(p_delete_plans, false)
    or coalesce(p_delete_members, false)
  ) then
    raise exception 'Bitte mindestens einen Bereich zum Zurücksetzen auswählen.';
  end if;

  select coalesce(array_agg(t.id), '{}'::uuid[]) into v_team_ids
  from public.teams t
  where t.club_id = p_club_id;

  -- b) Trainingstage (cascades to session_phases, session_blocks, session_notes)
  if coalesce(p_delete_sessions, false) then
    delete from public.training_sessions where team_id = any(v_team_ids);
    get diagnostics v_deleted_sessions = row_count;
  end if;

  -- c) Mesozyklen (cascades to plan_weeks)
  if coalesce(p_delete_plans, false) then
    if not coalesce(p_delete_sessions, false) then
      update public.training_sessions
      set plan_week_id = null,
          updated_at = now()
      where team_id = any(v_team_ids)
        and plan_week_id is not null;
    end if;

    delete from public.multi_week_plans where team_id = any(v_team_ids);
    get diagnostics v_deleted_plans = row_count;
  end if;

  -- a) (Vereins-)Übungen (PUBLIC stays)
  if coalesce(p_delete_exercises, false) then
    select coalesce(array_agg(e.id), '{}'::uuid[]) into v_deleted_exercise_ids
    from public.exercises e
    where e.club_id = p_club_id
      and e.visibility <> 'PUBLIC';

    if cardinality(v_deleted_exercise_ids) > 0 then
      if not coalesce(p_delete_sessions, false) then
        update public.session_blocks
        set exercise_id = null,
            updated_at = now()
        where exercise_id = any(v_deleted_exercise_ids);
      end if;

      update public.session_templates st
      set phases_template = (
            select coalesce(
              jsonb_agg(
                case
                  when (elem ->> 'default_exercise_id') = any(v_deleted_exercise_ids::text[])
                    then elem - 'default_exercise_id'
                  else elem
                end
                order by ord
              ),
              '[]'::jsonb
            )
            from jsonb_array_elements(st.phases_template) with ordinality as x(elem, ord)
          ),
          updated_at = now()
      where st.club_id = p_club_id
        and jsonb_typeof(st.phases_template) = 'array'
        and exists (
          select 1
          from jsonb_array_elements(st.phases_template) as y(elem)
          where (y.elem ->> 'default_exercise_id') = any(v_deleted_exercise_ids::text[])
        );

      update public.exercises
      set parent_exercise_id = null,
          updated_at = now()
      where parent_exercise_id = any(v_deleted_exercise_ids);

      delete from public.exercises where id = any(v_deleted_exercise_ids);
      v_deleted_exercises := cardinality(v_deleted_exercise_ids);
    end if;
  end if;

  -- d) Trainer etc. (all other members; caller always stays)
  if coalesce(p_delete_members, false) then
    select coalesce(array_agg(cm.id), '{}'::uuid[]) into v_deleted_member_ids
    from public.club_members cm
    where cm.club_id = p_club_id
      and cm.id <> v_caller_member_id
      and (cm.user_id is null or cm.user_id <> v_user_id);

    if cardinality(v_deleted_member_ids) > 0 then
      update public.exercises
      set created_by_member_id = null,
          updated_at = now()
      where club_id = p_club_id
        and created_by_member_id = any(v_deleted_member_ids);

      if not coalesce(p_delete_sessions, false) then
        update public.session_blocks sb
        set assigned_member_id = null,
            updated_at = now()
        from public.session_phases sp
        join public.training_sessions ts on ts.id = sp.training_session_id
        where sb.session_phase_id = sp.id
          and ts.team_id = any(v_team_ids)
          and sb.assigned_member_id = any(v_deleted_member_ids);

        update public.session_notes sn
        set author_member_id = null,
            updated_at = now()
        from public.training_sessions ts
        where sn.training_session_id = ts.id
          and ts.team_id = any(v_team_ids)
          and sn.author_member_id = any(v_deleted_member_ids);
      end if;

      delete from public.team_members where club_member_id = any(v_deleted_member_ids);
      get diagnostics v_deleted_team_members = row_count;

      delete from public.club_members where id = any(v_deleted_member_ids);
      get diagnostics v_deleted_members = row_count;
    end if;

    -- Always rotate the invite code so previously shared codes become invalid
    loop
      v_new_invite_code := public.generate_secure_invite_code(v_club.name);
      exit when v_new_invite_code <> v_club.invite_code
        and not exists (select 1 from public.clubs c where c.invite_code = v_new_invite_code);
      v_attempts := v_attempts + 1;
      if v_attempts > 20 then
        raise exception 'Neuer Einladungscode konnte nicht erzeugt werden.';
      end if;
    end loop;

    update public.clubs
    set invite_code = v_new_invite_code,
        updated_at = now()
    where id = p_club_id;
  end if;

  return jsonb_build_object(
    'club_id', p_club_id,
    'deleted_exercises', v_deleted_exercises,
    'deleted_sessions', v_deleted_sessions,
    'deleted_plans', v_deleted_plans,
    'deleted_members', v_deleted_members,
    'deleted_team_members', v_deleted_team_members,
    'new_invite_code', v_new_invite_code
  );
end;
$$;

revoke all on function public.reset_club_data(uuid, boolean, boolean, boolean, boolean) from public;
grant execute on function public.reset_club_data(uuid, boolean, boolean, boolean, boolean) to authenticated;
