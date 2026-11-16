import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BookOpen,
  Bot,
  Building2,
  CalendarRange,
  CheckCircle2,
  Clock,
  CopyPlus,
  Download,
  Edit3,
  ExternalLink as ExternalLinkIcon,
  GitBranch,
  Layers,
  LayoutDashboard,
  Package,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
  Wifi,
  WifiOff
} from 'lucide-react';
import { db, queueSyncOperation } from './db/database';
import { seedInitialDataIfEmpty } from './db/seedData';
import { ClubTeamManager } from './components/ClubTeamManager';
import { TacticBoardPreview } from './components/TacticBoardPreview';
import { PwaInstallGuideModal } from './components/PwaInstallGuideModal';
import { ExerciseEditorModal } from './components/ExerciseEditorModal';
import { AiExerciseImporterModal } from './components/AiExerciseImporterModal';
import {
  COMPLEXITY_LABELS,
  FOCUS_TAG_LABELS,
  MATERIAL_LABELS,
  PHASE_CATEGORY_LABELS,
  VISIBILITY_LABELS
} from './constants/handballLabels';
import {
  aggregateSessionMaterials,
  calculatePhaseEffectiveDuration,
  calculateSessionTotalDuration
} from './utils/trainingCalculations';
import type { Exercise, VisibilityLevel } from './types/domain';

type NavTab = 'DASHBOARD' | 'EXERCISES' | 'PLANS' | 'CLUB_ADMIN';

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('DASHBOARD');
  const [activeTeamId, setActiveTeamId] = useState<string>('team-mb');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);

  // Exercise filter & modal states (Milestone 2)
  const [searchQuery, setSearchQuery] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'ALL' | VisibilityLevel>('ALL');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [editorModalOpen, setEditorModalOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [variantParentExercise, setVariantParentExercise] = useState<Exercise | null>(null);
  const [aiImporterOpen, setAiImporterOpen] = useState(false);

  useEffect(() => {
    void seedInitialDataIfEmpty();
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const clubs = useLiveQuery(() => db.clubs.toArray(), []) ?? [];
  const teams = useLiveQuery(() => db.teams.toArray(), []) ?? [];
  const members = useLiveQuery(() => db.clubMembers.toArray(), []) ?? [];
  const teamMembers = useLiveQuery(() => db.teamMembers.toArray(), []) ?? [];
  const exercises = useLiveQuery(() => db.exercises.filter((e) => !e.is_deleted).toArray(), []) ?? [];
  const multiWeekPlans = useLiveQuery(() => db.multiWeekPlans.toArray(), []) ?? [];
  const planWeeks = useLiveQuery(() => db.planWeeks.toArray(), []) ?? [];
  const sessions = useLiveQuery(() => db.trainingSessions.toArray(), []) ?? [];
  const phases = useLiveQuery(() => db.sessionPhases.toArray(), []) ?? [];
  const blocks = useLiveQuery(() => db.sessionBlocks.toArray(), []) ?? [];
  const notes = useLiveQuery(() => db.sessionNotes.toArray(), []) ?? [];
  const pendingSyncCount = useLiveQuery(() => db.syncOutbox.where('synced').equals(0).count(), []) ?? 0;

  const activeClub = clubs[0];
  const activeTeam = useMemo(
    () => teams.find((t) => t.id === activeTeamId) ?? teams[0],
    [teams, activeTeamId]
  );

  const exercisesById = useMemo(() => {
    const map = new Map(exercises.map((ex) => [ex.id, ex]));
    return map;
  }, [exercises]);

  const filteredExercises = useMemo(() => {
    return exercises.filter((ex) => {
      if (visibilityFilter !== 'ALL' && ex.visibility !== visibilityFilter) {
        return false;
      }
      if (
        ex.visibility === 'TEAM' &&
        ex.owner_team_id &&
        activeTeam &&
        ex.owner_team_id !== activeTeam.id
      ) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        ex.title.toLowerCase().includes(q) ||
        ex.setup_description.toLowerCase().includes(q) ||
        ex.flow_description.toLowerCase().includes(q) ||
        ex.coaching_points.toLowerCase().includes(q)
      );
    });
  }, [exercises, visibilityFilter, searchQuery, activeTeam]);

  const activeExercise = useMemo(() => {
    if (selectedExerciseId && exercisesById.has(selectedExerciseId)) {
      return exercisesById.get(selectedExerciseId)!;
    }
    return filteredExercises[0] ?? null;
  }, [selectedExerciseId, exercisesById, filteredExercises]);

  const relatedVariants = useMemo(() => {
    if (!activeExercise) return [];
    const rootId = activeExercise.parent_exercise_id ?? activeExercise.id;
    return exercises.filter(
      (ex) =>
        ex.id !== activeExercise.id &&
        (ex.id === rootId || ex.parent_exercise_id === rootId)
    );
  }, [activeExercise, exercises]);

  const activeTeamSessions = useMemo(
    () => (activeTeam ? sessions.filter((s) => s.team_id === activeTeam.id) : []),
    [sessions, activeTeam]
  );

  const currentSession = activeTeamSessions[0];
  const currentSessionPhases = useMemo(
    () =>
      currentSession
        ? phases
            .filter((p) => p.training_session_id === currentSession.id)
            .sort((a, b) => a.sort_order - b.sort_order)
        : [],
    [phases, currentSession]
  );

  const currentSessionBlocks = useMemo(() => {
    const phaseIds = new Set(currentSessionPhases.map((p) => p.id));
    return blocks.filter((b) => phaseIds.has(b.session_phase_id));
  }, [blocks, currentSessionPhases]);

  const totalSessionDuration = useMemo(
    () => calculateSessionTotalDuration(currentSessionPhases, currentSessionBlocks),
    [currentSessionPhases, currentSessionBlocks]
  );

  const sessionPackingList = useMemo(
    () =>
      aggregateSessionMaterials(
        currentSessionBlocks,
        exercisesById,
        currentSession?.custom_materials_override ?? []
      ),
    [currentSessionBlocks, exercisesById, currentSession]
  );

  const activePlan = useMemo(
    () => (activeTeam ? multiWeekPlans.find((p) => p.team_id === activeTeam.id) : undefined),
    [multiWeekPlans, activeTeam]
  );

  const activePlanWeeks = useMemo(
    () =>
      activePlan
        ? planWeeks
            .filter((pw) => pw.multi_week_plan_id === activePlan.id)
            .sort((a, b) => a.week_number - b.week_number)
        : [],
    [planWeeks, activePlan]
  );

  async function handleSaveExercise(exercise: Exercise) {
    await db.exercises.put(exercise);
    await queueSyncOperation('exercises', exercise.id, 'UPSERT', exercise);
    setSelectedExerciseId(exercise.id);
  }

  async function handleImportAiExercises(importedList: Exercise[]) {
    await db.exercises.bulkPut(importedList);
    for (const ex of importedList) {
      await queueSyncOperation('exercises', ex.id, 'UPSERT', ex);
    }
    if (importedList[0]) {
      setSelectedExerciseId(importedList[0].id);
    }
  }

  async function handleDeleteExercise(ex: Exercise) {
    const updated: Exercise = {
      ...ex,
      is_deleted: true,
      updated_at: new Date().toISOString()
    };
    await db.exercises.put(updated);
    await queueSyncOperation('exercises', updated.id, 'DELETE', updated);
    if (selectedExerciseId === ex.id) {
      setSelectedExerciseId(null);
    }
  }

  if (!activeClub || !activeTeam) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        Initialisiere lokale Offline-Datenbank...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 lg:flex-row">
      {/* Linke Navigation (Desktop & Tablet Querformat) */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-800/90 bg-slate-900/90 p-5 lg:flex">
        <div className="flex items-center gap-3 pb-5 border-b border-slate-800">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 font-black text-white shadow-md shadow-blue-600/30">
            HB
          </div>
          <div>
            <div className="text-sm font-bold text-white leading-tight">{activeClub.name}</div>
            <div className="text-[11px] text-blue-400 font-medium">Offline-First Vereins-PWA</div>
          </div>
        </div>

        {/* Mannschafts-Umschalter */}
        <div className="mt-5">
          <label className="mb-1.5 block text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Aktive Mannschaft
          </label>
          <select
            value={activeTeam.id}
            onChange={(e) => setActiveTeamId(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white focus:border-blue-500 focus:outline-none"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.season})
              </option>
            ))}
          </select>
        </div>

        {/* Hauptnavigation */}
        <nav className="mt-6 flex-1 space-y-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('DASHBOARD')}
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
              activeTab === 'DASHBOARD'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-300 hover:bg-slate-800/70'
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard & Trainingstag
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('EXERCISES')}
            className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
              activeTab === 'EXERCISES'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-300 hover:bg-slate-800/70'
            }`}
          >
            <span className="flex items-center gap-3">
              <BookOpen className="h-4 w-4" />
              Übungsdatenbank
            </span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-200">
              {exercises.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PLANS')}
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
              activeTab === 'PLANS'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-300 hover:bg-slate-800/70'
            }`}
          >
            <CalendarRange className="h-4 w-4" />
            Mehrwochenplan (Mesozyklus)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('CLUB_ADMIN')}
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
              activeTab === 'CLUB_ADMIN'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-300 hover:bg-slate-800/70'
            }`}
          >
            <Building2 className="h-4 w-4" />
            Verein, Teams & Trainer
          </button>
        </nav>

        {/* Offline / Sync Status & Store-freie PWA Hilfe */}
        <div className="mt-6 space-y-3 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs">
            <span className="flex items-center gap-2 font-medium">
              {isOnline ? (
                <>
                  <Wifi className="h-4 w-4 text-emerald-400" />
                  <span className="text-emerald-300">Offline-DB bereit (Online)</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-amber-400" />
                  <span className="text-amber-300">Hallen-Offline-Modus aktiv</span>
                </>
              )}
            </span>
            {pendingSyncCount > 0 && (
              <span className="rounded bg-blue-950 px-1.5 py-0.5 text-[10px] text-blue-300">
                {pendingSyncCount} Outbox
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowInstallModal(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500/40 bg-blue-950/40 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-900/50"
          >
            <Download className="h-3.5 w-3.5" />
            Ohne App Store installieren
          </button>
        </div>
      </aside>

      {/* Hauptinhalt */}
      <div className="flex flex-1 flex-col pb-20 lg:pb-0">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/90 bg-slate-900/90 px-4 py-3 backdrop-blur-md lg:px-8">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-blue-600/20 px-2.5 py-1 text-xs font-bold text-blue-400">
              {activeTeam.name}
            </span>
            <span className="hidden text-xs text-slate-400 sm:inline">
              {activeTeam.age_group} · Saison {activeTeam.season}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={activeTeam.id}
              onChange={(e) => setActiveTeamId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white lg:hidden"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                setEditingExercise(null);
                setVariantParentExercise(null);
                setEditorModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
            >
              <Plus className="h-3.5 w-3.5" />
              Neue Übung
            </button>

            <button
              type="button"
              onClick={() => setAiImporterOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-950/50 px-3 py-1.5 text-xs font-semibold text-purple-200 hover:bg-purple-900/60"
            >
              <Bot className="h-3.5 w-3.5 text-purple-400" />
              <span className="hidden sm:inline">KI-JSON Import</span>
            </button>

            <button
              type="button"
              onClick={() => setShowInstallModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5 text-blue-400" />
              <span className="hidden md:inline">Installieren</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 lg:p-8">
          {/* TAB 1: DASHBOARD & AKTUELLER TRAININGSTAG */}
          {activeTab === 'DASHBOARD' && (
            <div className="space-y-6">
              {activePlan && activePlanWeeks[1] && (
                <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/50 via-slate-900 to-slate-900 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-emerald-400 uppercase">
                        <Sparkles className="h-4 w-4" />
                        Aktueller Wochen-Schwerpunkt ({activePlan.title})
                      </div>
                      <h2 className="mt-1 text-lg font-bold text-white">
                        {activePlanWeeks[1].focus_theme}
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-300">{activePlanWeeks[1].notes}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {activePlanWeeks[1].focus_tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-emerald-500/40 bg-emerald-950/70 px-3 py-1 text-xs font-medium text-emerald-300"
                        >
                          #{FOCUS_TAG_LABELS[tag]}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {currentSession ? (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <div className="space-y-4 lg:col-span-8">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                        <div>
                          <div className="flex items-center gap-2 text-xs text-blue-400 font-semibold">
                            <span>Trainingseinheit · {currentSession.session_date}</span>
                            <span>
                              ({currentSession.start_time}–{currentSession.end_time} Uhr)
                            </span>
                          </div>
                          <h3 className="mt-0.5 text-xl font-bold text-white">
                            {currentSession.title}
                          </h3>
                        </div>

                        <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2">
                          <Clock className="h-4 w-4 text-emerald-400" />
                          <div className="text-xs">
                            <div className="text-slate-400">Geplante Zeit</div>
                            <div className="font-bold text-white">
                              {totalSessionDuration} / {currentSession.planned_duration_min} Min
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 space-y-4">
                        {currentSessionPhases.map((phase) => {
                          const blocksInPhase = currentSessionBlocks.filter(
                            (b) => b.session_phase_id === phase.id
                          );
                          const effectiveMin = calculatePhaseEffectiveDuration(
                            phase,
                            blocksInPhase
                          );
                          const isParallel = blocksInPhase.length > 1;

                          return (
                            <div
                              key={phase.id}
                              className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"
                            >
                              <div className="mb-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-white text-sm">{phase.name}</span>
                                  {isParallel && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/80 border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                                      <Layers className="h-3 w-3" />
                                      Parallele Spuren (Längste Spur zählt)
                                    </span>
                                  )}
                                </div>
                                <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-blue-300">
                                  {effectiveMin} Min
                                </span>
                              </div>

                              <div
                                className={`grid gap-3 ${
                                  isParallel ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
                                }`}
                              >
                                {blocksInPhase.map((block) => {
                                  const linkedEx = block.exercise_id
                                    ? exercisesById.get(block.exercise_id)
                                    : undefined;
                                  const coach = members.find(
                                    (m) => m.id === block.assigned_member_id
                                  );
                                  const blockNotes = notes.filter(
                                    (n) => n.session_block_id === block.id
                                  );

                                  return (
                                    <div
                                      key={block.id}
                                      className="rounded-xl border border-slate-800/90 bg-slate-900 p-3.5"
                                    >
                                      <div className="flex items-center justify-between gap-2 text-[11px]">
                                        <span className="rounded bg-blue-950/90 px-2 py-0.5 font-semibold text-blue-300">
                                          {block.track_label}
                                        </span>
                                        <span className="text-slate-400">
                                          {block.custom_duration_min} Min ·{' '}
                                          {coach
                                            ? coach.display_name.split(' (')[0]
                                            : 'Trainerteam'}
                                        </span>
                                      </div>

                                      <div className="mt-2 font-bold text-white text-sm">
                                        {linkedEx
                                          ? linkedEx.title
                                          : block.quick_block_title ?? 'Freier Trainingsblock'}
                                      </div>

                                      <p className="mt-1 text-xs text-slate-300 line-clamp-2">
                                        {linkedEx
                                          ? linkedEx.flow_description
                                          : block.quick_block_description}
                                      </p>

                                      {blockNotes.length > 0 && (
                                        <div className="mt-2.5 space-y-1 border-t border-slate-800 pt-2">
                                          {blockNotes.map((note) => (
                                            <div
                                              key={note.id}
                                              className="rounded-lg bg-slate-950/90 px-2.5 py-1.5 text-[11px] text-amber-200/90"
                                            >
                                              <strong className="text-amber-400">
                                                {note.author_name}:
                                              </strong>{' '}
                                              {note.content}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6 lg:col-span-4">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
                      <div className="flex items-center gap-2 text-amber-400">
                        <Package className="h-5 w-5" />
                        <h3 className="text-base font-bold text-white">
                          Material-Packliste (Geräteraum)
                        </h3>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Automatisch berechnet aus den Phasen & parallelen Spuren dieser Einheit:
                      </p>

                      <div className="mt-4 space-y-2">
                        {sessionPackingList.map((item) => (
                          <div
                            key={item.type}
                            className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm"
                          >
                            <span className="flex items-center gap-2 text-slate-200">
                              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                              {MATERIAL_LABELS[item.type]}
                            </span>
                            <span className="rounded-lg bg-blue-950 px-2.5 py-0.5 font-bold text-blue-300 text-xs">
                              {item.quantity}x
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
                      <div className="flex items-center gap-2 text-blue-400">
                        <Users className="h-5 w-5" />
                        <h3 className="text-base font-bold text-white">
                          Feste Hallenzeiten ({activeTeam.name})
                        </h3>
                      </div>
                      <div className="mt-3 space-y-2">
                        {activeTeam.default_schedule.map((slot) => (
                          <div
                            key={slot.id}
                            className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs"
                          >
                            <span className="font-semibold text-white">{slot.weekdayLabel}</span>
                            <span className="text-slate-300">
                              {slot.startTime}–{slot.endTime} Uhr
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
                  <p className="text-sm text-slate-300">
                    Für <strong>{activeTeam.name}</strong> ist aktuell noch keine Trainingseinheit angelegt.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ÜBUNGSDATENBANK, TAKTIKBOARD & KI-IMPORT */}
          {activeTab === 'EXERCISES' && (
            <div className="space-y-6">
              {/* Top Action Bar in Exercise Catalog */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Vereins- & Team-Übungsdatenbank ({filteredExercises.length})
                  </h2>
                  <p className="text-xs text-slate-400">
                    Erstelle eigene Übungen mit Taktikboard, füge Web-Zeichnungen per Strg+V ein oder importiere per KI-JSON.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setAiImporterOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-purple-500/40 bg-purple-950/50 px-3.5 py-2 text-xs font-semibold text-purple-200 hover:bg-purple-900/60"
                  >
                    <Bot className="h-4 w-4 text-purple-400" />
                    KI-JSON Import & Prompt-Generator
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingExercise(null);
                      setVariantParentExercise(null);
                      setEditorModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-500"
                  >
                    <Plus className="h-4 w-4" />
                    Neue Übung & Taktik-Skizze
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Linke Liste (5 Cols) */}
                <div className="space-y-4 lg:col-span-5">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Übung, Schwerpunkt oder Coaching-Punkt suchen..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pr-3 pl-9 text-xs text-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {(['ALL', 'CLUB', 'TEAM'] as const).map((vis) => (
                        <button
                          key={vis}
                          type="button"
                          onClick={() => setVisibilityFilter(vis)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                            visibilityFilter === vis
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {vis === 'ALL'
                            ? 'Alle Sichtbarkeiten'
                            : vis === 'CLUB'
                              ? 'Vereins-Pool (CLUB)'
                              : 'Nur mein Team (TEAM)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {filteredExercises.map((ex) => {
                      const isSelected = activeExercise?.id === ex.id;
                      return (
                        <button
                          key={ex.id}
                          type="button"
                          onClick={() => setSelectedExerciseId(ex.id)}
                          className={`w-full rounded-xl border p-4 text-left transition ${
                            isSelected
                              ? 'border-blue-500 bg-blue-950/30 shadow-md'
                              : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span
                              className={`rounded px-2 py-0.5 font-semibold ${
                                ex.visibility === 'CLUB'
                                  ? 'bg-emerald-950 text-emerald-300'
                                  : 'bg-amber-950 text-amber-300'
                              }`}
                            >
                              {VISIBILITY_LABELS[ex.visibility]}
                            </span>
                            <span className="text-slate-400">
                              {ex.default_duration_min} Min · {ex.min_players}–{ex.max_players} Sp.
                            </span>
                          </div>

                          <div className="mt-1.5 font-bold text-white text-sm">{ex.title}</div>

                          {ex.parent_exercise_id && (
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-blue-400">
                              <GitBranch className="h-3 w-3" />
                              Variante einer Grundübung
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Rechte Detailansicht inkl. Taktikboard, Varianten & Aktionen (7 Cols) */}
                <div className="lg:col-span-7">
                  {activeExercise ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 space-y-5">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
                        <div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="rounded bg-blue-950 px-2.5 py-0.5 font-semibold text-blue-300">
                              {COMPLEXITY_LABELS[activeExercise.categories.level]}
                            </span>
                            <span className="text-slate-400">
                              Empfohlene Dauer: {activeExercise.default_duration_min} Min ·{' '}
                              {activeExercise.min_players}–{activeExercise.max_players} Feldspieler +{' '}
                              {activeExercise.goalkeepers} TW
                            </span>
                          </div>
                          <h2 className="mt-1.5 text-xl font-bold text-white">
                            {activeExercise.title}
                          </h2>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingExercise(activeExercise);
                              setVariantParentExercise(null);
                              setEditorModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                          >
                            <Edit3 className="h-3.5 w-3.5 text-blue-400" />
                            Bearbeiten
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingExercise(null);
                              setVariantParentExercise(activeExercise);
                              setEditorModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/40 bg-blue-950/40 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-900/50"
                          >
                            <CopyPlus className="h-3.5 w-3.5" />
                            Als Variante duplizieren
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteExercise(activeExercise)}
                            className="rounded-xl bg-rose-950/60 p-1.5 text-rose-300 hover:bg-rose-900"
                            title="Übung löschen"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Verknüpfte Varianten / Basis-Übung */}
                      {relatedVariants.length > 0 && (
                        <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-3">
                          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-blue-300">
                            <GitBranch className="h-3.5 w-3.5" />
                            Verknüpfte Grundübung / Varianten ({relatedVariants.length}):
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {relatedVariants.map((rel) => (
                              <button
                                key={rel.id}
                                type="button"
                                onClick={() => setSelectedExerciseId(rel.id)}
                                className="rounded-lg border border-blue-500/40 bg-slate-900 px-2.5 py-1 text-xs font-medium text-blue-200 hover:bg-blue-950"
                              >
                                ↳ {rel.title}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Vektor-Taktikboard & Eingefügte Web-Zeichnung (Strg+V) */}
                      <div className="space-y-4">
                        <div>
                          <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                            <span className="font-semibold text-slate-200 uppercase">
                              Handball-Taktikboard (Vektor-Skizze)
                            </span>
                            <span>
                              Blau = Angriff · Rot = Abwehr · Grün = TW · ((RL)) = Anstellreihe
                            </span>
                          </div>
                          <TacticBoardPreview data={activeExercise.tactic_board_data} />
                        </div>

                        {activeExercise.reference_image_data && (
                          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                            <div className="mb-2 text-xs font-semibold text-slate-300 uppercase">
                              Eingefügte Original-Zeichnung / Web-Referenz (Strg+V)
                            </div>
                            <img
                              src={activeExercise.reference_image_data}
                              alt={activeExercise.title}
                              className="mx-auto max-h-72 rounded-lg object-contain"
                            />
                          </div>
                        )}
                      </div>

                      {/* Tags & Kategorien */}
                      <div className="flex flex-wrap gap-1.5">
                        {activeExercise.categories.phases.map((p) => (
                          <span
                            key={p}
                            className="rounded-md bg-slate-800 px-2.5 py-1 text-xs text-slate-200"
                          >
                            {PHASE_CATEGORY_LABELS[p]}
                          </span>
                        ))}
                        {activeExercise.categories.focus.map((f) => (
                          <span
                            key={f}
                            className="rounded-md bg-blue-950/80 border border-blue-700/40 px-2.5 py-1 text-xs text-blue-300"
                          >
                            #{FOCUS_TAG_LABELS[f]}
                          </span>
                        ))}
                      </div>

                      {/* Strukturierte Beschreibung */}
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                          <h4 className="text-xs font-bold tracking-wider text-slate-400 uppercase">
                            Aufbau & Organisation
                          </h4>
                          <p className="mt-1.5 text-xs leading-relaxed text-slate-200 whitespace-pre-line">
                            {activeExercise.setup_description}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                          <h4 className="text-xs font-bold tracking-wider text-amber-400 uppercase">
                            Coaching-Punkte / Korrekturen
                          </h4>
                          <p className="mt-1.5 text-xs leading-relaxed text-slate-200 whitespace-pre-line">
                            {activeExercise.coaching_points}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                        <h4 className="text-xs font-bold tracking-wider text-blue-400 uppercase">
                          Übungsablauf
                        </h4>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-200 whitespace-pre-line">
                          {activeExercise.flow_description}
                        </p>
                      </div>

                      {/* Web-Referenz / Quellen-Link & Externe Links */}
                      {(activeExercise.source_url || activeExercise.external_links.length > 0) && (
                        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2">
                          <h4 className="text-xs font-bold tracking-wider text-slate-400 uppercase">
                            Web-Referenzen & Weiterführende Links
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {activeExercise.source_url && (
                              <a
                                href={activeExercise.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-blue-400 hover:underline"
                              >
                                <ExternalLinkIcon className="h-3.5 w-3.5" />
                                Original-Quelle öffnen
                              </a>
                            )}
                            {activeExercise.external_links.map((lnk, idx) => (
                              <a
                                key={idx}
                                href={lnk.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-blue-300 hover:underline"
                              >
                                <ExternalLinkIcon className="h-3.5 w-3.5" />
                                {lnk.title}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MEHRWOCHENPLAN (MESOZYKLUS) */}
          {activeTab === 'PLANS' && (
            <div className="space-y-6">
              {activePlan ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6">
                  <div className="border-b border-slate-800 pb-4">
                    <span className="text-xs font-semibold text-blue-400 uppercase">
                      Mehrwöchiger Trainingsplan · {activePlan.start_date} bis {activePlan.end_date}
                    </span>
                    <h2 className="mt-1 text-xl font-bold text-white">{activePlan.title}</h2>
                    <p className="mt-1 text-xs text-slate-300">{activePlan.goals}</p>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                    {activePlanWeeks.map((week) => (
                      <div
                        key={week.id}
                        className="rounded-xl border border-slate-800 bg-slate-950/80 p-4"
                        style={{ borderLeftWidth: '4px', borderLeftColor: week.color_hex }}
                      >
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span className="font-bold text-white">Woche {week.week_number}</span>
                          <span>ab {week.start_date}</span>
                        </div>
                        <h3 className="mt-1 font-bold text-white text-sm">{week.focus_theme}</h3>
                        <p className="mt-1 text-xs text-slate-400">{week.notes}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {week.focus_tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-slate-900 px-2 py-0.5 text-[11px] text-blue-300 border border-slate-700"
                            >
                              #{FOCUS_TAG_LABELS[tag]}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-300">
                  Für <strong>{activeTeam.name}</strong> ist noch kein Mehrwochenplan hinterlegt.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: VEREIN, MANNSCHAFTEN & TRAINERTEAM */}
          {activeTab === 'CLUB_ADMIN' && (
            <ClubTeamManager
              club={activeClub}
              teams={teams}
              members={members}
              teamMembers={teamMembers}
              activeTeamId={activeTeam.id}
              onSelectTeam={setActiveTeamId}
            />
          )}
        </main>
      </div>

      {/* Bottom Navigation für Smartphone & kleines Tablet */}
      <nav className="fixed right-0 bottom-0 left-0 z-40 flex items-center justify-around border-t border-slate-800 bg-slate-900/95 py-2 backdrop-blur-md lg:hidden">
        <button
          type="button"
          onClick={() => setActiveTab('DASHBOARD')}
          className={`flex flex-col items-center gap-1 px-3 py-1 text-[11px] font-medium ${
            activeTab === 'DASHBOARD' ? 'text-blue-400' : 'text-slate-400'
          }`}
        >
          <LayoutDashboard className="h-5 w-5" />
          Training
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('EXERCISES')}
          className={`flex flex-col items-center gap-1 px-3 py-1 text-[11px] font-medium ${
            activeTab === 'EXERCISES' ? 'text-blue-400' : 'text-slate-400'
          }`}
        >
          <BookOpen className="h-5 w-5" />
          Übungen
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('PLANS')}
          className={`flex flex-col items-center gap-1 px-3 py-1 text-[11px] font-medium ${
            activeTab === 'PLANS' ? 'text-blue-400' : 'text-slate-400'
          }`}
        >
          <CalendarRange className="h-5 w-5" />
          Wochenplan
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('CLUB_ADMIN')}
          className={`flex flex-col items-center gap-1 px-3 py-1 text-[11px] font-medium ${
            activeTab === 'CLUB_ADMIN' ? 'text-blue-400' : 'text-slate-400'
          }`}
        >
          <Building2 className="h-5 w-5" />
          Verein/Team
        </button>
      </nav>

      <PwaInstallGuideModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
      />

      <ExerciseEditorModal
        isOpen={editorModalOpen}
        initialExercise={editingExercise}
        parentExercise={variantParentExercise}
        clubId={activeClub.id}
        activeTeamId={activeTeam.id}
        onClose={() => setEditorModalOpen(false)}
        onSave={handleSaveExercise}
      />

      <AiExerciseImporterModal
        isOpen={aiImporterOpen}
        clubId={activeClub.id}
        activeTeamId={activeTeam.id}
        onClose={() => setAiImporterOpen(false)}
        onImportExercises={handleImportAiExercises}
      />
    </div>
  );
}
