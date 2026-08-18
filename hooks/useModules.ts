import { useEffect, useState } from 'react';
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

  useEffect(() => {
    let alive = true;
    const fetcher = user?.role ? FETCHER[user.role] : undefined;
    if (!fetcher) { setModules(null); setReady(true); return; }
    fetcher()
      .then((res: any) => { if (alive) setModules((res as any)?.data ?? res); })
      .catch(() => {})
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [user?.role]);

  /** true when the flag is enabled, or when flags haven't loaded (fail-open like web) */
  const isEnabled = (flag?: string) => !flag || !modules || modules[flag] === true;
  /** true only where the designation grants administrative access to the module */
  const isAdmin = (flag?: string) => !!(flag && modules?.moduleAdmin?.[flag]);
  const levelOf = (flag: string): ModuleLevel =>
    (modules?.permissions?.[flag] as ModuleLevel) ?? (isEnabled(flag) ? 'user' : 'none');

  return { modules, ready, isEnabled, isAdmin, levelOf, isSuperAdmin: user?.role === 'super-admin' };
}
