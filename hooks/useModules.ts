import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import * as adminApi from '@/api/admin.api';
import * as teacherApi from '@/api/teacher.api';
import * as studentApi from '@/api/student.api';
import * as parentApi from '@/api/parent.api';

export type ModuleLevel = 'admin' | 'user' | 'none';

export interface ModuleFlags {
  attendance?: boolean;
  notification?: boolean;
  aptitudeExam?: boolean;
  result?: boolean;
  timetable?: boolean;
  holiday?: boolean;
  leave?: boolean;
  document?: boolean;
  library?: boolean;
  payroll?: boolean;
  fees?: boolean;
  chat?: boolean;
  transport?: boolean;
  hostel?: boolean;
  inventory?: boolean;
  videoLibrary?: boolean;
  feedback?: boolean;
  employeeDirectory?: boolean;
  medical?: boolean;
  /** School module enablement, before designation permissions are applied. */
  schoolModules?: Record<string, boolean>;
  /** 'admin' | 'user' | 'none' per module, after school gating. */
  permissions?: Record<string, ModuleLevel>;
  /** true where the designation grants administrative access. */
  moduleAdmin?: Record<string, boolean>;
  designation?: string;
  isLibrarian?: boolean; // = moduleAdmin.library (kept for existing screens)
  isPrincipal?: boolean; // = moduleAdmin.feedback
  /** Teachers: class teacher, vice class teacher or subject teacher of a section this year — opens My Section. */
  hasMySection?: boolean;
  [key: string]: any;
}

const FETCHER: Record<string, () => Promise<any>> = {
  admin:   adminApi.getModules,
  teacher: teacherApi.getModules,
  student: studentApi.getModules,
  parent:  parentApi.getModules,
};

// Backoff for transient failures — a blip must not leave the screen showing
// every module for the rest of its life.
const RETRY_DELAYS = [1000, 3000, 8000];

// How old the answer may be before the app coming back to the front asks again.
const FRESH_ON_RETURN = 30 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The signed-in user's effective module access.
 *
 * The per-module booleans are already the answer to the whole hierarchy —
 * School module enablement → Designation permission → User access — because the
 * backend AND-s the school flag with the caller's designation level before
 * replying. `permissions` / `moduleAdmin` expose the level itself, which is what
 * separates a module's admin screens from its normal ones.
 *
 * It is not fetched once. The home screen stays mounted for as long as the app
 * is open — days, on a phone — and most of what the map says is decided by
 * someone else later: the office makes a teacher class teacher (My Sections),
 * enrols them on a bus, gives them a bed. The tile for it never appeared until
 * the app was restarted, and pulling to refresh did not ask either. So the
 * answer is re-asked, quietly (the screen keeps what it has meanwhile):
 *   • when the server says it changed (`access:changed`, via NotificationContext);
 *   • when the app comes back to the foreground;
 *   • whenever a screen calls `refresh()` — the home screen does on pull-to-
 *     refresh and each time it is shown.
 */
export function useModules() {
  const { user } = useAuth();
  const { accessChangedAt } = useNotifications();
  const [modules, setModules] = useState<ModuleFlags | null>(null);
  const [ready, setReady] = useState(false);
  const runRef = useRef(0);
  const fetchedAt = useRef(0);
  const refreshing = useRef<Promise<void> | null>(null);
  const loading = useRef(false);      // the first ask for this account is still out

  // What the fetch is keyed on. `isFirstLogin` belongs in the key because
  // /{role}/modules sits behind requirePasswordReset on the server: while it is
  // true the request can only answer 403 PASSWORD_RESET_REQUIRED, and the moment
  // the password is set the same account has to be fetched again. The role does
  // not change across that reset, so keying on it alone left `modules` null —
  // and a null map fails open, which shows every module.
  const role = user?.role;
  const userId = (user as any)?._id ?? (user as any)?.id ?? '';
  const firstLogin = user?.isFirstLogin === true;

  useEffect(() => {
    const run = ++runRef.current;
    const current = () => run === runRef.current;
    const fetcher = role ? FETCHER[role] : undefined;
    // No role to fetch for, or the account still has to set its password —
    // either way there is nothing to ask the server for yet.
    if (!fetcher || firstLogin) { loading.current = false; setModules(null); setReady(true); return; }

    setReady(false);
    loading.current = true;
    (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const res: any = await fetcher();
          if (!current()) return;
          fetchedAt.current = Date.now();
          loading.current = false;
          setModules((res as any)?.data ?? res);
          setReady(true);
          return;
        } catch (err: any) {
          // 401/403 are answers, not blips: retrying cannot change them.
          // Anything else (offline, timeout, backend restart) gets another go,
          // so a transient failure never becomes a permanently open session.
          const status = err?.status;
          const retryable = status !== 401 && status !== 403 && attempt < RETRY_DELAYS.length;
          if (!current()) return;
          if (!retryable) { loading.current = false; setReady(true); return; }
          await sleep(RETRY_DELAYS[attempt]);
          if (!current()) return;
        }
      }
    })();
    return () => { runRef.current++; };
  }, [role, userId, firstLogin]);

  /**
   * Ask again without emptying the screen. The answer already held stays in
   * force until the new one lands, and a failed ask changes nothing. `maxAge`
   * skips the request when the answer is younger than that.
   */
  const refresh = useCallback((maxAge = 0): Promise<void> => {
    const fetcher = role ? FETCHER[role] : undefined;
    if (!fetcher || firstLogin) return Promise.resolve();
    // The first ask is still out — it IS the fresh answer.
    if (loading.current) return Promise.resolve();
    // "Young enough" only counts for an age that makes sense: a phone's clock
    // set back would otherwise make the answer look fresh until it caught up.
    const age = Date.now() - fetchedAt.current;
    if (maxAge > 0 && age >= 0 && age < maxAge) return Promise.resolve();
    if (refreshing.current) return refreshing.current;
    const run = runRef.current;
    const ask = (async () => {
      try {
        const res: any = await fetcher();
        if (run !== runRef.current) return;     // another account signed in meanwhile
        fetchedAt.current = Date.now();
        setModules((res as any)?.data ?? res);
        setReady(true);
      } catch { /* keep what we have */ } finally {
        refreshing.current = null;
      }
    })();
    refreshing.current = ask;
    return ask;
  }, [role, firstLogin]);

  // The server said so.
  useEffect(() => {
    if (accessChangedAt) refresh(0);
  }, [accessChangedAt, refresh]);

  // Back to the foreground: the moment a change made at the office is looked for.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh(FRESH_ON_RETURN);
    });
    return () => sub.remove();
  }, [refresh]);

  /** true when the flag is enabled, or when flags haven't loaded (fail-open like web) */
  const isEnabled = (flag?: string) => !flag || !modules || modules[flag] === true;
  /** true only where the designation grants administrative access to the module */
  const isAdmin = (flag?: string) => !!(flag && modules?.moduleAdmin?.[flag]);
  const levelOf = (flag: string): ModuleLevel =>
    (modules?.permissions?.[flag] as ModuleLevel) ?? (isEnabled(flag) ? 'user' : 'none');

  return { modules, ready, isEnabled, isAdmin, levelOf, refresh, isSuperAdmin: user?.role === 'super-admin' };
}
