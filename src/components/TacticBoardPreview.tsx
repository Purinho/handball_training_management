import type { TacticBoardData } from '../types/domain';
import { TacticPlayerGlyph } from './TacticPlayerGlyph';

interface TacticBoardPreviewProps {
  data?: TacticBoardData;
  className?: string;
}

export function TacticBoardPreview({ data, className = '' }: TacticBoardPreviewProps) {
  if (!data) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900/70 p-6 text-xs text-slate-400 ${className}`}
      >
        Keine Taktikboard-Skizze hinterlegt
      </div>
    );
  }

  const width = 400;
  const height = 280;
  const template = data.courtTemplate ?? 'HALF_COURT_VERTICAL';

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900 shadow-inner ${className}`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full select-none">
        <defs>
          <marker id="arrow-white" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <polygon points="0 0, 7 3.5, 0 7" fill="#f8fafc" />
          </marker>
          <marker id="arrow-blue" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <polygon points="0 0, 7 3.5, 0 7" fill="#60a5fa" />
          </marker>
          <marker id="arrow-amber" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <polygon points="0 0, 7 3.5, 0 7" fill="#f59e0b" />
          </marker>
          <marker id="screen-t" markerWidth="8" markerHeight="10" refX="4" refY="5" orient="auto">
            <line x1="4" y1="0" x2="4" y2="10" stroke="#f59e0b" strokeWidth="3" />
          </marker>
        </defs>

        {/* Court Floor */}
        <rect x="0" y="0" width={width} height={height} fill="#0f2942" />
        <rect x="16" y="12" width={width - 32} height={height - 24} fill="#163b5c" stroke="#93c5fd" strokeWidth="2" />

        {/* Court Template markings */}
        {template === 'HALF_COURT_VERTICAL' && (
          <>
            <path
              d="M 85 12 A 115 95 0 0 0 315 12 Z"
              fill="#1d4ed8"
              fillOpacity="0.45"
              stroke="#ffffff"
              strokeWidth="2.5"
            />
            <path
              d="M 40 12 A 160 135 0 0 0 360 12"
              fill="none"
              stroke="#93c5fd"
              strokeWidth="2"
              strokeDasharray="8 6"
            />
            <line x1="192" y1="48" x2="208" y2="48" stroke="#ffffff" strokeWidth="2" />
            <line x1="188" y1="78" x2="212" y2="78" stroke="#ffffff" strokeWidth="2.5" />
            <rect x="170" y="4" width="60" height="10" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
          </>
        )}

        {template === 'GOAL_SECTOR_ZOOM' && (
          <>
            <path
              d="M 45 12 A 155 135 0 0 0 355 12 Z"
              fill="#1d4ed8"
              fillOpacity="0.45"
              stroke="#ffffff"
              strokeWidth="2.5"
            />
            <path
              d="M 16 95 A 190 165 0 0 0 384 95"
              fill="none"
              stroke="#93c5fd"
              strokeWidth="2"
              strokeDasharray="8 6"
            />
            <line x1="188" y1="62" x2="212" y2="62" stroke="#ffffff" strokeWidth="2" />
            <line x1="184" y1="102" x2="216" y2="102" stroke="#ffffff" strokeWidth="2.5" />
            <rect x="155" y="3" width="90" height="11" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
          </>
        )}

        {template === 'FULL_COURT' && (
          <>
            {/* Top Goal & 6m/9m */}
            <path d="M 120 12 A 80 55 0 0 0 280 12 Z" fill="#1d4ed8" fillOpacity="0.45" stroke="#ffffff" strokeWidth="2" />
            <path d="M 90 12 A 110 80 0 0 0 310 12" fill="none" stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="6 4" />
            <rect x="176" y="4" width="48" height="9" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
            {/* Center line */}
            <line x1="16" y1={height / 2} x2={width - 16} y2={height / 2} stroke="#ffffff" strokeWidth="2" />
            <circle cx={width / 2} cy={height / 2} r="18" fill="none" stroke="#93c5fd" strokeWidth="1.5" />
            {/* Bottom Goal & 6m/9m */}
            <path
              d={`M 120 ${height - 12} A 80 55 0 0 1 280 ${height - 12} Z`}
              fill="#1d4ed8"
              fillOpacity="0.45"
              stroke="#ffffff"
              strokeWidth="2"
            />
            <path
              d={`M 90 ${height - 12} A 110 80 0 0 1 310 ${height - 12}`}
              fill="none"
              stroke="#93c5fd"
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
            <rect x="176" y={height - 13} width="48" height="9" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
          </>
        )}

        {/* Paths */}
        {data.paths.map((path) => {
          if (path.points.length < 2) return null;
          const pts = path.points.map((p) => `${p.x * width},${p.y * height}`).join(' ');
          const first = path.points[0];
          const last = path.points[path.points.length - 1];
          const midX = ((first.x + last.x) / 2) * width;
          const midY = ((first.y + last.y) / 2) * height;

          const isPass = path.type === 'PASS_PATH';
          const isShot = path.type === 'SHOT_PATH';
          const isScreen = path.type === 'SCREEN_BLOCK_PATH';
          const isDribble = path.type === 'DRIBBLE_PATH';
          const isFeint = path.type === 'FEINT_PATH';

          const markerEnd = isScreen
            ? 'url(#screen-t)'
            : isShot || isFeint
              ? 'url(#arrow-amber)'
              : isPass
                ? 'url(#arrow-blue)'
                : 'url(#arrow-white)';

          const strokeColor =
            isShot || isScreen || isFeint ? '#f59e0b' : isPass ? '#60a5fa' : '#f8fafc';

          return (
            <g key={path.id}>
              <polyline
                points={pts}
                fill="none"
                stroke={strokeColor}
                strokeWidth={isShot ? 3.5 : 2.5}
                strokeDasharray={
                  isPass ? '6 4' : isDribble ? '3 3' : isFeint ? '2 4' : undefined
                }
                markerEnd={markerEnd}
              />
              {path.stepNumber !== undefined && (
                <g transform={`translate(${midX}, ${midY - 8})`}>
                  <circle r="8" fill="#0f172a" stroke={strokeColor} strokeWidth="1.5" />
                  <text textAnchor="middle" dy="3" fontSize="9" fontWeight="bold" fill="#ffffff">
                    {path.stepNumber}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {data.nodes.map((node) => {
          const cx = node.x * width;
          const cy = node.y * height;

          if (node.type === 'WAYPOINT') {
            return (
              <circle
                key={node.id}
                cx={cx}
                cy={cy}
                r="4.5"
                fill="#f8fafc"
                stroke="#0f172a"
                strokeWidth="1.5"
              />
            );
          }

          if (node.type === 'EQUIPMENT_CONE') {
            return (
              <polygon
                key={node.id}
                points={`${cx},${cy - 8} ${cx - 7},${cy + 6} ${cx + 7},${cy + 6}`}
                fill={node.color ?? '#facc15'}
                stroke="#0f172a"
                strokeWidth="1.5"
              />
            );
          }

          if (node.type === 'EQUIPMENT_MAT') {
            return (
              <rect
                key={node.id}
                x={cx - 16}
                y={cy - 10}
                width="32"
                height="20"
                rx="3"
                fill="#0284c7"
                stroke="#e0f2fe"
                strokeWidth="1.5"
              />
            );
          }

          if (node.type === 'EQUIPMENT_GOAL_TARGET') {
            return (
              <rect
                key={node.id}
                x={cx - 9}
                y={cy - 6}
                width="18"
                height="12"
                fill="none"
                stroke="#facc15"
                strokeWidth="2.5"
              />
            );
          }

          return (
            <g key={node.id} transform={`translate(${cx}, ${cy})`}>
              <TacticPlayerGlyph node={node} scale={0.85} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
