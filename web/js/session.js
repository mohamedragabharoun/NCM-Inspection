// The signed-in user's session, kept on the phone so the app opens offline.

import { kvGet, kvSet, kvDelete } from './db.js';

const KEY = 'session';

// Session shape: { token, expiresAt (ISO), mustChangePin, user: { UserID, NameAR, NameEN, Role } }
export async function getSession() {
  const s = await kvGet(KEY);
  if (!s || !s.token) return null;
  if (s.expiresAt && Date.parse(s.expiresAt) <= Date.now()) {
    await kvDelete(KEY);
    return null;
  }
  return s;
}

export const saveSession = (session) => kvSet(KEY, session);
export const clearSession = () => kvDelete(KEY);

export async function getToken() {
  const s = await getSession();
  return s ? s.token : null;
}
