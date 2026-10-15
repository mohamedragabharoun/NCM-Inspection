# NCM Maintenance Inspection App — Specification v1.1

Owner: Eng. Mohamed Ragab, Chief Engineer – Maintenance Manager, NCM (Nuclear Concrete Mixes), El Dabaa NPP site, Egypt.
Status: approved for build — Phase 1 (pilot).

v1.1 (2026-10-15): added deferred defects (quick report, "can it keep running?", Planned status with plan and review date, backlog per asset) and the engineer concession for Critical fails during a pour. Backend stays Google for the pilot; the frontend talks to it only through `web/js/api.js` so the backend can be replaced later.

---

## 1. Why this app exists

NCM is the concrete supplier for the El Dabaa Nuclear Power Plant project. The maintenance department maintains truck mixers, truck-mounted concrete pumps, stationary pumps, placing booms, batch plants, ice plants and chillers.

**The problem:** the existing inspection records are paper and largely formal — filled in without the inspection actually happening ("pencil-whipping"). They give a false picture that everything is fine, and they will not survive a client audit (TITAN-2 inspection control issues formal Acts with findings and close-out deadlines, and rejects evidence photos that carry no asset tag or timestamp).

**The goal:** a maintenance-owned inspection system where:

1. Each technician/engineer has a defined set of assets and inspection levels for a defined period.
2. Inspections happen at the machine (QR scan), on a phone, online or offline.
3. Faking an inspection is hard and, when attempted, visible.
4. Every failed item becomes a tracked defect that must be closed with evidence.
5. The maintenance manager sees compliance, overdue work, open defects and red flags at a glance.

**Constraints:**

- Budget: zero. Google Sheets + Google Drive + Google Apps Script + free static hosting.
- Connectivity: weak or no signal in the pits and inside plants → **offline-first is mandatory**, not a later feature.
- Language: **bilingual Arabic (RTL) + English**, switchable per user.
- Users in Phase 1: maintenance technicians and engineers (~10–15 people). Drivers/operators come later (Phase 3).
- Field conditions: sun glare, dust, gloves → large touch targets, high contrast, minimal typing.
- Maintainability: Mohamed is a mechanical engineer, not a full-time developer. Keep the stack simple: **no build step, plain HTML/CSS/JavaScript (ES modules)**.

---

## 2. Scope of equipment

Asset codes come from the **NCM Master Asset Register** (104 active assets). **Never invent or reformat asset codes** — use them exactly as in the register.

| Class code | Meaning | In scope now |
|---|---|---|
| TM | Truck mixer (fleet no. = 100 + code number, e.g. TM08 = 108) | 25 units — Phase 2 |
| CP | Truck-mounted concrete pump (Everdigm; CP07–CP12 are ECP63) | 10 units — **Phase 1** |
| SP | Stationary pump (Sany; register codes SP.01–SP.10) | **Phase 1** |
| PB | Placing boom (register codes 3.x / 4.x by unit area) | **Phase 1** |
| SPD | Spider boom | **Phase 1** |
| BP | Batch plant | 5 — Phase 2 |
| IP | Ice plant (ROSEN, KTI ammonia R717) | 5 — Phase 2 |
| CH | Chiller | 4 on the ground tank — Phase 2 |
| TANK | Chilled-water ground tank | 1 — Phase 2 |

Some assets have maintenance responsibility **TITAN-2**, not NCM (some placing booms). The `Responsibility` column on each asset decides this. Assets with `Responsibility = TITAN-2` must not appear in technicians' task lists; the admin can still view them.

---

## 3. Architecture

```
 Phone (PWA, offline-first)                 Google (department account)
 ┌──────────────────────────┐   HTTPS POST   ┌──────────────────────────┐
 │ GitHub Pages static site │ ─────────────► │ Apps Script Web App (API)│
 │ - Service worker (shell) │ ◄───────────── │ - doPost JSON router     │
 │ - IndexedDB (data+queue) │     JSON       │ - LockService on writes  │
 │ - Camera / QR / canvas   │                └──────┬──────────┬────────┘
 └──────────────────────────┘                       │          │
                                            Google Sheet   Google Drive
                                            (database)     (photos)
```

### 3.1 Frontend

- Static PWA hosted on **GitHub Pages** (free tier requires a public repository; this is acceptable because the frontend holds no data and no secrets). Alternative if a private repo is wanted: Cloudflare Pages.
- Plain HTML/CSS/JS, ES modules, **no bundler, no framework, no build step**.
- `manifest.json` + service worker → installable to the home screen, app shell cached for offline.
- IndexedDB for: cached reference data, the outbound submission queue, and photo blobs awaiting upload.
- Third-party libraries are **vendored locally** in `/web/vendor/` (pinned versions, never loaded from a CDN at runtime) so that scanning and exporting work offline:
  - QR scanning: native `BarcodeDetector` where available, fallback `jsQR`.
  - QR label generation (admin): `qrcode-generator`.
  - Excel export (admin, Phase 2): `SheetJS`.
- `config.js` holds only the Apps Script deployment URL and the app version.

### 3.2 Backend — Google Apps Script

- One Apps Script project bound to the database spreadsheet.
- Deployed as a Web App: **Execute as: the department account; Who has access: Anyone.** Access control is done by the app's own tokens (section 5).
- Single `doPost(e)` router; request body is JSON with an `action` field. The frontend sends `fetch(url, {method: 'POST', body: JSON.stringify(payload)})` **without** a custom `Content-Type` header (defaults to `text/plain`) so no CORS preflight happens. Responses are `ContentService` JSON: `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.
- All writes inside `LockService.getScriptLock()`; write rows in batches with `setValues`, never `appendRow` in loops.
- The Sheet ID and Drive folder IDs live in **Script Properties**, never in the frontend.
- Respect consumer-account quotas: keep each request short (well under the 6-minute execution limit), avoid heavy triggers.

### 3.3 Storage

- **Google Sheet** = database. Tab layout is defined in section 4 and provided as `NCM_Inspection_DB_Template.xlsx` (upload to Drive → open as Google Sheet).
- **Google Drive** = photos: `/NCM Inspection/Photos/<AssetID>/<YYYY-MM>/<InspectionID>_<ItemID>_<n>.jpg`. Files stay private; the app gets thumbnails through the API (`getPhoto` action).
- Use a **dedicated Google account for the maintenance department**, not a personal account, so the data belongs to the department.
- Yearly archive: at year end, copy the transactional tabs to `NCM_Inspection_Archive_<YYYY>` and clear them (admin action, Phase 2).

---

## 4. Data model (Google Sheet tabs)

Tabs filled by the admin: `Settings`, `Assets`, `Users`, `Assignments`, `ChecklistTemplates`, `ChecklistItems`.
Tabs written only by the app: `Inspections`, `Answers`, `Defects`, `Audits`, `Sessions`, `Log`.
Row 1 is always the header row. The code must look columns up **by header name**, never by position, so columns can be added later.

### Settings (key / value)
`Timezone` (Africa/Cairo), `WorkingDays`, `WeeklyGraceDays`, `H250Interval`, `H250WarnAt`, `PhotoMaxPx`, `PhotoJpegQuality`, `ClockSkewFlagMin`, `IdenticalReadingsFlagCount`, `ZeroFailFlagCount`, `AuditPercent`, `AuditMinPerWeek`, `LateSyncInfoHours`, `SessionDays`, `PinMaxAttempts`, `PinLockMinutes`, `MinAppVersion`.

### Assets
`AssetID | FleetNo | Class | DescriptionAR | DescriptionEN | Manufacturer | Model | Group | SerialNo | Location | Responsibility | Status | HasHourMeter | Notes`
- `Group` links model-specific checklist items (e.g. `ECP63`).
- `Status`: Active / Out of service / Disposed. Only Active assets get tasks.

### Users
`UserID | NameAR | NameEN | Role | Discipline | Phone | PINHash | PINSalt | MustChangePIN | Active | Notes`
- `Role`: Technician / Engineer / Admin.

### Assignments
`AssignmentID | UserID | AssetID | TemplateID | StartDate | EndDate | DueWeekday | Notes | CreatedBy | CreatedAt`
- One row = one user is responsible for one inspection template on one asset for a date range.
- `DueWeekday` (SAT…FRI) is used for weekly templates so the weekly load is spread across the week.
- Dates may be real date cells or ISO text (`YYYY-MM-DD`); the code must accept both.

### ChecklistTemplates
`TemplateID | AppliesToClass | Level | NameAR | NameEN | Version | MinDurationSec | DoneBy | Active`
- `AppliesToClass` may hold several classes separated by commas (e.g. `PB,SPD`).
- `Level`: Daily / Weekly / Monthly / 250h / Quarterly.
- `DoneBy`: minimum role (Technician or Engineer).
- `Version`: increment whenever items change. Every inspection stores the template version it used.

### ChecklistItems
`ItemID | TemplateID | Seq | SectionAR | SectionEN | TextAR | TextEN | Type | Unit | Min | Max | LimitSource | Photo | Critical | Required | AllowNA | AppliesToGroup | VariesExpected | HelpAR | HelpEN | Active`
- `Type`: `PASS_FAIL` | `NUMBER` | `TEXT`.
- `Min` / `Max`: for NUMBER items; out of range → status `OUT_OF_RANGE`, treated as a fail. Blank = no limit.
- `LimitSource`: where the limit comes from; `TBC` means it must be filled from the OEM manual before go-live (the app shows a warning to the admin for any active item with `TBC`).
- `Photo`: `ALWAYS` | `ON_FAIL` | `NO`.
- `Critical`: `Y` → a fail sets the asset to **DNO (Do Not Operate)** until the defect is verified closed.
- `AppliesToGroup`: blank = all assets of the class; otherwise only assets whose `Group` matches.
- `VariesExpected`: `Y` for readings that naturally change between inspections (used by the identical-readings flag).

### Inspections
`InspectionID | AssetID | TemplateID | TemplateVersion | Level | UserID | StartedAtDevice | SubmittedAtDevice | ReceivedAtServer | DurationSec | HourMeter | HourMeterPhotoID | QRScanned | ManualReason | Lat | Lng | GPSAccuracyM | Result | FailCount | Flags | AuditSelected | AppVersion | DeviceInfo`
- `HourMeter` is captured in the inspection header (not as a checklist item) for assets with `HasHourMeter = Y`, with a mandatory photo of the meter (`HourMeterPhotoID`).
- `Result`: OK / DEFECTS / CRITICAL.
- `Flags`: comma-separated flag codes (section 6).

### Answers
`AnswerID | InspectionID | ItemID | Value | Status | Comment | PhotoFileIDs`
- `Status`: OK / FAIL / OUT_OF_RANGE / NA.

### Defects
`DefectID | InspectionID | AnswerID | AssetID | ItemID | Description | Severity | DNO | Status | ReportedBy | ReportedAt | AssignedTo | AssignedAt | ResolvedBy | ResolvedAt | ResolutionNote | VerifiedBy | VerifiedAt | PhotosBefore | PhotosAfter | ExternalRef | LastUpdated | OperateStatus | InterimAction | PlanType | PlannedFor | ReviewBy | PartsNeeded | EstHours | Crew | PlannedBy | PlannedAt | ConcessionBy | ConcessionReason | ConcessionUntil`
- `Severity`: Critical / Major / Minor (default Critical if the item is Critical, otherwise Major; the inspector can lower Major to Minor, never raise or lower Critical).
- `Status` flow: Open → Assigned → Planned → In Progress → Waiting Parts → Resolved → Verified → Closed. `Planned` and `Waiting Parts` may go back and forth; any status before Resolved may jump to In Progress.
- `OperateStatus` (set by the reporter, can be changed by an Engineer/Admin): `NORMAL` (keep working) / `MONITOR` (keep working, follow `InterimAction`, e.g. "check leak every hour") / `DNO`. A Critical fail always starts as `DNO` (see Concession below).
- Plan fields (filled by an Engineer/Admin when moving to `Planned`): `PlanType` = `DATE` | `NEXT_STOP` | `END_OF_POUR`; `PlannedFor` (date, required for `DATE`); `ReviewBy` (date, always required — if the defect is not Resolved by then it shows as **overdue** on the dashboard); `PartsNeeded` (text); `EstHours` (number); `Crew` (number of technicians); `PlannedBy`, `PlannedAt` (set by the server).
- **Concession** (Critical fail while the asset is in the middle of a pour and cannot be stopped): an Engineer/Admin may let the asset run until the end of the pour. Required: `ConcessionReason` and `ConcessionUntil` (date-time, at most 24 h ahead); `ConcessionBy` is set by the server. While the concession is valid the asset shows "DNO — running under concession"; when `ConcessionUntil` passes it is plain DNO again. Every concession is listed on the dashboard. A concession never clears DNO — only verification does.
- `ExternalRef`: free text for a TITAN-2 Act number, NCR number or PR number.
- Defects can also be raised ad hoc (no inspection) from the asset screen or the **Report problem** button (section 8).
- **Deferred work backlog:** every defect not yet Resolved is part of the asset's backlog. Defects with `PlanType = NEXT_STOP` or `END_OF_POUR` are shown as "waiting for a stop" whenever someone opens that asset, so the work is done at the first opportunity.

### Audits
`AuditID | InspectionID | AuditorUserID | SelectedAt | AuditedAt | AuditInspectionID | MatchResult | DiscrepancyCount | Notes`

### Sessions
`TokenHash | UserID | CreatedAt | ExpiresAt | LastSeenAt | DeviceInfo | Revoked`

### Log
`Timestamp | Level | UserID | Action | Message | Payload`

**IDs:** InspectionID, AnswerID, DefectID and photo names are generated **on the phone** (UUID v4 with a readable prefix, e.g. `INS-…`) so offline submissions are idempotent: the server ignores an ID it already has and returns success.

---

## 5. Users, roles and security

| Capability | Technician | Engineer | Admin |
|---|---|---|---|
| See own task list | ✓ | ✓ | ✓ |
| Inspect assigned assets | ✓ | ✓ | ✓ |
| Inspect any asset / any level | — | ✓ | ✓ |
| Raise ad-hoc defect on any asset | ✓ | ✓ | ✓ |
| Update defects assigned to self | ✓ | ✓ | ✓ |
| Assign defects, verify resolved defects, clear DNO | — | ✓ | ✓ |
| Perform audits | — | ✓ | ✓ |
| Dashboard | — | read-only | full |
| Manage assignments, users, settings, QR labels | — | — | ✓ |

- Login: `UserID` + 4–6 digit PIN. PIN stored as SHA-256 of `salt + PIN` (`Utilities.computeDigest`), unique random salt per user. First login with `MustChangePIN = Y` forces a new PIN.
- After `PinMaxAttempts` wrong PINs, lock that user for `PinLockMinutes` (CacheService).
- On success the server returns a random session token; only its hash is stored in `Sessions`. Every request carries the token; the server checks expiry, revocation and role on **every** action.
- The phone stays logged in for `SessionDays`. Admin can revoke a user's sessions.

---

## 6. Anti-pencil-whipping rules (core requirement — do not simplify away)

1. **QR at the machine.** An inspection starts by scanning the asset's QR label (content: `NCM:<AssetID>`). Manual asset selection is allowed only with a mandatory reason (e.g. label damaged) → flag `MANUAL_ASSET`.
2. **Server time is the truth.** Store device start/submit times and the server receive time. Device clock differing from server by more than `ClockSkewFlagMin` → `CLOCK_SKEW`.
3. **Too fast.** `DurationSec < MinDurationSec` of the template → `TOO_FAST`.
4. **Copied readings.** A `VariesExpected = Y` number identical to the same asset's previous value for `IdenticalReadingsFlagCount` consecutive inspections → `IDENTICAL_READINGS`.
5. **Hour meter going backwards** → `HOURS_BACKWARDS` (comment required on the phone before submit).
6. **Never a defect.** An asset with zero fails for `ZeroFailFlagCount` consecutive inspections → `ZERO_FAIL_STREAK` (information only).
7. **Photo evidence.**
   - Taken from the camera (`<input type="file" accept="image/*" capture="environment">`).
   - If EXIF `DateTimeOriginal` exists and is earlier than inspection start by more than 10 min → `PHOTO_OLD`.
   - The phone **burns a watermark** into every photo before upload: AssetID, date and time, inspector name, InspectionID, and GPS if available. This makes photos valid as close-out evidence (asset tag + timestamp in frame).
   - Resize to `PhotoMaxPx` on the long side, JPEG quality `PhotoJpegQuality` (target ≈200 KB).
8. **Random audits.** Every week the server selects `AuditPercent` of last week's submitted inspections (minimum `AuditMinPerWeek`) for re-inspection by an engineer. The engineer performs the same template on the same asset; the app compares answers and records the discrepancy count. Discrepancy rate per inspector appears on the dashboard.
9. **Immutable records.** A submitted inspection is never edited. A correction is a new inspection linked to the old one in `Notes`/`Flags`.
10. **Report with evidence.** A defect raised from an inspection fail or from Report problem needs at least one watermarked photo (camera only), so a problem that cannot be fixed now is still recorded with proof.
11. **Close with evidence.** A defect cannot be Resolved without an after-photo and a resolution note. Critical and Major defects must be Verified by an Engineer/Admin. DNO is cleared only on verification.
12. `LATE_SYNC` (received more than `LateSyncInfoHours` after submit) is information only — offline is legitimate.

Flags are never shown to the technician; they appear on the admin dashboard.

---

## 7. Task scheduling (due logic)

Tasks are computed from active `Assignments` whose date range covers today:

- **Daily:** due every day in `WorkingDays`; overdue after the day ends.
- **Weekly:** due once per week on `DueWeekday`; overdue after `WeeklyGraceDays`.
- **Monthly:** due once per calendar month; overdue after the month ends.
- **250h:** due when (latest hour-meter reading of the asset from any inspection) − (hour meter at the last completed 250h inspection) ≥ `H250Interval`; shown as "coming due" from `H250WarnAt`. If no 250h inspection exists yet, it is due immediately (baseline).
- An inspection done by an Engineer/Admin on the same asset and template also satisfies the task.

---

## 8. Screens

Common: language toggle (AR/EN, `dir="rtl"` for Arabic), online/offline indicator, "pending N" sync counter, app version.

**Technician / Engineer**
1. **Login** — UserID + PIN; change PIN on first login.
2. **My Tasks (home)** — Overdue (red), Due today, Coming due, Done this week. Grouped by asset; each card shows asset, template and due date. Big "Scan QR" button.
3. **Asset screen** (after scan) — asset info, DNO banner if any, open defects on this asset, list of templates the user may start, "Report defect" button.
4. **Inspection form** — hour meter and a photo of the meter first (if `HasHourMeter`), then one card per item, grouped by section; huge OK / FAIL (/ N/A) buttons; numeric keypad for numbers with live range colouring; photo button where required; comment mandatory on FAIL/OUT_OF_RANGE; progress bar; cannot submit until every required item is answered; draft auto-saved locally.
5. **Review & submit** — list of failed items with proposed severity; confirm.
6. **My Defects** — defects assigned to me; update status, add after-photo and resolution note.
7. **Report problem** (big button on My Tasks, usable in under 30 seconds) — scan the asset QR (or pick with a reason), take at least one photo, short description, then one question: **"Can it keep running now?"** → Yes / Yes with monitoring (enter the interim action) / No (DNO). Saved offline like inspections.

**Engineer extras:** defect queue (assign, **plan**, verify), concession for Critical fails during a pour, backlog per asset, audit list.
- **Plan a defect:** when, parts, PR number (`ExternalRef`), hours, crew, interim action, review date.

**Admin**
8. **Dashboard** — compliance % by person / class / week; overdue list; open defects by severity and age; DNO list; active concessions; deferred backlog (planned vs past `ReviewBy`); flagged inspections; audit discrepancy rate; items with `TBC` limits.
9. **Assignments** — bulk assign: pick a user, select many assets (filter by class/group), pick a template and a date range, set weekday spreading automatically.
10. **QR labels** — printable A4 sheet of labels (QR + AssetID + description) for selected assets.
11. **Users & Settings** — edit basic fields, reset PIN, revoke sessions. (Checklist editing is done directly in the Sheet in Phase 1.)

UI rules: minimum 48 px touch targets, base font ≥ 16 px, high-contrast theme, works one-handed, no hover-dependent controls, Western digits, dates `dd/mm/yyyy`, times 24 h, timezone Africa/Cairo.

---

## 9. Offline and sync

- On login and whenever online (at most every 2 hours), `bootstrap` downloads: the user, settings, active assets, templates, items, the user's assignments, the user's open defects, and the last readings needed for due logic. Stored in IndexedDB.
- Submissions (inspection + answers + defects) go into an IndexedDB queue first, then sync in the background with exponential backoff. Photos upload as separate requests (`uploadPhoto`), then the inspection record references their Drive file IDs.
- Delete from the queue **only after the server confirms**. Never lose data on app close, reload or phone restart.
- If the app version is below `MinAppVersion`, force refresh of the service worker before new submissions (queued data is kept).

---

## 10. API actions (Apps Script)

| Action | Role | Purpose |
|---|---|---|
| `login` | any | UserID + PIN → token |
| `changePin` | any | first-login / user change |
| `bootstrap` | any | reference data for this user |
| `submitInspection` | any | inspection + answers + new defects (idempotent) |
| `uploadPhoto` | any | base64 JPEG → Drive file ID (idempotent by file name) |
| `getPhoto` | any | thumbnail for display |
| `listDefects` | any | own (technician) / all (engineer, admin) |
| `updateDefect` | any (rules per role) | status changes, notes, photos; plan and concession fields: engineer, admin |
| `raiseDefect` | any | ad-hoc defect |
| `listAudits` / `submitAudit` | engineer, admin | audit workflow |
| `dashboard` | engineer, admin | aggregated figures |
| `saveAssignments` | admin | bulk create/end assignments |
| `adminUsers` | admin | reset PIN, revoke sessions, activate/deactivate |

Validate every input on the server (types, enums, asset exists and is Active, user is assigned or has the role).

---

## 11. Phases

**Phase 1 — pilot (pumps):** CP, SP, PB, SPD. Login, task list, QR, inspection form, offline queue, photos with watermark, defects (open → verified), DNO, basic dashboard, bulk assignments, QR labels. Pilot length: 2 weeks with a few technicians and engineers, then review.

**Phase 2:** truck mixers, batch plants, ice plants, chillers and tank (checklists added in the Sheet); audits; full flag dashboard; monthly Excel export of resolved defects in the department Daily Report column format **`date | job location | description | points | worker`**; yearly archive.

**Phase 3:** drivers/operators daily pre-start checks; stoppages log. Keep NCM's existing rule: **Hold ≠ Breakdown** — a Hold means no production demand, has no maintenance fields and no spare parts, and mechanical availability counts Breakdowns only. Because of this, the inspection "do not operate" state is called **DNO**, never "Hold". Possible: link defects waiting for parts to PR numbers; share a defect summary to WhatsApp via a `wa.me` text link (no WhatsApp API).

---

## 12. Repository layout

```
/CLAUDE.md
/docs/SPEC.md                 ← this file
/docs/SETUP.md                ← step-by-step setup guide (write it during Step 0)
/apps-script/Code.gs          ← router + actions (split into several .gs files if large)
/apps-script/appsscript.json
/web/index.html
/web/manifest.json
/web/sw.js
/web/config.js
/web/css/app.css
/web/js/*.js                  ← modules: api, db (IndexedDB), sync, i18n, ui, scan, photo, tasks, inspect, defects, admin
/web/i18n/ar.json  /web/i18n/en.json
/web/vendor/                  ← pinned third-party libs
/web/icons/
```

A **mock API mode** (`config.js: MOCK = true`) must let the whole frontend run locally against fake data, so UI work does not need Google every time.

---

## 13. Build order for Phase 1 (one step at a time, Mohamed tests each on his phone before the next)

0. Repo skeleton, `SETUP.md`, PWA shell (manifest, service worker), i18n with RTL, mock API, login screen.
1. Apps Script: `login`, `changePin`, `bootstrap`; frontend task list from real assignments.
2. QR scanning, asset screen, inspection form, local drafts, offline queue and `submitInspection`.
3. Photo capture, resize, watermark, `uploadPhoto`, `getPhoto`.
4. Defects: creation from fails, Report problem, My Defects, engineer queue, planning (Planned / backlog / review date), concession, verification, DNO.
5. Admin: bulk assignments, QR label printing, basic dashboard.
6. Flags (section 6, items 1–7) and the `TBC` limits warning.
