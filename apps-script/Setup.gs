/**
 * One-time setup and maintenance. Run these from the Apps Script editor (select the function, press Run).
 *
 * setupProject()       — first time: checks the tabs, remembers the Sheet, creates first PINs.
 * createInitialPins()  — gives a new PIN to every user whose PINHash is empty.
 *                        To reset someone's PIN: clear their PINHash cell in Users, then run this.
 * The new PINs appear in the Execution log at the bottom of the editor. Give each person
 * their own PIN; the app makes them choose a new one at first sign-in.
 */

// Required headers per tab (SPEC section 4). Extra columns are fine.
const SCHEMA = {
  Settings: ['Key', 'Value'],
  Assets: ['AssetID', 'FleetNo', 'Class', 'DescriptionAR', 'DescriptionEN', 'Manufacturer', 'Model', 'Group', 'SerialNo', 'Location', 'Responsibility', 'Status', 'HasHourMeter', 'Notes'],
  Users: ['UserID', 'NameAR', 'NameEN', 'Role', 'Discipline', 'Phone', 'PINHash', 'PINSalt', 'MustChangePIN', 'Active', 'Notes'],
  Assignments: ['AssignmentID', 'UserID', 'AssetID', 'TemplateID', 'StartDate', 'EndDate', 'DueWeekday', 'Notes', 'CreatedBy', 'CreatedAt'],
  ChecklistTemplates: ['TemplateID', 'AppliesToClass', 'Level', 'NameAR', 'NameEN', 'Version', 'MinDurationSec', 'DoneBy', 'Active'],
  ChecklistItems: ['ItemID', 'TemplateID', 'Seq', 'SectionAR', 'SectionEN', 'TextAR', 'TextEN', 'Type', 'Unit', 'Min', 'Max', 'LimitSource', 'Photo', 'Critical', 'Required', 'AllowNA', 'AppliesToGroup', 'VariesExpected', 'HelpAR', 'HelpEN', 'Active'],
  Inspections: ['InspectionID', 'AssetID', 'TemplateID', 'TemplateVersion', 'Level', 'UserID', 'StartedAtDevice', 'SubmittedAtDevice', 'ReceivedAtServer', 'DurationSec', 'HourMeter', 'HourMeterPhotoID', 'QRScanned', 'ManualReason', 'Lat', 'Lng', 'GPSAccuracyM', 'Result', 'FailCount', 'Flags', 'AuditSelected', 'AppVersion', 'DeviceInfo'],
  Answers: ['AnswerID', 'InspectionID', 'ItemID', 'Value', 'Status', 'Comment', 'PhotoFileIDs'],
  Defects: ['DefectID', 'InspectionID', 'AnswerID', 'AssetID', 'ItemID', 'Description', 'Severity', 'DNO', 'Status', 'ReportedBy', 'ReportedAt', 'AssignedTo', 'AssignedAt', 'ResolvedBy', 'ResolvedAt', 'ResolutionNote', 'VerifiedBy', 'VerifiedAt', 'PhotosBefore', 'PhotosAfter', 'ExternalRef', 'LastUpdated', 'OperateStatus', 'InterimAction', 'PlanType', 'PlannedFor', 'ReviewBy', 'PartsNeeded', 'EstHours', 'Crew', 'PlannedBy', 'PlannedAt', 'ConcessionBy', 'ConcessionReason', 'ConcessionUntil'],
  Audits: ['AuditID', 'InspectionID', 'AuditorUserID', 'SelectedAt', 'AuditedAt', 'AuditInspectionID', 'MatchResult', 'DiscrepancyCount', 'Notes'],
  Sessions: ['TokenHash', 'UserID', 'CreatedAt', 'ExpiresAt', 'LastSeenAt', 'DeviceInfo', 'Revoked'],
  Log: ['Timestamp', 'Level', 'UserID', 'Action', 'Message', 'Payload'],
};

// Columns holding hex codes: forced to plain text so the Sheet never turns them into numbers.
const TEXT_COLUMNS = { Users: ['UserID', 'PINHash', 'PINSalt'], Sessions: ['TokenHash', 'UserID'] };

function setupProject() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this script from the Sheet (Extensions → Apps Script), then run again.');
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());

  const problems = checkSchema_();
  if (problems.length) throw new Error('Fix the Sheet first:\n' + problems.join('\n'));

  Object.keys(TEXT_COLUMNS).forEach((tab) => {
    const sh = sheet_(tab);
    const headers = headersOf_(sh);
    TEXT_COLUMNS[tab].forEach((name) => {
      sh.getRange(1, headers.indexOf(name) + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    });
  });

  Logger.log('Sheet OK: ' + ss.getName() + ' (timezone ' + ss.getSpreadsheetTimeZone() + ')');
  if (ss.getSpreadsheetTimeZone() !== 'Africa/Cairo') {
    Logger.log('WARNING: set the Sheet timezone to Cairo: File → Settings → Time zone → (GMT+02:00) Cairo.');
  }
  createInitialPins();
}

function checkSchema_() {
  const problems = [];
  Object.keys(SCHEMA).forEach((tab) => {
    const sh = db_().getSheetByName(tab);
    if (!sh) { problems.push('Missing tab: ' + tab); return; }
    const headers = headersOf_(sh);
    const missing = SCHEMA[tab].filter((h) => headers.indexOf(h) < 0);
    if (missing.length) problems.push(tab + ': missing column(s) ' + missing.join(', '));
  });
  return problems;
}

function randomPin_() {
  for (;;) {
    const pin = String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000).padStart(6, '0');
    if (!isWeakPin_(pin)) return pin;
  }
}

function createInitialPins() {
  const lines = [];
  withLock_(() => {
    const users = readTable_('Users');
    users.rows.forEach((u) => {
      const id = String(u.UserID).trim();
      if (!id || id.charAt(0) === '(' || String(u.PINHash).trim()) return;
      const pin = randomPin_();
      const salt = newSalt_();
      updateRow_(users, u, { PINHash: hashPin_(salt, pin), PINSalt: salt, MustChangePIN: 'Y' });
      lines.push(id + '  ' + (u.NameEN || u.NameAR || '') + '  →  PIN ' + pin);
    });
  });
  Logger.log(lines.length
    ? 'New PINs (give each person only their own; they must change it at first sign-in):\n' + lines.join('\n')
    : 'Every user already has a PIN. To reset one, clear that user\'s PINHash cell and run createInitialPins again.');
  return lines.length;
}
