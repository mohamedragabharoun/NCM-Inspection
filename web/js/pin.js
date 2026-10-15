// PIN rules shared by the screens and the mock server. The real server repeats these checks.

export function isPinFormat(pin) {
  return /^\d{4,6}$/.test(pin);
}

// Rejects all-same digits (0000) and straight runs up or down (1234, 654321).
export function isWeakPin(pin) {
  if (/^(\d)\1+$/.test(pin)) return true;
  const digits = [...pin].map(Number);
  const steps = digits.slice(1).map((d, i) => d - digits[i]);
  return steps.every((s) => s === 1) || steps.every((s) => s === -1);
}

// Returns an error code from i18n "errors", or null when the new PIN is acceptable.
export function checkNewPin(newPin, confirmPin, oldPin) {
  if (!newPin || !confirmPin) return 'REQUIRED';
  if (!isPinFormat(newPin)) return 'PIN_FORMAT';
  if (newPin !== confirmPin) return 'PIN_MISMATCH';
  if (oldPin && newPin === oldPin) return 'PIN_SAME';
  if (isWeakPin(newPin)) return 'PIN_WEAK';
  return null;
}
