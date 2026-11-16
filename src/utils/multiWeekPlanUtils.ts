import type {
  HandballFocusTag,
  MultiWeekPlan,
  PlanWeek,
  SessionBlock,
  SessionPhase,
  SessionTemplate,
  Team,
  TrainingSession
} from '../types/domain';
import { buildSessionFromTemplate } from './sessionPlannerUtils';

const WEEK_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

export interface MultiWeekPlanGeneratedBundle {
  plan: MultiWeekPlan;
  weeks: PlanWeek[];
  sessions: TrainingSession[];
  phases: SessionPhase[];
  blocks: SessionBlock[];
}

/**
 * Adds `days` to a YYYY-MM-DD date string in UTC and returns YYYY-MM-DD.
 */
export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Normalizes any YYYY-MM-DD date to the Monday of that ISO week.
 */
export function getMondayOfIsoWeek(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diffToMonday);
  return dt.toISOString().slice(0, 10);
}

/**
 * Generates a complete MultiWeekPlan (Mesocycle), its PlanWeeks (Microcycles),
 * and automatically creates all TrainingSessions based on the Team's fixed `default_schedule`.
 */
export function generateMultiWeekPlanBundle(params: {
  team: Team;
  title: string;
  startDate: string;
  weekCount: number;
  goals: string;
  defaultTemplate?: SessionTemplate;
  defaultCoachMemberId?: string;
  initialFocusTags?: HandballFocusTag[];
}): MultiWeekPlanGeneratedBundle {
  const now = new Date().toISOString();
  const mondayStart = getMondayOfIsoWeek(params.startDate);
  const clampedWeeks = Math.min(16, Math.max(1, params.weekCount));
  const endDate = addDaysIso(mondayStart, clampedWeeks * 7 - 1);

  const planId = `mwp-${crypto.randomUUID().slice(0, 8)}`;
  const plan: MultiWeekPlan = {
    id: planId,
    team_id: params.team.id,
    title: params.title.trim() || `Mehrwochenplan (${clampedWeeks} Wochen)`,
    start_date: mondayStart,
    end_date: endDate,
    goals: params.goals.trim(),
    updated_at: now
  };

  const weeks: PlanWeek[] = [];
  const sessions: TrainingSession[] = [];
  const phases: SessionPhase[] = [];
  const blocks: SessionBlock[] = [];

  for (let w = 0; w < clampedWeeks; w++) {
    const weekNumber = w + 1;
    const weekMonday = addDaysIso(mondayStart, w * 7);
    const weekId = `pw-${crypto.randomUUID().slice(0, 8)}`;

    const week: PlanWeek = {
      id: weekId,
      multi_week_plan_id: planId,
      week_number: weekNumber,
      start_date: weekMonday,
      focus_theme: `Woche ${weekNumber}: Schwerpunkt definieren`,
      focus_tags:
        params.initialFocusTags && params.initialFocusTags.length > 0
          ? params.initialFocusTags
          : ['OFFENSE_GROUP', 'DEFENSE_6_0'],
      color_hex: WEEK_COLORS[w % WEEK_COLORS.length],
      notes: '',
      updated_at: now
    };
    weeks.push(week);

    // Automatically generate training days from the team's default_schedule
    for (const slot of params.team.default_schedule) {
      // slot.weekday: 1 = Monday ... 7 = Sunday
      const dayOffset = Math.min(6, Math.max(0, slot.weekday - 1));
      const sessionDate = addDaysIso(weekMonday, dayOffset);

      const sessionBundle = buildSessionFromTemplate({
        teamId: params.team.id,
        sessionDate,
        startTime: slot.startTime,
        endTime: slot.endTime,
        title: `${slot.weekdayLabel}-Training (Woche ${weekNumber})`,
        planWeekId: weekId,
        template: params.defaultTemplate,
        defaultCoachMemberId: params.defaultCoachMemberId
      });

      sessions.push(sessionBundle.session);
      phases.push(...sessionBundle.phases);
      blocks.push(...sessionBundle.blocks);
    }
  }

  return {
    plan,
    weeks,
    sessions,
    phases,
    blocks
  };
}
