import type { TacticBoardData, TacticPath } from '../types/domain';

function sortPathsByStep(paths: TacticPath[]): TacticPath[] {
  return paths
    .map((p, index) => ({ path: p, index }))
    .sort((a, b) => {
      const stepA = a.path.stepNumber ?? Number.MAX_SAFE_INTEGER;
      const stepB = b.path.stepNumber ?? Number.MAX_SAFE_INTEGER;
      if (stepA !== stepB) return stepA - stepB;
      return a.index - b.index;
    })
    .map((entry) => entry.path);
}

/**
 * Sorts paths by their stepNumber and assigns contiguous 1..N step numbers.
 */
export function renumberTacticPaths(paths: TacticPath[]): TacticPath[] {
  return sortPathsByStep(paths).map((path, index) => ({
    ...path,
    stepNumber: index + 1
  }));
}

/**
 * Moves a path earlier or later in the action sequence and renumbers 1..N.
 */
export function moveTacticPathOrder(
  paths: TacticPath[],
  pathId: string,
  direction: 'EARLIER' | 'LATER'
): TacticPath[] {
  const ordered = sortPathsByStep(paths);
  const idx = ordered.findIndex((p) => p.id === pathId);
  if (idx === -1) return paths;

  const targetIdx = direction === 'EARLIER' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= ordered.length) return paths;

  const swapped = [...ordered];
  const temp = swapped[idx];
  swapped[idx] = swapped[targetIdx];
  swapped[targetIdx] = temp;

  return swapped.map((path, index) => ({
    ...path,
    stepNumber: index + 1
  }));
}

/**
 * Updates a single path's stepNumber (allowing simultaneous steps or manual ordering)
 * and keeps the paths array sorted by stepNumber.
 */
export function setTacticPathStepNumber(
  paths: TacticPath[],
  pathId: string,
  stepNumber: number
): TacticPath[] {
  const clamped = Math.max(1, Math.round(stepNumber));
  const updated = paths.map((p) =>
    p.id === pathId ? { ...p, stepNumber: clamped } : p
  );
  return sortPathsByStep(updated);
}

/**
 * Returns true if path step numbers have gaps, duplicates, or missing values compared to 1..N.
 */
export function hasPathNumberingGaps(paths: TacticPath[]): boolean {
  if (paths.length === 0) return false;
  const ordered = sortPathsByStep(paths);
  return ordered.some((p, index) => p.stepNumber !== index + 1);
}

/**
 * Removes a path from the board, cleans up any orphaned WAYPOINT nodes,
 * and optionally renumbers remaining paths to 1..N.
 */
export function deleteTacticPath(
  board: TacticBoardData,
  pathId: string,
  autoRenumber = true
): TacticBoardData {
  const remainingPaths = board.paths.filter((p) => p.id !== pathId);
  const referencedWaypoints = new Set<string>();
  for (const p of remainingPaths) {
    if (p.fromWaypointId) referencedWaypoints.add(p.fromWaypointId);
    if (p.toWaypointId) referencedWaypoints.add(p.toWaypointId);
  }

  const remainingNodes = board.nodes.filter(
    (n) => n.type !== 'WAYPOINT' || referencedWaypoints.has(n.id)
  );

  return {
    ...board,
    nodes: remainingNodes,
    paths: autoRenumber ? renumberTacticPaths(remainingPaths) : remainingPaths
  };
}

/**
 * Computes shortest Euclidean distance from point P to line segment AB (normalized coordinates).
 */
export function distancePointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}
