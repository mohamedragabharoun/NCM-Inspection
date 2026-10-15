// Fake backend for MOCK mode. Mirrors the Apps Script API contract (SPEC section 10)
// so screens can be built and tested without Google. State lives in this browser only.

import DATA from './mock-data.js';
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
