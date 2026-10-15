# NCM Inspection App

Mobile inspection app (PWA) for the NCM maintenance department at the El Dabaa NPP site.
Owner: Eng. Mohamed Ragab, Chief Engineer – Maintenance Manager.

**Read `docs/SPEC.md` fully before writing any code.** It is the source of truth.
The database structure is in `docs/NCM_Inspection_DB_Template.xlsx` (it becomes the Google Sheet).
Setup steps for Mohamed are in `docs/SETUP.md`; add to it at every build step.

## How to work with Mohamed
- Talk to him in Egyptian Arabic, short and practical. Code, comments, commit messages and docs in English.
- He is a mechanical engineer, not a full-time developer: explain what changed and how to test it on his phone in a few lines, without jargon.
- Work one build step at a time (SPEC section 13). Before coding a step, state the plan in a few lines and wait for his OK. At the end of a step, give him a short test checklist.
- Ask before changing the data model, a tab/column name, or anything in SPEC section 6 (anti-pencil-whipping rules).

## Technical rules
- Plain HTML/CSS/JavaScript ES modules. No framework, no bundler, no build step, no npm runtime dependencies.
- Third-party libraries vendored into `/web/vendor/` with pinned versions. Nothing loaded from a CDN at runtime (the app must work offline).
- Backend is Google Apps Script + Google Sheets + Google Drive. Sheet columns are always looked up by header name, never by position.
- Backend changes go to Google with clasp (`clasp push --force`, then `clasp update-deployment <id>` on the existing deployment so the URL in `web/config.js` stays the same). See `docs/SETUP.md` part D. Run `node --test "tests/*.test.mjs"` first.
- The published app runs with `MOCK: false`. For local UI work set `MOCK: true` but never commit it.
- Every web change: bump `APP_VERSION` (config.js) and `VERSION` (sw.js) together, and list new files in `sw.js`.
- POST requests to Apps Script without a custom Content-Type header (avoid CORS preflight).
- No secrets or Sheet IDs in the frontend. They live in Apps Script Script Properties.
- Asset codes come from the NCM Master Asset Register. Never invent or reformat them.
- The "do not operate" state is called **DNO**. Never call it "Hold" (Hold means no production demand at NCM).
- Every screen bilingual (Arabic RTL / English) via `/web/i18n/*.json`. No hard-coded UI text.
- Offline-first: never delete queued data until the server confirms it.
- Keep a mock API mode working so the UI can run without Google.
