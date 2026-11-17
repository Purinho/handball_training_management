import { describe, expect, it } from 'vitest';
import {
  deleteTacticPath,
  hasPathNumberingGaps,
  moveTacticPathOrder,
  renumberTacticPaths,
  setTacticPathStepNumber
} from './tacticBoardUtils';
import type { TacticBoardData, TacticPath } from '../types/domain';

describe('tacticBoardUtils', () => {
  const samplePaths: TacticPath[] = [
    { id: 'p1', type: 'RUN_PATH', stepNumber: 1, points: [{ x: 0.2, y: 0.5 }, { x: 0.3, y: 0.4 }] },
    { id: 'p2', type: 'PASS_PATH', stepNumber: 3, points: [{ x: 0.3, y: 0.4 }, { x: 0.6, y: 0.4 }] },
    { id: 'p3', type: 'SHOT_PATH', stepNumber: 5, points: [{ x: 0.6, y: 0.4 }, { x: 0.5, y: 0.1 }] }
  ];

  it('detects numbering gaps and renumbers paths contiguously 1..N', () => {
    expect(hasPathNumberingGaps(samplePaths)).toBe(true);
    const renumbered = renumberTacticPaths(samplePaths);
    expect(renumbered.map((p) => p.stepNumber)).toEqual([1, 2, 3]);
    expect(hasPathNumberingGaps(renumbered)).toBe(false);
  });

  it('moves a path earlier or later in the sequence and renumbers 1..N', () => {
    const moved = moveTacticPathOrder(samplePaths, 'p3', 'EARLIER');
    expect(moved.map((p) => p.id)).toEqual(['p1', 'p3', 'p2']);
    expect(moved.map((p) => p.stepNumber)).toEqual([1, 2, 3]);
  });

  it('allows setting a custom stepNumber and sorts paths accordingly', () => {
    const updated = setTacticPathStepNumber(samplePaths, 'p3', 2);
    expect(updated.map((p) => p.id)).toEqual(['p1', 'p3', 'p2']);
    expect(updated.find((p) => p.id === 'p3')?.stepNumber).toBe(2);
  });

  it('deletes a path, cleans up orphaned waypoints, and renumbers remaining paths', () => {
    const board: TacticBoardData = {
      version: 1,
      courtTemplate: 'HALF_COURT_VERTICAL',
      nodes: [
        { id: 'n1', type: 'OFFENSE_PLAYER', x: 0.2, y: 0.5 },
        { id: 'wp1', type: 'WAYPOINT', x: 0.3, y: 0.4 }
      ],
      paths: [
        {
          id: 'p1',
          type: 'RUN_PATH',
          stepNumber: 1,
          fromNodeId: 'n1',
          toWaypointId: 'wp1',
          points: [{ x: 0.2, y: 0.5 }, { x: 0.3, y: 0.4 }]
        },
        {
          id: 'p2',
          type: 'SHOT_PATH',
          stepNumber: 2,
          fromNodeId: 'n1',
          points: [{ x: 0.2, y: 0.5 }, { x: 0.5, y: 0.1 }]
        }
      ]
    };

    const next = deleteTacticPath(board, 'p1', true);
    expect(next.nodes.some((n) => n.id === 'wp1')).toBe(false);
    expect(next.paths).toHaveLength(1);
    expect(next.paths[0].id).toBe('p2');
    expect(next.paths[0].stepNumber).toBe(1);
  });
});
