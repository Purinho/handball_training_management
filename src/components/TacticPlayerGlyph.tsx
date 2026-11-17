import type { TacticNode } from '../types/domain';

interface TacticPlayerGlyphProps {
  node: TacticNode;
  isSelected?: boolean;
  scale?: number;
}

export function getDefaultNodeRotation(node: TacticNode): number {
  if (typeof node.rotation === 'number') return node.rotation;
  if (node.type === 'DEFENSE_PLAYER') return 180;
  return 0;
}

/**
 * Shared SVG glyph for Handball players (Offense = Triangle with filled tip,
 * Defense = Circle with filled directional segment, GK/Coach = Circle).
 * Labels remain upright regardless of node rotation.
 */
export function TacticPlayerGlyph({
  node,
  isSelected = false,
  scale = 1
}: TacticPlayerGlyphProps) {
  const isOffense = node.type === 'OFFENSE_PLAYER';
  const isDefense = node.type === 'DEFENSE_PLAYER';
  const isGK = node.type === 'GOALKEEPER';
  const isCoach = node.type === 'COACH_FEEDER';

  const rotation = getDefaultNodeRotation(node);
  const fill =
    node.color ??
    (isDefense
      ? '#991b1b'
      : isGK
        ? '#10b981'
        : isCoach
          ? '#8b5cf6'
          : '#1e3a8a');

  const accentTipFill = isDefense ? '#fca5a5' : '#60a5fa';

  return (
    <g transform={`scale(${scale})`}>
      {isSelected && (
        <circle
          r="23"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2.5"
          strokeDasharray="4 3"
        />
      )}

      {node.isQueue && (
        isOffense ? (
          <g transform={`rotate(${rotation})`}>
            <polygon
              points="0,-20 17,13 -17,13"
              transform="translate(-5, 5)"
              fill="none"
              stroke="#60a5fa"
              strokeWidth="2"
              opacity="0.65"
            />
            <polygon
              points="0,-20 17,13 -17,13"
              transform="translate(-2.5, 2.5)"
              fill="none"
              stroke="#ffffff"
              strokeWidth="1.5"
              opacity="0.85"
            />
          </g>
        ) : (
          <>
            <circle cx="-6" cy="6" r="16" fill="none" stroke={fill} strokeWidth="2.2" opacity="0.7" />
            <circle cx="-3" cy="3" r="16" fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.85" />
          </>
        )
      )}

      {isOffense ? (
        <g transform={`rotate(${rotation})`}>
          {/* Angreifer: Dreieck mit ausgefüllter Spitze in Blickrichtung */}
          <polygon
            points="0,-20 17,13 -17,13"
            fill={fill}
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <polygon
            points="0,-20 6.7,-7 -6.7,-7"
            fill={accentTipFill}
            stroke="#ffffff"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </g>
      ) : isDefense ? (
        <g transform={`rotate(${rotation})`}>
          {/* Verteidiger: Kreis mit kleiner ausgefüllter Fläche in Blickrichtung */}
          <circle
            r="16"
            fill={fill}
            stroke="#ffffff"
            strokeWidth="2.2"
          />
          <path
            d="M -10.3 -12.2 A 16 16 0 0 1 10.3 -12.2 Z"
            fill={accentTipFill}
            stroke="#ffffff"
            strokeWidth="1.2"
          />
        </g>
      ) : (
        <circle r="16" fill={fill} stroke="#ffffff" strokeWidth="2.5" />
      )}

      {/* Upright label */}
      <text
        textAnchor="middle"
        dy={isOffense ? '6' : '4'}
        fontSize={isOffense ? '10' : '11'}
        fontWeight="bold"
        fill="#ffffff"
      >
        {node.label ?? (isCoach ? 'T' : '')}
      </text>

      {node.hasBall && (
        <circle
          cx="14"
          cy="-12"
          r="5.5"
          fill="#f59e0b"
          stroke="#0f172a"
          strokeWidth="1.5"
        />
      )}

      {node.isQueue && node.queueCount && (
        <g transform="translate(-15, -14)">
          <rect
            x="-9"
            y="-7"
            width="20"
            height="14"
            rx="4"
            fill="#0f172a"
            stroke="#93c5fd"
            strokeWidth="1.2"
          />
          <text textAnchor="middle" x="1" dy="3" fontSize="9" fontWeight="bold" fill="#93c5fd">
            x{node.queueCount}
          </text>
        </g>
      )}
    </g>
  );
}
