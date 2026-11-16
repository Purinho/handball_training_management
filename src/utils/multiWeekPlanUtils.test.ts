import { describe, expect, it } from 'vitest';
import { generateMultiWeekPlanBundle, getMondayOfIsoWeek } from './multiWeekPlanUtils';
import type { Team } from '../types/domain';

describe('multiWeekPlanUtils', () => {
  it('normalizes any date to the Monday of its ISO week', () => {
    // 2026-11-18 is a Wednesday -> Monday is 2026-11-16
    expect(getMondayOfIsoWeek('2026-11-18')).toBe('2026-11-16');
  });

  it('generates weeks and automatic training sessions matching the team schedule', () => {
    const mockTeam: Team = {
      id: 'team-test',
      club_id: 'club-1',
      name: 'mB-Jugend',
      age_group: 'U17',
      season: '2026/27',
      default_schedule: [
        { id: 's1', weekday: 2, weekdayLabel: 'Dienstag', startTime: '18:30', endTime: '20:00' },
        { id: 's2', weekday: 4, weekdayLabel: 'Donnerstag', startTime: '18:30', endTime: '20:00' }
      ],
      is_archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const bundle = generateMultiWeekPlanBundle({
      team: mockTeam,
      title: 'Vorbereitung Block 1',
      startDate: '2026-11-16',
      weekCount: 3,
      goals: 'Abwehr & Gegenstoß'
    });

    expect(bundle.weeks).toHaveLength(3);
    // 3 weeks * 2 training days per week (Tue & Thu) = 6 training sessions automatically generated!
    expect(bundle.sessions).toHaveLength(6);
    expect(bundle.sessions[0].session_date).toBe('2026-11-17'); // Tuesday of week 1
    expect(bundle.sessions[1].session_date).toBe('2026-11-19'); // Thursday of week 1
  });
});
