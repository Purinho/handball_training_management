import { describe, expect, it } from 'vitest';
import { parseAndNormalizeAiExerciseJson } from './aiExerciseImport';
import { buildTacticBoardPreset } from './tacticPresets';

describe('aiExerciseImport & tacticPresets', () => {
  it('parses a single exercise wrapped in markdown code fences and normalizes tactic board coordinates', () => {
    const raw = `\`\`\`json
    {
      "title": "Kreuzen RM-RL mit Kreisanspiel",
      "default_duration_min": 20,
      "min_players": 6,
      "max_players": 12,
      "goalkeepers": 1,
      "categories": {
        "phases": ["GROUND_EXERCISE"],
        "focus": ["OFFENSE_GROUP"],
        "level": "ADVANCED"
      },
      "materials": [{ "type": "BALL", "quantity": 5 }],
      "setup_description": "Halbfeld",
      "flow_description": "RM zieht an und kreuzt für RL.",
      "coaching_points": "Tiefgang beachten",
      "tactic_board_data": {
        "nodes": [
          { "id": "n1", "type": "OFFENSE_PLAYER", "label": "RM", "x": 0.5, "y": 0.5, "hasBall": true }
        ],
        "paths": [
          { "id": "p1", "type": "RUN_PATH", "points": [{ "x": 0.5, "y": 0.5 }, { "x": 0.35, "y": 0.4 }] }
        ]
      }
    }
    \`\`\``;

    const result = parseAndNormalizeAiExerciseJson(raw, 'club-1', 'CLUB');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Kreuzen RM-RL mit Kreisanspiel');
    expect(result[0].tactic_board_data?.nodes).toHaveLength(1);
    expect(result[0].tactic_board_data?.paths[0].stepNumber).toBe(1);
  });

  it('builds complete handball tactic presets (e.g., 6:0 vs 3:3 and 3:2:1 defense)', () => {
    const board60 = buildTacticBoardPreset('COMBINED_6_0_VS_3_3');
    // 7 defense (incl. TW) + 6 offense = 13 nodes
    expect(board60.nodes).toHaveLength(13);

    const boardTriangle = buildTacticBoardPreset('OFFENSE_BACKCOURT_TRIANGLE');
    const rlNode = boardTriangle.nodes.find((n) => n.label === 'RL');
    expect(rlNode?.isQueue).toBe(true);
    expect(rlNode?.queueCount).toBe(3);
  });
});
