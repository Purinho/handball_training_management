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
  TrainingSession
} from '../types/domain';

/**
 * Pure helpers for the admin-only "Vereins-Reset" (selective club data reset).
 */

export interface ClubResetSelection {
  deleteExercises: boolean;
  deleteSessions: boolean;
  deletePlans: boolean;
  deleteMembers: boolean;
}

export const EMPTY_CLUB_RESET_SELECTION: ClubResetSelection = {
  deleteExercises: false,
  deleteSessions: false,
  deletePlans: false,
  deleteMembers: false
};

export const FULL_CLUB_RESET_SELECTION: ClubResetSelection = {
  deleteExercises: true,
  deleteSessions: true,
  deletePlans: true,
  deleteMembers: true
};

export interface ClubResetPreviewCounts {
  exercises: number;
  sessions: number;
  plans: number;
  planWeeks: number;
  membersToDelete: number;
  preservedAdminName?: string;
}

export interface ClubResetDataSnapshot {
  teams: Team[];
  clubMembers: ClubMember[];
  teamMembers: TeamMember[];
  exercises: Exercise[];
  templates: SessionTemplate[];
  plans: MultiWeekPlan[];
  planWeeks: PlanWeek[];
  sessions: TrainingSession[];
  phases: SessionPhase[];
  blocks: SessionBlock[];
  notes: SessionNote[];
}

export interface ClubResetScope {
  exerciseIdsToDelete: string[];
  activeExercisesToDeleteCount: number;
  sessionIdsToDelete: string[];
  phaseIdsToDelete: string[];
  blockIdsToDelete: string[];
  noteIdsToDelete: string[];
  planIdsToDelete: string[];
  planWeekIdsToDelete: string[];
  memberIdsToDelete: string[];
  teamMemberIdsToDelete: string[];
  sessionsToUpdate: TrainingSession[];
  blocksToUpdate: SessionBlock[];
  notesToUpdate: SessionNote[];
  exercisesToUpdate: Exercise[];
  templatesToUpdate: SessionTemplate[];
  outboxEntityKeysToPurge: Set<string>;
}

export interface ClubResetResult {
  mode: 'CLOUD' | 'LOCAL';
  clubId: string;
  deletedExercises: number;
  deletedSessions: number;
  deletedPlans: number;
  deletedMembers: number;
  deletedTeamMembers: number;
  newInviteCode?: string;
}

export function hasAnyResetSelection(selection: ClubResetSelection): boolean {
  return (
    selection.deleteExercises ||
    selection.deleteSessions ||
    selection.deletePlans ||
    selection.deleteMembers
  );
}

export function isResetConfirmationValid(input: string): boolean {
  return typeof input === 'string' && input.trim().toUpperCase() === 'RESET';
}

/**
 * Determines which club member must survive a "Trainer löschen" reset
 * (the executing admin – never lock the admin out of the club).
 */
export function resolvePreservedAdminMemberId(
  clubMembers: ClubMember[],
  clubId: string,
  authUserId?: string | null
): string | null {
  const ofClub = clubMembers.filter((m) => m.club_id === clubId);
  if (authUserId) {
    const asAdmin = ofClub.find((m) => m.user_id === authUserId && m.club_role === 'CLUB_ADMIN');
    if (asAdmin) return asAdmin.id;
    const anyRole = ofClub.find((m) => m.user_id === authUserId);
    return anyRole?.id ?? null;
  }
  const firstAdmin = ofClub.find((m) => m.club_role === 'CLUB_ADMIN');
  return firstAdmin?.id ?? ofClub[0]?.id ?? null;
}

function isClubOwnedExercise(ex: Exercise, clubId: string): boolean {
  return ex.club_id === clubId && ex.visibility !== 'PUBLIC';
}

export function computeClubResetPreviewCounts(params: {
  clubId: string;
  teams: Team[];
  members: ClubMember[];
  exercises: Exercise[];
  sessions: TrainingSession[];
  plans: MultiWeekPlan[];
  planWeeks: PlanWeek[];
  preservedAdminMemberId: string | null;
}): ClubResetPreviewCounts {
  const { clubId, preservedAdminMemberId } = params;
  const teamIds = new Set(params.teams.filter((t) => t.club_id === clubId).map((t) => t.id));
  const clubPlans = params.plans.filter((p) => teamIds.has(p.team_id));
  const planIds = new Set(clubPlans.map((p) => p.id));
  const clubMembers = params.members.filter((m) => m.club_id === clubId);
  const preservedAdmin = clubMembers.find((m) => m.id === preservedAdminMemberId);

  return {
    exercises: params.exercises.filter((e) => isClubOwnedExercise(e, clubId) && !e.is_deleted)
      .length,
    sessions: params.sessions.filter((s) => teamIds.has(s.team_id)).length,
    plans: clubPlans.length,
    planWeeks: params.planWeeks.filter((pw) => planIds.has(pw.multi_week_plan_id)).length,
    membersToDelete: clubMembers.filter((m) => m.id !== preservedAdminMemberId).length,
    preservedAdminName: preservedAdmin?.display_name
  };
}

/**
 * Computes every deletion and every foreign-key cleanup patch for surviving rows,
 * strictly scoped to the given club (multi-tenant safe).
 */
export function computeClubResetScope(params: {
  clubId: string;
  selection: ClubResetSelection;
  preservedAdminMemberId: string | null;
  data: ClubResetDataSnapshot;
  nowIso?: string;
}): ClubResetScope {
  const { clubId, selection, preservedAdminMemberId, data } = params;
  const nowIso = params.nowIso ?? new Date().toISOString();

  const teamIds = new Set(data.teams.filter((t) => t.club_id === clubId).map((t) => t.id));
  const clubSessions = data.sessions.filter((s) => teamIds.has(s.team_id));
  const clubSessionIds = new Set(clubSessions.map((s) => s.id));
  const clubPhases = data.phases.filter((p) => clubSessionIds.has(p.training_session_id));
  const clubPhaseIds = new Set(clubPhases.map((p) => p.id));
  const clubBlocks = data.blocks.filter((b) => clubPhaseIds.has(b.session_phase_id));
  const clubNotes = data.notes.filter((n) => clubSessionIds.has(n.training_session_id));
  const clubPlans = data.plans.filter((p) => teamIds.has(p.team_id));
  const clubPlanIds = new Set(clubPlans.map((p) => p.id));
  const clubPlanWeeks = data.planWeeks.filter((pw) => clubPlanIds.has(pw.multi_week_plan_id));

  // --- Deletions ---
  const sessionIdsToDelete = selection.deleteSessions ? clubSessions.map((s) => s.id) : [];
  const phaseIdsToDelete = selection.deleteSessions ? clubPhases.map((p) => p.id) : [];
  const blockIdsToDelete = selection.deleteSessions ? clubBlocks.map((b) => b.id) : [];
  const noteIdsToDelete = selection.deleteSessions ? clubNotes.map((n) => n.id) : [];
  const planIdsToDelete = selection.deletePlans ? clubPlans.map((p) => p.id) : [];
  const planWeekIdsToDelete = selection.deletePlans ? clubPlanWeeks.map((w) => w.id) : [];

  const exercisesToDelete = selection.deleteExercises
    ? data.exercises.filter((e) => isClubOwnedExercise(e, clubId))
    : [];
  const membersToDelete = selection.deleteMembers
    ? data.clubMembers.filter((m) => m.club_id === clubId && m.id !== preservedAdminMemberId)
    : [];

  const deletedExerciseIds = new Set(exercisesToDelete.map((e) => e.id));
  const deletedMemberIds = new Set(membersToDelete.map((m) => m.id));
  const deletedBlockIds = new Set(blockIdsToDelete);
  const deletedNoteIds = new Set(noteIdsToDelete);

  const teamMembersToDelete = data.teamMembers.filter((tm) =>
    deletedMemberIds.has(tm.club_member_id)
  );

  // --- Foreign-key cleanup on surviving rows ---
  const sessionsToUpdate: TrainingSession[] =
    selection.deletePlans && !selection.deleteSessions
      ? clubSessions
          .filter((s) => Boolean(s.plan_week_id))
          .map((s) => {
            const next: TrainingSession = { ...s, updated_at: nowIso };
            delete next.plan_week_id;
            return next;
          })
      : [];

  const blocksToUpdate: SessionBlock[] = [];
  for (const b of data.blocks) {
    if (deletedBlockIds.has(b.id)) continue;
    const clearExercise = Boolean(b.exercise_id && deletedExerciseIds.has(b.exercise_id));
    const clearMember = Boolean(b.assigned_member_id && deletedMemberIds.has(b.assigned_member_id));
    if (!clearExercise && !clearMember) continue;
    const next: SessionBlock = { ...b, updated_at: nowIso };
    if (clearExercise) delete next.exercise_id;
    if (clearMember) delete next.assigned_member_id;
    blocksToUpdate.push(next);
  }

  const notesToUpdate: SessionNote[] = [];
  for (const n of data.notes) {
    if (deletedNoteIds.has(n.id)) continue;
    if (!n.author_member_id || !deletedMemberIds.has(n.author_member_id)) continue;
    const next: SessionNote = { ...n, updated_at: nowIso };
    delete next.author_member_id;
    notesToUpdate.push(next);
  }

  const exercisesToUpdate: Exercise[] = [];
  for (const ex of data.exercises) {
    if (deletedExerciseIds.has(ex.id)) continue;
    const clearParent = Boolean(
      ex.parent_exercise_id && deletedExerciseIds.has(ex.parent_exercise_id)
    );
    const clearCreator = Boolean(
      ex.created_by_member_id && deletedMemberIds.has(ex.created_by_member_id)
    );
    if (!clearParent && !clearCreator) continue;
    const next: Exercise = { ...ex, updated_at: nowIso };
    if (clearParent) delete next.parent_exercise_id;
    if (clearCreator) delete next.created_by_member_id;
    exercisesToUpdate.push(next);
  }

  const templatesToUpdate: SessionTemplate[] = [];
  if (deletedExerciseIds.size > 0) {
    for (const tpl of data.templates) {
      if (tpl.club_id !== clubId) continue;
      const phasesTemplate = Array.isArray(tpl.phases_template) ? tpl.phases_template : [];
      const affected = phasesTemplate.some(
        (p) => p.default_exercise_id && deletedExerciseIds.has(p.default_exercise_id)
      );
      if (!affected) continue;
      templatesToUpdate.push({
        ...tpl,
        phases_template: phasesTemplate.map((p) => {
          if (!p.default_exercise_id || !deletedExerciseIds.has(p.default_exercise_id)) return p;
          const next = { ...p };
          delete next.default_exercise_id;
          return next;
        }),
        updated_at: nowIso
      });
    }
  }

  // --- Outbox keys of deleted entities (pending offline edits must not resurrect them) ---
  const outboxEntityKeysToPurge = new Set<string>();
  const addKeys = (table: string, ids: Iterable<string>) => {
    for (const id of ids) outboxEntityKeysToPurge.add(`${table}:${id}`);
  };
  addKeys('exercises', deletedExerciseIds);
  addKeys('training_sessions', sessionIdsToDelete);
  addKeys('session_phases', phaseIdsToDelete);
  addKeys('session_blocks', blockIdsToDelete);
  addKeys('session_notes', noteIdsToDelete);
  addKeys('multi_week_plans', planIdsToDelete);
  addKeys('plan_weeks', planWeekIdsToDelete);
  addKeys('club_members', deletedMemberIds);
  addKeys(
    'team_members',
    teamMembersToDelete.map((tm) => tm.id)
  );

  return {
    exerciseIdsToDelete: exercisesToDelete.map((e) => e.id),
    activeExercisesToDeleteCount: exercisesToDelete.filter((e) => !e.is_deleted).length,
    sessionIdsToDelete,
    phaseIdsToDelete,
    blockIdsToDelete,
    noteIdsToDelete,
    planIdsToDelete,
    planWeekIdsToDelete,
    memberIdsToDelete: membersToDelete.map((m) => m.id),
    teamMemberIdsToDelete: teamMembersToDelete.map((tm) => tm.id),
    sessionsToUpdate,
    blocksToUpdate,
    notesToUpdate,
    exercisesToUpdate,
    templatesToUpdate,
    outboxEntityKeysToPurge
  };
}

export function formatClubResetSummary(
  result: ClubResetResult,
  selection: ClubResetSelection
): string {
  const parts: string[] = [];
  if (selection.deleteExercises) parts.push(`Übungen: ${result.deletedExercises}`);
  if (selection.deleteSessions) parts.push(`Trainingstage: ${result.deletedSessions}`);
  if (selection.deletePlans) parts.push(`Mesozyklen: ${result.deletedPlans}`);
  if (selection.deleteMembers) parts.push(`Trainer/Mitglieder: ${result.deletedMembers}`);

  let message = `✓ Vereins-Reset abgeschlossen – gelöscht: ${parts.join(', ')}.`;
  if (selection.deleteMembers && result.newInviteCode) {
    message += ` Neuer Einladungscode: ${result.newInviteCode}`;
  }
  return message;
}
