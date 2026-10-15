# NCM Inspection — Setup Guide

Step-by-step setup. Do the sections in order. Each build step adds its section here.

---

## A. Run the app on the computer (demo mode, no Google)

Needs Python (already installed on the maintenance PC).

1. In `web/config.js` set `MOCK: true` (**do not commit this change**; the published app uses `MOCK: false`).
2. Open a terminal in `E:\Projects\NCM-Inspection\web` and run: `python -m http.server 8080`
3. Open `http://localhost:8080` in Chrome or Edge.
4. Sign in with **U001** (admin) or **U002** (technician), PIN **1234**.
   The first sign-in asks for a new PIN. In demo mode the new PIN is kept in this browser only.

To reset the demo: browser DevTools → Application → Storage → **Clear site data**.

`web/config.js` controls the mode:

| Setting | Meaning |
|---|---|
| `MOCK: true` | Demo data from `web/js/mock-data.js`. No Google needed. |
| `MOCK: false` + `API_URL` | Real backend (Apps Script). This is what is published. |

---

## B. Put the app on the phone (GitHub Pages)

A service worker (offline mode, install to home screen) only works on **https** or on `localhost`,
so phones need the GitHub Pages copy.

**Current setup (done 2026-10-15):** repository `github.com/mohamedragabharoun/NCM-Inspection` (public),
Pages source = GitHub Actions. Live app: **https://mohamedragabharoun.github.io/NCM-Inspection/**
Only steps 6 and "Publishing a new version" are needed from now on. If the repository moves to a department
account later (GitHub → Settings → Transfer), the address changes to that account's name.

1. Create a free GitHub account for the department (e.g. `ncm-maintenance`) with the department email.
2. Create a **public** repository named `NCM-Inspection` (public is required for free Pages; the frontend has no data and no secrets).
3. Upload the project to it (GitHub Desktop is the easiest: *File → Add local repository → `E:\Projects\NCM-Inspection` → Publish*).
4. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
5. Every push to `main` publishes the `web` folder automatically (`.github/workflows/pages.yml`).
   Check **Actions** tab → green tick. The address is `https://<account>.github.io/NCM-Inspection/`.
6. On the phone, open that address in Chrome → menu ⋮ → **Add to Home screen / Install app**.
   On iPhone: Safari → Share → **Add to Home Screen**.

### Publishing a new version
1. Change `APP_VERSION` in `web/config.js` **and** `VERSION` in `web/sw.js` to the same new number (e.g. `0.1.1`).
2. Push to GitHub.
3. On the phone, open the app: a yellow bar says *A new version is ready* → tap **Update**.

---

## C. Google account and database

**Current setup (done 2026-10-15):** department account `mohameedharounn@gmail.com`. In its Drive: the Sheet
`NCM_Inspection_DB` with the Apps Script project bound to it (same name). The Sheet was built automatically
from `docs/NCM_Inspection_DB_Template.xlsx` by `setupProject`, timezone Cairo.

Filling the data (any time, directly in the Sheet):
- Fill the admin tabs (`Assets`, `Users`, `Assignments`, `ChecklistTemplates`, `ChecklistItems`, `Settings`).
  Asset codes exactly as in the NCM Master Asset Register.
- New user: add a row in `Users` with `PINHash` / `PINSalt` empty and `Active = Y`, then run **createInitialPins** (D3).
- `Assignments`: dates as `2026-10-18` (or real date cells) and `DueWeekday` `SAT` … `THU` for weekly templates.
  A task shows on the phone only while today is between `StartDate` and `EndDate`.

---

## D. The server (Apps Script)

The code lives in `apps-script/` and is sent to Google with **clasp** (Google's command-line tool, installed
on the maintenance PC, signed in as the department account). No copy and paste.

### D1. Send a code change to Google
From the project folder:
1. `clasp push --force` — uploads the `apps-script/` files.
2. `clasp update-deployment AKfycbwYrS6w_vgal04fe4j1YBm9lwExJLF4OMAMiK-PP19l_8--OaZ3XYd0Ue12pUBk64Hi`
   — publishes them on the same link, so the phones need nothing.
3. Open the link in `web/config.js` (`API_URL`) in a browser: it must say *NCM Inspection API is running. Database: ready.*

`.clasp.json` (which script to push to) is kept only on this PC. If it is lost: `clasp clone <Script ID>`
(Script ID: Apps Script editor → Project Settings), then move the files back into `apps-script/`.

### D2. If Google asks for permission again
When new code needs a new Google permission (e.g. Drive for photos in Step 3), the web app stops with
"Authorization needed" until the account owner approves once:
open the `API_URL` link in Chrome while signed in as the department account → **Review permissions** → **Advanced** →
**Go to … (unsafe)** → **Allow**. ("Unsafe" only means it is our own script, not a published app.)

### D3. Running a setup function by hand
Apps Script editor (Chrome, department account; if several Google accounts are signed in, check the account
picture top right) → file `Setup.gs` → choose the function next to **Run** → **Run**. Results in the **Execution log**.
- **setupProject** — first-time setup: builds an empty Sheet from the template, checks every tab and column,
  sets the Cairo timezone, creates PINs for users without one.
- **createInitialPins** — new PIN for every user whose `PINHash` is empty. To reset someone's PIN: clear their
  `PINHash` cell, then run this. The PINs appear only in the Execution log; give each person only their own.

### D4. First-time setup on a new account (reference)
1. Turn on **Google Apps Script API**: https://script.google.com/home/usersettings
2. `npm install -g @google/clasp` then `clasp login` (approve in the browser).
3. From the project folder: `clasp create-script --type sheets --title "NCM_Inspection_DB" --rootDir apps-script`
   — then `git checkout -- apps-script/appsscript.json` (clasp overwrites it with a default one).
4. `clasp push --force` and `clasp create-deployment --description "v1"` → note the deployment ID.
5. Run **setupProject** (D3) and approve the permissions; then open the web app link once and approve (D2).
6. Put `https://script.google.com/macros/s/<deployment ID>/exec` in `web/config.js` as `API_URL`, `MOCK: false`,
   bump the version and push (section B).

"Who has access: Anyone" (in `apps-script/appsscript.json`) is needed because the phones call the API without a
Google login. Nobody can read data without a valid session token, and the Sheet stays private to the account.

---

## E. Checks on the computer (for development)

From the project folder (needs Node.js, already installed):

| Command | What it checks |
|---|---|
| `node --test "tests/*.test.mjs"` | due-date logic, the Apps Script code (with fake Google services), app files and translations |
| `node tests/gas-server.mjs` | runs the Apps Script code locally on `http://localhost:8090/exec` for end-to-end tests |
| `python -I tests/make_fixture.py` | refreshes the test data after the Sheet template changes |
