/**
 * A teacher's "father's / husband's name" is one field, asked for by gender
 * (Oct 2026): a man gives his father's name, a woman her father's or her
 * husband's. Other, or no gender chosen yet, keeps the combined label.
 *
 * Same wording on the server (school-backend/utils/fatherOrHusband.js) and on
 * the web (school-frontend/src/utils/fatherOrHusband.js).
 *
 *   fatherOrHusbandLabel('Male')                 → "Father's Name"
 *   fatherOrHusbandLabel('Female', 'sentence')   → "Father's / husband's name"
 */
export const fatherOrHusbandLabel = (gender?: string | null, style: 'title' | 'sentence' = 'title'): string => {
  const label = gender === 'Male' ? "Father's Name" : "Father's / Husband's Name";
  return style === 'sentence' ? label[0] + label.slice(1).toLowerCase() : label;
};
