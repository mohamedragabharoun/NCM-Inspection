// Fake backend for MOCK mode. Mirrors the Apps Script API contract (SPEC section 10)
// so screens can be built and tested without Google. State lives in this browser only.

import DATA from './mock-data.js';
import { addDays, dateIn, weekdayCode } from './dates.js';
import { isPinFormat, isWeakPin } from './pin.js';

const STATE_KEY = 'ncm.mockState';
const DEFAULT_PIN = '1234';
const LATENCY_MS = 300;

function loadState() {
  let state = null;
  try { state = JSON.parse(localStorage.getItem(STATE_KEY)); } catch { /* ignore */ }
  return state || { pins: {}, changed: {}, fails: {}, lockUntil: {}, sessions: {} };
}

function saveState(state) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

const ok = (data) => ({ ok: true, data });
const fail = (code, extra = {}) => ({ ok: false, error: { code, message: code, ...extra } });

function setting(key) {
  return Number(DATA.settings[key]);
}

function publicUser(u) {
  return { UserID: u.UserID, NameAR: u.NameAR, NameEN: u.NameEN, Role: u.Role };
}

function sessionUser(state, token) {
  const s = token && state.sessions[token];
  if (!s || Date.parse(s.expiresAt) <= Date.now()) return null;
  return DATA.users.find((u) => u.UserID === s.userId) || null;
}

// Demo assignments and history built around today's date, so every task group has something in it.
function demoData(today) {
  const span = { StartDate: addDays(today, -30), EndDate: addDays(today, 60) };
  const a = (id, userId, assetId, templateId, dueOffset = null) => ({
    AssignmentID: id, UserID: userId, AssetID: assetId, TemplateID: templateId, ...span,
    DueWeekday: dueOffset === null ? '' : weekdayCode(addDays(today, dueOffset)), Notes: 'Demo',
  });
  const done = (assetId, templateId, offset, userId = 'U002', role = 'Technician') =>
    ({ AssetID: assetId, TemplateID: templateId, UserID: userId, Role: role, Date: addDays(today, offset) });

  return {
    assignments: [
      ...DATA.assignments,
      a('DEMO01', 'U002', 'CP07', 'CP-D'),
      a('DEMO02', 'U002', 'CP08', 'CP-W', 0),
      a('DEMO03', 'U002', 'CP09', 'CP-W', -3),
      a('DEMO04', 'U002', 'CP10', 'CP-W', 2),
      a('DEMO05', 'U002', 'CP11', 'CP-W', -1),
      a('DEMO06', 'U002', 'CP12', 'CP-250'),
      a('DEMO07', 'U002', 'CP07', 'CP-250'),
      a('DEMO08', 'U001', 'CP08', 'CP-D'),
      a('DEMO09', 'U001', 'CP09', 'CP-250'),
    ],
    history: [
      done('CP08', 'CP-W', -7),
      done('CP09', 'CP-W', -10),
      done('CP10', 'CP-W', -5),
      done('CP11', 'CP-W', -8),
      done('CP11', 'CP-W', 0),
    ],
    meters: { CP07: { hours: 860 }, CP09: { hours: 1500 }, CP12: { hours: 1240 } },
    last250: { 'CP12|CP-250': { hours: 1000 }, 'CP09|CP-250': { hours: 1240 } },
  };
}

const actions = {
  login(state, { userId, pin }) {
    const id = String(userId || '').trim().toUpperCase();
    const user = DATA.users.find((u) => u.UserID === id);
    const lockedUntil = state.lockUntil[id] || 0;
    if (lockedUntil > Date.now()) {
      return fail('LOCKED', { minutes: Math.ceil((lockedUntil - Date.now()) / 60000) });
    }
    const expected = state.pins[id] || DEFAULT_PIN;
    if (!user || String(pin) !== expected) {
      if (user) {
        state.fails[id] = (state.fails[id] || 0) + 1;
        if (state.fails[id] >= setting('PinMaxAttempts')) {
          state.lockUntil[id] = Date.now() + setting('PinLockMinutes') * 60000;
          state.fails[id] = 0;
        }
      }
      return fail('BAD_LOGIN');
    }
    if (user.Active !== 'Y') return fail('INACTIVE');
    state.fails[id] = 0;
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + setting('SessionDays') * 86400000).toISOString();
    state.sessions[token] = { userId: id, expiresAt };
    const mustChangePin = user.MustChangePIN === 'Y' && !state.changed[id];
    return ok({ token, expiresAt, mustChangePin, user: publicUser(user) });
  },

  changePin(state, { token, oldPin, newPin }) {
    const user = sessionUser(state, token);
    if (!user) return fail('NO_SESSION');
    const id = user.UserID;
    if (String(oldPin) !== (state.pins[id] || DEFAULT_PIN)) return fail('BAD_LOGIN');
    if (!isPinFormat(newPin)) return fail('PIN_FORMAT');
    if (newPin === oldPin) return fail('PIN_SAME');
    if (isWeakPin(newPin)) return fail('PIN_WEAK');
    state.pins[id] = newPin;
    state.changed[id] = true;
    return ok({});
  },

  logout(state, { token }) {
    delete state.sessions[token];
    return ok({});
  },

  bootstrap(state, { token }) {
    const user = sessionUser(state, token);
    if (!user) return fail('NO_SESSION');
    if (user.MustChangePIN === 'Y' && !state.changed[user.UserID]) return fail('MUST_CHANGE_PIN');
    const today = dateIn(DATA.settings.Timezone);
    const demo = demoData(today);
    const templateIds = new Set(DATA.templates.filter((tpl) => tpl.Active === 'Y').map((tpl) => tpl.TemplateID));
    const assets = DATA.assets.filter((x) => x.Status === 'Active'
      && (user.Role !== 'Technician' || x.Responsibility !== 'TITAN-2'));
    const assignments = demo.assignments.filter((x) => x.UserID === user.UserID && x.StartDate <= today && today <= x.EndDate);
    const keys = new Set(assignments.map((x) => `${x.AssetID}|${x.TemplateID}`));
    return ok({
      serverTime: new Date().toISOString(),
      user: publicUser(user),
      settings: DATA.settings,
      assets,
      templates: DATA.templates.filter((tpl) => templateIds.has(tpl.TemplateID)),
      items: DATA.items.filter((it) => it.Active === 'Y' && templateIds.has(it.TemplateID)),
      assignments,
      history: demo.history.filter((x) => keys.has(`${x.AssetID}|${x.TemplateID}`)),
      meters: demo.meters,
      last250: demo.last250,
      openDefects: [],
    });
  },
};

export async function handle(body) {
  await new Promise((r) => setTimeout(r, LATENCY_MS));
  const fn = actions[body.action];
  if (!fn) return fail('UNKNOWN_ACTION');
  const state = loadState();
  const res = fn(state, body);
  saveState(state);
  return res;
}
