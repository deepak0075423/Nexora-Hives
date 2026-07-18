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
    logo?: string;
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

/** A signed-in account kept on the device for quick switching */
export interface SavedAccount {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  schoolName?: string;
  token: string;
  refreshToken: string;
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

const ACCOUNTS_KEY = 'accounts';

async function readAccounts(): Promise<SavedAccount[]> {
  try { return JSON.parse((await storage.getItem(ACCOUNTS_KEY)) ?? '[]'); }
  catch { return []; }
}
async function writeAccounts(list: SavedAccount[]) {
  await storage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  accounts: SavedAccount[];
  signIn: (token: string, refreshToken: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
  switchAccount: (accountId: string) => Promise<boolean>;
  addAccount: () => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshAccounts = useCallback(async () => {
    setAccounts(await readAccounts());
  }, []);

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

  useEffect(() => { loadUser(); refreshAccounts(); }, [loadUser, refreshAccounts]);

  /** Upsert an entry in the saved-accounts registry */
  const upsertAccount = async (u: User, token: string, refreshToken: string) => {
    const list = await readAccounts();
    const entry: SavedAccount = {
      _id: u._id, name: u.name, email: u.email, role: u.role,
      schoolName: u.school?.name, token, refreshToken,
    };
    const idx = list.findIndex(a => a._id === u._id);
    if (idx >= 0) list[idx] = entry; else list.push(entry);
    await writeAccounts(list);
    setAccounts(list);
  };

  /** Save the ACTIVE tokens back into the registry (they rotate via refresh) */
  const snapshotActive = async (current: User | null) => {
    if (!current) return;
    const [token, refreshToken] = await Promise.all([
      storage.getItem('token'), storage.getItem('refreshToken'),
    ]);
    if (token && refreshToken) await upsertAccount(current, token, refreshToken);
  };

  const signIn = async (token: string, refreshToken: string, userData: User) => {
    const normalized = normalizeUser(userData);
    await storage.setItem('token', token);
    await storage.setItem('refreshToken', refreshToken);
    setUser(normalized);
    await upsertAccount(normalized, token, refreshToken);
  };

  /** Sign out the CURRENT account (removes it from the registry) */
  const signOut = async () => {
    const list = (await readAccounts()).filter(a => a._id !== user?._id);
    await writeAccounts(list);
    setAccounts(list);
    await storage.deleteItem('token');
    await storage.deleteItem('refreshToken');
    setUser(null);
  };

  /** Keep the current account saved and go to login to add another */
  const addAccount = async () => {
    await snapshotActive(user);
    await storage.deleteItem('token');
    await storage.deleteItem('refreshToken');
    setUser(null);
  };

  /** Activate a saved account's tokens and load its user */
  const switchAccount = async (accountId: string): Promise<boolean> => {
    await snapshotActive(user); // keep the outgoing account's fresh tokens
    const list = await readAccounts();
    const target = list.find(a => a._id === accountId);
    if (!target) return false;

    await storage.setItem('token', target.token);
    await storage.setItem('refreshToken', target.refreshToken);
    try {
      const data: any = await getMe();
      const fresh = normalizeUser(data.user);
      setUser(fresh);
      await snapshotActive(fresh); // token may have rotated during getMe
      return true;
    } catch {
      // Stale/expired session — drop this account and stay signed out of it
      const cleaned = (await readAccounts()).filter(a => a._id !== accountId);
      await writeAccounts(cleaned);
      setAccounts(cleaned);
      await storage.deleteItem('token');
      await storage.deleteItem('refreshToken');
      setUser(null);
      return false;
    }
  };

  const removeAccount = async (accountId: string) => {
    const list = (await readAccounts()).filter(a => a._id !== accountId);
    await writeAccounts(list);
    setAccounts(list);
  };

  return (
    <AuthContext.Provider value={{
      user, loading, accounts,
      signIn, signOut, reload: loadUser,
      switchAccount, addAccount, removeAccount,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
