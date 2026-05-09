import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import storage from '@/utils/storage';
import { getMe } from '@/api/auth.api';

export type UserRole = 'student' | 'teacher' | 'parent' | 'admin' | 'super-admin';

export interface User {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  isFirstLogin?: boolean;
  avatar?: string;
  school?: {
    name: string;
    _id: string;
    modules?: {
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
    };
  };
}

// Backend uses school_admin / super_admin; normalize to our app's role names
function normalizeUser(raw: any): User {
  const roleMap: Record<string, UserRole> = {
    school_admin: 'admin',
    super_admin: 'super-admin',
  };
  return {
    ...raw,
    _id: raw._id ?? raw.id,
    role: roleMap[raw.role] ?? raw.role,
  };
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (token: string, refreshToken: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = await storage.getItem('token');
    if (!token) { setLoading(false); return; }
    try {
      const data: any = await getMe();
      setUser(normalizeUser(data.user));
    } catch {
      await storage.deleteItem('token');
      await storage.deleteItem('refreshToken');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const signIn = async (token: string, refreshToken: string, userData: User) => {
    await storage.setItem('token', token);
    await storage.setItem('refreshToken', refreshToken);
    setUser(normalizeUser(userData));
  };

  const signOut = async () => {
    await storage.deleteItem('token');
    await storage.deleteItem('refreshToken');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, reload: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
