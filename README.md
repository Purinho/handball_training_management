# Handball Trainings- & Planungs-App (MVP)

Plattformübergreifende **Offline-First Progressive Web App (PWA)** zur Verwaltung von Handball-Übungen (inkl. interaktivem SVG-Taktikboard, `Strg+V` Web-Referenzen & KI-JSON-Importer), Trainingseinheiten (mit parallelen Spuren), mehrwöchigen Trainingsplänen (Mesozyklen) und einem aktiven **Sporthallen-Modus** für Tablets und Smartphones.

📄 **Vollständige MVP-Spezifikation:** [docs/SPECIFICATION.md](docs/SPECIFICATION.md)

---

## Technologie-Stack

* **Frontend:** React 19 + TypeScript + Vite
* **UI & Styling:** Tailwind CSS v4 + Lucide Icons
* **Offline-First Datenbank:** Dexie.js (IndexedDB) + Sync-Outbox
* **PWA & Offline-Caching:** `vite-plugin-pwa` (Workbox Service Worker)
* **Cloud-Backend (optional koppelbar):** Supabase (PostgreSQL + RLS Schema unter [supabase/migrations/0001_initial_schema.sql](supabase/migrations/0001_initial_schema.sql))
* **Unit Testing:** Vitest

---

## Lokale Entwicklung starten

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Entwicklungsserver starten (lokal & im Heimnetzwerk erreichbar)
npm run dev

# 3. Unit-Tests ausführen
npm run test:run

# 4. Produktions-Build (PWA) erstellen
npm run build
```

---

## Bereitstellung ohne App Store (iOS, Android & Windows)

Bei jedem Push auf den `main`-Branch baut und veröffentlicht die GitHub Action ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) die Anwendung automatisch als installierbare **HTTPS-PWA auf GitHub Pages**:
* **Windows:** Im Browser (Edge/Chrome) öffnen $\rightarrow$ über das App-Symbol in der Adressleiste als eigenständige Desktop-App installieren.
* **iPad / iPhone (Safari):** URL öffnen $\rightarrow$ *Teilen* $\rightarrow$ *Zum Home-Bildschirm hinzufügen*.
* **Android (Chrome):** URL öffnen $\rightarrow$ *App installieren / Zum Startbildschirm hinzufügen*.
