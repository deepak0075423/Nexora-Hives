import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { BASE_URL } from '@/api/axios';
import storage from '@/utils/storage';
import { FormModal } from '@/components/ui/kit';
import { readProgress, readResult, type ImportResult } from '@/utils/importStream';

/**
 * Bulk import for teachers and students, matching the web admin screens.
 *
 * The template is downloaded from the server rather than shipped with the app:
 * it is built per school (its own classes, sections and designations) and it
 * carries one column per field of the matching intake wizard, so a sheet import
 * produces the same record as filling the form in by hand.
 *
 * Two things here are deliberately not done through the shared axios client:
 * the download needs the raw bytes on disk (`File.downloadFileAsync` streams
 * them natively), and the student import answers with server-sent events, which
 * only XHR lets us read while they arrive.
 */

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PICKER_TYPES = [XLSX_MIME, 'application/vnd.ms-excel', 'text/csv'];

type Kind   = 'teachers' | 'students';
type Picked = { uri: string; name: string; mimeType?: string | null };

const COPY: Record<Kind, { title: string; noun: string; file: string; docs: string }> = {
  teachers: {
    title: 'Bulk Import Teachers',
    noun:  'teacher',
    file:  'teacher-template.xlsx',
    docs:  'Aadhaar and PAN scans, resignation letter, experience certificate',
  },
  students: {
    title: 'Bulk Import Students',
    noun:  'student',
    file:  'student-template.xlsx',
    docs:  'photo, Aadhaar scans, birth certificate, TC',
  },
};

/**
 * POST the sheet and hand back the whole response body. `onPartial` fires as
 * the body streams in, which is what drives the student row counter.
 */
function postSheet(url: string, token: string, file: Picked, onPartial: (text: string) => void) {
  return new Promise<string>((resolve, reject) => {
    const fd = new FormData();
    // The server accepts a sheet by EXTENSION, so a picked file that lost its
    // suffix (some providers hand back a bare display name) gets one back.
    const name = /\.(xlsx|xls|csv)$/i.test(file.name) ? file.name : `${file.name}.xlsx`;
    fd.append('excelFile', { uri: file.uri, name, type: file.mimeType || XLSX_MIME } as any);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    // Every created account sends a welcome email, so a few hundred rows can
    // run well past the 30s the shared client allows.
    xhr.timeout = 10 * 60 * 1000;
    xhr.onprogress = () => onPartial(xhr.responseText || '');
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.responseText || '');
      let message = `Import failed (${xhr.status})`;
      try { message = JSON.parse(xhr.responseText)?.message || message; } catch { /* not JSON */ }
      reject(new Error(message));
    };
    xhr.onerror   = () => reject(new Error('Could not reach the server'));
    xhr.ontimeout = () => reject(new Error('The import timed out — try a smaller sheet'));
    xhr.send(fd);
  });
}

export default function BulkImportModal({ visible, kind, onClose, onImported }: {
  visible: boolean; kind: Kind; onClose: () => void; onImported: () => void;
}) {
  const copy = COPY[kind];
  const [file, setFile]           = useState<Picked | null>(null);
  const [downloading, setDown]    = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress]   = useState<{ current: number; total: number; name: string } | null>(null);
  const [result, setResult]       = useState<ImportResult | null>(null);

  const [savingErrors, setSavingErrors] = useState(false);
  const [errorsSaved, setErrorsSaved]   = useState(false);

  const reset = () => {
    setFile(null); setResult(null); setProgress(null); setImporting(false); setErrorsSaved(false);
  };

  /**
   * The failed-row sheet is built once, inside the import response, and is not
   * stored on the server — so walking away without saving it silently throws
   * away the only record of what went wrong. `then` runs once that is settled.
   */
  const guardUnsaved = (then: () => void) => {
    if (!result?.errorFile || errorsSaved) { then(); return; }
    const n = result.errorFile.rows;
    Alert.alert(
      'Download the failed rows first?',
      `${n} row${n !== 1 ? 's' : ''} did not import. The sheet listing them — with the reason against `
      + 'each row — has not been saved, and the server does not keep a copy. Leave now and the only '
      + 'way to see those rows again is to run the whole import a second time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave anyway', style: 'destructive', onPress: then },
        { text: 'Download', onPress: () => { saveErrorSheet(); } },
      ],
    );
  };

  const close = () => guardUnsaved(() => { reset(); onClose(); });

  const downloadTemplate = async () => {
    setDown(true);
    try {
      const token  = await storage.getItem('token');
      const target = new File(Paths.cache, copy.file);
      const saved  = await File.downloadFileAsync(
        `${BASE_URL}/admin/${kind}/template`, target,
        { headers: { Authorization: `Bearer ${token}` }, idempotent: true },
      );
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(saved.uri, {
          mimeType: XLSX_MIME,
          UTI: 'org.openxmlformats.spreadsheetml.sheet',
          dialogTitle: copy.file,
        });
      } else {
        Alert.alert('Template saved', `Saved to ${saved.uri}`);
      }
    } catch (err: any) {
      Alert.alert('Download failed', err.message ?? 'Could not download the template');
    } finally { setDown(false); }
  };

  const saveErrorSheet = async () => {
    if (!result?.errorFile) return;
    setSavingErrors(true);
    try {
      const target = new File(Paths.cache, result.errorFile.filename);
      target.create({ overwrite: true });
      target.write(result.errorFile.base64, { encoding: 'base64' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target.uri, {
          mimeType: XLSX_MIME,
          UTI: 'org.openxmlformats.spreadsheetml.sheet',
          dialogTitle: result.errorFile.filename,
        });
      } else {
        Alert.alert('Saved', `Saved to ${target.uri}`);
      }
      setErrorsSaved(true);
    } catch (err: any) {
      Alert.alert('Could not save', err.message ?? 'Failed to write the file');
    } finally { setSavingErrors(false); }
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: PICKER_TYPES, copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      setFile({ uri: a.uri, name: a.name ?? 'import.xlsx', mimeType: a.mimeType });
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not open the file picker');
    }
  };

  const runImport = async () => {
    if (!file) { Alert.alert('No file', 'Choose the filled-in Excel sheet first.'); return; }
    setImporting(true);
    setProgress(null);
    try {
      const token = await storage.getItem('token');
      if (!token) throw new Error('Your session has expired — sign in again');

      // Students stream their progress; teachers answer with one JSON body.
      const streamed = kind === 'students';
      const body = await postSheet(
        `${BASE_URL}/admin/${kind}/bulk`, token, file,
        (text) => { if (streamed) setProgress(readProgress(text)); },
      );

      const outcome = readResult(body, streamed);
      setResult(outcome);
      if (outcome.created + outcome.updated > 0) onImported();
    } catch (err: any) {
      Alert.alert('Import failed', err.message ?? 'Something went wrong');
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  // ── Result summary ────────────────────────────────────────────────────────
  if (result) {
    return (
      <FormModal visible={visible} title={copy.title} onClose={close}>
        <View style={s.tiles}>
          <Tile value={result.created} label="Created" tone={Colors.success} bg={Colors.successLight} />
          <Tile value={result.updated} label="Updated" tone={Colors.text} bg={Colors.surfaceAlt} />
          <Tile
            value={result.errors.length}
            label="Errors"
            tone={result.errors.length ? Colors.danger : Colors.textSecondary}
            bg={result.errors.length ? Colors.dangerLight : Colors.surfaceAlt}
          />
        </View>
        {result.errors.length > 0 && (
          <ScrollView style={s.errorBox}>
            {result.errors.map((e, i) => (
              <View key={i} style={s.errorRow}>
                <Text style={s.errorRowTitle}>Row {e.row}{e.name ? ` — ${e.name}` : ''}</Text>
                <Text style={s.errorRowText}>{e.reason}</Text>
              </View>
            ))}
          </ScrollView>
        )}
        {result.errorFile && (
          <>
            <TouchableOpacity style={s.outlineBtn} onPress={saveErrorSheet} disabled={savingErrors}>
              {savingErrors
                ? <ActivityIndicator size="small" color={Colors.accent} />
                : <Ionicons name="download-outline" size={18} color={Colors.accent} />}
              <Text style={s.outlineText}>
                Download the {result.errorFile.rows} failed row{result.errorFile.rows !== 1 ? 's' : ''} (.xlsx)
              </Text>
            </TouchableOpacity>
            <Text style={s.noteText}>
              That file is your own sheet with just these rows and an Error column saying what stopped
              each one. Fix them there and upload the same file again — the rows that already imported
              are not in it.
              {result.errorFile.total > result.errorFile.rows
                ? ` Showing the first ${result.errorFile.rows} of ${result.errorFile.total} failures.`
                : ''}
            </Text>
          </>
        )}
        <TouchableOpacity style={s.secondaryBtn} onPress={() => guardUnsaved(reset)}>
          <Text style={s.secondaryText}>Import another sheet</Text>
        </TouchableOpacity>
      </FormModal>
    );
  }

  // ── Import in flight ──────────────────────────────────────────────────────
  if (importing) {
    return (
      <FormModal visible={visible} title={copy.title} onClose={() => {}}>
        <View style={s.busy}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={s.busyTitle}>
            {progress ? `Importing ${progress.current} of ${progress.total}…` : 'Importing…'}
          </Text>
          {!!progress?.name && <Text style={s.busySub}>Creating account for {progress.name}</Text>}
          <Text style={s.busyNote}>Each new account is emailed a one-time password. Keep this screen open.</Text>
        </View>
      </FormModal>
    );
  }

  // ── Picker ────────────────────────────────────────────────────────────────
  return (
    <FormModal visible={visible} title={copy.title} onClose={close} onSubmit={runImport} submitLabel="Import">
      <Text style={s.intro}>
        The template carries every field of the Add {copy.noun === 'teacher' ? 'Teacher' : 'Student'} form.
        Its Reference sheet lists the exact values each column accepts and which ones are required.
      </Text>

      <TouchableOpacity style={s.outlineBtn} onPress={downloadTemplate} disabled={downloading}>
        {downloading
          ? <ActivityIndicator size="small" color={Colors.accent} />
          : <Ionicons name="download-outline" size={18} color={Colors.accent} />}
        <Text style={s.outlineText}>Download Template (.xlsx)</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[s.outlineBtn, file && s.outlineBtnDone]} onPress={pickFile}>
        <Ionicons
          name={file ? 'checkmark-circle' : 'document-attach-outline'}
          size={18}
          color={file ? Colors.success : Colors.accent}
        />
        <Text style={[s.outlineText, file && { color: Colors.success }]} numberOfLines={1}>
          {file ? file.name : 'Choose Excel File'}
        </Text>
      </TouchableOpacity>

      <View style={s.note}>
        <Text style={s.noteTitle}>Note</Text>
        <Text style={s.noteText}>
          Only the paperwork itself can’t be imported — {copy.docs}. Open each {copy.noun} in Edit
          afterwards to attach it. Re-uploading a corrected sheet updates the {copy.noun}s it already created.
        </Text>
      </View>
    </FormModal>
  );
}

function Tile({ value, label, tone, bg }: { value: number; label: string; tone: string; bg: string }) {
  return (
    <View style={[s.tile, { backgroundColor: bg }]}>
      <Text style={[s.tileValue, { color: tone }]}>{value}</Text>
      <Text style={s.tileLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  intro: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: Spacing.md },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingVertical: 13, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  outlineBtnDone: { borderColor: Colors.success, backgroundColor: Colors.successLight },
  outlineText: { fontSize: 14, fontWeight: '600', color: Colors.accent, flexShrink: 1 },
  note: {
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md,
    padding: Spacing.md, marginTop: Spacing.sm,
  },
  noteTitle: { fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  noteText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

  tiles: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  tile: { flex: 1, borderRadius: Radius.md, paddingVertical: Spacing.md, alignItems: 'center' },
  tileValue: { ...Typography.h3, fontWeight: '700' },
  tileLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  errorBox: {
    maxHeight: 220, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, marginBottom: Spacing.md,
  },
  errorRow: { paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  errorRowTitle: { fontSize: 12, fontWeight: '700', color: Colors.text },
  errorRowText: { fontSize: 12, color: Colors.danger, marginTop: 2 },

  secondaryBtn: { alignItems: 'center', paddingVertical: 12 },
  secondaryText: { fontSize: 14, fontWeight: '600', color: Colors.accent },

  busy: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  busyTitle: { ...Typography.h4, color: Colors.text, marginTop: Spacing.sm },
  busySub: { fontSize: 13, color: Colors.textSecondary },
  busyNote: { fontSize: 12, color: Colors.textLight, textAlign: 'center', marginTop: Spacing.sm, paddingHorizontal: Spacing.md },
});
