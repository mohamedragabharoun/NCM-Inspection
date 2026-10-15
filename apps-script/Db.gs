/**
 * Sheet access. Columns are always found by header name (row 1), never by position,
 * so columns can be added or moved in the Sheet without breaking the app.
 */

// Opened once per request.
let dbCache_ = null;
let sheetTzCache_ = null;

function db_() {
  if (!dbCache_) {
    const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    dbCache_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  }
  return dbCache_;
}

function sheetTimeZone_() {
  if (!sheetTzCache_) sheetTzCache_ = db_().getSpreadsheetTimeZone();
  return sheetTzCache_;
}

function sheet_(name) {
  const sh = db_().getSheetByName(name);
  if (!sh) throw new Error('Missing tab in the Sheet: ' + name);
  return sh;
}

function headersOf_(sh) {
  const width = sh.getLastColumn();
  if (width < 1) return [];
  return sh.getRange(1, 1, 1, width).getValues()[0].map((h) => String(h).trim());
}

/**
 * Reads a whole tab. Returns { sheet, headers, rows }, each row an object keyed by header,
 * plus _row = its row number in the Sheet. Fully empty rows are skipped.
 */
function readTable_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const headers = (values[0] || []).map((h) => String(h).trim());
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (r.every((v) => v === '' || v === null)) continue;
    const obj = { _row: i + 1 };
    headers.forEach((h, j) => { if (h) obj[h] = r[j]; });
    rows.push(obj);
  }
  return { sheet: sh, headers, rows };
}

/** Appends objects as new rows in one write. Unknown keys are ignored, missing ones left blank. */
function appendObjects_(name, objects) {
  if (!objects.length) return;
  const sh = sheet_(name);
  const headers = headersOf_(sh);
  const values = objects.map((o) => headers.map((h) => (o[h] === undefined || o[h] === null ? '' : o[h])));
  sh.getRange(sh.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
}

/** Writes some fields of one row read by readTable_. */
function updateRow_(table, row, patch) {
  Object.keys(patch).forEach((key) => {
    const col = table.headers.indexOf(key);
    if (col < 0) throw new Error('Missing column ' + key + ' in tab ' + table.sheet.getName());
    table.sheet.getRange(row._row, col + 1).setValue(patch[key]);
    row[key] = patch[key];
  });
}

/** Settings tab as { Key: Value }. */
function readSettings_() {
  const settings = {};
  readTable_('Settings').rows.forEach((r) => {
    const key = String(r.Key || '').trim();
    if (key) settings[key] = r.Value;
  });
  return settings;
}

/** All writes go through the script lock so two phones never write at the same moment. */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Date cell or 'YYYY-MM-DD' text → 'YYYY-MM-DD'. Date cells use the Sheet's own timezone. */
function toIsoDate_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, sheetTimeZone_(), 'yyyy-MM-dd');
  const s = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

/** Timestamp (Date cell or ISO text) → milliseconds, or 0 when empty or invalid. */
function toMillis_(value) {
  if (value instanceof Date) return value.getTime();
  const ms = Date.parse(String(value || ''));
  return isNaN(ms) ? 0 : ms;
}

/** Row object → plain object for JSON: drops _row, turns Date cells into 'YYYY-MM-DD'. */
function plain_(row) {
  const out = {};
  Object.keys(row).forEach((k) => {
    if (k === '_row') return;
    out[k] = row[k] instanceof Date ? toIsoDate_(row[k]) : row[k];
  });
  return out;
}
