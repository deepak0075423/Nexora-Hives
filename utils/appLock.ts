import storage from '@/utils/storage';

// PIN + flags live in SecureStore on native (localStorage on web dev builds).
const PIN_KEY = 'applock.pin';
const APP_FLAG = 'applock.app';
const ACC_FLAG = (userId: string) => `applock.acc.${userId}`;

export async function hasPin(): Promise<boolean> {
  return !!(await storage.getItem(PIN_KEY));
}

export async function setPin(pin: string): Promise<void> {
  await storage.setItem(PIN_KEY, pin);
}

export async function verifyPin(pin: string): Promise<boolean> {
  return (await storage.getItem(PIN_KEY)) === pin;
}

export async function clearPinAndLocks(): Promise<void> {
  await storage.deleteItem(PIN_KEY);
  await storage.deleteItem(APP_FLAG);
  // account flags are cleaned lazily — without a pin they are ignored
}

// ── App-wide lock ─────────────────────────────────────────────────────────────
export async function isAppLockOn(): Promise<boolean> {
  return (await storage.getItem(APP_FLAG)) === '1';
}
export async function setAppLock(on: boolean): Promise<void> {
  if (on) await storage.setItem(APP_FLAG, '1');
  else await storage.deleteItem(APP_FLAG);
}

// ── Per-account lock ──────────────────────────────────────────────────────────
export async function isAccountLockOn(userId: string): Promise<boolean> {
  return (await storage.getItem(ACC_FLAG(userId))) === '1';
}
export async function setAccountLock(userId: string, on: boolean): Promise<void> {
  if (on) await storage.setItem(ACC_FLAG(userId), '1');
  else await storage.deleteItem(ACC_FLAG(userId));
}

/** True when a lock screen must be shown for this state (no PIN ⇒ never locked) */
export async function lockRequired(userId?: string | null): Promise<boolean> {
  if (!(await hasPin())) return false;
  if (await isAppLockOn()) return true;
  if (userId && (await isAccountLockOn(userId))) return true;
  return false;
}
