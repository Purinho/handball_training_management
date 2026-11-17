import { useState } from 'react';
import {
  Building2,
  Cloud,
  KeyRound,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  X
} from 'lucide-react';
import { getSupabaseClient, isSupabaseConfigured } from '../services/supabaseClient';
import {
  clearAllLocalDatabaseTables,
  getLastSyncedAt,
  syncWithSupabaseCloud
} from '../services/cloudSyncService';
import { seedInitialDataIfEmpty } from '../db/seedData';
import type { Club, ClubMember } from '../types/domain';

interface AuthClubModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string | null;
  activeClub?: Club;
  currentMember?: ClubMember;
  needsClubOnboarding: boolean;
  onNeedsOnboarding: () => void;
  onSyncCompleted: (message: string) => void;
}

export function AuthClubModal({
  isOpen,
  onClose,
  userEmail,
  activeClub,
  currentMember,
  needsClubOnboarding,
  onNeedsOnboarding,
  onSyncCompleted
}: AuthClubModalProps) {
  const [authMode, setAuthMode] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [onboardingMode, setOnboardingMode] = useState<'JOIN' | 'CREATE'>('JOIN');
  const [inviteCode, setInviteCode] = useState('');
  const [clubName, setClubName] = useState('');
  const [displayName, setDisplayName] = useState('');

  const [isBusy, setIsBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const configured = isSupabaseConfigured();
  const lastSynced = getLastSyncedAt();

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setIsBusy(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      if (authMode === 'LOGIN') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (error) {
          setErrorMsg(error.message);
        } else {
          const syncRes = await syncWithSupabaseCloud();
          if (syncRes.errorMessage) {
            setErrorMsg(`Sync-Fehler: ${syncRes.errorMessage}`);
          } else if (syncRes.mode === 'NO_CLUB') {
            onNeedsOnboarding();
          } else if (syncRes.mode === 'CLOUD') {
            onSyncCompleted(
              `Angemeldet & synchronisiert (${syncRes.pulledCount} geladen, ${syncRes.pushedCount} gesendet).`
            );
            onClose();
          }
        }
      } else {
        const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: redirectTo
          }
        });
        if (error) {
          setErrorMsg(error.message);
        } else if (data.session) {
          const syncRes = await syncWithSupabaseCloud();
          if (syncRes.mode === 'NO_CLUB') {
            onNeedsOnboarding();
          }
          setInfoMsg('Konto erstellt! Bitte jetzt einem Verein beitreten oder einen neuen Verein anlegen.');
        } else {
          setInfoMsg(
            'Registrierung erfolgreich! Bitte bestätige ggf. deine E-Mail-Adresse und melde dich danach an.'
          );
          setAuthMode('LOGIN');
        }
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function handleOnboardingSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setIsBusy(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      if (onboardingMode === 'JOIN') {
        const { error } = await supabase.rpc('join_club_by_invite_code', {
          p_invite_code: inviteCode.trim(),
          p_display_name: displayName.trim() || userEmail?.split('@')[0] || 'Trainer',
          p_email: userEmail
        });
        if (error) {
          setErrorMsg(error.message);
          return;
        }
      } else {
        const { error } = await supabase.rpc('create_club_with_admin', {
          p_club_name: clubName.trim(),
          p_display_name: displayName.trim() || userEmail?.split('@')[0] || 'Vereins-Admin',
          p_email: userEmail
        });
        if (error) {
          setErrorMsg(error.message);
          return;
        }
      }

      const syncRes = await syncWithSupabaseCloud();
      onSyncCompleted(
        `Verein verbunden & synchronisiert (${syncRes.pulledCount} Datensätze geladen).`
      );
      onClose();
    } finally {
      setIsBusy(false);
    }
  }

  async function handleManualSync() {
    setIsBusy(true);
    setErrorMsg(null);
    try {
      const res = await syncWithSupabaseCloud();
      if (res.errorMessage) {
        setErrorMsg(res.errorMessage);
      } else {
        onSyncCompleted(
          `Sync abgeschlossen: ${res.pushedCount} gesendet, ${res.pulledCount} aktualisiert.`
        );
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLogout() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setIsBusy(true);
    try {
      await supabase.auth.signOut();
      await clearAllLocalDatabaseTables();
      await seedInitialDataIfEmpty();
      onSyncCompleted('Abgemeldet. Lokaler Demo-Modus aktiv.');
      onClose();
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Cloud-Sync & Vereins-Konto</h2>
              <p className="text-xs text-slate-400">
                Geräteübergreifend zwischen Windows & Android synchronisieren
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 p-1.5 text-slate-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!configured && (
          <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-950/30 p-4 text-xs text-amber-200 space-y-2">
            <div className="font-bold text-amber-300">
              Supabase-Umgebungsvariablen noch nicht hinterlegt
            </div>
            <p>
              Die App läuft aktuell im <strong>100% lokalen Offline-Modus</strong>. Sobald{' '}
              <code className="rounded bg-slate-950 px-1 py-0.5">VITE_SUPABASE_URL</code> und{' '}
              <code className="rounded bg-slate-950 px-1 py-0.5">VITE_SUPABASE_ANON_KEY</code>{' '}
              (lokal in <code className="rounded bg-slate-950 px-1 py-0.5">.env</code> bzw. als
              GitHub Actions Secrets) gesetzt sind, erscheint hier der Cloud-Login.
            </p>
          </div>
        )}

        {configured && !userEmail && (
          <form onSubmit={handleAuthSubmit} className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-950 p-1">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('LOGIN');
                  setErrorMsg(null);
                }}
                className={`rounded-lg py-2 text-xs font-semibold transition ${
                  authMode === 'LOGIN'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Anmelden
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('SIGNUP');
                  setErrorMsg(null);
                }}
                className={`rounded-lg py-2 text-xs font-semibold transition ${
                  authMode === 'SIGNUP'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Neu registrieren
              </button>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">E-Mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trainer@verein.de"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Passwort</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mindestens 6 Zeichen"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            {errorMsg && (
              <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200">
                {errorMsg}
              </div>
            )}
            {infoMsg && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs text-emerald-200">
                {infoMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={isBusy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {authMode === 'LOGIN' ? (
                <>
                  <LogIn className="h-4 w-4" />
                  {isBusy ? 'Melde an...' : 'Anmelden & synchronisieren'}
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  {isBusy ? 'Registriere...' : 'Konto erstellen'}
                </>
              )}
            </button>
          </form>
        )}

        {configured && userEmail && needsClubOnboarding && (
          <form onSubmit={handleOnboardingSubmit} className="mt-5 space-y-4">
            <div className="rounded-xl border border-blue-500/30 bg-blue-950/30 p-3 text-xs text-blue-200">
              Angemeldet als <strong>{userEmail}</strong>. Verbinde dein Konto jetzt mit einem
              Verein:
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-950 p-1">
              <button
                type="button"
                onClick={() => {
                  setOnboardingMode('JOIN');
                  setErrorMsg(null);
                }}
                className={`rounded-lg py-2 text-xs font-semibold transition ${
                  onboardingMode === 'JOIN'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Verein beitreten
              </button>
              <button
                type="button"
                onClick={() => {
                  setOnboardingMode('CREATE');
                  setErrorMsg(null);
                }}
                className={`rounded-lg py-2 text-xs font-semibold transition ${
                  onboardingMode === 'CREATE'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Neuen Verein gründen
              </button>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">Dein Name</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="z. B. Max Mustermann"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            {onboardingMode === 'JOIN' ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Vereins-Einladungscode
                </label>
                <div className="relative">
                  <KeyRound className="absolute top-2.5 left-3 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="z. B. SGH-2026"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pr-3 pl-9 text-sm uppercase text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">
                  Name des Vereins
                </label>
                <div className="relative">
                  <Building2 className="absolute top-2.5 left-3 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={clubName}
                    onChange={(e) => setClubName(e.target.value)}
                    placeholder="z. B. TSV Handball Musterstadt"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pr-3 pl-9 text-sm text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200">
                {errorMsg}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isBusy}
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {isBusy
                  ? 'Verbinde...'
                  : onboardingMode === 'JOIN'
                    ? 'Mit Code beitreten'
                    : 'Verein anlegen'}
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Abmelden
              </button>
            </div>
          </form>
        )}

        {configured && userEmail && !needsClubOnboarding && (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-emerald-300">
                <ShieldCheck className="h-4 w-4" />
                Cloud-Synchronisation aktiv
              </div>
              <div className="grid grid-cols-2 gap-y-1 text-slate-300">
                <span className="text-slate-400">Konto:</span>
                <span className="font-medium text-white truncate">{userEmail}</span>
                <span className="text-slate-400">Verein:</span>
                <span className="font-medium text-white">{activeClub?.name ?? '–'}</span>
                <span className="text-slate-400">Einladungscode:</span>
                <span className="font-mono font-semibold text-blue-300">
                  {activeClub?.invite_code ?? '–'}
                </span>
                <span className="text-slate-400">Rolle:</span>
                <span className="font-medium text-white">
                  {currentMember?.club_role === 'CLUB_ADMIN' ? 'Vereins-Admin (Bearbeiter)' : 'Trainer'}
                </span>
                <span className="text-slate-400">Letzter Sync:</span>
                <span className="text-slate-200">
                  {lastSynced ? new Date(lastSynced).toLocaleString('de-DE') : 'Noch nicht'}
                </span>
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200">
                {errorMsg}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleManualSync()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isBusy ? 'animate-spin' : ''}`} />
                {isBusy ? 'Synchronisiere...' : 'Jetzt synchronisieren'}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleLogout()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                <LogOut className="h-4 w-4 text-slate-400" />
                Abmelden
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
