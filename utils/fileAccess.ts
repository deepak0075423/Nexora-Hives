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

/** The address with the reader's file token on it, when it points at a private folder. */
export function withFileToken(url?: string | null): string {
  const u = String(url || '');
  if (!u || !token || !PRIVATE_UPLOAD.test(u) || /[?&]ft=/.test(u)) return u;
  return `${u}${u.includes('?') ? '&' : '?'}ft=${encodeURIComponent(token)}`;
}
