/**
 * Files for the admission screens on the phone (Oct 2026).
 *
 *   openAdmissionFile — a PDF, calendar entry or export the server sends behind
 *     sign-in (receipts, the offer letter, admit cards, .ics files, exports):
 *     fetched with the session, written to the phone's cache, and handed to
 *     the share sheet — where "Calendar", "Files" or a PDF viewer opens it.
 *     The server renders every document; the phone never draws its own copy.
 *   pickFile — a document or a photo from the phone, for an upload.
 *   partOf — that pick as a FormData part (a {uri,name,type} on the phone,
 *     the File itself in a browser).
 *   openWeb — a page in the in-app browser (the card checkout, DigiLocker);
 *     resolves when the family closes it.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import api from '@/api/axios';

export type Picked = { uri: string; name: string; type: string; size?: number; file?: any };

const MIME: Record<string, string> = { pdf: 'application/pdf', ics: 'text/calendar', csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', json: 'application/json' };
const mimeOf = (name: string) => MIME[String(name).split('.').pop()?.toLowerCase() || ''] || 'application/octet-stream';

const blobToBase64 = (blob: any): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('The file could not be read'));
  reader.onloadend = () => resolve(String(reader.result).split(',')[1] ?? '');
  reader.readAsDataURL(blob);
});

/** Fetch a protected file and open it (share sheet on the phone, a tab in a browser). */
export async function openAdmissionFile(url: string, filename: string): Promise<void> {
  const blob: any = await api.get(url, { responseType: 'blob', timeout: 120000 });
  const safe = String(filename || 'file').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80);
  if (Platform.OS === 'web') {
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href; a.download = safe; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60000);
    return;
  }
  const uri = `${FileSystem.cacheDirectory}${safe}`;
  await FileSystem.writeAsStringAsync(uri, await blobToBase64(blob), { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: mimeOf(safe), dialogTitle: safe });
  else throw new Error('Sharing is not available on this phone');
}

/** A document (PDF or image) from the phone's files, or a photo taken now. */
export async function pickFile(from: 'files' | 'camera', accept: string[] = ['pdf', 'jpg', 'jpeg', 'png']): Promise<Picked | null> {
  if (from === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('The camera is not allowed for this app — allow it in the phone\'s settings');
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (r.canceled || !r.assets?.[0]) return null;
    const a = r.assets[0];
    return { uri: a.uri, name: a.fileName || `photo-${Date.now()}.jpg`, type: a.mimeType || 'image/jpeg', size: a.fileSize, file: (a as any).file };
  }
  const types = [...new Set(accept.map((x) => (x === 'pdf' ? 'application/pdf' : 'image/*')))];
  const r = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.[0]) return null;
  const a: any = r.assets[0];
  return { uri: a.uri, name: a.name || 'document', type: a.mimeType || mimeOf(a.name || ''), size: a.size, file: a.file };
}

/** The pick as a FormData part. */
export function partOf(p: Picked): any {
  if (Platform.OS === 'web' && p.file) return p.file;
  return { uri: p.uri, name: p.name, type: p.type };
}

/** A web page in the in-app browser; resolves when it is closed. */
export async function openWeb(url: string): Promise<void> {
  if (Platform.OS === 'web') { window.open(url, '_blank'); return; }
  await WebBrowser.openBrowserAsync(url);
}

/**
 * Sign-in at another service that comes back to the app (DigiLocker): the
 * session ends when the server sends the browser to `aksharum://…`.
 */
export async function openAuth(url: string): Promise<'done' | 'closed'> {
  if (Platform.OS === 'web') { window.open(url, '_blank'); return 'closed'; }
  const r = await WebBrowser.openAuthSessionAsync(url, 'aksharum://');
  return r.type === 'success' ? 'done' : 'closed';
}
