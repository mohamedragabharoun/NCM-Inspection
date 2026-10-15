// Bilingual UI text (Arabic RTL / English). All UI text comes from /i18n/*.json.

const LANGS = ['ar', 'en'];
const STORAGE_KEY = 'ncm.lang';
const dicts = {};
let lang = 'ar';

function readStoredLang() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function storeLang(value) {
  try { localStorage.setItem(STORAGE_KEY, value); } catch { /* private mode: ignore */ }
}

export async function initI18n() {
  await Promise.all(LANGS.map(async (code) => {
    const res = await fetch(new URL(`../i18n/${code}.json`, import.meta.url));
    dicts[code] = await res.json();
  }));
  const stored = readStoredLang();
  lang = LANGS.includes(stored) ? stored : 'ar';
  applyToDocument();
}

export function getLang() {
  return lang;
}

export function setLang(code) {
  if (!LANGS.includes(code) || code === lang) return;
  lang = code;
  storeLang(code);
  applyToDocument();
  document.dispatchEvent(new CustomEvent('langchange'));
}

export function toggleLang() {
  setLang(lang === 'ar' ? 'en' : 'ar');
}

function lookup(dict, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), dict);
}

// t('home.hello', { name: 'Ali' }) → "Hello, Ali". Falls back to English, then to the key.
export function t(key, vars = {}) {
  let text = lookup(dicts[lang], key);
  if (typeof text !== 'string') text = lookup(dicts.en, key);
  if (typeof text !== 'string') return key;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

// Fills every element that has data-i18n="key" (static parts of index.html).
export function translateStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
}

function applyToDocument() {
  const html = document.documentElement;
  html.lang = lang;
  html.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = t('common.appName');
  translateStatic();
}
