// My Tasks (home): task list grouped by status, then by asset.

import { call } from './api.js';
import { formatDate, formatTime } from './dates.js';
import { t, getLang } from './i18n.js';
import { getRef, isStale, refreshRef, clearRef, todayFor, timeZoneOf } from './refdata.js';
import { clearSession } from './session.js';
import { computeTasks, STATUS_ORDER } from './tasks.js';
import { h, mount, errorBox, errorText } from './ui.js';

const byLang = (row, field) => (getLang() === 'ar' ? row[`${field}AR`] : row[`${field}EN`]) || row[`${field}EN`] || row[`${field}AR`] || '';

function dueText(task, today) {
  const { status } = task;
  if (task.baseline) return t('tasks.baseline');
  if (task.hoursSince != null && status !== 'DONE') {
    return t('tasks.hours', { since: Math.round(task.hoursSince), interval: task.interval });
  }
  if (status === 'OVERDUE') return t('tasks.overdueSince', { date: formatDate(task.dueDate) });
  if (status === 'DONE') return t('tasks.doneOn', { date: formatDate(task.doneDate) });
  if (status === 'DUE') return task.dueDate === today ? t('tasks.dueToday') : t('tasks.dueBy', { date: formatDate(task.dueDate) });
  return t('tasks.dueOn', { date: formatDate(task.dueDate) });
}

function taskRow(task, today) {
  return h('li', { class: 'task-row' },
    h('span', { class: 'level' }, t(`levels.${task.template.Level}`)),
    h('span', { class: 'task-main' },
      h('span', { class: 'task-name' }, byLang(task.template, 'Name')),
      h('span', { class: 'task-due' }, dueText(task, today))));
}

function assetCard(assetTasks, today) {
  const { asset } = assetTasks[0];
  return h('div', { class: 'card asset-card' },
    h('div', { class: 'asset-head' },
      h('span', { class: 'asset-id' }, asset.AssetID),
      h('span', { class: 'asset-desc' }, byLang(asset, 'Description'))),
    h('ul', { class: 'task-list' }, assetTasks.map((task) => taskRow(task, today))));
}

function statusSection(status, tasks, today) {
  const byAsset = new Map();
  for (const task of tasks) {
    if (!byAsset.has(task.asset.AssetID)) byAsset.set(task.asset.AssetID, []);
    byAsset.get(task.asset.AssetID).push(task);
  }
  return h('section', { class: `status-section status-${status.toLowerCase()}` },
    h('h2', {}, `${t(`tasks.${status}`)} (${tasks.length})`),
    [...byAsset.values()].map((list) => assetCard(list, today)));
}

function taskSections(ref) {
  const today = todayFor(ref);
  const tasks = computeTasks({ today, ...ref });
  if (!ref.assignments || ref.assignments.length === 0) return h('div', { class: 'msg msg-info' }, t('tasks.empty'));
  const sections = STATUS_ORDER
    .map((status) => [status, tasks.filter((task) => task.status === status)])
    .filter(([, list]) => list.length > 0)
    .map(([status, list]) => statusSection(status, list, today));
  const nothingDue = !tasks.some((task) => task.status === 'OVERDUE' || task.status === 'DUE');
  return [nothingDue ? h('div', { class: 'msg msg-ok' }, t('tasks.allClear')) : null, ...sections];
}

export async function showHome({ session, onLogout }) {
  const { user } = session;
  const root = h('div');
  mount(root);

  let ref = await getRef(user.UserID);
  let refreshing = false;
  let error = null;

  // messageKey: i18n key shown on the login screen when the server ended the session.
  const logout = async (messageKey) => {
    // Queued inspections stay on the phone; only the session and cached reference data go.
    if (!messageKey) call('logout').catch(() => {});
    await clearSession();
    await clearRef();
    onLogout(messageKey);
  };

  const refresh = async () => {
    if (refreshing) return;
    refreshing = true;
    error = null;
    render();
    try {
      ref = await refreshRef();
    } catch (err) {
      if (err.code === 'NO_SESSION') { refreshing = false; await logout('errors.NO_SESSION'); return; }
      error = errorText(err);
    }
    refreshing = false;
    render();
  };

  function render() {
    if (!root.isConnected) return; // user left this screen meanwhile
    const name = getLang() === 'ar' ? user.NameAR : user.NameEN;
    const updated = ref
      ? t('tasks.updatedAt', { time: `${formatDate(todayFor(ref))} ${formatTime(new Date(ref.fetchedAt), timeZoneOf(ref))}` })
      : t('tasks.neverUpdated');

    let body;
    if (ref) body = taskSections(ref);
    else if (refreshing) body = h('div', { class: 'msg msg-info' }, t('tasks.loadingFirst'));
    else if (!navigator.onLine) body = h('div', { class: 'msg msg-info' }, t('tasks.needInternet'));
    else body = null;

    root.replaceChildren(...[
      h('h1', {}, t('home.hello', { name })),
      h('p', { class: 'muted' }, t('home.role', { role: t(`roles.${user.Role}`) })),
      h('div', { class: 'action-row' },
        h('button', { type: 'button', class: 'btn btn-big', disabled: true, title: t('home.soon') }, t('home.scan')),
        h('button', { type: 'button', class: 'btn btn-big btn-accent', disabled: true, title: t('home.soon') }, t('home.report'))),
      h('div', { class: 'sync-row' },
        h('span', { class: 'muted' }, updated),
        h('button', { type: 'button', class: 'btn btn-ghost btn-small', disabled: refreshing, onclick: refresh },
          refreshing ? t('tasks.refreshing') : t('tasks.refresh'))),
      error ? errorBox(error) : null,
      body,
      h('button', { type: 'button', class: 'btn btn-ghost btn-block logout', onclick: () => logout() }, t('common.logout')),
    ].flat().filter(Boolean));
  }

  render();
  if (isStale(ref) && navigator.onLine) refresh();
}
