import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
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
  /** School module enablement, before designation permissions are applied. */
  schoolModules?: Record<string, boolean>;
  /** 'admin' | 'user' | 'none' per module, after school gating. */
  permissions?: Record<string, ModuleLevel>;
  /** true where the designation grants administrative access. */
  moduleAdmin?: Record<string, boolean>;
  designation?: string;
  isLibrarian?: boolean; // = moduleAdmin.library (kept for existing screens)
  isPrincipal?: boolean; // = moduleAdmin.feedback
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The signed-in user's effective module access.
 *
 * The per-module booleans are already the answer to the whole hierarchy —
 * School module enablement → Designation permission → User access — because the
 * backend AND-s the school flag with the caller's designation level before
 * replying. `permissions` / `moduleAdmin` expose the level itself, which is what
 * separates a module's admin screens from its normal ones.
 */
export function useModules() {
  const { user } = useAuth();
  const [modules, setModules] = useState<ModuleFlags | null>(null);
  const [ready, setReady] = useState(false);
  const runRef = useRef(0);

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
    if (!fetcher || firstLogin) { setModules(null); setReady(true); return; }

    setReady(false);
    (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const res: any = await fetcher();
          if (!current()) return;
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
          if (!retryable) { setReady(true); return; }
          await sleep(RETRY_DELAYS[attempt]);
          if (!current()) return;
        }
      }
    })();
    return () => { runRef.current++; };
  }, [role, userId, firstLogin]);

  /** true when the flag is enabled, or when flags haven't loaded (fail-open like web) */
  const isEnabled = (flag?: string) => !flag || !modules || modules[flag] === true;
  /** true only where the designation grants administrative access to the module */
  const isAdmin = (flag?: string) => !!(flag && modules?.moduleAdmin?.[flag]);
  const levelOf = (flag: string): ModuleLevel =>
    (modules?.permissions?.[flag] as ModuleLevel) ?? (isEnabled(flag) ? 'user' : 'none');

  return { modules, ready, isEnabled, isAdmin, levelOf, isSuperAdmin: user?.role === 'super-admin' };
}
