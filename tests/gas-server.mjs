// Local stand-in for the deployed Apps Script Web App, for end-to-end checks of the web app.
// Run: node tests/gas-server.mjs  → POST http://localhost:8090/exec
// Prints the first PINs. Data lives in memory and is lost when the server stops.
import http from 'node:http';
import { createBackend } from './gas-harness.mjs';
import { dateIn, addDays, weekdayCode } from '../web/js/dates.js';

const PORT = Number(process.env.PORT || 8090);
const be = createBackend();
be.run('setupProject');
console.log(be.logs.join('\n'));

const today = dateIn('Africa/Cairo');
const span = { StartDate: addDays(today, -30), EndDate: addDays(today, 30) };
be.addRow('Assignments', { AssignmentID: 'E2E1', UserID: 'U002', AssetID: 'CP08', TemplateID: 'CP-W', DueWeekday: weekdayCode(today), ...span });
be.addRow('Assignments', { AssignmentID: 'E2E2', UserID: 'U002', AssetID: 'CP07', TemplateID: 'CP-D', ...span });
be.addRow('Assignments', { AssignmentID: 'E2E3', UserID: 'U002', AssetID: 'CP12', TemplateID: 'CP-250', ...span });

http.createServer((req, res) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (req.method !== 'POST') { res.writeHead(200, headers); res.end('{"ok":true}'); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const answer = be.call(body);
    console.log(req.headers['content-type'], JSON.parse(body).action, '→', answer.ok ? 'ok' : answer.error.code);
    res.writeHead(200, headers);
    res.end(JSON.stringify(answer));
  });
}).listen(PORT, () => console.log(`Fake Apps Script on http://localhost:${PORT}/exec`));
