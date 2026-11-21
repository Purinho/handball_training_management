import { describe, expect, it } from 'vitest';
import type {
  ClubMember,
  Exercise,
  MultiWeekPlan,
  PlanWeek,
  SessionBlock,
  SessionNote,
  SessionPhase,
  SessionTemplate,
  Team,
  TeamMember,
  TrainingSession,
  VisibilityLevel
} from '../types/domain';
import {
  EMPTY_CLUB_RESET_SELECTION,
  FULL_CLUB_RESET_SELECTION,
  computeClubResetPreviewCounts,
  computeClubResetScope,
  formatClubResetSummary,
  hasAnyResetSelection,
  isResetConfirmationValid,
  resolvePreservedAdminMemberId,
  type ClubResetDataSnapshot,
  type ClubResetSelection
} from './clubResetUtils';
import { findDeletedLocalIds } from '../services/cloudSyncService';

const OLD = '2025-01-01T00:00:00.000Z';
const NOW = '2026-11-21T12:00:00.000Z';

function team(id: string, club_id: string): Team {
  return {
    id,
    club_id,
    name: id,
    age_group: 'U17',
    season: '2026/27',
    default_schedule: [],
    is_archived: false,
    created_at: OLD,
    updated_at: OLD
  };
}

function member(
  id: string,
  club_id: string,
  club_role: ClubMember['club_role'],
  user_id?: string
): ClubMember {
  return { id, club_id, club_role, user_id, display_name: `Name ${id}`, created_at: OLD, updated_at: OLD };
}

function teamMember(id: string, team_id: string, club_member_id: string): TeamMember {
  return { id, team_id, club_member_id, team_role: 'HEAD_COACH' };
}

function exercise(
  id: string,
  club_id: string,
  visibility: VisibilityLevel,
  extra: Partial<Exercise> = {}
): Exercise {
  return {
    id,
    club_id,
    visibility,
    title: id,
    default_duration_min: 15,
    min_players: 6,
    max_players: 14,
    goalkeepers: 1,
    categories: { phases: [], focus: [], level: 'BASIC', age_groups: [] },
    materials: [],
    setup_description: '',
    flow_description: '',
    coaching_points: '',
    variations_text: '',
    external_links: [],
    is_deleted: false,
    created_at: OLD,
    updated_at: OLD,
    ...extra
  };
}

function template(id: string, club_id: string, exerciseIds: string[]): SessionTemplate {
  return {
    id,
    club_id,
    title: id,
    description: '',
    default_duration_min: 90,
    phases_template: exerciseIds.map((exId, i) => ({
      name: `Phase ${i + 1}`,
      target_duration_min: 15,
      default_exercise_id: exId
    })),
    updated_at: OLD
  };
}

function plan(id: string, team_id: string): MultiWeekPlan {
  return { id, team_id, title: id, start_date: '2026-11-02', end_date: '2026-11-29', goals: '', updated_at: OLD };
}

function week(id: string, multi_week_plan_id: string): PlanWeek {
  return {
    id,
    multi_week_plan_id,
    week_number: 1,
    start_date: '2026-11-02',
    focus_theme: '',
    focus_tags: [],
    color_hex: '#2563EB',
    notes: '',
    updated_at: OLD
  };
}

function session(id: string, team_id: string, plan_week_id?: string): TrainingSession {
  return {
    id,
    team_id,
    plan_week_id,
    session_date: '2026-11-17',
    start_time: '18:30',
    end_time: '20:00',
    planned_duration_min: 90,
    title: id,
    custom_materials_override: [],
    status: 'PLANNED',
    updated_at: OLD
  };
}

function phase(id: string, training_session_id: string): SessionPhase {
  return { id, training_session_id, name: id, sort_order: 1, target_duration_min: 15, updated_at: OLD };
}

function block(
  id: string,
  session_phase_id: string,
  exercise_id?: string,
  assigned_member_id?: string
): SessionBlock {
  return {
    id,
    session_phase_id,
    exercise_id,
    assigned_member_id,
    time_slot_index: 0,
    track_label: 'Alle',
    custom_duration_min: 15,
    updated_at: OLD
  };
}

function note(
  id: string,
  training_session_id: string,
  author_member_id?: string,
  session_block_id?: string
): SessionNote {
  return {
    id,
    training_session_id,
    session_block_id,
    author_member_id,
    author_name: 'Trainer',
    content: 'Notiz',
    created_at: OLD,
    updated_at: OLD
  };
}

function buildData(): ClubResetDataSnapshot {
  return {
    teams: [team('t1', 'c1'), team('t2', 'c1'), team('t3', 'c2')],
    clubMembers: [
      member('admin', 'c1', 'CLUB_ADMIN', 'u-admin'),
      member('coach', 'c1', 'COACH', 'u-coach'),
      member('unlinked', 'c1', 'COACH'),
      member('other', 'c2', 'CLUB_ADMIN', 'u-other')
    ],
    teamMembers: [
      teamMember('tm1', 't1', 'admin'),
      teamMember('tm2', 't1', 'coach'),
      teamMember('tm3', 't2', 'unlinked'),
      teamMember('tm4', 't3', 'other')
    ],
    exercises: [
      exercise('ex-club', 'c1', 'CLUB', { created_by_member_id: 'coach' }),
      exercise('ex-team', 'c1', 'TEAM', { owner_team_id: 't1' }),
      exercise('ex-variant', 'c1', 'CLUB', { parent_exercise_id: 'ex-club' }),
      exercise('ex-soft', 'c1', 'CLUB', { is_deleted: true }),
      exercise('ex-public', 'c1', 'PUBLIC', {
        parent_exercise_id: 'ex-club',
        created_by_member_id: 'coach'
      }),
      exercise('ex-c2', 'c2', 'CLUB', { created_by_member_id: 'other' })
    ],
    templates: [template('tpl1', 'c1', ['ex-club', 'ex-public']), template('tpl2', 'c2', ['ex-c2'])],
    plans: [plan('p1', 't1'), plan('p2', 't3')],
    planWeeks: [week('w1', 'p1'), week('w2', 'p1'), week('w3', 'p2')],
    sessions: [session('s1', 't1', 'w1'), session('s2', 't2'), session('s3', 't3', 'w3')],
    phases: [phase('ph1', 's1'), phase('ph2', 's2'), phase('ph3', 's3')],
    blocks: [
      block('b1', 'ph1', 'ex-club', 'coach'),
      block('b2', 'ph2', 'ex-public', 'admin'),
      block('b3', 'ph3', 'ex-c2', 'other')
    ],
    notes: [note('n1', 's1', 'coach', 'b1'), note('n2', 's3', 'other')]
  };
}

function scopeFor(selection: Partial<ClubResetSelection>) {
  return computeClubResetScope({
    clubId: 'c1',
    selection: { ...EMPTY_CLUB_RESET_SELECTION, ...selection },
    preservedAdminMemberId: 'admin',
    data: buildData(),
    nowIso: NOW
  });
}

describe('clubResetUtils – basics', () => {
  it('detects any selection and validates the RESET confirmation', () => {
    expect(hasAnyResetSelection(EMPTY_CLUB_RESET_SELECTION)).toBe(false);
    expect(hasAnyResetSelection({ ...EMPTY_CLUB_RESET_SELECTION, deletePlans: true })).toBe(true);
    expect(hasAnyResetSelection(FULL_CLUB_RESET_SELECTION)).toBe(true);

    expect(isResetConfirmationValid('RESET')).toBe(true);
    expect(isResetConfirmationValid('  reset ')).toBe(true);
    expect(isResetConfirmationValid('')).toBe(false);
    expect(isResetConfirmationValid('RESE')).toBe(false);
    expect(isResetConfirmationValid('DELETE')).toBe(false);
  });

  it('resolves the preserved admin member per club and auth mode', () => {
    const { clubMembers } = buildData();
    expect(resolvePreservedAdminMemberId(clubMembers, 'c1', 'u-admin')).toBe('admin');
    expect(resolvePreservedAdminMemberId(clubMembers, 'c1', null)).toBe('admin');
    expect(resolvePreservedAdminMemberId(clubMembers, 'c2', undefined)).toBe('other');
    // User of another club must never resolve to a member of c1
    expect(resolvePreservedAdminMemberId(clubMembers, 'c1', 'u-other')).toBeNull();
    // Coach without admin role still resolves to his own membership
    expect(resolvePreservedAdminMemberId(clubMembers, 'c1', 'u-coach')).toBe('coach');
  });

  it('computes preview counts strictly for the target club', () => {
    const data = buildData();
    const counts = computeClubResetPreviewCounts({
      clubId: 'c1',
      teams: data.teams,
      members: data.clubMembers,
      exercises: data.exercises,
      sessions: data.sessions,
      plans: data.plans,
      planWeeks: data.planWeeks,
      preservedAdminMemberId: 'admin'
    });
    expect(counts).toEqual({
      exercises: 3, // ex-club, ex-team, ex-variant (no PUBLIC, no soft-deleted)
      sessions: 2,
      plans: 1,
      planWeeks: 2,
      membersToDelete: 2,
      preservedAdminName: 'Name admin'
    });
  });
});

describe('clubResetUtils – computeClubResetScope', () => {
  it('a) deletes only own club exercises and cleans references', () => {
    const scope = scopeFor({ deleteExercises: true });

    expect(scope.exerciseIdsToDelete.sort()).toEqual(['ex-club', 'ex-soft', 'ex-team', 'ex-variant']);
    expect(scope.activeExercisesToDeleteCount).toBe(3);
    expect(scope.sessionIdsToDelete).toEqual([]);
    expect(scope.memberIdsToDelete).toEqual([]);

    expect(scope.blocksToUpdate).toHaveLength(1);
    expect(scope.blocksToUpdate[0].id).toBe('b1');
    expect(scope.blocksToUpdate[0].exercise_id).toBeUndefined();
    expect(scope.blocksToUpdate[0].assigned_member_id).toBe('coach');
    expect(scope.blocksToUpdate[0].updated_at).toBe(NOW);

    expect(scope.templatesToUpdate).toHaveLength(1);
    expect(scope.templatesToUpdate[0].id).toBe('tpl1');
    expect(scope.templatesToUpdate[0].phases_template[0].default_exercise_id).toBeUndefined();
    expect(scope.templatesToUpdate[0].phases_template[1].default_exercise_id).toBe('ex-public');

    expect(scope.exercisesToUpdate.map((e) => e.id)).toEqual(['ex-public']);
    expect(scope.exercisesToUpdate[0].parent_exercise_id).toBeUndefined();
    expect(scope.exercisesToUpdate[0].created_by_member_id).toBe('coach');

    expect(scope.outboxEntityKeysToPurge.has('exercises:ex-club')).toBe(true);
    expect(scope.outboxEntityKeysToPurge.has('exercises:ex-public')).toBe(false);
    expect(scope.outboxEntityKeysToPurge.has('exercises:ex-c2')).toBe(false);
  });

  it('b) deletes club sessions incl. phases, blocks and notes', () => {
    const scope = scopeFor({ deleteSessions: true });
    expect(scope.sessionIdsToDelete).toEqual(['s1', 's2']);
    expect(scope.phaseIdsToDelete).toEqual(['ph1', 'ph2']);
    expect(scope.blockIdsToDelete).toEqual(['b1', 'b2']);
    expect(scope.noteIdsToDelete).toEqual(['n1']);
    expect(scope.planIdsToDelete).toEqual([]);
    expect(scope.blocksToUpdate).toEqual([]);
    expect(scope.outboxEntityKeysToPurge.has('training_sessions:s3')).toBe(false);
    expect(scope.outboxEntityKeysToPurge.has('session_blocks:b2')).toBe(true);
  });

  it('c) deletes club plans incl. weeks and unlinks surviving sessions', () => {
    const scope = scopeFor({ deletePlans: true });
    expect(scope.planIdsToDelete).toEqual(['p1']);
    expect(scope.planWeekIdsToDelete).toEqual(['w1', 'w2']);
    expect(scope.sessionsToUpdate.map((s) => s.id)).toEqual(['s1']);
    expect(scope.sessionsToUpdate[0].plan_week_id).toBeUndefined();

    const combined = scopeFor({ deletePlans: true, deleteSessions: true });
    expect(combined.sessionsToUpdate).toEqual([]);
  });

  it('d) deletes other members + assignments but keeps the executing admin', () => {
    const scope = scopeFor({ deleteMembers: true });
    expect(scope.memberIdsToDelete).toEqual(['coach', 'unlinked']);
    expect(scope.teamMemberIdsToDelete).toEqual(['tm2', 'tm3']);

    expect(scope.blocksToUpdate.map((b) => b.id)).toEqual(['b1']);
    expect(scope.blocksToUpdate[0].assigned_member_id).toBeUndefined();
    expect(scope.blocksToUpdate[0].exercise_id).toBe('ex-club');

    expect(scope.notesToUpdate.map((n) => n.id)).toEqual(['n1']);
    expect(scope.notesToUpdate[0].author_member_id).toBeUndefined();

    expect(scope.exercisesToUpdate.map((e) => e.id).sort()).toEqual(['ex-club', 'ex-public']);
    expect(scope.exercisesToUpdate.every((e) => e.created_by_member_id === undefined)).toBe(true);

    expect(scope.outboxEntityKeysToPurge.has('club_members:admin')).toBe(false);
    expect(scope.outboxEntityKeysToPurge.has('team_members:tm2')).toBe(true);
  });

  it('all parts combined never touch other clubs, PUBLIC exercises or the admin', () => {
    const scope = scopeFor(FULL_CLUB_RESET_SELECTION);

    expect(scope.exerciseIdsToDelete).not.toContain('ex-public');
    expect(scope.exerciseIdsToDelete).not.toContain('ex-c2');
    expect(scope.memberIdsToDelete).not.toContain('admin');
    expect(scope.memberIdsToDelete).not.toContain('other');
    expect(scope.teamMemberIdsToDelete).not.toContain('tm1');
    expect(scope.teamMemberIdsToDelete).not.toContain('tm4');
    expect(scope.sessionIdsToDelete).not.toContain('s3');
    expect(scope.planIdsToDelete).not.toContain('p2');

    // Deleted rows receive no patches; c2 rows stay untouched
    expect(scope.blocksToUpdate).toEqual([]);
    expect(scope.notesToUpdate).toEqual([]);
    expect(scope.sessionsToUpdate).toEqual([]);
    expect(scope.exercisesToUpdate.map((e) => e.id)).toEqual(['ex-public']);
    expect(scope.templatesToUpdate.map((t) => t.id)).toEqual(['tpl1']);

    for (const key of [
      'exercises:ex-club',
      'training_sessions:s1',
      'session_phases:ph2',
      'session_blocks:b1',
      'session_notes:n1',
      'multi_week_plans:p1',
      'plan_weeks:w2',
      'club_members:coach',
      'team_members:tm3'
    ]) {
      expect(scope.outboxEntityKeysToPurge.has(key)).toBe(true);
    }
  });
});

describe('clubResetUtils – summary & sync pruning', () => {
  it('formats partial and full reset summaries', () => {
    const base = {
      mode: 'LOCAL' as const,
      clubId: 'c1',
      deletedExercises: 3,
      deletedSessions: 2,
      deletedPlans: 1,
      deletedMembers: 2,
      deletedTeamMembers: 2,
      newInviteCode: 'SGHA-0123456789'
    };
    const partial = formatClubResetSummary(base, {
      ...EMPTY_CLUB_RESET_SELECTION,
      deleteSessions: true
    });
    expect(partial).toContain('Trainingstage: 2');
    expect(partial).not.toContain('Übungen');
    expect(partial).not.toContain('Einladungscode');

    const full = formatClubResetSummary(base, FULL_CLUB_RESET_SELECTION);
    expect(full).toContain('Übungen: 3');
    expect(full).toContain('Mesozyklen: 1');
    expect(full).toContain('Trainer/Mitglieder: 2');
    expect(full).toContain('SGHA-0123456789');
  });

  it('findDeletedLocalIds prunes remote-deleted rows but protects pending ones', () => {
    const local = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const remote = [{ id: 'a' }, { id: 'x' }];
    expect(findDeletedLocalIds(local, remote, new Set(['c']))).toEqual(['b', 'd']);
    expect(findDeletedLocalIds([], remote, new Set())).toEqual([]);
  });
});
