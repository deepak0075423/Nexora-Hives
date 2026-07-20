// Shared form validation helpers (mirror of school-backend/utils/validators.js).
//
// `firstError(form, rules)` returns the first error message or null — suited
// to the Alert-based validation flow used across the app's screens:
//
//   const err = firstError(form, {
//     name:  { label: 'Name', required: true, minLen: 2 },
//     email: { label: 'Email', required: true, type: 'email' },
//   });
//   if (err) return Alert.alert('Invalid', err);

export const isEmail   = (v?: string | null) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v ?? '').trim());
export const isPhone   = (v?: string | null) => /^\d{7,15}$/.test(String(v ?? '').replace(/[\s\-+()]/g, ''));
export const isURL     = (v?: string | null) => /^https?:\/\/.+\..+/.test(String(v ?? '').trim());
export const isPincode = (v?: string | null) => /^\d{4,10}$/.test(String(v ?? '').trim());
export const isTime    = (v?: string | null) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v ?? '').trim());
export const isDate    = (v?: string | null) => !Number.isNaN(new Date(String(v ?? '')).getTime());
const isNumber = (v: unknown) => !Number.isNaN(Number(v)) && String(v).trim() !== '';

export interface FieldRule {
  label?: string;
  required?: boolean;
  type?: 'email' | 'phone' | 'url' | 'pincode' | 'date' | 'time' | 'number';
  enum?: string[];
  min?: number;
  max?: number;
  minLen?: number;
  maxLen?: number;
  regex?: RegExp;
  regexMsg?: string;
}

const TYPE_CHECKS: Record<string, { check: (v: any) => boolean; msg: (l: string) => string }> = {
  email:   { check: isEmail,   msg: (l) => `${l} must be a valid email address` },
  phone:   { check: isPhone,   msg: (l) => `${l} must be a valid phone number` },
  url:     { check: isURL,     msg: (l) => `${l} must be a valid URL starting with http:// or https://` },
  pincode: { check: isPincode, msg: (l) => `${l} must be 4-10 digits` },
  date:    { check: isDate,    msg: (l) => `${l} must be a valid date` },
  time:    { check: isTime,    msg: (l) => `${l} must be a valid time (HH:MM)` },
  number:  { check: isNumber,  msg: (l) => `${l} must be a number` },
};

export function firstError(form: Record<string, any>, rules: Record<string, FieldRule>): string | null {
  for (const [field, rule] of Object.entries(rules)) {
    const label = rule.label || field;
    const raw   = form[field];
    const empty = raw === undefined || raw === null || String(raw).trim() === '';

    if (empty) {
      if (rule.required) return `${label} is required`;
      continue;
    }
    const val = typeof raw === 'string' ? raw.trim() : raw;

    if (rule.type && TYPE_CHECKS[rule.type] && !TYPE_CHECKS[rule.type].check(val))
      return TYPE_CHECKS[rule.type].msg(label);
    if (rule.enum && !rule.enum.includes(val))
      return `${label} must be one of: ${rule.enum.join(', ')}`;
    if (rule.minLen !== undefined && String(val).length < rule.minLen)
      return `${label} must be at least ${rule.minLen} characters`;
    if (rule.maxLen !== undefined && String(val).length > rule.maxLen)
      return `${label} must be at most ${rule.maxLen} characters`;
    if (rule.min !== undefined && Number(val) < rule.min)
      return `${label} must be at least ${rule.min}`;
    if (rule.max !== undefined && Number(val) > rule.max)
      return `${label} must be at most ${rule.max}`;
    if (rule.regex && !rule.regex.test(String(val)))
      return rule.regexMsg || `${label} has an invalid format`;
  }
  return null;
}

// Password strength shared with backend: 8+ chars with letters and digits.
export function passwordError(pw?: string | null): string | null {
  const v = String(pw ?? '');
  if (v.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'Password must contain both letters and numbers';
  return null;
}
