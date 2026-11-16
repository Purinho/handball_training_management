import type {
  Exercise,
  MaterialItem,
  MaterialType,
  SessionBlock,
  SessionPhase
} from '../types/domain';

/**
 * Calculates the effective duration of a single training phase.
 * Blocks sharing the same `time_slot_index` run in PARALLEL (so the maximum duration of that slot counts).
 * Sequential slots (different `time_slot_index`) are summed up.
 * If no blocks exist yet, falls back to the phase's `target_duration_min`.
 */
export function calculatePhaseEffectiveDuration(
  phase: Pick<SessionPhase, 'target_duration_min'>,
  blocksInPhase: Pick<SessionBlock, 'time_slot_index' | 'custom_duration_min'>[]
): number {
  if (blocksInPhase.length === 0) {
    return phase.target_duration_min;
  }

  const maxDurationBySlot = new Map<number, number>();
  for (const block of blocksInPhase) {
    const currentMax = maxDurationBySlot.get(block.time_slot_index) ?? 0;
    if (block.custom_duration_min > currentMax) {
      maxDurationBySlot.set(block.time_slot_index, block.custom_duration_min);
    }
  }

  let total = 0;
  for (const slotMax of maxDurationBySlot.values()) {
    total += slotMax;
  }
  return total;
}

/**
 * Calculates total planned minutes across all phases of a session.
 */
export function calculateSessionTotalDuration(
  phases: Pick<SessionPhase, 'id' | 'target_duration_min'>[],
  allBlocks: Pick<SessionBlock, 'session_phase_id' | 'time_slot_index' | 'custom_duration_min'>[]
): number {
  return phases.reduce((sum, phase) => {
    const blocksForPhase = allBlocks.filter((b) => b.session_phase_id === phase.id);
    return sum + calculatePhaseEffectiveDuration(phase, blocksForPhase);
  }, 0);
}

/**
 * Aggregates the required materials for a training session (Packing List for the equipment room).
 * - Within the same parallel time slot, materials of parallel exercises are summed (since both groups need cones/balls simultaneously).
 * - Across sequential phases/slots, the peak (maximum) needed quantity per material type is taken,
 *   because 10 cones used in Warmup can be reused in Main Part 1.
 * - Custom material overrides are merged on top.
 */
export function aggregateSessionMaterials(
  blocks: Pick<SessionBlock, 'session_phase_id' | 'time_slot_index' | 'exercise_id'>[],
  exercisesById: Map<string, Pick<Exercise, 'materials'>>,
  customOverrides: MaterialItem[] = []
): MaterialItem[] {
  // Group blocks by (phase_id + time_slot_index) to sum simultaneous needs
  const simultaneousSlots = new Map<string, MaterialItem[]>();

  for (const block of blocks) {
    if (!block.exercise_id) continue;
    const exercise = exercisesById.get(block.exercise_id);
    if (!exercise || !exercise.materials.length) continue;

    const slotKey = `${block.session_phase_id}__${block.time_slot_index}`;
    const existing = simultaneousSlots.get(slotKey) ?? [];
    simultaneousSlots.set(slotKey, [...existing, ...exercise.materials]);
  }

  // Peak required quantity across all time slots
  const peakByType = new Map<MaterialType, number>();

  for (const itemsInSlot of simultaneousSlots.values()) {
    const sumInSlot = new Map<MaterialType, number>();
    for (const item of itemsInSlot) {
      sumInSlot.set(item.type, (sumInSlot.get(item.type) ?? 0) + item.quantity);
    }
    for (const [type, slotTotal] of sumInSlot.entries()) {
      const currentPeak = peakByType.get(type) ?? 0;
      if (slotTotal > currentPeak) {
        peakByType.set(type, slotTotal);
      }
    }
  }

  // Apply custom overrides (if higher or additional)
  for (const override of customOverrides) {
    const current = peakByType.get(override.type) ?? 0;
    if (override.quantity > current) {
      peakByType.set(override.type, override.quantity);
    }
  }

  return Array.from(peakByType.entries()).map(([type, quantity]) => ({
    type,
    quantity
  }));
}

/**
 * Calculates duration in minutes between two HH:mm strings (e.g. "18:30" and "20:00" -> 90).
 */
export function calculateMinutesBetweenTimes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) {
    return 90;
  }
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : 90;
}
