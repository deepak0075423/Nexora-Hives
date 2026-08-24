import storage from '@/utils/storage';

/**
 * Following a notification to wherever it belongs.
 *
 * The server resolves every notification into a destination for the reader's
 * own role — `{ web, mobile, resolved }` — because the same notification opens
 * on a different screen for a teacher, an admin and a parent. This module is
 * only the client half: pick the app path, and hold on to a destination that
 * arrived before there was anywhere to take it.
 */
export interface NotificationLink {
  type?: string;
  entityId?: string | null;
  web?: string;
  mobile?: string;
  resolved?: boolean;
}

/** The in-app path a notification (or its receipt) opens on, or null. */
export function notificationPath(receiptOrLink: any): string | null {
  const link: NotificationLink | undefined = receiptOrLink?.link ?? receiptOrLink;
  return link?.mobile || null;
}

/** True when the sender chose this destination, rather than it being the inbox fallback. */
export function hasTarget(receiptOrLink: any): boolean {
  const link: NotificationLink | undefined = receiptOrLink?.link ?? receiptOrLink;
  return !!link?.mobile && link.resolved !== false;
}

// ── Deferred destinations ────────────────────────────────────────────────────
// A deep link can arrive before the app is ready for it: at cold start while
// the session is still loading, or while the PIN screen is up, or with nobody
// signed in at all. Rather than dropping it, the target is parked here and
// replayed once there is somewhere to go. Kept in the same secure store as the
// session so it survives the app being killed mid-flow.
const PENDING_KEY = 'pendingNotification';

export async function rememberPendingNotification(receiptId: string): Promise<void> {
  try { await storage.setItem(PENDING_KEY, receiptId); } catch { /* not worth failing over */ }
}

export async function takePendingNotification(): Promise<string | null> {
  try {
    const id = await storage.getItem(PENDING_KEY);
    if (id) await storage.deleteItem(PENDING_KEY);
    return id || null;
  } catch { return null; }
}

export async function clearPendingNotification(): Promise<void> {
  try { await storage.deleteItem(PENDING_KEY); } catch { /* nothing to clear */ }
}

/**
 * Pull a receipt id out of a deep link, whichever shape it takes:
 *   aksharum://notification/<id>          — what the app's own links use
 *   https://…/n/<id>                      — the URL in notification emails
 *   …?receipt=<id>                        — the inbox fallback
 */
export function receiptIdFromUrl(url?: string | null): string | null {
  if (!url) return null;
  const byPath = url.match(/(?:notification|\/n)\/([0-9a-fA-F-]{16,})/);
  if (byPath) return byPath[1];
  const byQuery = url.match(/[?&]receipt=([0-9a-fA-F-]{16,})/);
  return byQuery ? byQuery[1] : null;
}
