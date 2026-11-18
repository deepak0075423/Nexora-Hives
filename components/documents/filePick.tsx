/**
 * Picking files for the Documents module on the phone (Nov 2026) — what a
 * teacher or the office attaches to a document, and what a student hands in.
 *
 * The limits are the server's own (middleware/upload.js): the same kinds of
 * file, 10 MB each. They are said here, before anything is sent — a file the
 * server will not take should not have to travel there to be refused.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Colors, Radius } from '@/constants/theme';

export type Picked = { uri: string; name: string; mimeType?: string; size?: number; file?: any };

export const UPLOAD_TYPES = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
/** What a student hands in for an assignment: PDF only (middleware/upload.js, uploadSubmission). */
export const HANDIN_TYPES = ['pdf'];
const MAX_BYTES = 10 * 1024 * 1024;

const size = (n?: number) => {
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

/** The picked files, as the multipart field the document routes read (`files`). */
export function appendDocFiles(body: FormData, files: Picked[]) {
  files.forEach((f) => {
    if (Platform.OS === 'web' && f.file) body.append('files', f.file, f.name);
    else body.append('files', { uri: f.uri, name: f.name, type: f.mimeType || 'application/octet-stream' } as any);
  });
}

/**
 * `types` is what this box takes (the share sheet: every UPLOAD_TYPES kind; a
 * student's hand-in: HANDIN_TYPES, PDF only) and `typeRule` says so when
 * something else is picked.
 */
export function DocPick({ files, onFiles, max = 10, label = 'Attach files', hint, types = UPLOAD_TYPES, typeRule }: {
  files: Picked[]; onFiles: (f: Picked[]) => void; max?: number; label?: string; hint?: string;
  types?: string[]; typeRule?: string;
}) {
  const pdfOnly = types.length === 1 && types[0] === 'pdf';
  const pick = async () => {
    try {
      // PDF only: the system picker shows PDFs alone, so nothing else can be chosen.
      const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, ...(pdfOnly ? { type: 'application/pdf' } : {}) });
      if (res.canceled || !res.assets?.length) return;
      const refused: string[] = [];
      const good: Picked[] = [];
      for (const a of res.assets as any[]) {
        let name = a.name || 'file';
        // A PDF from a cloud drive can arrive named without ".pdf"; the server
        // reads the name, then checks the file really is a PDF.
        if (a.mimeType === 'application/pdf' && !/\.pdf$/i.test(name)) name = `${name}.pdf`;
        const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
        if (!types.includes(ext)) refused.push(`${name} — ${typeRule || 'use a PDF, a Word, Excel or PowerPoint file, a text file or a photo'}`);
        else if ((a.size || 0) > MAX_BYTES) refused.push(`${name} is ${size(a.size)} — the limit is 10 MB a file`);
        else good.push({ uri: a.uri, name, mimeType: a.mimeType, size: a.size, file: a.file });
      }
      let next = [...files, ...good];
      if (next.length > max) { refused.push(`Only ${max} file${max === 1 ? '' : 's'} can be attached here`); next = next.slice(0, max); }
      if (refused.length) Alert.alert('Not attached', refused.join('\n\n'));
      onFiles(next);
    } catch (e: any) { Alert.alert('Could not open the file picker', e?.message || ''); }
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <TouchableOpacity style={s.drop} onPress={pick} accessibilityRole="button" accessibilityLabel={label}>
        <Ionicons name="cloud-upload-outline" size={20} color="#4338CA" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title}>{label}</Text>
          <Text style={s.sub}>{hint || `Up to ${max} files, 10 MB each — PDFs, documents or photos`}</Text>
        </View>
      </TouchableOpacity>
      {files.map((f, i) => (
        <View key={`${f.name}-${i}`} style={s.file}>
          <Ionicons name="document-attach-outline" size={16} color={Colors.primary} />
          <Text style={s.name} numberOfLines={1}>{f.name}</Text>
          <Text style={s.size}>{size(f.size)}</Text>
          <TouchableOpacity onPress={() => onFiles(files.filter((_, x) => x !== i))} hitSlop={8}
            accessibilityRole="button" accessibilityLabel={`Remove ${f.name}`}>
            <Ionicons name="close" size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  drop: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    borderWidth: 1, borderStyle: 'dashed', borderColor: '#C7D2FE', borderRadius: Radius.md, backgroundColor: '#F5F3FF',
  },
  title: { fontSize: 13, fontWeight: '700', color: '#3730A3' },
  sub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  file: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.surface,
  },
  name: { flex: 1, fontSize: 13, color: Colors.text },
  size: { fontSize: 11, color: Colors.textSecondary },
});
