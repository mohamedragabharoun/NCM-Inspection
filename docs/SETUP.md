# NCM Inspection — Setup Guide

Step-by-step setup. Do the sections in order. Each build step adds its section here.

---

## A. Run the app on the computer (demo mode, no Google)

Needs Python (already installed on the maintenance PC).

1. Open a terminal in `E:\Projects\NCM-Inspection\web`.
2. Run: `python -m http.server 8080`
3. Open `http://localhost:8080` in Chrome or Edge.
4. Sign in with **U001** (admin) or **U002** (technician), PIN **1234**.
   The first sign-in asks for a new PIN. In demo mode the new PIN is kept in this browser only.

To reset the demo: browser DevTools → Application → Storage → **Clear site data**.

`web/config.js` controls the mode:

| Setting | Meaning |
|---|---|
| `MOCK: true` | Demo data from `web/js/mock-data.js`. No Google needed. |
| `MOCK: false` + `API_URL` | Real backend (Apps Script, Step 1). |

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

## C. Google (department account, database, photos)

Done once, before Step 1.

1. Create a Google account for the maintenance department (not a personal account), e.g. `ncm.maintenance.eldabaa@gmail.com`.
   Turn on 2-step verification and keep the recovery phone with the maintenance manager.
2. In that account's Google Drive, create the folder `NCM Inspection`, and inside it `Photos`.
3. Upload `docs/NCM_Inspection_DB_Template.xlsx` to `NCM Inspection` → open it → **File → Save as Google Sheets**.
   Rename it `NCM_Inspection_DB`. Delete the uploaded .xlsx.
4. **File → Settings → Time zone → (GMT+02:00) Cairo** → Save.
5. Fill the admin tabs (`Assets`, `Users`, `Assignments`, `ChecklistTemplates`, `ChecklistItems`, `Settings`).
   Asset codes exactly as in the NCM Master Asset Register. Leave `PINHash` / `PINSalt` empty — the setup script fills them.
   In `Assignments`, dates as `2026-10-18` (or real date cells) and `DueWeekday` as `SAT` … `THU` for weekly templates.

---

## D. The server (Apps Script) — Step 1

Done once in the department Google account. Later steps only paste updated files and redeploy (end of this section).

### D1. Put the code in
1. Open the `NCM_Inspection_DB` Sheet → **Extensions → Apps Script**. A new tab opens; rename the project (top left) to `NCM Inspection API`.
2. The project has one file `Code.gs`. Replace its content with `apps-script/Code.gs` from the project folder.
3. Click **+** next to *Files* → **Script** and create `Db`, `Auth`, `Bootstrap`, `Setup` (the editor adds `.gs`).
   Paste into each the content of the file with the same name in `apps-script/`.
4. **Project Settings** (gear icon) → tick **Show "appsscript.json" manifest file** → back to the editor →
   open `appsscript.json` → replace its content with `apps-script/appsscript.json`.
5. Press **Save** (disk icon).

### D2. First run (creates the PINs)
1. In the editor, choose the file `Setup.gs`, choose the function **setupProject** in the toolbar list, press **Run**.
2. Google asks for permission: **Review permissions** → choose the department account →
   *Google hasn't verified this app* → **Advanced** → **Go to NCM Inspection API (unsafe)** → **Allow**.
   (It is "unverified" only because it is our own script, not a published app.)
3. The **Execution log** at the bottom shows `Sheet OK` and one line per user: `U002  Name  →  PIN 123456`.
   Give each person only their own PIN. They choose a new PIN at first sign-in.
   If it shows an error such as `Defects: missing column(s) …`, fix the Sheet header and run again.
4. Reset a PIN later: clear that user's `PINHash` cell in `Users`, select **createInitialPins**, press **Run**.

### D3. Publish the API
1. **Deploy → New deployment** → gear icon → **Web app**.
2. Description `v1` · Execute as **Me (department account)** · Who has access **Anyone** → **Deploy**.
3. Copy the **Web app URL** (ends with `/exec`). Opening it in a browser shows *NCM Inspection API is running.*
4. Put it in `web/config.js`: `API_URL: 'https://script.google.com/macros/s/…/exec'` and `MOCK: false`,
   bump the version (section B, *Publishing a new version*) and push.

"Anyone" is needed because the phones call it without a Google login. Nobody can read data without a valid
session token, and the Sheet itself stays private to the department account.

### D4. Updating the server after a code change
Paste the changed `.gs` files, Save, then **Deploy → Manage deployments → pencil icon → Version: New version → Deploy**.
The URL stays the same, so the phones need nothing.

---

## E. Checks on the computer (for development)

From the project folder (needs Node.js, already installed):

| Command | What it checks |
|---|---|
| `node --test "tests/*.test.mjs"` | due-date logic, the Apps Script code (with fake Google services), app files and translations |
| `node tests/gas-server.mjs` | runs the Apps Script code locally on `http://localhost:8090/exec` for end-to-end tests |
| `python -I tests/make_fixture.py` | refreshes the test data after the Sheet template changes |
