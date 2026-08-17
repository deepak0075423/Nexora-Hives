import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import * as adminApi from '@/api/admin.api';
import * as teacherApi from '@/api/teacher.api';
import * as studentApi from '@/api/student.api';
import * as parentApi from '@/api/parent.api';

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
  isLibrarian?: boolean; // teacher-only designation flag
  isPrincipal?: boolean; // teacher-only designation flag (Principal / Vice Principal)
  [key: string]: any;
}

const FETCHER: Record<string, () => Promise<any>> = {
  admin:   adminApi.getModules,
  teacher: teacherApi.getModules,
  student: studentApi.getModules,
  parent:  parentApi.getModules,
};

/**
 * Fetches the enabled module flags for the current user's school (permission
 * structure set by the super admin). Super admins have no school → all flags on.
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

  return { modules, ready, isEnabled, isSuperAdmin: user?.role === 'super-admin' };
}
