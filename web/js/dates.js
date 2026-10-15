// Calendar helpers. Dates are plain 'YYYY-MM-DD' strings in the site timezone (Africa/Cairo),
// so comparisons are simple string comparisons and there are no timezone surprises.

export const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAY_MS = 86400000;

function toUtc(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// Calendar date of an instant in a timezone, e.g. dateIn('Africa/Cairo', new Date()) → '2026-10-15'.
export function dateIn(timeZone, instant = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(iso, n) {
  return fromUtc(toUtc(iso) + n * DAY_MS);
}

// Whole days from b to a (a - b).
export function diffDays(a, b) {
  return Math.round((toUtc(a) - toUtc(b)) / DAY_MS);
}

export function weekdayCode(iso) {
  return DAY_CODES[new Date(toUtc(iso)).getUTCDay()];
}

// First day of the week containing iso. NCM weeks start on the first working day (SAT).
export function weekStartOf(iso, startCode = 'SAT') {
  const offset = (DAY_CODES.indexOf(weekdayCode(iso)) - DAY_CODES.indexOf(startCode) + 7) % 7;
  return addDays(iso, -offset);
}

// Days from the week start to a weekday, e.g. SAT-start week: SAT → 0, THU → 5.
export function weekdayOffset(code, startCode = 'SAT') {
  return (DAY_CODES.indexOf(code) - DAY_CODES.indexOf(startCode) + 7) % 7;
}

export function monthStart(iso) {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEnd(iso) {
  const [y, m] = iso.split('-').map(Number);
  return fromUtc(Date.UTC(y, m, 0));
}

export function quarterStart(iso) {
  const [y, m] = iso.split('-').map(Number);
  const qm = Math.floor((m - 1) / 3) * 3 + 1;
  return `${y}-${String(qm).padStart(2, '0')}-01`;
}

export function quarterEnd(iso) {
  const [y, m] = quarterStart(iso).split('-').map(Number);
  return fromUtc(Date.UTC(y, m + 2, 0));
}

// 'YYYY-MM-DD' → 'dd/mm/yyyy' (site standard, Western digits).
export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Instant → 'HH:mm' (24 h) in the site timezone.
export function formatTime(instant, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(instant);
}
