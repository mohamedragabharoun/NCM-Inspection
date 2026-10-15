// The only module that talks to the backend. Swapping the backend later means changing this file
// (and apps-script/), not the screens.
//
// Request: POST { action, token, appVersion, ...payload } as text/plain JSON (no Content-Type header,
// so the browser sends no CORS preflight to Apps Script).
// Response: { ok: true, data } or { ok: false, error: { code, message, ...details } }.

import { CONFIG } from '../config.js';
import { getToken } from './session.js';

export class ApiError extends Error {
  constructor(code, message = code, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

async function send(body) {
  if (CONFIG.MOCK) {
    const { handle } = await import('./mock-api.js');
    return handle(body);
  }
  if (!CONFIG.API_URL) throw new ApiError('NOT_CONFIGURED');
  if (!navigator.onLine) throw new ApiError('OFFLINE');

  let res;
  try {
    res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' });
  } catch (err) {
    throw new ApiError('NETWORK', err.message);
  }
  if (!res.ok) throw new ApiError('SERVER', `HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new ApiError('SERVER', 'Invalid JSON from server');
  }
}

export async function call(action, payload = {}, { auth = true } = {}) {
  const body = { action, appVersion: CONFIG.APP_VERSION, ...payload };
  if (auth) body.token = await getToken();
  const res = await send(body);
  if (!res || !res.ok) {
    const { code = 'SERVER', message, ...details } = (res && res.error) || {};
    throw new ApiError(code, message, details);
  }
  return res.data;
}
