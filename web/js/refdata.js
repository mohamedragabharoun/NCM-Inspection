// Reference data downloaded by `bootstrap` (settings, assets, templates, items, my assignments,
// recent inspections, hour meters) and kept on the phone so the task list works offline.

import { call } from './api.js';
import { kvGet, kvSet, kvDelete } from './db.js';
import { dateIn } from './dates.js';

const KEY = 'ref';
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // refresh at most every 2 hours (SPEC section 9)
const DEFAULT_TZ = 'Africa/Cairo';

export async function getRef(userId) {
  const ref = await kvGet(KEY);
  return ref && ref.user && ref.user.UserID === userId ? ref : null;
}

export function isStale(ref) {
  return !ref || Date.now() - ref.fetchedAt > MAX_AGE_MS;
}

export async function refreshRef() {
  const data = await call('bootstrap');
  const ref = {
    ...data,
    fetchedAt: Date.now(),
    // Phone clock vs server clock, so "today" is right even if the phone clock is wrong.
    clockOffsetMs: data.serverTime ? Date.parse(data.serverTime) - Date.now() : 0,
  };
  await kvSet(KEY, ref);
  return ref;
}

export const clearRef = () => kvDelete(KEY);

export function timeZoneOf(ref) {
  return (ref && ref.settings && ref.settings.Timezone) || DEFAULT_TZ;
}

export function nowFor(ref) {
  return new Date(Date.now() + ((ref && ref.clockOffsetMs) || 0));
}

export function todayFor(ref) {
  return dateIn(timeZoneOf(ref), nowFor(ref));
}
