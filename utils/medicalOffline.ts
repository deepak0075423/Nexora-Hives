/**
 * Emergency cards kept on the phone for when there is no network (Oct 2026).
 *
 * They are kept in expo-secure-store — the iOS Keychain / Android Keystore,
 * encrypted by the system — in pieces small enough for it (it warns past
 * 2 KB a value). They belong to the account that saved them, expire (72 h,
 * set by the server) and are deleted on sign-out, on expiry, and when another
 * account opens them. On the web there is no secure store: nothing is kept.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const META = 'medOffline_meta';
const PIECE = (i: number) => `medOffline_${i}`;
const SIZE = 1800;

export type OfflineSet = { generatedAt: string; expiresAt: string; hours: number; count: number; room: any; cards: any[] };
type Meta = { pieces: number; userId: string; savedAt: string; expiresAt: string; count: number };

export const offlineSupported = () => Platform.OS !== 'web';

async function readMeta(): Promise<Meta | null> {
  if (!offlineSupported()) return null;
  try { const raw = await SecureStore.getItemAsync(META); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export async function clearOffline(): Promise<void> {
  if (!offlineSupported()) return;
  const m = await readMeta();
  const n = Math.max(m?.pieces || 0, 0);
  for (let i = 0; i < n; i += 1) { try { await SecureStore.deleteItemAsync(PIECE(i)); } catch { /* gone */ } }
  try { await SecureStore.deleteItemAsync(META); } catch { /* gone */ }
}

export async function saveOffline(set: OfflineSet, userId: string): Promise<void> {
  if (!offlineSupported()) throw new Error('Offline cards are kept on the phone app, not in a browser');
  await clearOffline();
  const text = JSON.stringify(set);
  const pieces = Math.ceil(text.length / SIZE);
  for (let i = 0; i < pieces; i += 1) await SecureStore.setItemAsync(PIECE(i), text.slice(i * SIZE, (i + 1) * SIZE));
  const meta: Meta = { pieces, userId, savedAt: new Date().toISOString(), expiresAt: String(set.expiresAt), count: set.count };
  await SecureStore.setItemAsync(META, JSON.stringify(meta));
}

/** What is saved, for this account and not expired — else nothing (and anything stale is deleted). */
export async function loadOffline(userId: string): Promise<{ meta: Meta; set: OfflineSet } | null> {
  const meta = await readMeta();
  if (!meta) return null;
  if (meta.userId !== userId || new Date(meta.expiresAt).getTime() < Date.now()) { await clearOffline(); return null; }
  let text = '';
  for (let i = 0; i < meta.pieces; i += 1) {
    const part = await SecureStore.getItemAsync(PIECE(i));
    if (part === null) { await clearOffline(); return null; }
    text += part;
  }
  try { return { meta, set: JSON.parse(text) }; } catch { await clearOffline(); return null; }
}

/** Just the summary (count, when it expires) — without reading every piece. */
export async function offlineStatus(userId: string): Promise<Meta | null> {
  const meta = await readMeta();
  if (!meta) return null;
  if (meta.userId !== userId || new Date(meta.expiresAt).getTime() < Date.now()) { await clearOffline(); return null; }
  return meta;
}
