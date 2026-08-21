/**
 * Date bounds for a leave application, derived from the type's policy.
 *
 * Mirrors school-frontend/src/utils/leaveDates.js. The rules themselves are
 * enforced server-side in leavePolicyService.validateApplication — this is the
 * form's copy so it can refuse a date before a round trip, not a second opinion.
 *
 * Mobile has no calendar widget (dates are typed as YYYY-MM-DD, matching the
 * Comp Off screen), so where the web restricts the picker, this validates the
 * typed value and blocks submission instead.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type DateRules = {
  allowBackdated?: boolean;
  backdatedWithinDays?: number;
  advanceNoticeDays?: number;
  maxConsecutiveDays?: number;
};

/** `YYYY-MM-DD` in local time. */
export const toDateStr = (d: Date | number) => {
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const todayStr = () => toDateStr(new Date());

const shift = (days: number) => toDateStr(Date.now() + days * DAY_MS);

export const isDateStr = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Earliest date this policy will accept, or '' when unbounded. */
export function minFromDate(rules?: DateRules | null): string {
  if (!rules) return '';
  if (!rules.allowBackdated) {
    return shift(rules.advanceNoticeDays && rules.advanceNoticeDays > 0 ? rules.advanceNoticeDays : 0);
  }
  if (rules.backdatedWithinDays && rules.backdatedWithinDays > 0) {
    return shift(-rules.backdatedWithinDays);
  }
  return '';   // back-dating allowed with no window = no lower bound
}

/** One line explaining the bound, or '' when the dates are unrestricted. */
export function dateRuleHint(rules?: DateRules | null): string {
  if (!rules) return '';
  if (!rules.allowBackdated) {
    const notice = rules.advanceNoticeDays && rules.advanceNoticeDays > 0 ? rules.advanceNoticeDays : 0;
    return notice
      ? `Past dates are not allowed, and this type needs ${notice} day(s) advance notice.`
      : 'Past dates are not allowed for this leave type.';
  }
  if (rules.backdatedWithinDays && rules.backdatedWithinDays > 0) {
    return `Back-dated applications are allowed within ${rules.backdatedWithinDays} day(s).`;
  }
  return '';
}

/**
 * The whole date validation for an apply form, in the order a person reads it.
 * Returns '' when the pair is acceptable.
 */
export function validateLeaveDates(from: string, to: string, rules?: DateRules | null): string {
  if (!isDateStr(from)) return 'From date must be YYYY-MM-DD.';
  if (!isDateStr(to))   return 'To date must be YYYY-MM-DD.';
  if (to < from)        return 'To date must be on or after From date.';

  const min = minFromDate(rules);
  if (min && from < min) {
    if (!rules?.allowBackdated) {
      return rules?.advanceNoticeDays && rules.advanceNoticeDays > 0
        ? `This leave type needs ${rules.advanceNoticeDays} day(s) advance notice — the earliest is ${min}.`
        : 'Cannot apply leave for a past date.';
    }
    return `Back-dated applications are allowed only within ${rules.backdatedWithinDays} day(s) — the earliest is ${min}.`;
  }
  return '';
}
