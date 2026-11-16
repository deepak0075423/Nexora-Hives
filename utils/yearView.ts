/**
 * The academic year this person is looking at (Nov 2026).
 *
 * Every screen shows one academic year's data — the school's active year,
 * unless the year switcher in the header is on another one. The choice travels
 * with every read as the `X-Academic-Year` header (api/axios.ts) and the server
 * works out the rest (school-backend/services/yearScope.js).
 *
 * Kept in memory only: looking back at last year is something you do for a
 * while, not a setting — opening the app again, or switching account, starts
 * on the school's current year.
 */
let current = '';
const listeners = new Set<(year: string) => void>();

/** The year id being looked at, or '' for the school's active year. */
export function viewYear(): string {
  return current;
}

/** Look at `yearId` (pass '' to go back to the school's active year). */
export function setViewYear(yearId: string) {
  const next = yearId || '';
  if (next === current) return;
  current = next;
  listeners.forEach((fn) => fn(current));
}

/** Forget the choice without telling anyone — the session itself is changing. */
export function resetViewYear() {
  current = '';
}

/** Run `fn` whenever the year being looked at changes; returns the unsubscribe. */
export function onViewYearChange(fn: (year: string) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
