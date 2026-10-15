// Login and first-login PIN change screens.

import { CONFIG } from '../config.js';
import { call } from './api.js';
import { t } from './i18n.js';
import { checkNewPin } from './pin.js';
import { saveSession, getSession } from './session.js';
import { h, mount, errorBox, errorText, busy, toast } from './ui.js';

const LAST_USER_KEY = 'ncm.lastUserId';

function lastUserId() {
  try { return localStorage.getItem(LAST_USER_KEY) || ''; } catch { return ''; }
}

function rememberUserId(id) {
  try { localStorage.setItem(LAST_USER_KEY, id); } catch { /* ignore */ }
}

// The PIN typed at login, kept in memory only, so the server can check it again on changePin.
let loginPin = null;

export function hasLoginPin() {
  return loginPin !== null;
}

export function showLogin({ onDone, message } = {}) {
  const userInput = h('input', {
    id: 'user-id', type: 'text', class: 'ltr-input', autocomplete: 'username',
    autocapitalize: 'characters', spellcheck: 'false', value: lastUserId(), required: true,
  });
  const pinInput = h('input', {
    id: 'pin', type: 'password', class: 'ltr-input', inputmode: 'numeric', pattern: '[0-9]*',
    maxlength: '6', autocomplete: 'current-password', required: true,
  });
  const submit = h('button', { type: 'submit', class: 'btn btn-block btn-big' }, t('login.submit'));
  const errorSlot = h('div', {}, message ? errorBox(message) : null);

  const form = h('form', {
    class: 'card', novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      errorSlot.replaceChildren();
      const userId = userInput.value.trim().toUpperCase();
      const pin = pinInput.value.trim();
      if (!userId || !pin) { errorSlot.append(errorBox(t('errors.REQUIRED'))); return; }
      try {
        const data = await busy(submit, () => call('login', { userId, pin }, { auth: false }));
        rememberUserId(userId);
        loginPin = pin;
        await saveSession(data);
        onDone();
      } catch (err) {
        pinInput.value = '';
        errorSlot.append(errorBox(errorText(err)));
        pinInput.focus();
      }
    },
  },
    errorSlot,
    h('div', { class: 'field' },
      h('label', { for: 'user-id' }, t('login.userId')),
      userInput,
      h('div', { class: 'hint' }, t('login.userIdHint'))),
    h('div', { class: 'field' },
      h('label', { for: 'pin' }, t('login.pin')),
      pinInput),
    submit,
  );

  mount(
    h('h1', {}, t('login.title')),
    CONFIG.MOCK ? h('div', { class: 'msg msg-info' }, t('login.mockHint')) : null,
    form,
  );
  (userInput.value ? pinInput : userInput).focus();
}

export function showChangePin({ onDone }) {
  const newInput = h('input', {
    id: 'new-pin', type: 'password', class: 'ltr-input', inputmode: 'numeric', pattern: '[0-9]*',
    maxlength: '6', autocomplete: 'new-password',
  });
  const confirmInput = h('input', {
    id: 'confirm-pin', type: 'password', class: 'ltr-input', inputmode: 'numeric', pattern: '[0-9]*',
    maxlength: '6', autocomplete: 'new-password',
  });
  const submit = h('button', { type: 'submit', class: 'btn btn-block btn-big' }, t('changePin.submit'));
  const errorSlot = h('div');

  const form = h('form', {
    class: 'card', novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      errorSlot.replaceChildren();
      const newPin = newInput.value.trim();
      const code = checkNewPin(newPin, confirmInput.value.trim(), loginPin);
      if (code) { errorSlot.append(errorBox(t(`errors.${code}`))); return; }
      try {
        await busy(submit, () => call('changePin', { oldPin: loginPin, newPin }));
        const session = await getSession();
        await saveSession({ ...session, mustChangePin: false });
        loginPin = null;
        toast(t('changePin.done'));
        onDone();
      } catch (err) {
        errorSlot.append(errorBox(errorText(err)));
      }
    },
  },
    errorSlot,
    h('div', { class: 'field' }, h('label', { for: 'new-pin' }, t('changePin.newPin')), newInput),
    h('div', { class: 'field' }, h('label', { for: 'confirm-pin' }, t('changePin.confirmPin')), confirmInput),
    submit,
  );

  mount(
    h('h1', {}, t('changePin.title')),
    h('p', { class: 'muted' }, t('changePin.intro')),
    form,
  );
  newInput.focus();
}
