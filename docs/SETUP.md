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
4. Fill the admin tabs (`Assets`, `Users`, `Assignments`, `ChecklistTemplates`, `ChecklistItems`, `Settings`).
   Asset codes exactly as in the NCM Master Asset Register. Leave `PINHash` / `PINSalt` empty — the setup script fills them.

The Apps Script part (deploying the API and connecting `API_URL`) is added to this guide in **Step 1**.
