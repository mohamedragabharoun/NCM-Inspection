// App start: language, service worker, status bar and screen routing.

import { CONFIG } from '../config.js';
import { initI18n, t, toggleLang } from './i18n.js';
import { queueCount } from './db.js';
import { getSession, clearSession } from './session.js';
import { showLogin, showChangePin, hasLoginPin } from './login.js';
import { showHome } from './home.js';

let currentScreen = null;

async function route() {
  const session = await getSession();
  if (!session) {
    currentScreen = () => showLogin({ onDone: route });
  } else if (session.mustChangePin) {
    if (!hasLoginPin()) {
      // App was reloaded during the forced PIN change: sign in again to restart it.
      await clearSession();
      currentScreen = () => showLogin({ onDone: route, message: t('errors.MUST_CHANGE_PIN') });
    } else {
      currentScreen = () => showChangePin({ onDone: route });
    }
  } else {
    currentScreen = () => showHome({ session, onLogout: route });
  }
  currentScreen();
}

function renderStatus() {
  const net = document.getElementById('net');
  const online = navigator.onLine;
  net.classList.toggle('offline', !online);
  net.textContent = online ? t('common.online') : t('common.offline');
  document.getElementById('lang-toggle').textContent = t('common.langToggle');
  document.getElementById('app-version').textContent = CONFIG.APP_VERSION;
  document.getElementById('mock-badge').hidden = !CONFIG.MOCK;
}

export async function refreshPending() {
  const n = await queueCount().catch(() => 0);
  document.getElementById('pending').textContent = n > 0 ? t('common.pending', { n }) : '';
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const bar = document.getElementById('update-bar');
  let waiting = null;

  const offerUpdate = (worker) => {
    waiting = worker;
    bar.hidden = false;
  };

  document.getElementById('update-btn').addEventListener('click', () => {
    if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
  });

  // Reload only when a new version replaces an old one, not when the first install takes control.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
  }).catch((err) => console.warn('Service worker registration failed', err));
}

async function start() {
  await initI18n();
  renderStatus();
  refreshPending();

  document.getElementById('lang-toggle').addEventListener('click', toggleLang);
  document.addEventListener('langchange', () => {
    renderStatus();
    refreshPending();
    if (currentScreen) currentScreen();
  });
  window.addEventListener('online', renderStatus);
  window.addEventListener('offline', renderStatus);

  registerServiceWorker();
  await route();
}

start();
