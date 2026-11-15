/**
 * Opening private uploads on the phone (Oct 2026).
 *
 * Admission papers, staff papers, leave and attendance attachments and the
 * Documents module's files are no longer public (server services/privateFiles).
 * The server reads who is asking from a 12-hour FILE TOKEN; the web keeps it in
 * a cookie, but a phone browser or <Image> carries none of the app's cookies,
 * so `withFileToken(url)` puts it on the address instead. The token is fetched
 * when someone signs in and renewed before it runs out.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import api from '@/api/axios';

export const PRIVATE_UPLOAD = /\/uploads\/(student-docs|staff-docs|leave-docs|attendance-docs|documents)\//i;

let token = '';
let timer: ReturnType<typeof setTimeout> | null = null;

export async function startFileAccess(): Promise<void> {
  if (timer) clearTimeout(timer);
  try {
    const res: any = await api.get('/auth/file-token');
    const data = res?.data ?? res;
    if (!data?.token) return;
    token = String(data.token);
    const life = Number(data.expiresIn) || 12 * 3600;
    // Renewed at two-thirds of its life, so an app left open keeps opening files.
    timer = setTimeout(startFileAccess, Math.max(60, life * (2 / 3)) * 1000);
  } catch {
    timer = setTimeout(startFileAccess, 5 * 60 * 1000);
  }
}

export function stopFileAccess(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  token = '';
}

/** The token as a request header — for anything that fetches a file itself. */
export function fileAuthHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Open a private file without its address ever carrying the token.
 *
 * `Linking.openURL(withFileToken(url))` handed the file's address — token and
 * all — to the phone's browser, where it sat in the history and could be
 * shared on as a working link for up to twelve hours. Here the app fetches
 * the file itself, the token in a header, keeps it in its own cache and hands
 * that copy to the phone ("Open with…", Quick Look, a PDF reader).
 */
export async function openPrivateFile(url: string, name = 'file', mime?: string): Promise<void> {
  const clean = String(url || '').replace(/([?&])ft=[^&]*(&|$)/, (_m, a, b) => (b ? a : '')).replace(/[?&]$/, '');
  if (!clean) throw new Error('This file has no address');
  if (!token) await startFileAccess();
  const safe = String(name || 'file').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80) || 'file';

  if (Platform.OS === 'web') {
    const res = await fetch(clean, { headers: fileAuthHeaders() });
    if (!res.ok) throw new Error(res.status === 403 ? 'You do not have access to this file' : 'The file could not be opened');
    const href = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = href; a.download = safe; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60000);
    return;
  }

  const target = `${FileSystem.cacheDirectory}${Date.now()}-${safe}`;
  const out = await FileSystem.downloadAsync(clean, target, { headers: fileAuthHeaders() });
  if (out.status !== 200) {
    await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
    throw new Error(out.status === 403 ? 'You do not have access to this file'
      : out.status === 401 ? 'Sign in again to open this file' : 'The file could not be opened');
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('This phone cannot open files from the app');
  await Sharing.shareAsync(out.uri, { mimeType: mime || 'application/octet-stream', dialogTitle: name });
}

/** The address with the reader's file token on it, when it points at a private folder. */
export function withFileToken(url?: string | null): string {
  const u = String(url || '');
  if (!u || !token || !PRIVATE_UPLOAD.test(u) || /[?&]ft=/.test(u)) return u;
  return `${u}${u.includes('?') ? '&' : '?'}ft=${encodeURIComponent(token)}`;
}
