import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CircleDot,
  Eraser,
  Layers,
  ListOrdered,
  MousePointer,
  MoveRight,
  RotateCcw,
  RotateCw,
  Shield,
  Sparkles,
  Trash2,
  UserPlus,
  Users
} from 'lucide-react';
import type {
  CourtTemplate,
  TacticBoardData,
  TacticNode,
  TacticPath,
  TacticPathType
} from '../types/domain';
import { buildTacticBoardPreset, TACTIC_PRESETS } from '../utils/tacticPresets';
import {
  deleteTacticPath,
  distancePointToSegment,
  hasPathNumberingGaps,
  moveTacticPathOrder,
  renumberTacticPaths,
  setTacticPathStepNumber
} from '../utils/tacticBoardUtils';
import { getDefaultNodeRotation, TacticPlayerGlyph } from './TacticPlayerGlyph';

type EditorTool =
  | 'SELECT_MOVE'
  | 'ROTATE'
  | 'STAMP_OFFENSE'
  | 'STAMP_DEFENSE'
  | 'STAMP_GK'
  | 'STAMP_COACH'
  | 'STAMP_CONE'
  | 'STAMP_MAT'
  | 'STAMP_TARGET'
  | 'DRAW_RUN'
  | 'DRAW_PASS'
  | 'DRAW_DRIBBLE'
  | 'DRAW_SHOT'
  | 'DRAW_SCREEN'
  | 'DRAW_FEINT';

interface TacticBoardEditorProps {
  value: TacticBoardData;
  onChange: (next: TacticBoardData) => void;
}

const OFFENSE_LABELS = ['RL', 'RM', 'RR', 'KM', 'LA', 'RA', 'A1', 'A2'];
const DEFENSE_LABELS = ['IL', 'IR', 'HL', 'HR', 'AL', 'AR', 'VM', 'HM'];

const PATH_TYPE_LABELS: Record<TacticPathType, string> = {
  RUN_PATH: 'Laufweg',
  PASS_PATH: 'Passweg',
  DRIBBLE_PATH: 'Prellen',
  SHOT_PATH: 'Torwurf',
  SCREEN_BLOCK_PATH: 'Sperre',
  FEINT_PATH: 'Täuschung'
};

export function TacticBoardEditor({ value, onChange }: TacticBoardEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeTool, setActiveTool] = useState<EditorTool>('SELECT_MOVE');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [rotatingNodeId, setRotatingNodeId] = useState<string | null>(null);

  // Active path drawing state
  const [drawingStart, setDrawingStart] = useState<{
    x: number;
    y: number;
    fromNodeId?: string;
    fromWaypointId?: string;
  } | null>(null);
  const [drawingCurrent, setDrawingCurrent] = useState<{ x: number; y: number } | null>(null);

  const width = 500;
  const height = 350;
  const template = value.courtTemplate ?? 'HALF_COURT_VERTICAL';

  const selectedNode = value.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedPath = value.paths.find((p) => p.id === selectedPathId) ?? null;
  const numberingHasGaps = hasPathNumberingGaps(value.paths);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if (e.key === 'Escape') {
        setSelectedNodeId(null);
        setSelectedPathId(null);
        setActiveTool('SELECT_MOVE');
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          e.preventDefault();
          handleDeleteSelectedNode();
        } else if (selectedPathId) {
          e.preventDefault();
          handleDeleteSelectedPath();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  function getNormalizedCoords(e: React.PointerEvent<SVGSVGElement>): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0.5, y: 0.5 };
    const rect = svg.getBoundingClientRect();
    const x = Math.min(0.96, Math.max(0.04, (e.clientX - rect.left) / rect.width));
    const y = Math.min(0.96, Math.max(0.04, (e.clientY - rect.top) / rect.height));
    return {
      x: Math.round(x * 1000) / 1000,
      y: Math.round(y * 1000) / 1000
    };
  }

  function findNearestSnapNode(x: number, y: number, maxDist = 0.065): TacticNode | undefined {
    let best: TacticNode | undefined;
    let bestDist = maxDist;
    for (const node of value.nodes) {
      const dist = Math.hypot(node.x - x, node.y - y);
      if (dist <= bestDist) {
        bestDist = dist;
        best = node;
      }
    }
    return best;
  }

  function findNearestPath(x: number, y: number, maxDist = 0.045): TacticPath | undefined {
    let best: TacticPath | undefined;
    let bestDist = maxDist;
    for (const path of value.paths) {
      if (path.points.length < 2) continue;
      // Check step badge position first
      const first = path.points[0];
      const last = path.points[path.points.length - 1];
      const badgeX = (first.x + last.x) / 2;
      const badgeY = (first.y + last.y) / 2 - 9 / height;
      const badgeDist = Math.hypot(x - badgeX, y - badgeY);
      if (badgeDist <= bestDist) {
        bestDist = badgeDist;
        best = path;
      }

      for (let i = 0; i < path.points.length - 1; i++) {
        const a = path.points[i];
        const b = path.points[i + 1];
        const segDist = distancePointToSegment(x, y, a.x, a.y, b.x, b.y);
        if (segDist <= bestDist) {
          bestDist = segDist;
          best = path;
        }
      }
    }
    return best;
  }

  function isPathTool(tool: EditorTool): boolean {
    return tool.startsWith('DRAW_');
  }

  function mapToolToPathType(tool: EditorTool): TacticPathType {
    switch (tool) {
      case 'DRAW_PASS':
        return 'PASS_PATH';
      case 'DRAW_DRIBBLE':
        return 'DRIBBLE_PATH';
      case 'DRAW_SHOT':
        return 'SHOT_PATH';
      case 'DRAW_SCREEN':
        return 'SCREEN_BLOCK_PATH';
      case 'DRAW_FEINT':
        return 'FEINT_PATH';
      case 'DRAW_RUN':
      default:
        return 'RUN_PATH';
    }
  }

  function isRotatableNode(node: TacticNode): boolean {
    return node.type === 'OFFENSE_PLAYER' || node.type === 'DEFENSE_PLAYER';
  }

  function getRotationHandleCoords(node: TacticNode): { hx: number; hy: number } {
    const rotRad = (getDefaultNodeRotation(node) * Math.PI) / 180;
    return {
      hx: node.x * width + Math.sin(rotRad) * 32,
      hy: node.y * height - Math.cos(rotRad) * 32
    };
  }

  function computeAngleFromNodeToCoords(
    node: TacticNode,
    coords: { x: number; y: number }
  ): number {
    const dx = (coords.x - node.x) * width;
    const dy = (coords.y - node.y) * height;
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return (Math.round(deg / 5) * 5) % 360;
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const coords = getNormalizedCoords(e);

    if (activeTool === 'SELECT_MOVE') {
      // Check rotation handle of currently selected player first
      if (selectedNode && isRotatableNode(selectedNode)) {
        const { hx, hy } = getRotationHandleCoords(selectedNode);
        const px = coords.x * width;
        const py = coords.y * height;
        if (Math.hypot(px - hx, py - hy) <= 13) {
          setRotatingNodeId(selectedNode.id);
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
      }

      const hitNode = findNearestSnapNode(coords.x, coords.y, 0.055);
      if (hitNode) {
        setSelectedNodeId(hitNode.id);
        setSelectedPathId(null);
        setDraggingNodeId(hitNode.id);
        e.currentTarget.setPointerCapture(e.pointerId);
      } else {
        const hitPath = findNearestPath(coords.x, coords.y, 0.045);
        setSelectedNodeId(null);
        setSelectedPathId(hitPath ? hitPath.id : null);
      }
      return;
    }

    if (activeTool === 'ROTATE') {
      const hitNode = findNearestSnapNode(coords.x, coords.y, 0.075);
      if (hitNode && isRotatableNode(hitNode)) {
        setSelectedNodeId(hitNode.id);
        setSelectedPathId(null);
        setRotatingNodeId(hitNode.id);
        e.currentTarget.setPointerCapture(e.pointerId);

        const distPx = Math.hypot((coords.x - hitNode.x) * width, (coords.y - hitNode.y) * height);
        const nextRotation =
          distPx < 8
            ? (getDefaultNodeRotation(hitNode) + 45) % 360
            : computeAngleFromNodeToCoords(hitNode, coords);

        onChange({
          ...value,
          nodes: value.nodes.map((n) =>
            n.id === hitNode.id ? { ...n, rotation: nextRotation } : n
          )
        });
      }
      return;
    }

    if (isPathTool(activeTool)) {
      const snapStart = findNearestSnapNode(coords.x, coords.y, 0.07);
      const startX = snapStart ? snapStart.x : coords.x;
      const startY = snapStart ? snapStart.y : coords.y;

      setDrawingStart({
        x: startX,
        y: startY,
        fromNodeId: snapStart && snapStart.type !== 'WAYPOINT' ? snapStart.id : undefined,
        fromWaypointId: snapStart && snapStart.type === 'WAYPOINT' ? snapStart.id : undefined
      });
      setDrawingCurrent({ x: startX, y: startY });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // Stamp Mode: Place player or equipment with 1 click/tap!
    const id = `node-${crypto.randomUUID().slice(0, 6)}`;
    let newNode: TacticNode | null = null;

    if (activeTool === 'STAMP_OFFENSE') {
      const offCount = value.nodes.filter((n) => n.type === 'OFFENSE_PLAYER').length;
      const label = OFFENSE_LABELS[offCount % OFFENSE_LABELS.length];
      newNode = {
        id,
        type: 'OFFENSE_PLAYER',
        label,
        x: coords.x,
        y: coords.y,
        hasBall: offCount === 0,
        rotation: 0
      };
    } else if (activeTool === 'STAMP_DEFENSE') {
      const defCount = value.nodes.filter((n) => n.type === 'DEFENSE_PLAYER').length;
      const label = DEFENSE_LABELS[defCount % DEFENSE_LABELS.length];
      newNode = {
        id,
        type: 'DEFENSE_PLAYER',
        label,
        x: coords.x,
        y: coords.y,
        rotation: 180
      };
    } else if (activeTool === 'STAMP_GK') {
      newNode = {
        id,
        type: 'GOALKEEPER',
        label: 'TW',
        x: coords.x,
        y: coords.y,
        color: '#10b981'
      };
    } else if (activeTool === 'STAMP_COACH') {
      newNode = {
        id,
        type: 'COACH_FEEDER',
        label: 'T',
        x: coords.x,
        y: coords.y,
        color: '#8b5cf6',
        hasBall: true
      };
    } else if (activeTool === 'STAMP_CONE') {
      newNode = {
        id,
        type: 'EQUIPMENT_CONE',
        x: coords.x,
        y: coords.y,
        color: '#facc15'
      };
    } else if (activeTool === 'STAMP_MAT') {
      newNode = {
        id,
        type: 'EQUIPMENT_MAT',
        x: coords.x,
        y: coords.y
      };
    } else if (activeTool === 'STAMP_TARGET') {
      newNode = {
        id,
        type: 'EQUIPMENT_GOAL_TARGET',
        x: coords.x,
        y: coords.y
      };
    }

    if (newNode) {
      onChange({
        ...value,
        nodes: [...value.nodes, newNode]
      });
      setSelectedNodeId(newNode.id);
    }
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (rotatingNodeId) {
      const targetNode = value.nodes.find((n) => n.id === rotatingNodeId);
      if (!targetNode) return;
      const coords = getNormalizedCoords(e);
      const distPx = Math.hypot(
        (coords.x - targetNode.x) * width,
        (coords.y - targetNode.y) * height
      );
      if (distPx >= 8) {
        const nextRotation = computeAngleFromNodeToCoords(targetNode, coords);
        onChange({
          ...value,
          nodes: value.nodes.map((n) =>
            n.id === rotatingNodeId ? { ...n, rotation: nextRotation } : n
          )
        });
      }
      return;
    }

    if (draggingNodeId && activeTool === 'SELECT_MOVE') {
      const coords = getNormalizedCoords(e);
      const nextNodes = value.nodes.map((n) =>
        n.id === draggingNodeId ? { ...n, x: coords.x, y: coords.y } : n
      );

      // Magnetic snapping: update connected path start/end points in real time!
      const nextPaths = value.paths.map((path) => {
        const pts = [...path.points];
        if (
          (path.fromNodeId === draggingNodeId || path.fromWaypointId === draggingNodeId) &&
          pts.length >= 1
        ) {
          pts[0] = { x: coords.x, y: coords.y };
        }
        if (
          (path.toNodeId === draggingNodeId || path.toWaypointId === draggingNodeId) &&
          pts.length >= 2
        ) {
          pts[pts.length - 1] = { x: coords.x, y: coords.y };
        }
        return { ...path, points: pts };
      });

      onChange({
        ...value,
        nodes: nextNodes,
        paths: nextPaths
      });
      return;
    }

    if (drawingStart && isPathTool(activeTool)) {
      const coords = getNormalizedCoords(e);
      setDrawingCurrent(coords);
    }
  }

  function handlePointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (rotatingNodeId) {
      setRotatingNodeId(null);
      return;
    }

    if (draggingNodeId) {
      setDraggingNodeId(null);
      return;
    }

    if (drawingStart && drawingCurrent && isPathTool(activeTool)) {
      const endCoords = getNormalizedCoords(e);
      const dist = Math.hypot(endCoords.x - drawingStart.x, endCoords.y - drawingStart.y);

      if (dist > 0.03) {
        const pathType = mapToolToPathType(activeTool);
        const snapEnd = findNearestSnapNode(endCoords.x, endCoords.y, 0.065);
        const finalEndX = snapEnd ? snapEnd.x : endCoords.x;
        const finalEndY = snapEnd ? snapEnd.y : endCoords.y;

        let toNodeId: string | undefined;
        let toWaypointId: string | undefined;
        const nextNodes = [...value.nodes];

        if (snapEnd) {
          if (snapEnd.type === 'WAYPOINT') {
            toWaypointId = snapEnd.id;
          } else {
            toNodeId = snapEnd.id;
          }
        } else if (
          pathType === 'RUN_PATH' ||
          pathType === 'DRIBBLE_PATH' ||
          pathType === 'FEINT_PATH'
        ) {
          // Automatically place a chainable WAYPOINT at the end of a run/dribble path
          const wpId = `wp-${crypto.randomUUID().slice(0, 6)}`;
          toWaypointId = wpId;
          nextNodes.push({
            id: wpId,
            type: 'WAYPOINT',
            x: finalEndX,
            y: finalEndY
          });
        }

        const newPath: TacticPath = {
          id: `path-${crypto.randomUUID().slice(0, 6)}`,
          type: pathType,
          stepNumber: value.paths.length + 1,
          fromNodeId: drawingStart.fromNodeId,
          fromWaypointId: drawingStart.fromWaypointId,
          toNodeId,
          toWaypointId,
          points: [
            { x: drawingStart.x, y: drawingStart.y },
            { x: finalEndX, y: finalEndY }
          ]
        };

        onChange({
          ...value,
          nodes: nextNodes,
          paths: [...value.paths, newPath]
        });
      }

      setDrawingStart(null);
      setDrawingCurrent(null);
    }
  }

  function handleApplyPreset(presetId: string) {
    if (!presetId) return;
    const presetData = buildTacticBoardPreset(presetId, template);
    onChange(presetData);
    setSelectedNodeId(null);
    setSelectedPathId(null);
  }

  function handleUpdateSelectedNode(patch: Partial<TacticNode>) {
    if (!selectedNodeId) return;
    onChange({
      ...value,
      nodes: value.nodes.map((n) => (n.id === selectedNodeId ? { ...n, ...patch } : n))
    });
  }

  function handleDeleteSelectedNode() {
    if (!selectedNodeId) return;
    const remainingPaths = value.paths.filter(
      (p) =>
        p.fromNodeId !== selectedNodeId &&
        p.toNodeId !== selectedNodeId &&
        p.fromWaypointId !== selectedNodeId &&
        p.toWaypointId !== selectedNodeId
    );
    onChange({
      ...value,
      nodes: value.nodes.filter((n) => n.id !== selectedNodeId),
      paths: renumberTacticPaths(remainingPaths)
    });
    setSelectedNodeId(null);
  }

  function handleUpdateSelectedPath(patch: Partial<TacticPath>) {
    if (!selectedPathId) return;
    onChange({
      ...value,
      paths: value.paths.map((p) => (p.id === selectedPathId ? { ...p, ...patch } : p))
    });
  }

  function handleSetSelectedPathStep(nextStep: number) {
    if (!selectedPathId || Number.isNaN(nextStep)) return;
    onChange({
      ...value,
      paths: setTacticPathStepNumber(value.paths, selectedPathId, nextStep)
    });
  }

  function handleMovePathOrder(pathId: string, direction: 'EARLIER' | 'LATER') {
    onChange({
      ...value,
      paths: moveTacticPathOrder(value.paths, pathId, direction)
    });
  }

  function handleRenumberAllPaths() {
    onChange({
      ...value,
      paths: renumberTacticPaths(value.paths)
    });
  }

  function handleDeleteSelectedPath() {
    if (!selectedPathId) return;
    onChange(deleteTacticPath(value, selectedPathId, true));
    setSelectedPathId(null);
  }

  function handleUndoLastPath() {
    if (value.paths.length === 0) return;
    const lastPath = value.paths[value.paths.length - 1];
    const nextBoard = deleteTacticPath(value, lastPath.id, true);
    if (selectedPathId === lastPath.id) {
      setSelectedPathId(null);
    }
    onChange(nextBoard);
  }

  function handleClearBoard() {
    onChange({
      version: 1,
      courtTemplate: template,
      nodes: [],
      paths: []
    });
    setSelectedNodeId(null);
    setSelectedPathId(null);
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
      {/* Top Bar: Spielfeld-Vorlage & 1-Klick-Formations-Presets */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={template}
            onChange={(e) =>
              onChange({ ...value, courtTemplate: e.target.value as CourtTemplate })
            }
            className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white"
          >
            <option value="HALF_COURT_VERTICAL">Spielfeld: Halbfeld (Standard)</option>
            <option value="GOAL_SECTOR_ZOOM">Spielfeld: Torraum- & 9m-Zoom</option>
            <option value="FULL_COURT">Spielfeld: Ganzfeld (Tempospiel)</option>
            <option value="FREE_SPACE">Spielfeld: Freifläche (Koordination)</option>
          </select>

          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <select
              value=""
              onChange={(e) => handleApplyPreset(e.target.value)}
              className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-2.5 py-1.5 text-xs font-semibold text-amber-200"
            >
              <option value="">⚡ 1-Klick Aufstellungs-Preset laden...</option>
              {TACTIC_PRESETS.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleUndoLastPath}
            disabled={value.paths.length === 0}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-40"
            title="Letzten Pfeil rückgängig machen"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Pfeil zurück
          </button>
          <button
            type="button"
            onClick={handleClearBoard}
            className="inline-flex items-center gap-1 rounded-lg bg-rose-950/60 border border-rose-700/40 px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-900/60"
          >
            <Eraser className="h-3.5 w-3.5" />
            Leeren
          </button>
        </div>
      </div>

      {/* Werkzeugleiste: Bewegen, Stempel-Modus (Spieler/Material) & Handball-Pfeile */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setActiveTool('SELECT_MOVE')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
            activeTool === 'SELECT_MOVE'
              ? 'bg-blue-600 text-white shadow'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <MousePointer className="h-3.5 w-3.5" />
          Bewegen / Auswählen
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('ROTATE')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
            activeTool === 'ROTATE'
              ? 'bg-cyan-600 text-white shadow'
              : 'bg-slate-800 text-cyan-300 hover:bg-slate-700'
          }`}
          title="Angreifer oder Verteidiger in Blickrichtung drehen"
        >
          <RotateCw className="h-3.5 w-3.5" />
          Drehen
        </button>

        {/* Stempel-Werkzeuge */}
        <button
          type="button"
          onClick={() => setActiveTool('STAMP_OFFENSE')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
            activeTool === 'STAMP_OFFENSE'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-blue-300 hover:bg-slate-700'
          }`}
        >
          <UserPlus className="h-3.5 w-3.5" />
          + Angreifer
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('STAMP_DEFENSE')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
            activeTool === 'STAMP_DEFENSE'
              ? 'bg-rose-600 text-white'
              : 'bg-slate-800 text-rose-300 hover:bg-slate-700'
          }`}
        >
          <Shield className="h-3.5 w-3.5" />
          + Abwehr
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('STAMP_GK')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
            activeTool === 'STAMP_GK'
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-800 text-emerald-300 hover:bg-slate-700'
          }`}
        >
          + TW
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('STAMP_COACH')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
            activeTool === 'STAMP_COACH'
              ? 'bg-purple-600 text-white'
              : 'bg-slate-800 text-purple-300 hover:bg-slate-700'
          }`}
        >
          + Trainer (T)
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('STAMP_CONE')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
            activeTool === 'STAMP_CONE'
              ? 'bg-amber-500 text-slate-950'
              : 'bg-slate-800 text-amber-300 hover:bg-slate-700'
          }`}
        >
          ▲ Hütchen
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('STAMP_MAT')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
            activeTool === 'STAMP_MAT'
              ? 'bg-sky-600 text-white'
              : 'bg-slate-800 text-sky-300 hover:bg-slate-700'
          }`}
        >
          ▬ Matte
        </button>

        {/* Handball-Pfeile */}
        <button
          type="button"
          onClick={() => setActiveTool('DRAW_RUN')}
          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
            activeTool === 'DRAW_RUN'
              ? 'bg-white text-slate-950'
              : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
          }`}
        >
          <MoveRight className="h-3.5 w-3.5" />
          Laufweg
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('DRAW_PASS')}
          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
            activeTool === 'DRAW_PASS'
              ? 'bg-sky-500 text-slate-950'
              : 'bg-slate-800 text-sky-300 hover:bg-slate-700'
          }`}
        >
          - - ► Passweg
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('DRAW_DRIBBLE')}
          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
            activeTool === 'DRAW_DRIBBLE'
              ? 'bg-indigo-500 text-white'
              : 'bg-slate-800 text-indigo-300 hover:bg-slate-700'
          }`}
        >
          ~~~► Prellen
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('DRAW_SHOT')}
          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
            activeTool === 'DRAW_SHOT'
              ? 'bg-amber-500 text-slate-950'
              : 'bg-slate-800 text-amber-300 hover:bg-slate-700'
          }`}
        >
          ══► Torwurf
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('DRAW_SCREEN')}
          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
            activeTool === 'DRAW_SCREEN'
              ? 'bg-amber-600 text-white'
              : 'bg-slate-800 text-amber-200 hover:bg-slate-700'
          }`}
        >
          ──┤ Sperre
        </button>
      </div>

      {/* Interaktive SVG-Zeichenfläche */}
      <div className="relative overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="h-auto w-full touch-none select-none cursor-crosshair"
        >
          <defs>
            <marker id="ed-arrow-white" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <polygon points="0 0, 7 3.5, 0 7" fill="#f8fafc" />
            </marker>
            <marker id="ed-arrow-blue" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <polygon points="0 0, 7 3.5, 0 7" fill="#60a5fa" />
            </marker>
            <marker id="ed-arrow-amber" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <polygon points="0 0, 7 3.5, 0 7" fill="#f59e0b" />
            </marker>
            <marker id="ed-screen-t" markerWidth="8" markerHeight="10" refX="4" refY="5" orient="auto">
              <line x1="4" y1="0" x2="4" y2="10" stroke="#f59e0b" strokeWidth="3" />
            </marker>
          </defs>

          {/* Court Background */}
          <rect x="0" y="0" width={width} height={height} fill="#0f2942" />
          <rect x="20" y="15" width={width - 40} height={height - 30} fill="#163b5c" stroke="#93c5fd" strokeWidth="2" />

          {template === 'HALF_COURT_VERTICAL' && (
            <>
              <path
                d="M 106 15 A 144 118 0 0 0 394 15 Z"
                fill="#1d4ed8"
                fillOpacity="0.45"
                stroke="#ffffff"
                strokeWidth="2.5"
              />
              <path
                d="M 50 15 A 200 168 0 0 0 450 15"
                fill="none"
                stroke="#93c5fd"
                strokeWidth="2"
                strokeDasharray="9 7"
              />
              <line x1="240" y1="60" x2="260" y2="60" stroke="#ffffff" strokeWidth="2" />
              <line x1="235" y1="98" x2="265" y2="98" stroke="#ffffff" strokeWidth="2.5" />
              <rect x="212" y="5" width="76" height="12" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
            </>
          )}

          {template === 'GOAL_SECTOR_ZOOM' && (
            <>
              <path
                d="M 56 15 A 194 168 0 0 0 444 15 Z"
                fill="#1d4ed8"
                fillOpacity="0.45"
                stroke="#ffffff"
                strokeWidth="2.5"
              />
              <path
                d="M 20 118 A 238 205 0 0 0 480 118"
                fill="none"
                stroke="#93c5fd"
                strokeWidth="2"
                strokeDasharray="9 7"
              />
              <rect x="194" y="4" width="112" height="13" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
            </>
          )}

          {template === 'FULL_COURT' && (
            <>
              <path d="M 150 15 A 100 68 0 0 0 350 15 Z" fill="#1d4ed8" fillOpacity="0.45" stroke="#ffffff" strokeWidth="2" />
              <line x1="20" y1={height / 2} x2={width - 20} y2={height / 2} stroke="#ffffff" strokeWidth="2" />
              <circle cx={width / 2} cy={height / 2} r="22" fill="none" stroke="#93c5fd" strokeWidth="1.5" />
              <path
                d={`M 150 ${height - 15} A 100 68 0 0 1 350 ${height - 15} Z`}
                fill="#1d4ed8"
                fillOpacity="0.45"
                stroke="#ffffff"
                strokeWidth="2"
              />
            </>
          )}

          {/* Existing Paths */}
          {value.paths.map((path) => {
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

            const markerEnd = isScreen
              ? 'url(#ed-screen-t)'
              : isShot
                ? 'url(#ed-arrow-amber)'
                : isPass
                  ? 'url(#ed-arrow-blue)'
                  : 'url(#ed-arrow-white)';

            const strokeColor = isShot || isScreen ? '#f59e0b' : isPass ? '#60a5fa' : '#f8fafc';
            const isSelectedPath = path.id === selectedPathId;

            return (
              <g key={path.id}>
                {isSelectedPath && (
                  <polyline
                    points={pts}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={isShot ? 9 : 7.5}
                    strokeOpacity="0.45"
                    strokeLinecap="round"
                  />
                )}
                <polyline
                  points={pts}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isShot ? 4 : 2.8}
                  strokeDasharray={isPass ? '7 5' : isDribble ? '3 3' : undefined}
                  markerEnd={markerEnd}
                />
                {path.stepNumber !== undefined && (
                  <g transform={`translate(${midX}, ${midY - 9})`}>
                    <circle
                      r={isSelectedPath ? 11 : 9}
                      fill={isSelectedPath ? '#0284c7' : '#0f172a'}
                      stroke={isSelectedPath ? '#bae6fd' : strokeColor}
                      strokeWidth={isSelectedPath ? 2 : 1.5}
                    />
                    <text textAnchor="middle" dy="3.5" fontSize="10" fontWeight="bold" fill="#ffffff">
                      {path.stepNumber}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Live Path Preview while dragging */}
          {drawingStart && drawingCurrent && (
            <line
              x1={drawingStart.x * width}
              y1={drawingStart.y * height}
              x2={drawingCurrent.x * width}
              y2={drawingCurrent.y * height}
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeDasharray="5 4"
            />
          )}

          {/* Nodes */}
          {value.nodes.map((node) => {
            const cx = node.x * width;
            const cy = node.y * height;
            const isSelected = node.id === selectedNodeId;

            if (node.type === 'WAYPOINT') {
              return (
                <g key={node.id} transform={`translate(${cx}, ${cy})`}>
                  <circle
                    r={isSelected ? 8 : 6}
                    fill="#f8fafc"
                    stroke="#38bdf8"
                    strokeWidth="2"
                  />
                  <title>Verketteter Wegpunkt (Hier weiteren Pfeil für Folgeaktion ansetzen)</title>
                </g>
              );
            }

            if (node.type === 'EQUIPMENT_CONE') {
              return (
                <g key={node.id} transform={`translate(${cx}, ${cy})`}>
                  {isSelected && (
                    <circle r="15" fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="3 2" />
                  )}
                  <polygon
                    points="0,-10 -9,8 9,8"
                    fill={node.color ?? '#facc15'}
                    stroke="#0f172a"
                    strokeWidth="1.5"
                  />
                </g>
              );
            }

            if (node.type === 'EQUIPMENT_MAT') {
              return (
                <g key={node.id} transform={`translate(${cx}, ${cy})`}>
                  <rect
                    x="-20"
                    y="-12"
                    width="40"
                    height="24"
                    rx="4"
                    fill="#0284c7"
                    stroke={isSelected ? '#facc15' : '#e0f2fe'}
                    strokeWidth="2"
                  />
                </g>
              );
            }

            if (node.type === 'EQUIPMENT_GOAL_TARGET') {
              return (
                <g key={node.id} transform={`translate(${cx}, ${cy})`}>
                  <rect
                    x="-11"
                    y="-7"
                    width="22"
                    height="14"
                    fill="none"
                    stroke="#facc15"
                    strokeWidth="3"
                  />
                </g>
              );
            }

            const showRotateHandle =
              isSelected &&
              isRotatableNode(node) &&
              (activeTool === 'SELECT_MOVE' || activeTool === 'ROTATE');
            const handleCoords = showRotateHandle ? getRotationHandleCoords(node) : null;

            return (
              <g key={node.id}>
                <g transform={`translate(${cx}, ${cy})`}>
                  <TacticPlayerGlyph node={node} isSelected={isSelected} />
                </g>
                {handleCoords && (
                  <g className="cursor-grab">
                    <line
                      x1={cx}
                      y1={cy}
                      x2={handleCoords.hx}
                      y2={handleCoords.hy}
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                      strokeDasharray="3 2"
                    />
                    <circle
                      cx={handleCoords.hx}
                      cy={handleCoords.hy}
                      r="6"
                      fill="#0ea5e9"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Knoten-Inspektor: Anstellreihe ((RL)), Ballbesitz, Beschriftung & Löschen */}
      {selectedNode ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-500/40 bg-blue-950/30 px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-blue-300">Ausgewähltes Element:</span>

            {selectedNode.type !== 'WAYPOINT' && selectedNode.type !== 'EQUIPMENT_CONE' && (
              <div className="flex items-center gap-1.5">
                <label className="text-slate-300">Kürzel:</label>
                <input
                  type="text"
                  maxLength={4}
                  value={selectedNode.label ?? ''}
                  onChange={(e) => handleUpdateSelectedNode({ label: e.target.value })}
                  className="w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-center font-bold text-white"
                />
              </div>
            )}

            {(selectedNode.type === 'OFFENSE_PLAYER' || selectedNode.type === 'COACH_FEEDER') && (
              <>
                <button
                  type="button"
                  onClick={() => handleUpdateSelectedNode({ hasBall: !selectedNode.hasBall })}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold ${
                    selectedNode.hasBall
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  <CircleDot className="h-3.5 w-3.5" />
                  {selectedNode.hasBall ? 'Hat Ball ✓' : 'Ball geben'}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleUpdateSelectedNode({
                      isQueue: !selectedNode.isQueue,
                      queueCount: selectedNode.queueCount ?? 3
                    })
                  }
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold ${
                    selectedNode.isQueue
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  {selectedNode.isQueue ? 'Anstellreihe (( )) ✓' : 'Als Anstellreihe'}
                </button>

                {selectedNode.isQueue && (
                  <div className="flex items-center gap-1">
                    <span className="text-slate-300">Spieler:</span>
                    <select
                      value={selectedNode.queueCount ?? 3}
                      onChange={(e) =>
                        handleUpdateSelectedNode({ queueCount: Number(e.target.value) })
                      }
                      className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-white"
                    >
                      {[2, 3, 4, 5, 6].map((cnt) => (
                        <option key={cnt} value={cnt}>
                          x{cnt}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            {isRotatableNode(selectedNode) && (
              <div className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-2 py-0.5">
                <span className="text-cyan-300">Blickrichtung:</span>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateSelectedNode({
                      rotation: (getDefaultNodeRotation(selectedNode) + 315) % 360
                    })
                  }
                  className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200 hover:bg-slate-700"
                  title="45° gegen den Uhrzeigersinn drehen"
                >
                  ↺ 45°
                </button>
                <span className="min-w-[32px] text-center font-mono font-bold text-white">
                  {getDefaultNodeRotation(selectedNode)}°
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateSelectedNode({
                      rotation: (getDefaultNodeRotation(selectedNode) + 45) % 360
                    })
                  }
                  className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200 hover:bg-slate-700"
                  title="45° im Uhrzeigersinn drehen"
                >
                  ↻ 45°
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateSelectedNode({
                      rotation: (getDefaultNodeRotation(selectedNode) + 180) % 360
                    })
                  }
                  className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200 hover:bg-slate-700"
                  title="Um 180° wenden"
                >
                  180°
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleDeleteSelectedNode}
            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 font-semibold text-white hover:bg-rose-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Element löschen
          </button>
        </div>
      ) : selectedPath ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/40 bg-sky-950/30 px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-sky-300">Ausgewählter Schritt:</span>

            <div className="flex items-center gap-1.5">
              <label className="text-slate-300">Nr.:</label>
              <input
                type="number"
                min={1}
                max={99}
                value={selectedPath.stepNumber ?? 1}
                onChange={(e) => handleSetSelectedPathStep(Number(e.target.value))}
                className="w-14 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-center font-bold text-white"
              />
              <button
                type="button"
                onClick={() => handleMovePathOrder(selectedPath.id, 'EARLIER')}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700"
                title="Schritt in der Reihenfolge vorziehen"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Früher
              </button>
              <button
                type="button"
                onClick={() => handleMovePathOrder(selectedPath.id, 'LATER')}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700"
                title="Schritt in der Reihenfolge nach hinten schieben"
              >
                Später
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-slate-300">Typ:</label>
              <select
                value={selectedPath.type}
                onChange={(e) =>
                  handleUpdateSelectedPath({ type: e.target.value as TacticPathType })
                }
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-white"
              >
                {(Object.keys(PATH_TYPE_LABELS) as TacticPathType[]).map((pt) => (
                  <option key={pt} value={pt}>
                    {PATH_TYPE_LABELS[pt]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDeleteSelectedPath}
            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 font-semibold text-white hover:bg-rose-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Pfeil löschen
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-blue-400" />
            Tipp: Pfeile rasten magnetisch an Spielern ein. Im „Bewegen / Auswählen“-Modus kannst du Spieler verschieben oder Pfeile/Nummern anklicken.
          </span>
          <span>
            {value.nodes.length} Elemente · {value.paths.length} Aktionen
          </span>
        </div>
      )}

      {/* Ablauf-Reihenfolge & Neu-Nummerierung */}
      {value.paths.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
              <ListOrdered className="h-3.5 w-3.5 text-sky-400" />
              Reihenfolge:
            </span>
            {value.paths.map((p) => {
              const isSelected = p.id === selectedPathId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setActiveTool('SELECT_MOVE');
                    setSelectedNodeId(null);
                    setSelectedPathId(p.id);
                  }}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                    isSelected
                      ? 'border-sky-400 bg-sky-600 text-white'
                      : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-950/80 text-[10px] font-bold text-white">
                    {p.stepNumber ?? '?'}
                  </span>
                  <span>{PATH_TYPE_LABELS[p.type]}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleRenumberAllPaths}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
              numberingHasGaps
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="Alle Aktions-Schritte lückenlos 1 bis N neu nummerieren"
          >
            <ListOrdered className="h-3.5 w-3.5" />
            1…{value.paths.length} neu nummerieren
          </button>
        </div>
      )}
    </div>
  );
}
