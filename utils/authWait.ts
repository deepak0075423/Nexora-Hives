/**
 * Waits on the signed-out screens — a locked sign-in, the next password-reset
 * code — said the same way on each of them.
 */

/** "2:15 pm tomorrow" — when a wait ends, in the phone's own clock. */
export function opensAt(iso?: string | null) {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return null;
  const time = at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(at).setHours(0, 0, 0, 0) - today.getTime()) / 86400000);
  if (days === 0) return `${time} today`;
  if (days === 1) return `${time} tomorrow`;
  return `${time} on ${at.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}`;
}

/** 42 → "0:42" */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Where the person stands on asking for another reset code. */
export type CodeState = { resendAt: number; sendsLeft: number | null; maxSends: number; availableAt: string | null };

const RESEND_SECONDS = 60;

/**
 * A /auth/forgot-password answer — a success, or an OTP_WAIT / OTP_LIMIT
 * refusal — as the code screen's state. Codes are 60 seconds apart, three in a
 * row, then a day (school-backend services/resetCodeLimit). `resendAt` is a
 * moment, not a count, so it survives being passed around as a route param.
 * With nothing to go on, a code counts as just sent: the screen always opens
 * on the full minute's countdown, never on "Resend".
 */
export const codeState = (d: any): CodeState => ({
  resendAt:    Date.now() + (Number(d?.resendIn ?? d?.retryAfter ?? RESEND_SECONDS) || 0) * 1000,
  sendsLeft:   d?.sendsLeft ?? null,
  maxSends:    d?.maxSends ?? 3,
  availableAt: d?.availableAt || null,
});

/** The same, as route params (strings only). */
export const codeParams = (email: string, d: any) => {
  const c = codeState(d);
  return {
    email,
    resendAt:    String(c.resendAt),
    sendsLeft:   c.sendsLeft == null ? '' : String(c.sendsLeft),
    maxSends:    String(c.maxSends),
    availableAt: c.availableAt || '',
  };
};

/** Route params back into the code screen's state. */
export const codeStateFromParams = (p: Record<string, string | string[] | undefined>): CodeState => {
  const one = (k: string) => (Array.isArray(p[k]) ? p[k]![0] : p[k]) || '';
  return {
    resendAt:    Number(one('resendAt')) || Date.now() + RESEND_SECONDS * 1000,
    sendsLeft:   one('sendsLeft') === '' ? null : Number(one('sendsLeft')),
    maxSends:    Number(one('maxSends')) || 3,
    availableAt: one('availableAt') || null,
  };
};
