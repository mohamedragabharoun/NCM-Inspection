// My Tasks (home). Step 0: greeting and placeholders; the task list arrives in Step 1.

import { call } from './api.js';
import { t, getLang } from './i18n.js';
import { clearSession } from './session.js';
import { h, mount } from './ui.js';

export function showHome({ session, onLogout }) {
  const { user } = session;
  const name = getLang() === 'ar' ? user.NameAR : user.NameEN;

  const logout = async () => {
    // Queued inspections stay on the phone; only the session is removed.
    call('logout').catch(() => {});
    await clearSession();
    onLogout();
  };

  mount(
    h('h1', {}, t('home.hello', { name })),
    h('p', { class: 'muted' }, t('home.role', { role: t(`roles.${user.Role}`) })),
    h('div', { class: 'stack' },
      h('button', { type: 'button', class: 'btn btn-block btn-big', disabled: true }, t('home.scan')),
      h('button', { type: 'button', class: 'btn btn-block btn-big btn-accent', disabled: true }, t('home.report'))),
    h('div', { class: 'msg msg-info', style: 'margin-top:16px' }, t('home.comingSoon')),
    h('button', { type: 'button', class: 'btn btn-ghost btn-block', onclick: logout }, t('common.logout')),
  );
}
