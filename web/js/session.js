// The signed-in user's session, kept on the phone so the app opens offline.

import { CONFIG } from '../config.js';
import { kvGet, kvSet, kvDelete } from './db.js';

const KEY = 'session';

// Which backend issued a session or data: demo data and the real server must never mix
// (e.g. a phone that tried the demo before the app was connected to Google).
export function backendId() {
  return CONFIG.MOCK ? 'mock' : CONFIG.API_URL;
}

// Session shape: { token, expiresAt (ISO), mustChangePin, backend, user: { UserID, NameAR, NameEN, Role } }
export async function getSession() {
  const s = await kvGet(KEY);
  if (!s || !s.token) return null;
  const expired = s.expiresAt && Date.parse(s.expiresAt) <= Date.now();
  if (expired || s.backend !== backendId()) {
    await kvDelete(KEY);
    return null;
  }
  return s;
}

export const saveSession = (session) => kvSet(KEY, { ...session, backend: backendId() });
export const clearSession = () => kvDelete(KEY);

export async function getToken() {
  const s = await getSession();
  return s ? s.token : null;
}
