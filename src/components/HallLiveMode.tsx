import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  GitBranch,
  Maximize2,
  MessageSquarePlus,
  Package,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sun,
  Timer
} from 'lucide-react';
import { db, queueSyncOperation } from '../db/database';
import type {
  ClubMember,
  Exercise,
  MaterialType,
  SessionBlock,
  SessionNote,
  SessionPhase,
  Team,
  TrainingSession
} from '../types/domain';
import { MATERIAL_LABELS } from '../constants/handballLabels';
import { aggregateSessionMaterials } from '../utils/trainingCalculations';
import { TacticBoardPreview } from './TacticBoardPreview';
import { FullScreenChalkboardModal } from './FullScreenChalkboardModal';

interface HallLiveModeProps {
  activeTeam: Team;
  sessions: TrainingSession[];
  phases: SessionPhase[];
  blocks: SessionBlock[];
  exercises: Exercise[];
  members: ClubMember[];
  notes: SessionNote[];
  initialSessionId?: string;
}

function formatSeconds(totalSec: number): string {
  const abs = Math.max(0, totalSec);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function HallLiveMode({
  activeTeam,
  sessions,
  phases,
  blocks,
  exercises,
  members,
  notes,
  initialSessionId
}: HallLiveModeProps) {
  const teamSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.team_id === activeTeam.id)
        .sort((a, b) => a.session_date.localeCompare(b.session_date)),
    [sessions, activeTeam.id]
  );

  const [selectedSessionId, setSelectedSessionId] = useState<string>(initialSessionId ?? '');

  useEffect(() => {
    if (initialSessionId) {
      setSelectedSessionId(initialSessionId);
    }
  }, [initialSessionId]);

  const currentSession = useMemo(() => {
    if (selectedSessionId) {
      const found = teamSessions.find((s) => s.id === selectedSessionId);
      if (found) return found;
    }
    return teamSessions[0] ?? null;
  }, [teamSessions, selectedSessionId]);

  const currentPhases = useMemo(
    () =>
      currentSession
        ? phases
            .filter((p) => p.training_session_id === currentSession.id)
            .sort((a, b) => a.sort_order - b.sort_order)
        : [],
    [phases, currentSession]
  );

  const exercisesById = useMemo(
    () => new Map(exercises.map((ex) => [ex.id, ex])),
    [exercises]
  );

  // Ordered flat list of blocks across phases
  const orderedBlocksWithPhase = useMemo(() => {
    const list: { block: SessionBlock; phase: SessionPhase }[] = [];
    for (const phase of currentPhases) {
      const pBlocks = blocks
        .filter((b) => b.session_phase_id === phase.id)
        .sort((a, b) => a.time_slot_index - b.time_slot_index);
      for (const block of pBlocks) {
        list.push({ block, phase });
      }
    }
    return list;
  }, [currentPhases, blocks]);

  // "Meine Spur" filter for parallel coaching
  const [trackFilter, setTrackFilter] = useState<string>('ALL');
  const availableTracks = useMemo(() => {
    const set = new Set<string>();
    for (const item of orderedBlocksWithPhase) {
      if (item.block.track_label) {
        set.add(item.block.track_label);
      }
    }
    return Array.from(set);
  }, [orderedBlocksWithPhase]);

  const visibleBlocksWithPhase = useMemo(() => {
    if (trackFilter === 'ALL') return orderedBlocksWithPhase;
    return orderedBlocksWithPhase.filter(
      (item) =>
        item.block.track_label === trackFilter ||
        item.block.track_label.toLowerCase().includes('alle')
    );
  }, [orderedBlocksWithPhase, trackFilter]);

  const [activeIndex, setActiveIndex] = useState(0);
  const currentItem = visibleBlocksWithPhase[activeIndex] ?? visibleBlocksWithPhase[0] ?? null;
  const activeBlock = currentItem?.block ?? null;
  const activePhase = currentItem?.phase ?? null;
  const activeExercise = activeBlock?.exercise_id
    ? exercisesById.get(activeBlock.exercise_id)
    : undefined;

  // Packing list & checked state
  const [showPackingList, setShowPackingList] = useState(false);
  const [checkedMaterials, setCheckedMaterials] = useState<Set<MaterialType>>(new Set());
  const sessionPackingList = useMemo(() => {
    const allSessionBlocks = orderedBlocksWithPhase.map((x) => x.block);
    return aggregateSessionMaterials(
      allSessionBlocks,
      exercisesById,
      currentSession?.custom_materials_override ?? []
    );
  }, [orderedBlocksWithPhase, exercisesById, currentSession]);

  // Section Countdown Timer state
  const [remainingSeconds, setRemainingSeconds] = useState<number>(15 * 60);
  const [timerRunning, setTimerRunning] = useState<boolean>(false);

  // Interval Stopwatch state
  const [stopwatchSeconds, setStopwatchSeconds] = useState<number>(0);
  const [stopwatchRunning, setStopwatchRunning] = useState<boolean>(false);

  // Fullscreen Chalkboard modal state
  const [chalkboardOpen, setChalkboardOpen] = useState(false);

  // Quick-Swap panel state
  const [showQuickSwap, setShowQuickSwap] = useState(false);

  // Live Note input state
  const [liveNoteText, setLiveNoteText] = useState('');
  const [liveNoteAuthorId, setLiveNoteAuthorId] = useState<string>(members[0]?.id ?? '');

  // Wake Lock status
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Request Screen Wake Lock on mount
  useEffect(() => {
    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator && navigator.wakeLock) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          setWakeLockActive(true);
        }
      } catch {
        setWakeLockActive(false);
      }
    }
    void requestWakeLock();
    return () => {
      if (wakeLockRef.current) {
        void wakeLockRef.current.release();
      }
    };
  }, []);

  // Reset countdown timer whenever active block changes
  useEffect(() => {
    if (activeBlock) {
      setRemainingSeconds((activeBlock.custom_duration_min || 15) * 60);
      setTimerRunning(false);
      setShowQuickSwap(false);
    }
  }, [activeBlock?.id, activeBlock?.custom_duration_min]);

  // Countdown interval
  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  // Stopwatch interval
  useEffect(() => {
    if (!stopwatchRunning) return;
    const id = window.setInterval(() => {
      setStopwatchSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [stopwatchRunning]);

  // Quick-Swap candidate exercises (Variants first, then matching focus)
  const quickSwapCandidates = useMemo(() => {
    if (!activeExercise) return exercises;
    const rootId = activeExercise.parent_exercise_id ?? activeExercise.id;

    return exercises
      .filter((ex) => ex.id !== activeExercise.id)
      .sort((a, b) => {
        const aIsVariant = a.id === rootId || a.parent_exercise_id === rootId ? 1 : 0;
        const bIsVariant = b.id === rootId || b.parent_exercise_id === rootId ? 1 : 0;
        return bIsVariant - aIsVariant;
      });
  }, [activeExercise, exercises]);

  async function handleQuickSwapExercise(replacementExercise: Exercise) {
    if (!activeBlock) return;
    const updated: SessionBlock = {
      ...activeBlock,
      exercise_id: replacementExercise.id,
      quick_block_title: undefined,
      quick_block_description: undefined,
      custom_duration_min: replacementExercise.default_duration_min,
      updated_at: new Date().toISOString()
    };
    await db.sessionBlocks.put(updated);
    await queueSyncOperation('session_blocks', updated.id, 'UPSERT', updated);
    setShowQuickSwap(false);
  }

  async function handleAddLiveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!currentSession || !activeBlock || !liveNoteText.trim()) return;
    const author = members.find((m) => m.id === liveNoteAuthorId) ?? members[0];
    const now = new Date().toISOString();
    const note: SessionNote = {
      id: `note-${crypto.randomUUID().slice(0, 8)}`,
      training_session_id: currentSession.id,
      session_block_id: activeBlock.id,
      author_member_id: author?.id,
      author_name: author ? author.display_name.split(' (')[0] : 'Trainer',
      content: liveNoteText.trim(),
      created_at: now,
      updated_at: now
    };
    await db.sessionNotes.put(note);
    await queueSyncOperation('session_notes', note.id, 'UPSERT', note);
    setLiveNoteText('');
  }

  async function handleCompleteTrainingSession() {
    if (!currentSession) return;
    const updated: TrainingSession = {
      ...currentSession,
      status: 'COMPLETED',
      updated_at: new Date().toISOString()
    };
    await db.trainingSessions.put(updated);
    await queueSyncOperation('training_sessions', updated.id, 'UPSERT', updated);
  }

  function toggleMaterialChecked(type: MaterialType) {
    setCheckedMaterials((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  if (!currentSession) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-300">
        Keine Trainingseinheit für den Sporthallen-Modus ausgewählt.
      </div>
    );
  }

  const activeBlockNotes = activeBlock
    ? notes.filter((n) => n.session_block_id === activeBlock.id)
    : [];

  return (
    <div className="space-y-5">
      {/* Top Hall Control Header (High Contrast & Large Touch Targets >= 48px) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={currentSession.id}
              onChange={(e) => {
                setSelectedSessionId(e.target.value);
                setActiveIndex(0);
              }}
              className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm font-bold text-white"
            >
              {teamSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.session_date} ({s.start_time}–{s.end_time}) · {s.title}
                </option>
              ))}
            </select>

            <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3 py-1.5 text-xs font-semibold text-emerald-300">
              <Sun className="h-3.5 w-3.5" />
              {wakeLockActive ? 'Display-WakeLock aktiv' : 'Hallen-Modus aktiv'}
            </span>
          </div>

          {/* Quick Buttons: Material-Packliste, Meine Spur Filter & Training abschließen */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPackingList((prev) => !prev)}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                showPackingList
                  ? 'border-amber-500 bg-amber-500 text-slate-950'
                  : 'border-amber-500/40 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50'
              }`}
            >
              <Package className="h-4 w-4" />
              Geräteraum-Packliste ({checkedMaterials.size}/{sessionPackingList.length})
            </button>

            <div className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5">
              <Filter className="h-3.5 w-3.5 text-blue-400" />
              <select
                value={trackFilter}
                onChange={(e) => {
                  setTrackFilter(e.target.value);
                  setActiveIndex(0);
                }}
                className="bg-transparent text-xs font-bold text-white focus:outline-none"
              >
                <option value="ALL" className="bg-slate-900">
                  Spur: Alle Gruppen ({orderedBlocksWithPhase.length})
                </option>
                {availableTracks.map((tr) => (
                  <option key={tr} value={tr} className="bg-slate-900">
                    Meine Spur: {tr}
                  </option>
                ))}
              </select>
            </div>

            {currentSession.status !== 'COMPLETED' ? (
              <button
                type="button"
                onClick={() => void handleCompleteTrainingSession()}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
              >
                <CheckCircle2 className="h-4 w-4" />
                Training abschließen
              </button>
            ) : (
              <span className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-emerald-950 border border-emerald-500/40 px-3.5 py-2 text-xs font-bold text-emerald-300">
                ✓ Training durchgeführt
              </span>
            )}
          </div>
        </div>

        {/* Collapsible Equipment Room Packing Checklist */}
        {showPackingList && (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-slate-950 p-4">
            <div className="mb-2.5 text-xs font-bold text-amber-300 uppercase">
              Vor Trainingsbeginn aus dem Geräteraum holen (Antippen zum Abhaken):
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
              {sessionPackingList.map((item) => {
                const isChecked = checkedMaterials.has(item.type);
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => toggleMaterialChecked(item.type)}
                    className={`flex min-h-[48px] items-center justify-between rounded-xl border px-3.5 py-2 text-left text-xs font-semibold transition ${
                      isChecked
                        ? 'border-emerald-500/60 bg-emerald-950/40 text-emerald-300 line-through'
                        : 'border-slate-800 bg-slate-900 text-white hover:border-slate-700'
                    }`}
                  >
                    <span>{MATERIAL_LABELS[item.type]}</span>
                    <span className="rounded-lg bg-slate-800 px-2 py-0.5 font-bold text-amber-300">
                      {item.quantity}x
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Timer & Step Navigation Bar (Touch-Optimized >= 48px) */}
      {activeBlock && activePhase && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Countdown Timer for Active Block (8 Cols) */}
          <div
            className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 lg:col-span-8 ${
              remainingSeconds === 0
                ? 'border-rose-500 bg-rose-950/40'
                : timerRunning
                  ? 'border-emerald-500/70 bg-emerald-950/20'
                  : 'border-slate-800 bg-slate-900'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className="font-mono text-4xl font-black tracking-tight text-white sm:text-5xl">
                {formatSeconds(remainingSeconds)}
              </div>
              <div>
                <div className="text-xs font-bold text-blue-400 uppercase">
                  Abschnitt {activeIndex + 1} / {visibleBlocksWithPhase.length} · {activePhase.name}
                </div>
                <div className="text-sm font-bold text-white">
                  {activeBlock.track_label} ({activeBlock.custom_duration_min} Min geplant)
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTimerRunning((prev) => !prev)}
                className={`inline-flex min-h-[48px] items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-lg transition ${
                  timerRunning
                    ? 'bg-amber-600 hover:bg-amber-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {timerRunning ? (
                  <>
                    <Pause className="h-4 w-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Timer Start
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setRemainingSeconds((prev) => prev + 60)}
                className="min-h-[48px] rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-700"
              >
                +1 Min
              </button>

              <button
                type="button"
                onClick={() => setRemainingSeconds((prev) => prev + 120)}
                className="min-h-[48px] rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-700"
              >
                +2 Min
              </button>

              <button
                type="button"
                onClick={() => {
                  setTimerRunning(false);
                  setRemainingSeconds((activeBlock.custom_duration_min || 15) * 60);
                }}
                className="min-h-[48px] rounded-xl bg-slate-800 p-3 text-slate-300 hover:bg-slate-700"
                title="Timer zurücksetzen"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Interval Stopwatch & Prev/Next Block Step Controls (4 Cols) */}
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 lg:col-span-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-bold text-slate-300">Intervall-Stoppuhr:</span>
                <span className="font-mono text-lg font-black text-amber-300">
                  {formatSeconds(stopwatchSeconds)}
                </span>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setStopwatchRunning((prev) => !prev)}
                  className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-bold text-white hover:bg-slate-700"
                >
                  {stopwatchRunning ? 'Stopp' : 'Start'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStopwatchRunning(false);
                    setStopwatchSeconds(0);
                  }}
                  className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-400 hover:text-white"
                >
                  00:00
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={activeIndex <= 0}
                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                className="flex min-h-[48px] flex-1 items-center justify-center gap-1 rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                Vorherige
              </button>
              <button
                type="button"
                disabled={activeIndex >= visibleBlocksWithPhase.length - 1}
                onClick={() =>
                  setActiveIndex((i) => Math.min(visibleBlocksWithPhase.length - 1, i + 1))
                }
                className="flex min-h-[48px] flex-1 items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-40"
              >
                Nächste Übung
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Hall Split-View: Left TacticBoard + Fullscreen Chalkboard Trigger | Right Coaching Points, Quick-Swap & Live Notes */}
      {activeBlock && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left (7 Cols): Large TacticBoard & Fullscreen Chalkboard Button */}
          <div className="space-y-4 lg:col-span-7">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="rounded bg-blue-950 px-2.5 py-1 text-xs font-bold text-blue-300">
                    {activeBlock.track_label}
                  </span>
                  <h2 className="mt-1.5 text-xl font-black text-white lg:text-2xl">
                    {activeExercise
                      ? activeExercise.title
                      : activeBlock.quick_block_title ?? 'Freier Trainingsblock'}
                  </h2>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowQuickSwap((prev) => !prev)}
                    className="inline-flex min-h-[48px] items-center gap-1.5 rounded-xl border border-blue-500/40 bg-blue-950/50 px-3.5 py-2 text-xs font-bold text-blue-200 hover:bg-blue-900/60"
                  >
                    <RefreshCw className="h-4 w-4 text-blue-400" />
                    Übung tauschen (Quick-Swap)
                  </button>

                  <button
                    type="button"
                    onClick={() => setChalkboardOpen(true)}
                    className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-slate-950 shadow-lg shadow-amber-500/20 hover:bg-amber-400"
                  >
                    <Maximize2 className="h-4 w-4" />
                    Vollbild & Live-Zeichenstift
                  </button>
                </div>
              </div>

              {/* Quick-Swap Selection Sheet */}
              {showQuickSwap && (
                <div className="rounded-xl border border-blue-500/50 bg-slate-950 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-300 uppercase">
                      Spontan in der Halle tauschen (Varianten zuerst vorgeschlagen):
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowQuickSwap(false)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Schließen
                    </button>
                  </div>
                  <div className="grid max-h-60 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                    {quickSwapCandidates.map((cand) => {
                      const isVariant =
                        activeExercise &&
                        (cand.parent_exercise_id === activeExercise.id ||
                          activeExercise.parent_exercise_id === cand.id);
                      return (
                        <button
                          key={cand.id}
                          type="button"
                          onClick={() => void handleQuickSwapExercise(cand)}
                          className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900 p-3 text-left hover:border-blue-500"
                        >
                          <div>
                            {isVariant && (
                              <span className="mb-1 inline-flex items-center gap-1 rounded bg-blue-950 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                                <GitBranch className="h-3 w-3" />
                                Direkte Variante
                              </span>
                            )}
                            <div className="font-bold text-white text-xs">{cand.title}</div>
                          </div>
                          <div className="mt-1 text-[11px] text-slate-400">
                            {cand.default_duration_min} Min · {cand.min_players}–{cand.max_players}{' '}
                            Sp. + {cand.goalkeepers} TW
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Large TacticBoard / Reference Image */}
              <div
                onClick={() => setChalkboardOpen(true)}
                className="cursor-pointer transition hover:opacity-95"
                title="Antippen für Vollbild-Taktiktafel mit temporärem Live-Zeichenstift"
              >
                {activeExercise?.reference_image_data && !activeExercise.tactic_board_data ? (
                  <img
                    src={activeExercise.reference_image_data}
                    alt={activeExercise.title}
                    className="mx-auto max-h-96 rounded-xl border border-slate-700 object-contain"
                  />
                ) : (
                  <TacticBoardPreview data={activeExercise?.tactic_board_data} />
                )}
              </div>
            </div>
          </div>

          {/* Right (5 Cols): High-Contrast Coaching Points, Flow & Conflict-Free Live Notes */}
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-2xl border border-amber-500/30 bg-slate-900 p-5">
              <h3 className="text-xs font-bold tracking-wider text-amber-400 uppercase">
                Coaching-Punkte & Korrekturen (Hallen-Fokus)
              </h3>
              <p className="mt-2 text-base leading-relaxed font-medium text-white whitespace-pre-line">
                {activeExercise?.coaching_points ||
                  'Fokus auf hohes Tempo, saubere Passqualität und laute Absprache.'}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h3 className="text-xs font-bold tracking-wider text-blue-400 uppercase">
                Übungsablauf & Aufbau
              </h3>
              {activeExercise?.setup_description && (
                <p className="mt-2 text-xs text-slate-300 whitespace-pre-line">
                  <strong className="text-white">Aufbau:</strong> {activeExercise.setup_description}
                </p>
              )}
              <p className="mt-2 text-sm leading-relaxed text-slate-100 whitespace-pre-line">
                {activeExercise
                  ? activeExercise.flow_description
                  : activeBlock.quick_block_description || 'Freier Trainingsabschnitt'}
              </p>
            </div>

            {/* Conflict-Free Live Coach Notes */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase">
                <MessageSquarePlus className="h-4 w-4 text-emerald-400" />
                Live-Notizen aus der Sporthalle ({activeBlockNotes.length})
              </div>

              <div className="space-y-2">
                {activeBlockNotes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-200"
                  >
                    <div className="flex items-center justify-between text-[11px] text-amber-400 font-bold">
                      <span>{note.author_name}</span>
                      <span className="text-slate-500">
                        {new Date(note.created_at).toLocaleTimeString('de-DE', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="mt-1">{note.content}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddLiveNote} className="space-y-2 pt-1">
                <div className="flex gap-2">
                  <select
                    value={liveNoteAuthorId}
                    onChange={(e) => setLiveNoteAuthorId(e.target.value)}
                    className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name.split(' (')[0]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    required
                    placeholder="Notiz für nächstes Training erfassen..."
                    value={liveNoteText}
                    onChange={(e) => setLiveNoteText(e.target.value)}
                    className="min-h-[44px] flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full min-h-[44px] rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-500"
                >
                  Live-Notiz speichern (konfliktfrei pro Trainer)
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Timeline Strip of all Sections at Bottom */}
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900 p-3">
        {visibleBlocksWithPhase.map((item, idx) => {
          const isCurrent = idx === activeIndex;
          const ex = item.block.exercise_id ? exercisesById.get(item.block.exercise_id) : undefined;
          return (
            <button
              key={item.block.id}
              type="button"
              onClick={() => setActiveIndex(idx)}
              className={`min-w-[180px] shrink-0 rounded-xl border p-3 text-left transition ${
                isCurrent
                  ? 'border-blue-500 bg-blue-950/40'
                  : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="font-bold text-blue-400">#{idx + 1}</span>
                <span>
                  <Clock className="inline h-3 w-3 mr-0.5" />
                  {item.block.custom_duration_min}m
                </span>
              </div>
              <div className="mt-1 truncate text-xs font-bold text-white">
                {ex ? ex.title : item.block.quick_block_title ?? 'Block'}
              </div>
              <div className="mt-0.5 truncate text-[10px] text-slate-400">
                {item.block.track_label}
              </div>
            </button>
          );
        })}
      </div>

      <FullScreenChalkboardModal
        isOpen={chalkboardOpen}
        title={
          activeExercise
            ? activeExercise.title
            : activeBlock?.quick_block_title ?? 'Taktiktafel'
        }
        coachingPoints={activeExercise?.coaching_points}
        tacticBoardData={activeExercise?.tactic_board_data}
        referenceImageData={activeExercise?.reference_image_data}
        onClose={() => setChalkboardOpen(false)}
      />
    </div>
  );
}
