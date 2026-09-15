/**
 * A half-finished feedback form, kept on this device only.
 *
 * A file in the app's document directory rather than SecureStore: a written
 * comment can run to a thousand characters and SecureStore values are meant to
 * be small. Every call is wrapped — a feedback form must never fail because a
 * convenience did.
 */
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

const name = (id: string) => `fb-draft-${String(id).replace(/[^a-zA-Z0-9-]/g, '')}.json`;

export async function readDraft(id: string): Promise<Record<string, any> | null> {
  try {
    if (Platform.OS === 'web') {
      const raw = globalThis.localStorage?.getItem(name(id));
      return raw ? JSON.parse(raw)?.answers ?? null : null;
    }
    const f = new File(Paths.document, name(id));
    if (!f.exists) return null;
    return JSON.parse(await f.text())?.answers ?? null;
  } catch { return null; }
}

export function writeDraft(id: string, answers: Record<string, any>) {
  try {
    const body = JSON.stringify({ answers, at: Date.now() });
    if (Platform.OS === 'web') { globalThis.localStorage?.setItem(name(id), body); return; }
    const f = new File(Paths.document, name(id));
    if (!f.exists) f.create({ overwrite: true });
    f.write(body);
  } catch { /* a draft is a convenience */ }
}

export function clearDraft(id: string) {
  try {
    if (Platform.OS === 'web') { globalThis.localStorage?.removeItem(name(id)); return; }
    const f = new File(Paths.document, name(id));
    if (f.exists) f.delete();
  } catch { /* nothing to clear */ }
}
