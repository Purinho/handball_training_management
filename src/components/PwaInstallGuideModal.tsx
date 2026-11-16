import { Laptop, Share, Smartphone, Tablet, X } from 'lucide-react';

interface PwaInstallGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PwaInstallGuideModal({ isOpen, onClose }: PwaInstallGuideModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div>
            <span className="text-xs font-semibold tracking-wider text-blue-400 uppercase">
              Store-freie Installation (Offline-PWA)
            </span>
            <h2 className="mt-0.5 text-xl font-bold text-white">
              App ohne App Store auf Tablet, Smartphone & Windows installieren
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 p-1.5 text-slate-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Apple iPad & iPhone */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-center gap-2 text-blue-400">
              <Tablet className="h-5 w-5" />
              <h3 className="font-bold text-white">iPad & iPhone</h3>
            </div>
            <p className="mt-1 text-xs text-slate-400">In Apple Safari öffnen:</p>
            <ol className="mt-3 space-y-2 text-xs text-slate-200">
              <li className="flex items-start gap-1.5">
                <span className="font-bold text-blue-400">1.</span>
                <span>
                  Oben/unten auf das <Share className="inline h-3.5 w-3.5 text-blue-400" />{' '}
                  <strong>Teilen-Symbol</strong> tippen.
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="font-bold text-blue-400">2.</span>
                <span>
                  Auf <strong>„Zum Home-Bildschirm"</strong> tippen.
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="font-bold text-blue-400">3.</span>
                <span>
                  Startet ab sofort im Vollbild & funktioniert 100 % offline in der Halle!
                </span>
              </li>
            </ol>
          </div>

          {/* Android Tablet & Smartphone */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-center gap-2 text-emerald-400">
              <Smartphone className="h-5 w-5" />
              <h3 className="font-bold text-white">Android</h3>
            </div>
            <p className="mt-1 text-xs text-slate-400">In Google Chrome öffnen:</p>
            <ol className="mt-3 space-y-2 text-xs text-slate-200">
              <li className="flex items-start gap-1.5">
                <span className="font-bold text-emerald-400">1.</span>
                <span>
                  Rechts oben auf das <strong>Drei-Punkte-Menü (⋮)</strong> tippen.
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="font-bold text-emerald-400">2.</span>
                <span>
                  <strong>„App installieren"</strong> oder <strong>„Zum Startbildschirm"</strong> wählen.
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="font-bold text-emerald-400">3.</span>
                <span>Erscheint als echte App mit eigenem Icon auf dem Gerät.</span>
              </li>
            </ol>
          </div>

          {/* Windows Desktop */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-center gap-2 text-amber-400">
              <Laptop className="h-5 w-5" />
              <h3 className="font-bold text-white">Windows PC</h3>
            </div>
            <p className="mt-1 text-xs text-slate-400">In Edge oder Chrome öffnen:</p>
            <ol className="mt-3 space-y-2 text-xs text-slate-200">
              <li className="flex items-start gap-1.5">
                <span className="font-bold text-amber-400">1.</span>
                <span>
                  Rechts in der Adressleiste auf das <strong>App-Installations-Icon (⊕)</strong> klicken.
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="font-bold text-amber-400">2.</span>
                <span>
                  Auf <strong>„Installieren"</strong> klicken.
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="font-bold text-amber-400">3.</span>
                <span>Läuft als eigenes Windows-Programm in der Taskleiste & im Startmenü.</span>
              </li>
            </ol>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          >
            Verstanden
          </button>
        </div>
      </div>
    </div>
  );
}
