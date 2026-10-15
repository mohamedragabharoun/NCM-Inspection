/**
 * bootstrap: everything the phone needs to work offline for this user (SPEC section 9).
 * The phone computes due dates itself from assignments + history (web/js/tasks.js).
 */

const HISTORY_DAYS = 100;

function actionBootstrap(req, ctx) {
  const user = ctx.user;
  const settings = readSettings_();
  const tz = String(settings.Timezone || 'Africa/Cairo');
  const now = new Date();
  const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const isTechnician = user.Role === 'Technician';

  // Active assets. Technicians never see TITAN-2 assets (their maintenance is not NCM's).
  const assets = readTable_('Assets').rows
    .filter((a) => a.AssetID !== '' && String(a.Status).trim() === 'Active')
    .filter((a) => !(isTechnician && String(a.Responsibility).trim() === 'TITAN-2'))
    .map(plain_);
  const assetIdSet = {};
  assets.forEach((a) => { assetIdSet[a.AssetID] = true; });

  const allTemplates = readTable_('ChecklistTemplates').rows.filter((t) => t.TemplateID !== '');
  const levelOf = {};
  allTemplates.forEach((t) => { levelOf[t.TemplateID] = String(t.Level).trim(); });
  const templates = allTemplates.filter((t) => isYes_(t.Active)).map(plain_);
  const templateIdSet = {};
  templates.forEach((t) => { templateIdSet[t.TemplateID] = true; });

  const items = readTable_('ChecklistItems').rows
    .filter((i) => isYes_(i.Active) && templateIdSet[i.TemplateID])
    .map(plain_);

  // This user's assignments covering today, on assets they can see.
  const assignments = readTable_('Assignments').rows
    .filter((a) => sameId_(a.UserID, user.UserID) && assetIdSet[a.AssetID] && templateIdSet[a.TemplateID])
    .map((a) => Object.assign(plain_(a), {
      StartDate: toIsoDate_(a.StartDate),
      EndDate: toIsoDate_(a.EndDate),
      DueWeekday: String(a.DueWeekday || '').trim().toUpperCase(),
    }))
    .filter((a) => a.StartDate && a.EndDate && a.StartDate <= today && today <= a.EndDate);

  const taskKeys = {};
  const taskAssets = {};
  assignments.forEach((a) => {
    taskKeys[a.AssetID + '|' + a.TemplateID] = true;
    taskAssets[a.AssetID] = true;
  });

  const roleOf = {};
  ctx.users.rows.forEach((u) => { roleOf[String(u.UserID).trim().toUpperCase()] = u.Role; });

  // Recent inspections on these assets → history, latest hour meter, hour meter at the last 250h.
  const since = Utilities.formatDate(new Date(now.getTime() - HISTORY_DAYS * 86400000), tz, 'yyyy-MM-dd');
  const history = [];
  const meters = {};
  const last250 = {};
  readTable_('Inspections').rows.forEach((r) => {
    if (!taskAssets[r.AssetID]) return;
    const ms = toMillis_(r.SubmittedAtDevice) || toMillis_(r.StartedAtDevice) || toMillis_(r.ReceivedAtServer);
    if (!ms) return;
    const date = Utilities.formatDate(new Date(ms), tz, 'yyyy-MM-dd');
    const key = r.AssetID + '|' + r.TemplateID;
    if (taskKeys[key] && date >= since) {
      history.push({
        AssetID: r.AssetID, TemplateID: r.TemplateID, UserID: r.UserID,
        Role: roleOf[String(r.UserID).trim().toUpperCase()] || '', Date: date,
      });
    }
    const hours = num_(r.HourMeter, null);
    if (hours === null) return;
    if (!meters[r.AssetID] || ms > meters[r.AssetID].ms) meters[r.AssetID] = { hours, date, ms };
    if (taskKeys[key] && levelOf[r.TemplateID] === '250h' && (!last250[key] || ms > last250[key].ms)) {
      last250[key] = { hours, date, ms };
    }
  });
  [meters, last250].forEach((map) => Object.keys(map).forEach((k) => { delete map[k].ms; }));

  withLock_(() => updateRow_(ctx.sessions, ctx.session, { LastSeenAt: now }));

  return {
    serverTime: now.toISOString(),
    user: publicUser_(user),
    settings,
    assets,
    templates,
    items,
    assignments,
    history,
    meters,
    last250,
    openDefects: [], // Step 4
  };
}
