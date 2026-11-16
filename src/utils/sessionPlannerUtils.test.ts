import { describe, expect, it } from 'vitest';
import {
  buildSessionFromTemplate,
  cloneTrainingSessionBundle,
  convertQuickBlockToCatalogExercise
} from './sessionPlannerUtils';

describe('sessionPlannerUtils', () => {
  it('creates a session bundle from a template with default phases and exercise blocks', () => {
    const bundle = buildSessionFromTemplate({
      teamId: 'team-mb',
      sessionDate: '2026-11-19',
      startTime: '18:30',
      endTime: '20:00',
      title: 'Donnerstagstraining',
      template: {
        id: 'tpl-1',
        club_id: 'club-1',
        title: 'Standard 90',
        description: '',
        default_duration_min: 90,
        phases_template: [
          { name: 'Aufwärmen', target_duration_min: 15, default_exercise_id: 'ex-1' },
          { name: 'Hauptteil', target_duration_min: 45 }
        ],
        updated_at: new Date().toISOString()
      }
    });

    expect(bundle.session.planned_duration_min).toBe(90);
    expect(bundle.phases).toHaveLength(2);
    expect(bundle.blocks).toHaveLength(1);
    expect(bundle.blocks[0].exercise_id).toBe('ex-1');
  });

  it('clones an existing session bundle with new IDs while preserving phase/block links', () => {
    const original = buildSessionFromTemplate({
      teamId: 'team-mb',
      sessionDate: '2026-11-17',
      startTime: '18:30',
      endTime: '20:00',
      title: 'Dienstag'
    });

    const cloned = cloneTrainingSessionBundle({
      sourceSession: original.session,
      sourcePhases: original.phases,
      sourceBlocks: [
        {
          id: 'b-orig',
          session_phase_id: original.phases[0].id,
          quick_block_title: 'Sprint-Staffel',
          time_slot_index: 0,
          track_label: 'Alle',
          custom_duration_min: 15,
          updated_at: new Date().toISOString()
        }
      ],
      newDate: '2026-11-24',
      newTitle: 'Dienstag Nächste Woche'
    });

    expect(cloned.session.id).not.toBe(original.session.id);
    expect(cloned.session.session_date).toBe('2026-11-24');
    expect(cloned.phases).toHaveLength(5);
    expect(cloned.blocks).toHaveLength(1);
    expect(cloned.blocks[0].session_phase_id).toBe(cloned.phases[0].id);
  });

  it('converts a Quick-Block into a full catalog exercise and links the block', () => {
    const quickBlock = {
      id: 'block-quick-1',
      session_phase_id: 'phase-1',
      quick_block_title: '4gg4 Überzahl-Kontinuum',
      quick_block_description: 'Schnelles Weiterspielen bis zum freien Außen.',
      time_slot_index: 0,
      track_label: 'Alle Spieler',
      custom_duration_min: 20,
      updated_at: new Date().toISOString()
    };

    const { exercise, updatedBlock } = convertQuickBlockToCatalogExercise({
      block: quickBlock,
      clubId: 'club-1',
      teamId: 'team-mb',
      focusTags: ['OFFENSE_GROUP']
    });

    expect(exercise.title).toBe('4gg4 Überzahl-Kontinuum');
    expect(exercise.default_duration_min).toBe(20);
    expect(updatedBlock.exercise_id).toBe(exercise.id);
    expect(updatedBlock.quick_block_title).toBeUndefined();
  });
});
