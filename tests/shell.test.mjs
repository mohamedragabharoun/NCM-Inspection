// Guards the offline app shell: every web file is cached and the two version numbers match.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('../web/', import.meta.url));
const sw = readFileSync(`${web}sw.js`, 'utf8');
const config = readFileSync(`${web}config.js`, 'utf8');

test('service worker caches every JS, i18n and CSS file', () => {
  const files = [
    ...readdirSync(`${web}js`).map((f) => `./js/${f}`),
    ...readdirSync(`${web}i18n`).map((f) => `./i18n/${f}`),
    ...readdirSync(`${web}css`).map((f) => `./css/${f}`),
  ];
  const missing = files.filter((f) => !sw.includes(`'${f}'`));
  assert.deepEqual(missing, []);
});

test('sw.js VERSION equals config.js APP_VERSION', () => {
  const swVersion = sw.match(/const VERSION = '([^']+)'/)[1];
  const appVersion = config.match(/APP_VERSION: '([^']+)'/)[1];
  assert.equal(swVersion, appVersion);
});

test('ar.json and en.json have the same keys', () => {
  const keys = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) =>
    (typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
  const ar = keys(JSON.parse(readFileSync(`${web}i18n/ar.json`, 'utf8'))).sort();
  const en = keys(JSON.parse(readFileSync(`${web}i18n/en.json`, 'utf8'))).sort();
  assert.deepEqual(ar, en);
});
