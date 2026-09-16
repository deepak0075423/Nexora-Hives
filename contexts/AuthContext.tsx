import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import storage from '@/utils/storage';
import { getMe, switchAccount as switchAccountApi } from '@/api/auth.api';

export type UserRole = 'student' | 'teacher' | 'parent' | 'admin' | 'super-admin';

export interface User {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  isFirstLogin?: boolean;
  avatar?: string;
  /** The other schools / roles this same sign-in opens (server-supplied). */
  accounts?: {
    id: string; name: string; email: string; role: string; current?: boolean;
    school?: { _id: string; name: string; logo?: string; code?: string } | null;
  }[];
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
  schoolLogo?: string;   // lets the sign-in screen show the school's own branding
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

/**
 * The saved list without posts of THIS person that the server no longer offers.
 *
 * A post switched off at its school — a teacher who has moved to another school,
 * say — must not linger on the device's "Switch Account" sheet. The server's
 * `accounts` on the signed-in user is the list of posts that are still live, so
 * any saved entry for the same email that is not on it is dropped. Entries for
 * other people's logins on this device are left alone. An older server that
 * sends no `accounts` gives nothing to compare with, so nothing is removed.
 */
function withoutStalePosts(list: SavedAccount[], current: User | null): SavedAccount[] {
  if (!current?.accounts) return list;
  const live  = new Set([String(current._id), ...current.accounts.map(a => String(a.id))]);
  const email = String(current.email || '').toLowerCase();
  return list.filter(a => String(a.email || '').toLowerCase() !== email || live.has(String(a._id)));
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  accounts: SavedAccount[];
  signIn: (token: string, refreshToken: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
  switchAccount: (accountId: string) => Promise<boolean>;
  /** Change school / role inside this sign-in (server-side), not between saved logins. */
  switchPost: (accountId: string) => Promise<void>;
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
      const fresh = normalizeUser(data.user);
      setUser(fresh);
      const saved = await readAccounts();
      const kept  = withoutStalePosts(saved, fresh);
      if (kept.length !== saved.length) { await writeAccounts(kept); setAccounts(kept); }
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
      schoolName: u.school?.name, schoolLogo: u.school?.logo, token, refreshToken,
    };
    const idx = list.findIndex(a => a._id === u._id);
    if (idx >= 0) list[idx] = entry; else list.push(entry);
    const kept = withoutStalePosts(list, u);
    await writeAccounts(kept);
    setAccounts(kept);
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

  /**
   * Move to another school or role held by THIS sign-in.
   *
   * Not the same thing as switchAccount above: that flips between separate
   * logins saved on this device, each with its own password. This asks the
   * server for a session on another post behind the one password already
   * proved — the person never signs out, and the device registry is updated so
   * the new post is the one saved under these tokens.
   */
  const switchPost = async (accountId: string) => {
    const res: any = await switchAccountApi(accountId);
    if (!res?.token || !res?.user) throw new Error('Could not switch account');
    const fresh = normalizeUser(res.user);
    await storage.setItem('token', res.token);
    await storage.setItem('refreshToken', res.refreshToken);
    setUser(fresh);
    // Same person, same sign-in: the device keeps ONE entry for it, now pointing
    // at the post just switched to. Keeping the outgoing post as a second entry
    // would put every school they had ever visited on the "Switch Account"
    // sheet — including ones that have since been switched off.
    const outgoing = user?._id;
    if (outgoing && outgoing !== fresh._id) {
      await writeAccounts((await readAccounts()).filter(a => a._id !== outgoing));
    }
    await upsertAccount(fresh, res.token, res.refreshToken);
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
      switchAccount, switchPost, addAccount, removeAccount,
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
