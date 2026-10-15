/**
 * Sign-in with UserID + PIN, sessions and PIN changes (SPEC section 5).
 * PINs are stored only as SHA-256(salt + PIN) with a random salt per user.
 * Session tokens are random; only their SHA-256 hash is stored in the Sessions tab.
 */

const PIN_PATTERN = /^\d{4,6}$/;

function sha256Hex_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map((b) => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function hashPin_(salt, pin) {
  return sha256Hex_(String(salt) + String(pin));
}

function newSalt_() {
  return Utilities.getUuid().replace(/-/g, '');
}

function newToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

// Same rule as web/js/pin.js: no all-same digits (0000), no straight runs (1234, 654321).
function isWeakPin_(pin) {
  if (/^(\d)\1+$/.test(pin)) return true;
  const d = pin.split('').map(Number);
  const steps = d.slice(1).map((x, i) => x - d[i]);
  return steps.every((s) => s === 1) || steps.every((s) => s === -1);
}

function publicUser_(u) {
  return { UserID: u.UserID, NameAR: u.NameAR, NameEN: u.NameEN, Role: u.Role };
}

function findUser_(users, userId) {
  return users.rows.find((u) => u.UserID !== '' && sameId_(u.UserID, userId)) || null;
}

// Wrong PIN counter and lock, kept in the script cache (SPEC: PinMaxAttempts, PinLockMinutes).
function registerPinFailure_(userId, settings) {
  const cache = CacheService.getScriptCache();
  const lockMinutes = num_(settings.PinLockMinutes, 15);
  const failKey = 'pinfail:' + userId;
  const fails = Number(cache.get(failKey) || 0) + 1;
  if (fails >= num_(settings.PinMaxAttempts, 5)) {
    cache.put('pinlock:' + userId, String(Date.now() + lockMinutes * 60000), lockMinutes * 60);
    cache.remove(failKey);
  } else {
    cache.put(failKey, String(fails), lockMinutes * 60);
  }
}

function actionLogin(req) {
  const userId = String(req.userId || '').trim().toUpperCase().slice(0, 20);
  const pin = String(req.pin || '').trim();
  if (!userId || !pin) throw new ApiError('BAD_LOGIN');

  const settings = readSettings_();
  const cache = CacheService.getScriptCache();
  const lockedUntil = Number(cache.get('pinlock:' + userId) || 0);
  if (lockedUntil > Date.now()) {
    throw new ApiError('LOCKED', 'Too many wrong PINs', { minutes: Math.ceil((lockedUntil - Date.now()) / 60000) });
  }

  const users = readTable_('Users');
  const user = findUser_(users, userId);
  const pinOk = user && user.PINHash && user.PINSalt && hashPin_(user.PINSalt, pin) === String(user.PINHash);
  if (!pinOk) {
    if (user) registerPinFailure_(userId, settings);
    throw new ApiError('BAD_LOGIN');
  }
  if (!isYes_(user.Active)) throw new ApiError('INACTIVE');
  cache.remove('pinfail:' + userId);

  const token = newToken_();
  const now = new Date();
  const expires = new Date(now.getTime() + num_(settings.SessionDays, 30) * 86400000);
  withLock_(() => appendObjects_('Sessions', [{
    TokenHash: sha256Hex_(token),
    UserID: user.UserID,
    CreatedAt: now,
    ExpiresAt: expires,
    LastSeenAt: now,
    DeviceInfo: String(req.deviceInfo || '').slice(0, 200),
    Revoked: 'N',
  }]));

  return {
    token,
    expiresAt: expires.toISOString(),
    mustChangePin: isYes_(user.MustChangePIN),
    user: publicUser_(user),
    serverTime: now.toISOString(),
  };
}

/** Checks the token on every request. Returns { user, users, session, sessions }. */
function requireSession_(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw new ApiError('NO_SESSION');
  const hash = sha256Hex_(token);
  const sessions = readTable_('Sessions');
  const session = sessions.rows.find((s) => String(s.TokenHash) === hash);
  if (!session || isYes_(session.Revoked) || toMillis_(session.ExpiresAt) <= Date.now()) throw new ApiError('NO_SESSION');
  const users = readTable_('Users');
  const user = findUser_(users, session.UserID);
  if (!user || !isYes_(user.Active)) throw new ApiError('NO_SESSION');
  return { user, users, session, sessions };
}

function actionChangePin(req, ctx) {
  const oldPin = String(req.oldPin || '').trim();
  const newPin = String(req.newPin || '').trim();
  const user = ctx.user;
  if (hashPin_(user.PINSalt, oldPin) !== String(user.PINHash)) throw new ApiError('BAD_LOGIN');
  if (!PIN_PATTERN.test(newPin)) throw new ApiError('PIN_FORMAT');
  if (newPin === oldPin) throw new ApiError('PIN_SAME');
  if (isWeakPin_(newPin)) throw new ApiError('PIN_WEAK');

  const salt = newSalt_();
  withLock_(() => updateRow_(ctx.users, user, { PINHash: hashPin_(salt, newPin), PINSalt: salt, MustChangePIN: 'N' }));
  return {};
}

function actionLogout(req, ctx) {
  withLock_(() => updateRow_(ctx.sessions, ctx.session, { Revoked: 'Y' }));
  return {};
}
