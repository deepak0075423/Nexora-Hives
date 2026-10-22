/**
 * The classes a school can create (Oct 2026): four pre-primary years, then
 * Class 1 to Class 12 — and the number each one carries. Same list as the
 * server (school-backend/utils/classLevels.js), which checks every class
 * created against it, and the web.
 *
 * The number is the class order everywhere (utils/listOrder byClass) and what
 * promotion climbs, so pre-primary sits below 1 and UKG / KG2 leads straight
 * into Class 1:
 *
 *   −3 Playgroup / Pre-Nursery   −2 Nursery   −1 LKG / KG1   0 UKG / KG2   1…12 Class 1…12
 *
 * Three of the four go by two names; the school picks the one it uses, and
 * that is the class's name. `short` fits a chip or sits before a section
 * letter ("LKG A"), where Class 1 to 12 show their number.
 */
export interface ClassLevel { number: number; label: string; names: string[]; short: string[] }

export const PRE_PRIMARY: ClassLevel[] = [
  { number: -3, label: 'Playgroup / Pre-Nursery', names: ['Playgroup', 'Pre-Nursery'], short: ['PG', 'PN'] },
  { number: -2, label: 'Nursery',                 names: ['Nursery'],                   short: ['NUR'] },
  { number: -1, label: 'LKG / KG1',               names: ['LKG', 'KG1'],                short: ['LKG', 'KG1'] },
  { number: 0,  label: 'UKG / KG2',               names: ['UKG', 'KG2'],                short: ['UKG', 'KG2'] },
];
export const SCHOOL_CLASSES: ClassLevel[] = Array.from({ length: 12 }, (_, i) => ({
  number: i + 1, label: `Class ${i + 1}`, names: [`Class ${i + 1}`], short: [String(i + 1)],
}));
export const CLASS_LEVELS: ClassLevel[] = [...PRE_PRIMARY, ...SCHOOL_CLASSES];

export const levelOf = (number: unknown): ClassLevel | null => {
  if (number === null || number === undefined || number === '') return null;
  const n = Number(number);
  return Number.isInteger(n) ? CLASS_LEVELS.find((l) => l.number === n) || null : null;
};

/** "LKG", "PG", "5" — a class in a few characters. Anything unrecognised keeps its own name. */
export function shortOf(cls: { classNumber?: unknown; className?: string } | null | undefined): string {
  const n = Number(cls?.classNumber);
  const name = String(cls?.className ?? '').trim();
  if (Number.isInteger(n) && n >= 1) return String(n);
  const lvl = levelOf(n);
  const i = lvl ? lvl.names.findIndex((x) => x.toLowerCase() === name.toLowerCase()) : -1;
  return i >= 0 && lvl ? lvl.short[i] : name;
}
