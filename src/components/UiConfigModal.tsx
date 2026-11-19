import { Check, Compass, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import {
  ALL_FEATURES_ENABLED,
  UI_FEATURE_CATEGORY_LABELS,
  UI_FEATURE_DEFINITIONS,
  UI_PRESETS,
  applyUiPreset,
  countEnabledFeatures,
  toggleUiFeature,
  type UiFeatureCategory,
  type UiFeatureKey,
  type UiPreferences,
  type UiPresetKey
} from '../utils/uiPreferences';

interface UiConfigModalProps {
  isOpen: boolean;
  preferences: UiPreferences;
  onChangePreferences: (next: UiPreferences) => void;
  onOpenTour: () => void;
  onClose: () => void;
}

const CATEGORY_ORDER: UiFeatureCategory[] = ['MODULES', 'TOOLS', 'CATALOG', 'SYSTEM'];

export function UiConfigModal({
  isOpen,
  preferences,
  onChangePreferences,
  onOpenTour,
  onClose
}: UiConfigModalProps) {
  if (!isOpen) return null;

  const activeCount = countEnabledFeatures(preferences.features);
  const totalCount = UI_FEATURE_DEFINITIONS.length;

  function handlePresetClick(preset: Exclude<UiPresetKey, 'CUSTOM'>) {
    onChangePreferences(applyUiPreset(preferences, preset));
  }

  function handleToggle(key: UiFeatureKey) {
    onChangePreferences(toggleUiFeature(preferences, key));
  }

  function handleResetAll() {
    onChangePreferences({
      ...preferences,
      features: { ...ALL_FEATURES_ENABLED },
      activePreset: 'PRO',
      updatedAt: new Date().toISOString()
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-blue-400" />
              <h2 className="text-lg font-bold text-white">
                Oberfläche & Funktionen anpassen
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Blende nicht benötigte Bereiche, Buttons und Filter aus, um die App genau auf deinen
              Trainingsalltag zu reduzieren ({activeCount} von {totalCount} aktiv).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Schließen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Guided Tour Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-500/40 bg-indigo-950/40 px-4 py-3">
            <div>
              <div className="text-xs font-bold text-indigo-200">
                Geführte Einrichtungs-Tour
              </div>
              <div className="text-[11px] text-indigo-300/80">
                In 4 kurzen Fragen festlegen, welche Funktionen du wirklich brauchst.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenTour();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              <Compass className="h-3.5 w-3.5" />
              Tour starten
            </button>
          </div>

          {/* Presets */}
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Schnell-Profile (Presets)
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {(['MINIMAL', 'STANDARD', 'PRO'] as const).map((presetKey) => {
                const preset = UI_PRESETS[presetKey];
                const isSelected = preferences.activePreset === presetKey;
                return (
                  <button
                    key={presetKey}
                    type="button"
                    onClick={() => handlePresetClick(presetKey)}
                    className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                      isSelected
                        ? 'border-blue-500 bg-blue-950/50 ring-1 ring-blue-500/40'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white">{preset.label}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-blue-400" />}
                    </div>
                    <span className="mt-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                      {preset.badge}
                    </span>
                    <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
                      {preset.subtitle}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Individual feature toggles */}
          <div className="space-y-5">
            {CATEGORY_ORDER.map((category) => {
              const items = UI_FEATURE_DEFINITIONS.filter((f) => f.category === category);
              return (
                <div key={category} className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {UI_FEATURE_CATEGORY_LABELS[category]}
                  </h3>
                  <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950/50">
                    {items.map((item) => {
                      const enabled = preferences.features[item.key];
                      return (
                        <div
                          key={item.key}
                          className="flex items-center justify-between gap-4 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-white">{item.label}</div>
                            <p className="mt-0.5 text-[11px] text-slate-400">{item.description}</p>
                            <p className="mt-0.5 text-[10px] text-slate-500">
                              Betrifft: {item.affectsUi}
                            </p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            onClick={() => handleToggle(item.key)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                              enabled ? 'bg-blue-600' : 'bg-slate-700'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                enabled ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-6 py-4">
          <button
            type="button"
            onClick={handleResetAll}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Alle Funktionen aktivieren
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-500"
          >
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
}
