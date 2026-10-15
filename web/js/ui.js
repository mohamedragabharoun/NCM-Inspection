// Small DOM helpers shared by all screens.

import { t } from './i18n.js';

// h('button', { class: 'btn', onclick: fn }, 'Text', childNode)
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const app = () => document.getElementById('app');

export function mount(...nodes) {
  const root = app();
  root.replaceChildren(...nodes);
  root.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

let toastTimer = null;
export function toast(text, ms = 3500) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// Turns an ApiError (or any error) into a translated message.
export function errorText(err) {
  const code = (err && err.code) || 'SERVER';
  const text = t(`errors.${code}`, (err && err.details) || {});
  return text === `errors.${code}` ? t('errors.SERVER') : text;
}

export function errorBox(text) {
  return h('div', { class: 'msg msg-error', role: 'alert' }, text);
}

// Disables a submit button and shows a spinner while fn runs.
export async function busy(button, fn) {
  const label = button.textContent;
  button.disabled = true;
  button.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), t('common.loading'));
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}
