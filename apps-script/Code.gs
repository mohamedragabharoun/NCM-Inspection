/**
 * NCM Inspection — Apps Script backend (Web App API). See docs/SPEC.md sections 3.2 and 10.
 *
 * The phone sends POST { action, token, appVersion, ...payload } as text/plain JSON.
 * Every answer is { ok: true, data } or { ok: false, error: { code, message, ...details } }.
 *
 * Files: Code.gs (router), Db.gs (sheet access), Auth.gs (PINs, sessions),
 *        Bootstrap.gs (reference data), Setup.gs (one-time setup, run from the editor).
 */

// auth: false = no session needed. allowPinChange = still allowed while MustChangePIN = Y.
// roles: limit to these roles (omit = any signed-in user).
// Handlers are wrapped in arrow functions because other .gs files load after this one.
const ACTIONS = {
  login: { auth: false, handler: (req) => actionLogin(req) },
  changePin: { auth: true, allowPinChange: true, handler: (req, ctx) => actionChangePin(req, ctx) },
  logout: { auth: true, allowPinChange: true, handler: (req, ctx) => actionLogout(req, ctx) },
  bootstrap: { auth: true, handler: (req, ctx) => actionBootstrap(req, ctx) },
};

class ApiError extends Error {
  constructor(code, message, details) {
    super(message || code);
    this.code = code;
    this.details = details || {};
  }
}

function doPost(e) {
  let action = '';
  let userId = '';
  try {
    const req = parseRequest_(e);
    action = req.action;
    const def = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
    if (!def) throw new ApiError('UNKNOWN_ACTION');

    let ctx = {};
    if (def.auth) {
      ctx = requireSession_(req.token);
      userId = ctx.user.UserID;
      if (isYes_(ctx.user.MustChangePIN) && !def.allowPinChange) throw new ApiError('MUST_CHANGE_PIN');
      if (def.roles && def.roles.indexOf(ctx.user.Role) < 0) throw new ApiError('FORBIDDEN');
    }
    return jsonOut_({ ok: true, data: def.handler(req, ctx) });
  } catch (err) {
    if (err instanceof ApiError) {
      return jsonOut_({ ok: false, error: Object.assign({ code: err.code, message: err.message }, err.details) });
    }
    logError_(action, userId, err);
    return jsonOut_({ ok: false, error: { code: 'SERVER', message: 'Server error' } });
  }
}

// Opening the /exec link in a browser confirms the deployment works and shows whether the database is set up.
function doGet() {
  let status;
  try {
    const configured = !!PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    const problems = checkSchema_();
    if (!configured) status = 'Database: NOT SET UP — run setupProject in the Apps Script editor.';
    else if (problems.length) status = 'Database: PROBLEM — ' + problems.join('; ');
    else status = 'Database: ready.';
  } catch (err) {
    status = 'Database: ERROR — ' + String(err && err.message || err);
  }
  return ContentService.createTextOutput('NCM Inspection API is running.\n' + status);
}

function parseRequest_(e) {
  let req;
  try {
    req = JSON.parse(e && e.postData ? e.postData.contents : '');
  } catch (err) {
    throw new ApiError('BAD_REQUEST', 'Body is not JSON');
  }
  if (!req || typeof req !== 'object' || typeof req.action !== 'string') {
    throw new ApiError('BAD_REQUEST', 'Missing action');
  }
  return req;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function logError_(action, userId, err) {
  try {
    appendObjects_('Log', [{
      Timestamp: new Date(),
      Level: 'ERROR',
      UserID: userId,
      Action: action,
      Message: String(err && err.message || err).slice(0, 500),
      Payload: String(err && err.stack || '').slice(0, 2000),
    }]);
  } catch (ignored) {
    console.error(err);
  }
}

// ---- Small shared helpers ----

function isYes_(value) {
  return String(value).trim().toUpperCase() === 'Y';
}

function sameId_(a, b) {
  return String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
}

function num_(value, fallback) {
  const n = Number(value);
  return value === '' || value === null || isNaN(n) ? fallback : n;
}
