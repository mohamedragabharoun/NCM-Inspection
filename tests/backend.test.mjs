// Backend (Apps Script) tests through the fake Google services in gas-harness.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackend } from './gas-harness.mjs';
import { computeTasks, STATUS } from '../web/js/tasks.js';
import { dateIn, addDays, weekdayCode } from '../web/js/dates.js';

const today = dateIn('Africa/Cairo');

// Fresh backend after setupProject; returns the first PINs read from the execution log.
function setUp() {
  const be = createBackend();
  be.run('setupProject');
  const pins = {};
  for (const line of be.logs.join('\n').split('\n')) {
    const m = line.match(/^(\S+) .*PIN (\d{6})$/);
    if (m) pins[m[1]] = m[2];
  }
  return { be, pins };
}

function signIn(be, userId, pin, newPin = '2580') {
  const login = be.call({ action: 'login', userId, pin });
  assert.equal(login.ok, true, JSON.stringify(login));
  if (login.data.mustChangePin) {
    const res = be.call({ action: 'changePin', token: login.data.token, oldPin: pin, newPin });
    assert.equal(res.ok, true, JSON.stringify(res));
  }
  return login.data.token;
}

test('setupProject stores the Sheet ID, formats hash columns as text and creates first PINs', () => {
  const { be, pins } = setUp();
  assert.equal(be.props.SHEET_ID, 'FAKE_SHEET_ID');
  assert.deepEqual(Object.keys(pins).sort(), ['U001', 'U002']);
  const users = be.rows('Users');
  assert.ok(users.every((u) => /^[0-9a-f]{64}$/.test(u.PINHash) && u.MustChangePIN === 'Y'));
  assert.ok(be.sheets.Users.formats.length >= 3);
  // Running it again keeps the existing PINs.
  be.logs.length = 0;
  be.run('createInitialPins');
  assert.match(be.logs.join('\n'), /already has a PIN/);
});

test('setupProject on a new empty Sheet builds the tabs from the template', () => {
  const be = createBackend({ empty: true });
  be.run('setupProject');
  const tabs = be.spreadsheet.getSheets().map((s) => s.getName());
  assert.equal(tabs[0], 'README');
  assert.ok(!tabs.includes('Sheet1'));
  assert.ok(tabs.includes('Defects') && tabs.includes('ChecklistItems'));
  assert.ok(!tabs.some((n) => n.startsWith('Copy of')));
  assert.equal(be.spreadsheet.getName(), 'NCM_Inspection_DB');
  assert.equal(be.spreadsheet.getSpreadsheetTimeZone(), 'Africa/Cairo');
  assert.deepEqual(be.trashed, ['TEMP']);
  assert.match(be.logs.join('\n'), /U002 .*PIN \d{6}/);
});

test('setupProject refuses a Sheet with a missing column', () => {
  const be = createBackend();
  be.sheets.Defects.values[0] = be.sheets.Defects.values[0].filter((h) => h !== 'ReviewBy');
  assert.throws(() => be.run('setupProject'), /Defects: missing column\(s\) ReviewBy/);
});

test('login: wrong PIN, lock after PinMaxAttempts, unknown user', () => {
  const { be, pins } = setUp();
  for (let i = 0; i < 4; i++) assert.equal(be.call({ action: 'login', userId: 'U002', pin: '000000' }).error.code, 'BAD_LOGIN');
  assert.equal(be.call({ action: 'login', userId: 'U002', pin: '000000' }).error.code, 'BAD_LOGIN');
  const locked = be.call({ action: 'login', userId: 'u002', pin: pins.U002 });
  assert.equal(locked.error.code, 'LOCKED');
  assert.equal(locked.error.minutes, 15);
  assert.equal(be.call({ action: 'login', userId: 'U999', pin: '123456' }).error.code, 'BAD_LOGIN');
});

test('first sign-in: must change PIN before anything else, weak PIN refused', () => {
  const { be, pins } = setUp();
  const login = be.call({ action: 'login', userId: 'U002', pin: pins.U002 });
  assert.equal(login.data.mustChangePin, true);
  assert.equal(login.data.user.Role, 'Technician');
  assert.equal(login.data.token.length, 64);
  const { token } = login.data;
  assert.equal(be.call({ action: 'bootstrap', token }).error.code, 'MUST_CHANGE_PIN');
  assert.equal(be.call({ action: 'changePin', token, oldPin: '999999', newPin: '2580' }).error.code, 'BAD_LOGIN');
  assert.equal(be.call({ action: 'changePin', token, oldPin: pins.U002, newPin: '123456' }).error.code, 'PIN_WEAK');
  assert.equal(be.call({ action: 'changePin', token, oldPin: pins.U002, newPin: '12' }).error.code, 'PIN_FORMAT');
  assert.equal(be.call({ action: 'changePin', token, oldPin: pins.U002, newPin: '2580' }).ok, true);
  assert.equal(be.rows('Users').find((u) => u.UserID === 'U002').MustChangePIN, 'N');
  assert.equal(be.call({ action: 'bootstrap', token }).ok, true);
  // Old PIN no longer works, new one does.
  assert.equal(be.call({ action: 'login', userId: 'U002', pin: pins.U002 }).error.code, 'BAD_LOGIN');
  assert.equal(be.call({ action: 'login', userId: 'U002', pin: '2580' }).data.mustChangePin, false);
  // Only the token hash is stored.
  assert.ok(!JSON.stringify(be.sheets.Sessions.values).includes(token));
});

test('inactive user cannot sign in; logout revokes the session', () => {
  const { be, pins } = setUp();
  const token = signIn(be, 'U002', pins.U002);
  assert.equal(be.call({ action: 'logout', token }).ok, true);
  assert.equal(be.call({ action: 'bootstrap', token }).error.code, 'NO_SESSION');
  const users = be.sheets.Users.values;
  users[2][users[0].indexOf('Active')] = 'N';
  assert.equal(be.call({ action: 'login', userId: 'U002', pin: '2580' }).error.code, 'INACTIVE');
});

test('bad requests', () => {
  const { be } = setUp();
  assert.equal(be.call('not json').error.code, 'BAD_REQUEST');
  assert.equal(be.call({ nothing: 1 }).error.code, 'BAD_REQUEST');
  assert.equal(be.call({ action: 'dropTables' }).error.code, 'UNKNOWN_ACTION');
  assert.equal(be.call({ action: 'toString' }).error.code, 'UNKNOWN_ACTION');
  assert.equal(be.call({ action: 'bootstrap', token: 'x'.repeat(64) }).error.code, 'NO_SESSION');
  assert.equal(be.call({ action: 'bootstrap' }).error.code, 'NO_SESSION');
});

test('unexpected errors return SERVER and are written to the Log tab', () => {
  const { be, pins } = setUp();
  const token = signIn(be, 'U002', pins.U002);
  delete be.sheets.Inspections;
  const res = be.call({ action: 'bootstrap', token });
  assert.equal(res.error.code, 'SERVER');
  const log = be.rows('Log').pop();
  assert.equal(log.Action, 'bootstrap');
  assert.equal(log.UserID, 'U002');
  assert.match(log.Message, /Missing tab in the Sheet: Inspections/);
});

test('bootstrap: reference data, assignments, history, hour meters → task list', () => {
  const { be, pins } = setUp();
  const dueToday = weekdayCode(today);
  const span = { StartDate: addDays(today, -30), EndDate: addDays(today, 30) };
  be.addRow('Assignments', { AssignmentID: 'T1', UserID: 'U002', AssetID: 'CP08', TemplateID: 'CP-W', DueWeekday: dueToday, ...span });
  be.addRow('Assignments', { AssignmentID: 'T2', UserID: 'U002', AssetID: 'CP12', TemplateID: 'CP-250', ...span });
  be.addRow('Assignments', { AssignmentID: 'T3', UserID: 'U002', AssetID: 'PB09', TemplateID: 'PB-W', DueWeekday: dueToday, ...span });
  be.addRow('Assignments', { AssignmentID: 'T4', UserID: 'U001', AssetID: 'CP09', TemplateID: 'CP-W', ...span });
  be.addRow('Assignments', { AssignmentID: 'T5', UserID: 'U002', AssetID: 'CP09', TemplateID: 'CP-W', StartDate: addDays(today, 5), EndDate: addDays(today, 30) });
  be.addRow('Assets', { AssetID: 'PB09', Class: 'PB', Status: 'Active', Responsibility: 'TITAN-2', HasHourMeter: 'N' });
  const at = (offsetDays) => new Date(Date.parse(`${addDays(today, offsetDays)}T07:00:00Z`)).toISOString();
  be.addRow('Inspections', { InspectionID: 'INS-1', AssetID: 'CP08', TemplateID: 'CP-W', UserID: 'U002', SubmittedAtDevice: at(-7), HourMeter: 900 });
  be.addRow('Inspections', { InspectionID: 'INS-2', AssetID: 'CP12', TemplateID: 'CP-250', UserID: 'U001', SubmittedAtDevice: at(-20), HourMeter: 1000 });
  be.addRow('Inspections', { InspectionID: 'INS-3', AssetID: 'CP12', TemplateID: 'CP-D', UserID: 'U002', SubmittedAtDevice: at(-1), HourMeter: 1240 });

  const token = signIn(be, 'U002', pins.U002);
  const res = be.call({ action: 'bootstrap', token });
  assert.equal(res.ok, true, JSON.stringify(res.error));
  const d = res.data;

  assert.equal(d.settings.Timezone, 'Africa/Cairo');
  assert.equal(d.user.UserID, 'U002');
  assert.ok(!('PINHash' in d.user));
  assert.ok(d.assets.every((a) => a.Responsibility !== 'TITAN-2'), 'technician must not get TITAN-2 assets');
  assert.ok(d.assets.every((a) => !String(a.AssetID).startsWith('(')), 'placeholder rows are skipped');
  assert.equal(d.templates.length, 7);
  assert.ok(d.items.length > 50 && d.items.every((i) => !('_row' in i)));
  assert.deepEqual(d.assignments.map((a) => a.AssignmentID).sort(), ['T1', 'T2']);
  assert.deepEqual(d.history.map((h) => h.Role), ['Technician', 'Admin']);
  assert.deepEqual(d.meters.CP12, { hours: 1240, date: addDays(today, -1) });
  assert.deepEqual(d.last250['CP12|CP-250'], { hours: 1000, date: addDays(today, -20) });

  const tasks = computeTasks({ today, ...d });
  const byKey = Object.fromEntries(tasks.map((t) => [t.key, t]));
  assert.equal(byKey['CP08|CP-W'].status, STATUS.DUE);
  assert.equal(byKey['CP12|CP-250'].status, STATUS.COMING);
  assert.equal(byKey['CP12|CP-250'].hoursSince, 240);

  // Engineers and admins still see TITAN-2 assets.
  const adminToken = signIn(be, 'U001', pins.U001);
  const admin = be.call({ action: 'bootstrap', token: adminToken }).data;
  assert.ok(admin.assets.some((a) => a.AssetID === 'PB09'));
  assert.deepEqual(admin.assignments.map((a) => a.AssignmentID), ['T4']);
});
