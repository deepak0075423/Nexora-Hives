/**
 * Values held by a dropdown (Nov 2026) — the phone twin of
 * school-frontend/src/utils/formOptions.js.
 *
 * A Select can only show a value spelled exactly like one of its options.
 * Records carry older spellings ("male", "A-" where the list says "A−", a state
 * typed by hand), and such a value sat in the edit wizards unseen: the Select
 * looked unpicked, "required" passed because the value was not empty, and only
 * the final save objected. Snap stored values onto their options when a form
 * loads, and on Next accept only a value the Select can show.
 */

export const GENDERS = ['Male', 'Female', 'Other'];

// Same text, whatever its case, spacing, or minus/hyphen/dash.
const fold = (v: unknown) => String(v ?? '')
  .replace(/[‐-―−]/g, '-')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

/** The option `value` stands for, written as the list writes it — '' when none. */
export function snapToOption(value: unknown, options: readonly string[]): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string' && options.includes(value)) return value;
  const f = fold(value);
  return options.find((o) => fold(o) === f) || '';
}

/** Blank, or exactly one of `options` — i.e. something the Select can show. */
export const isOptionOrBlank = (value: unknown, options: readonly string[]) =>
  !value || options.includes(String(value));
