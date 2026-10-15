// Due logic for the task list (SPEC section 7). Pure functions: no DOM, no storage, so it is tested in Node.
//
// Rules in short:
// - Daily: due every working day; done when inspected today.
// - Weekly / Monthly / Quarterly: one inspection per period. A missed period shows OVERDUE until the
//   next inspection is done ("catch-up": one late inspection puts the task back on track).
// - Weekly: due on the assignment's DueWeekday, overdue after WeeklyGraceDays.
// - Monthly / Quarterly: due all period long, overdue after the period ends.
// - 250h: due when hours since the last 250h inspection reach H250Interval, coming from H250WarnAt.
//   No 250h inspection yet → due now (baseline).
// - An inspection by the assigned user or by any Engineer/Admin satisfies the task.

import {
  addDays, weekdayCode, weekStartOf, weekdayOffset,
  monthStart, monthEnd, quarterStart, quarterEnd,
} from './dates.js';

export const STATUS = { OVERDUE: 'OVERDUE', DUE: 'DUE', COMING: 'COMING', DONE: 'DONE' };
export const STATUS_ORDER = [STATUS.OVERDUE, STATUS.DUE, STATUS.COMING, STATUS.DONE];

const SUPERVISOR_ROLES = ['Engineer', 'Admin'];

function parseWorkingDays(value) {
  const days = String(value || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  return days.length ? days : ['SAT', 'SUN', 'MON', 'TUE', 'WED', 'THU'];
}

function dailyRule({ today, done, workingDays }) {
  if (done.includes(today)) return { status: STATUS.DONE, doneDate: today };
  if (!workingDays.includes(weekdayCode(today))) return null;
  return { status: STATUS.DUE, dueDate: today };
}

// Shared logic for one-inspection-per-period levels.
// cur / prev: { start, due, dueFrom, deadline } — dueFrom is when the task stops being "coming".
function periodRule({ today, done, assignment, weekStart, cur, prev }) {
  const within = (d, a, b) => d >= a && d <= b;

  // Previous period still open (inside grace) or missed and not yet caught up.
  if (assignment.StartDate <= prev.due && prev.due <= assignment.EndDate) {
    const prevDone = done.some((d) => within(d, prev.start, prev.deadline));
    const caughtUp = done.some((d) => d > prev.deadline);
    if (!prevDone && !caughtUp) {
      const status = today <= prev.deadline ? STATUS.DUE : STATUS.OVERDUE;
      return { status, dueDate: prev.due };
    }
  }

  // Assignment ends before this period's due date: nothing required.
  if (cur.due > assignment.EndDate) return null;

  const curDone = done.filter((d) => d >= cur.start).pop();
  if (curDone) return curDone >= weekStart ? { status: STATUS.DONE, doneDate: curDone } : null;

  // Assignment started after this period's due date: the next period is the first one.
  if (assignment.StartDate > cur.due) return null;

  if (today < cur.dueFrom) return { status: STATUS.COMING, dueDate: cur.due };
  if (today <= cur.deadline) return { status: STATUS.DUE, dueDate: cur.due };
  return { status: STATUS.OVERDUE, dueDate: cur.due };
}

function weeklyRule(ctx) {
  const { today, assignment, weekStartCode, grace } = ctx;
  const dueCode = String(assignment.DueWeekday || weekStartCode).toUpperCase();
  const curStart = weekStartOf(today, weekStartCode);
  const curDue = addDays(curStart, weekdayOffset(dueCode, weekStartCode));
  const cur = { start: curStart, due: curDue, dueFrom: curDue, deadline: addDays(curDue, grace) };
  const prevDue = addDays(curDue, -7);
  const prev = { start: addDays(curStart, -7), due: prevDue, dueFrom: prevDue, deadline: addDays(prevDue, grace) };

  const result = periodRule({ ...ctx, cur, prev });
  // Started after this week's due day: show next week's date so the task is not invisible.
  if (result === null && assignment.StartDate > curDue && addDays(curDue, 7) <= assignment.EndDate) {
    return { status: STATUS.COMING, dueDate: addDays(curDue, 7) };
  }
  return result;
}

function calendarRule(ctx, startOf, endOf) {
  const { today } = ctx;
  const curStart = startOf(today);
  const curEnd = endOf(today);
  const prevEnd = addDays(curStart, -1);
  const cur = { start: curStart, due: curEnd, dueFrom: curStart, deadline: curEnd };
  const prev = { start: startOf(prevEnd), due: prevEnd, dueFrom: startOf(prevEnd), deadline: prevEnd };
  return periodRule({ ...ctx, cur, prev });
}

function hoursRule({ asset, settings, weekStart, allDone, meter, last250 }) {
  if (asset.HasHourMeter !== 'Y') return null;
  const interval = Number(settings.H250Interval) || 250;
  const warnAt = Number(settings.H250WarnAt) || interval;
  const doneThisWeek = allDone.filter((d) => d >= weekStart).pop();

  if (!last250 || last250.hours == null || last250.hours === '') {
    if (doneThisWeek) return { status: STATUS.DONE, doneDate: doneThisWeek };
    return { status: STATUS.DUE, baseline: true };
  }
  const latest = meter && meter.hours !== '' && meter.hours != null ? Number(meter.hours) : Number(last250.hours);
  const since = Math.max(0, latest - Number(last250.hours));
  const info = { hoursSince: since, interval };
  if (since >= interval) return { status: STATUS.DUE, ...info };
  if (since >= warnAt) return { status: STATUS.COMING, ...info };
  if (doneThisWeek) return { status: STATUS.DONE, doneDate: doneThisWeek, ...info };
  return null;
}

/**
 * @param {object} p
 * @param {string} p.today        'YYYY-MM-DD' in the site timezone
 * @param {object} p.settings     Settings tab as { Key: Value }
 * @param {Array}  p.assets       Assets rows
 * @param {Array}  p.templates    ChecklistTemplates rows
 * @param {Array}  p.assignments  this user's Assignments rows (dates as 'YYYY-MM-DD')
 * @param {Array}  p.history      recent inspections: { AssetID, TemplateID, UserID, Role, Date }
 * @param {object} p.meters       { AssetID: { hours, date } } latest hour-meter reading
 * @param {object} p.last250      { 'AssetID|TemplateID': { hours, date } } at the last 250h inspection
 * @returns {Array} tasks: { key, assignment, asset, template, status, dueDate?, doneDate?, hoursSince?, interval?, baseline? }
 */
export function computeTasks({ today, settings = {}, assets = [], templates = [], assignments = [], history = [], meters = {}, last250 = {} }) {
  const workingDays = parseWorkingDays(settings.WorkingDays);
  const weekStartCode = workingDays[0];
  const weekStart = weekStartOf(today, weekStartCode);
  const grace = Number(settings.WeeklyGraceDays) || 0;
  const assetById = new Map(assets.map((a) => [a.AssetID, a]));
  const templateById = new Map(templates.map((t) => [t.TemplateID, t]));
  const seen = new Set();
  const tasks = [];

  for (const assignment of assignments) {
    if (!(assignment.StartDate <= today && today <= assignment.EndDate)) continue;
    const asset = assetById.get(assignment.AssetID);
    const template = templateById.get(assignment.TemplateID);
    if (!asset || !template) continue;
    if (asset.Status !== 'Active' || asset.Responsibility === 'TITAN-2' || template.Active !== 'Y') continue;

    const key = `${assignment.AssetID}|${assignment.TemplateID}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const forTask = history.filter((h) => h.AssetID === assignment.AssetID && h.TemplateID === assignment.TemplateID && h.Date <= today);
    const allDone = forTask.map((h) => h.Date).sort();
    const done = forTask
      .filter((h) => h.UserID === assignment.UserID || SUPERVISOR_ROLES.includes(h.Role))
      .map((h) => h.Date)
      .sort();

    const ctx = { today, settings, asset, assignment, done, allDone, weekStart, weekStartCode, workingDays, grace };
    let result = null;
    switch (template.Level) {
      case 'Daily': result = dailyRule(ctx); break;
      case 'Weekly': result = weeklyRule(ctx); break;
      case 'Monthly': result = calendarRule(ctx, monthStart, monthEnd); break;
      case 'Quarterly': result = calendarRule(ctx, quarterStart, quarterEnd); break;
      case '250h': result = hoursRule({ ...ctx, meter: meters[asset.AssetID], last250: last250[key] }); break;
      default: result = null;
    }
    if (result) tasks.push({ key, assignment, asset, template, ...result });
  }

  return tasks.sort((a, b) =>
    STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
    || String(a.dueDate || a.doneDate || '').localeCompare(String(b.dueDate || b.doneDate || ''))
    || a.asset.AssetID.localeCompare(b.asset.AssetID));
}
