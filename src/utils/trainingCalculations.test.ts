import { describe, expect, it } from 'vitest';
import {
  aggregateSessionMaterials,
  calculateMinutesBetweenTimes,
  calculatePhaseEffectiveDuration,
  calculateSessionTotalDuration
} from './trainingCalculations';
import type { Exercise } from '../types/domain';

describe('trainingCalculations', () => {
  it('calculates parallel block duration using the longest track in the same slot', () => {
    const phase = { target_duration_min: 20 };
    const blocks = [
      { time_slot_index: 0, custom_duration_min: 15 }, // Track A (Goalkeepers)
      { time_slot_index: 0, custom_duration_min: 20 }, // Track B (Field players, parallel)
      { time_slot_index: 1, custom_duration_min: 10 }  // Sequential follow-up block for all
    ];

    // Slot 0 max is 20, Slot 1 is 10 -> Total 30 min
    expect(calculatePhaseEffectiveDuration(phase, blocks)).toBe(30);
  });

  it('falls back to phase target_duration_min when phase has no blocks', () => {
    expect(calculatePhaseEffectiveDuration({ target_duration_min: 15 }, [])).toBe(15);
  });

  it('calculates total session duration across multiple phases', () => {
    const phases = [
      { id: 'p1', target_duration_min: 15 },
      { id: 'p2', target_duration_min: 30 }
    ];
    const blocks = [
      { session_phase_id: 'p1', time_slot_index: 0, custom_duration_min: 15 },
      { session_phase_id: 'p2', time_slot_index: 0, custom_duration_min: 25 },
      { session_phase_id: 'p2', time_slot_index: 0, custom_duration_min: 20 }
    ];

    expect(calculateSessionTotalDuration(phases, blocks)).toBe(40);
  });

  it('aggregates materials by summing parallel tracks and taking peak across sequential slots', () => {
    const exMap = new Map<string, Pick<Exercise, 'materials'>>([
      [
        'ex-1',
        {
          materials: [
            { type: 'CONE', quantity: 6 },
            { type: 'BALL', quantity: 10 }
          ]
        }
      ],
      [
        'ex-2',
        {
          materials: [
            { type: 'CONE', quantity: 4 },
            { type: 'COORDINATION_LADDER', quantity: 1 }
          ]
        }
      ],
      [
        'ex-3',
        {
          materials: [{ type: 'CONE', quantity: 8 }]
        }
      ]
    ]);

    const blocks = [
      // Parallel in Phase 1, Slot 0 -> needs 6 + 4 = 10 cones simultaneously!
      { session_phase_id: 'p1', time_slot_index: 0, exercise_id: 'ex-1' },
      { session_phase_id: 'p1', time_slot_index: 0, exercise_id: 'ex-2' },
      // Sequential in Phase 2, Slot 0 -> needs 8 cones (reuses the 10 cones already out)
      { session_phase_id: 'p2', time_slot_index: 0, exercise_id: 'ex-3' }
    ];

    const result = aggregateSessionMaterials(blocks, exMap);
    const coneItem = result.find((m) => m.type === 'CONE');
    const ladderItem = result.find((m) => m.type === 'COORDINATION_LADDER');
    const ballItem = result.find((m) => m.type === 'BALL');

    expect(coneItem?.quantity).toBe(10);
    expect(ladderItem?.quantity).toBe(1);
    expect(ballItem?.quantity).toBe(10);
  });

  it('calculates minutes between start and end time strings', () => {
    expect(calculateMinutesBetweenTimes('18:30', '20:00')).toBe(90);
    expect(calculateMinutesBetweenTimes('19:00', '20:45')).toBe(105);
  });
});
