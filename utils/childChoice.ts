/**
 * The child a parent is looking at — ONE choice for every parent screen.
 *
 * Each screen used to keep its own `useState('')` and open on "the first
 * child", and the endpoints list children in different orders, so a parent
 * who picked their second child on Home found the first one again on Class,
 * Fees or Attendance. Now a pick on any screen is the starting child of the
 * next one. Held in memory for this app session, like the year switcher.
 */
import { useCallback, useState } from 'react';

let current = '';

/** The child last picked on any parent screen ('' when none yet). */
export const chosenChild = () => current;

/** Forget the choice — on sign-out, so another account never inherits it. */
export const forgetChild = () => { current = ''; };

/**
 * A drop-in for `useState('')` holding a child id. Starts on `initial` (a link
 * naming a child) or else the family's chosen child; every non-empty value set
 * becomes the choice. Accepts an updater function like useState's setter.
 */
type SetChild = (next: string | ((prev: string) => string)) => void;

export function useChildChoice(initial?: string | string[] | null): [string, SetChild] {
  const linked = Array.isArray(initial) ? initial[0] : initial;
  const [id, setId] = useState(() => {
    if (linked) current = String(linked);
    return linked ? String(linked) : current;
  });
  const set = useCallback<SetChild>((next) => {
    setId((prev) => {
      const v = String((typeof next === 'function' ? next(prev) : next) || '');
      if (v) current = v;
      return v;
    });
  }, []);
  return [id, set];
}

/** `id` if this list holds it, else the list's first child's (keyed by `key`). */
export function childIn(list: any[], id: string, key = '_id'): string {
  if (id && list.some((c) => String(c?.[key]) === String(id))) return String(id);
  return list[0]?.[key] ? String(list[0][key]) : '';
}
