// Run from the project folder: node --test "tests/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTasks, STATUS } from '../web/js/tasks.js';
import { dateIn, weekStartOf, monthEnd, quarterEnd, addDays, weekdayCode, formatDate } from '../web/js/dates.js';

const settings = { WorkingDays: 'SAT,SUN,MON,TUE,WED,THU', WeeklyGraceDays: 2, H250Interval: 250, H250WarnAt: 230 };
const asset = (id, extra = {}) => ({ AssetID: id, Class: 'CP', Status: 'Active', Responsibility: 'NCM', HasHourMeter: 'Y', ...extra });
const templates = [
  { TemplateID: 'CP-D', Level: 'Daily', Active: 'Y' },
  { TemplateID: 'CP-W', Level: 'Weekly', Active: 'Y' },
  { TemplateID: 'PB-M', Level: 'Monthly', Active: 'Y' },
  { TemplateID: 'CP-250', Level: '250h', Active: 'Y' },
  { TemplateID: 'OLD', Level: 'Weekly', Active: 'N' },
];
const assign = (assetId, templateId, extra = {}) => ({
  AssignmentID: `${assetId}-${templateId}`, UserID: 'U002', AssetID: assetId, TemplateID: templateId,
  StartDate: '2026-09-01', EndDate: '2026-12-31', DueWeekday: '', ...extra,
});
const insp = (assetId, templateId, date, userId = 'U002', role = 'Technician') => ({ AssetID: assetId, TemplateID: templateId, UserID: userId, Role: role, Date: date });

function one(today, assignment, history = [], extra = {}) {
  const tasks = computeTasks({
    today, settings, templates, assets: [asset('CP07'), asset('PB01', { Class: 'PB' })],
    assignments: [assignment], history, ...extra,
  });
  return tasks[0] || null;
}

// 2026-10-15 is a Thursday; the NCM week started Saturday 2026-10-10.
const THU = '2026-10-15';

test('dates helpers', () => {
  assert.equal(weekdayCode(THU), 'THU');
  assert.equal(weekStartOf(THU, 'SAT'), '2026-10-10');
  assert.equal(weekStartOf('2026-10-10', 'SAT'), '2026-10-10');
  assert.equal(weekStartOf('2026-10-16', 'SAT'), '2026-10-10');
  assert.equal(monthEnd('2028-02-10'), '2028-02-29');
  assert.equal(quarterEnd('2026-11-05'), '2026-12-31');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(formatDate('2026-10-05'), '05/10/2026');
  // 22:30 UTC on the 15th is already the 16th in Cairo (UTC+3 in October).
  assert.equal(dateIn('Africa/Cairo', new Date('2026-10-15T22:30:00Z')), '2026-10-16');
});

test('daily: due on a working day, done when inspected today, nothing on Friday', () => {
  assert.equal(one(THU, assign('CP07', 'CP-D')).status, STATUS.DUE);
  assert.equal(one(THU, assign('CP07', 'CP-D'), [insp('CP07', 'CP-D', THU)]).status, STATUS.DONE);
  assert.equal(one('2026-10-16', assign('CP07', 'CP-D')), null);
});

test('weekly: due day, coming, overdue after grace, done', () => {
  const lastWeekDone = (due) => [insp('CP07', 'CP-W', addDays(due, -7))];
  // Due today.
  let t = one(THU, assign('CP07', 'CP-W', { DueWeekday: 'THU' }), lastWeekDone(THU));
  assert.deepEqual([t.status, t.dueDate], [STATUS.DUE, THU]);
  // Monday: Thursday is still coming.
  t = one('2026-10-12', assign('CP07', 'CP-W', { DueWeekday: 'THU' }), lastWeekDone(THU));
  assert.deepEqual([t.status, t.dueDate], [STATUS.COMING, THU]);
  // Due Sunday 11th, grace 2 days → overdue from Wednesday 14th.
  t = one('2026-10-13', assign('CP07', 'CP-W', { DueWeekday: 'SUN' }), lastWeekDone('2026-10-11'));
  assert.equal(t.status, STATUS.DUE);
  t = one(THU, assign('CP07', 'CP-W', { DueWeekday: 'SUN' }), lastWeekDone('2026-10-11'));
  assert.deepEqual([t.status, t.dueDate], [STATUS.OVERDUE, '2026-10-11']);
  // Done this week.
  t = one(THU, assign('CP07', 'CP-W', { DueWeekday: 'SUN' }), [insp('CP07', 'CP-W', '2026-10-12')]);
  assert.deepEqual([t.status, t.doneDate], [STATUS.DONE, '2026-10-12']);
});

test('weekly: missed last week stays overdue until the next inspection (catch-up)', () => {
  const a = assign('CP07', 'CP-W', { DueWeekday: 'SUN' });
  let t = one(THU, a, []);
  assert.deepEqual([t.status, t.dueDate], [STATUS.OVERDUE, '2026-10-04']);
  // One late inspection clears it and counts for this week.
  t = one(THU, a, [insp('CP07', 'CP-W', '2026-10-14')]);
  assert.equal(t.status, STATUS.DONE);
});

test('weekly: Thursday task inside grace on Saturday, one inspection closes both weeks', () => {
  const a = assign('CP07', 'CP-W', { DueWeekday: 'THU' });
  const sat = '2026-10-17';
  let t = one(sat, a, [insp('CP07', 'CP-W', '2026-10-08')]);
  assert.deepEqual([t.status, t.dueDate], [STATUS.DUE, THU]);
  t = one(sat, a, [insp('CP07', 'CP-W', '2026-10-08'), insp('CP07', 'CP-W', sat)]);
  assert.equal(t.status, STATUS.DONE);
});

test('weekly: assignment starting after this week\'s due day shows next week', () => {
  const t = one(THU, assign('CP07', 'CP-W', { DueWeekday: 'SUN', StartDate: '2026-10-13' }));
  assert.deepEqual([t.status, t.dueDate], [STATUS.COMING, '2026-10-18']);
});

test('weekly: inspection by another technician does not count, by an engineer it does', () => {
  const a = assign('CP07', 'CP-W', { DueWeekday: 'SUN' });
  const base = [insp('CP07', 'CP-W', '2026-10-04')];
  assert.equal(one(THU, a, [...base, insp('CP07', 'CP-W', '2026-10-12', 'U009')]).status, STATUS.OVERDUE);
  assert.equal(one(THU, a, [...base, insp('CP07', 'CP-W', '2026-10-12', 'U001', 'Engineer')]).status, STATUS.DONE);
});

test('monthly: due all month, overdue when last month was missed, hidden if done earlier this month', () => {
  const a = assign('PB01', 'PB-M');
  assert.deepEqual([one(THU, a).status, one(THU, a).dueDate], [STATUS.OVERDUE, '2026-09-30']);
  const sep = [insp('PB01', 'PB-M', '2026-09-20')];
  assert.deepEqual([one(THU, a, sep).status, one(THU, a, sep).dueDate], [STATUS.DUE, '2026-10-31']);
  assert.equal(one(THU, a, [...sep, insp('PB01', 'PB-M', '2026-10-03')]), null);
  assert.equal(one(THU, a, [...sep, insp('PB01', 'PB-M', '2026-10-12')]).status, STATUS.DONE);
});

test('250h: baseline, coming, due, hidden; no hour meter → no task', () => {
  const a = assign('CP07', 'CP-250');
  const run = (latest, last, assetExtra = {}) => computeTasks({
    today: THU, settings, templates, assets: [asset('CP07', assetExtra)], assignments: [a], history: [],
    meters: latest == null ? {} : { CP07: { hours: latest } },
    last250: last == null ? {} : { 'CP07|CP-250': { hours: last } },
  })[0] || null;
  assert.equal(run(null, null).baseline, true);
  assert.deepEqual([run(1240, 1000).status, run(1240, 1000).hoursSince], [STATUS.COMING, 240]);
  assert.equal(run(1260, 1000).status, STATUS.DUE);
  assert.equal(run(1100, 1000), null);
  assert.equal(run(1260, 1000, { HasHourMeter: 'N' }), null);
});

test('filters: TITAN-2 assets, inactive templates, out-of-range or duplicate assignments', () => {
  const tasks = computeTasks({
    today: THU, settings, templates,
    assets: [asset('CP07'), asset('PB09', { Responsibility: 'TITAN-2' }), asset('CP99', { Status: 'Out of service' })],
    assignments: [
      assign('CP07', 'CP-D'), assign('CP07', 'CP-D'),
      assign('PB09', 'CP-D'), assign('CP99', 'CP-D'), assign('CP07', 'OLD'),
      assign('CP07', 'CP-W', { StartDate: '2026-11-01' }),
    ],
  });
  assert.deepEqual(tasks.map((t) => t.key), ['CP07|CP-D']);
});
