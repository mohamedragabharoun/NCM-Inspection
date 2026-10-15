// Runs the Apps Script files (apps-script/*.gs) in Node with in-memory fakes of the Google services,
// so the backend can be tested without deploying. Only the parts of each service the code uses are faked.

import vm from 'node:vm';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// Same order as in the Apps Script editor.
const GS_FILES = ['Code.gs', 'Db.gs', 'Auth.gs', 'Bootstrap.gs', 'Setup.gs'];

class FakeRange {
  constructor(sheet, row, col, rows, cols) { Object.assign(this, { sheet, row, col, rows, cols }); }

  getValues() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const src = this.sheet.values[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.cols; c++) {
        const v = src[this.col - 1 + c];
        line.push(v === undefined ? '' : v);
      }
      out.push(line);
    }
    return out;
  }

  setValues(values) {
    if (values.length !== this.rows || values.some((r) => r.length !== this.cols)) {
      throw new Error(`setValues size mismatch on ${this.sheet.name}`);
    }
    values.forEach((line, r) => {
      const idx = this.row - 1 + r;
      while (this.sheet.values.length <= idx) this.sheet.values.push([]);
      line.forEach((v, c) => { this.sheet.values[idx][this.col - 1 + c] = v; });
    });
    return this;
  }

  setValue(v) { return this.setValues([[v]]); }

  setNumberFormat(fmt) { this.sheet.formats.push({ col: this.col, fmt }); return this; }
}

class FakeSheet {
  constructor(name, values) { this.name = name; this.values = values; this.formats = []; }
  getName() { return this.name; }
  setName(name) { this.name = name; return this; }
  copyTo(ss) { return ss.insertCopy(this); }
  getLastRow() { return this.values.length; }
  getLastColumn() { return Math.max(0, ...this.values.map((r) => r.length)); }
  getMaxRows() { return 1000; }
  getRange(row, col, rows = 1, cols = 1) { return new FakeRange(this, row, col, rows, cols); }
  getDataRange() { return new FakeRange(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
}

function formatDate(date, timeZone, pattern) {
  if (pattern !== 'yyyy-MM-dd') throw new Error(`Fake formatDate does not support ${pattern}`);
  const p = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t) => p.find((x) => x.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const loadFixture = () => JSON.parse(readFileSync(`${root}tests/fixtures/db.json`, 'utf8'));

// A spreadsheet whose tabs live in `sheets` (name → FakeSheet), kept in tab order.
function makeSpreadsheet(id, name, sheets, timeZone = 'Africa/Cairo') {
  const ss = {
    id, name, timeZone, active: null,
    getId: () => id,
    getName: () => ss.name,
    rename: (n) => { ss.name = n; },
    getSpreadsheetTimeZone: () => ss.timeZone,
    setSpreadsheetTimeZone: (tz) => { ss.timeZone = tz; },
    getSheetByName: (n) => sheets[n] || null,
    getSheets: () => Object.values(sheets),
    insertCopy(sheet) {
      const copy = new FakeSheet(`Copy of ${sheet.name}`, structuredClone(sheet.values));
      const original = copy.setName.bind(copy);
      copy.setName = (n) => { delete sheets[copy.name]; sheets[n] = copy; return original(n); };
      sheets[copy.name] = copy;
      return copy;
    },
    deleteSheet: (sheet) => { delete sheets[sheet.name]; },
    setActiveSheet: (sheet) => { ss.active = sheet; return sheet; },
    moveActiveSheet: (pos) => {
      const rest = Object.entries(sheets).filter(([, s]) => s !== ss.active);
      const ordered = [...rest.slice(0, pos - 1), [ss.active.name, ss.active], ...rest.slice(pos - 1)];
      Object.keys(sheets).forEach((k) => delete sheets[k]);
      ordered.forEach(([k, s]) => { sheets[k] = s; });
    },
  };
  return ss;
}

/**
 * Creates a fresh backend with its own copy of the fixture tables.
 * empty: true starts from a blank spreadsheet (only "Sheet1"), like a new Google Sheet.
 */
export function createBackend({ tables, empty = false } = {}) {
  const data = tables || loadFixture();
  const sheets = empty
    ? { Sheet1: new FakeSheet('Sheet1', []) }
    : Object.fromEntries(Object.entries(data).map(([name, values]) => [name, new FakeSheet(name, values)]));
  const props = {};
  const cache = new Map();
  const logs = [];
  const trashed = [];
  const spreadsheet = makeSpreadsheet('FAKE_SHEET_ID', empty ? 'Untitled spreadsheet' : 'NCM_Inspection_DB', sheets, empty ? 'Etc/GMT' : 'Africa/Cairo');
  const others = {};

  const context = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: (id) => (id === spreadsheet.id ? spreadsheet : others[id]) },
    // The template download + conversion: becomes a spreadsheet with the fixture tables (incl. README).
    UrlFetchApp: { fetch: () => ({ getBlob: () => ({ setName() { return this; } }) }) },
    MimeType: { GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet' },
    Drive: {
      Files: {
        create: (meta) => {
          const tabs = { README: new FakeSheet('README', [['NCM Inspection App — Database Template v1.0']]) };
          Object.entries(loadFixture()).forEach(([n, v]) => { tabs[n] = new FakeSheet(n, v); });
          others.TEMP = makeSpreadsheet('TEMP', meta.name, tabs);
          return { id: 'TEMP' };
        },
        update: (meta, id) => { if (meta.trashed) trashed.push(id); },
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => { const e = cache.get(k); return e && e.until > Date.now() ? e.value : null; },
        put: (k, v, seconds = 600) => { cache.set(k, { value: String(v), until: Date.now() + seconds * 1000 }); },
        remove: (k) => { cache.delete(k); },
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (content) => ({ content, setMimeType() { return this; }, getContent() { return content; } }),
    },
    Logger: { log: (...args) => { logs.push(args.join(' ')); } },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      // Apps Script returns signed Java bytes (-128..127).
      computeDigest: (alg, text) => [...crypto.createHash(alg).update(String(text), 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
      getUuid: () => crypto.randomUUID(),
      formatDate,
    },
  };
  vm.createContext(context);
  for (const file of GS_FILES) {
    vm.runInContext(readFileSync(`${root}apps-script/${file}`, 'utf8'), context, { filename: file });
  }

  return {
    sheets,
    spreadsheet,
    trashed,
    props,
    logs,
    /** Calls doPost like the phone does and returns the parsed JSON answer. */
    call(body) {
      const out = context.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } });
      return JSON.parse(out.getContent());
    },
    /** Runs a top-level function, like pressing Run in the editor. */
    run(name, ...args) { return context[name](...args); },
    /** Rows of a tab as objects keyed by header. */
    rows(name) {
      const [headers, ...rest] = sheets[name].values;
      return rest.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] === undefined ? '' : r[i]])));
    },
    /** Appends a row given as an object keyed by header. */
    addRow(name, obj) {
      const headers = sheets[name].values[0];
      sheets[name].values.push(headers.map((h) => (h in obj ? obj[h] : '')));
    },
  };
}
