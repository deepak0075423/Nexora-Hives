/**
 * Pictures and maths in aptitude questions, on the phone (Nov 2026) — the
 * twin of school-frontend/src/pages/exams/examMedia.jsx.
 *
 *   • A question and each option may carry a picture (a screenshot, a
 *     diagram). It is uploaded the moment it is picked; the question then
 *     holds its address. Tap a picture to see it full screen.
 *   • Question text is any language, and a row of keys under the focused box
 *     types exponents (x², 10⁻³, aⁿ) and maths symbols that phone keyboards
 *     lack. Unicode characters, so they read the same everywhere.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, Image, Modal, Pressable, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Alert,
  type NativeSyntheticEvent, type TextInputSelectionChangeEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { BASE_URL } from '@/api/axios';
import { TextInput } from '@/components/ui/TextInput';
import { Colors, Radius, Spacing } from '@/constants/theme';

const UPLOADS_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');

/** A stored picture address → something <Image> can load. */
export function examImageUrl(path?: string | null): string {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return `${UPLOADS_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

// ── Showing a picture ─────────────────────────────────────────────────────────

/**
 * A question's or an option's picture, sized to its own shape. `zoom` opens
 * it full screen on a tap — off inside an answer tile, where a tap answers.
 */
export function ExamImage({ src, maxHeight = 220, zoom = true, label = 'Question picture' }: {
  src?: string | null; maxHeight?: number; zoom?: boolean; label?: string;
}) {
  const uri = examImageUrl(src);
  const [ratio, setRatio] = useState(4 / 3);
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (!uri) return;
    Image.getSize(uri, (w, h) => { if (w > 0 && h > 0) setRatio(w / h); }, () => {});
  }, [uri]);

  if (!uri) return null;
  if (broken) {
    return (
      <View style={m.broken}>
        <Ionicons name="image-outline" size={14} color={Colors.textSecondary} />
        <Text style={m.brokenText}>Picture could not load</Text>
      </View>
    );
  }

  const pic = (
    <View style={[m.frame, { maxHeight }]}>
      <Image
        source={{ uri }}
        style={{ width: '100%', aspectRatio: ratio, maxHeight: maxHeight - 8 }}
        resizeMode="contain"
        onError={() => setBroken(true)}
        accessibilityLabel={label}
      />
    </View>
  );
  if (!zoom) return pic;
  return (
    <>
      <TouchableOpacity activeOpacity={0.85} onPress={() => setOpen(true)} accessibilityLabel={`${label} — open full screen`}>
        {pic}
        <View style={m.zoomBadge} pointerEvents="none"><Ionicons name="expand-outline" size={13} color="#fff" /></View>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={m.light} onPress={() => setOpen(false)}>
          <Image source={{ uri }} style={m.lightImg} resizeMode="contain" accessibilityLabel={label} />
          <TouchableOpacity style={m.lightClose} onPress={() => setOpen(false)} accessibilityLabel="Close picture">
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Picking and uploading one ─────────────────────────────────────────────────

/**
 * Pick a picture from the phone and send it. `upload(form)` posts the form
 * (examApi.uploadQuestionImage) and the stored address comes back.
 */
export async function pickExamImage(upload: (fd: FormData) => Promise<any>): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to add a picture'); return null; }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 });
  if (result.canceled || !result.assets?.length) return null;
  const a = result.assets[0];
  if (a.fileSize && a.fileSize > 5 * 1024 * 1024) { Alert.alert('Picture too large', 'Pick a picture under 5 MB, or crop it.'); return null; }
  const type = /^image\/(png|jpeg|webp|gif)$/.test(a.mimeType ?? '') ? a.mimeType! : 'image/jpeg';
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : type === 'image/gif' ? 'gif' : 'jpg';
  const fd = new FormData();
  fd.append('image', { uri: a.uri, name: a.fileName || `picture-${Date.now()}.${ext}`, type } as any);
  try {
    const res: any = await upload(fd);
    return (res?.data ?? res)?.url ?? null;
  } catch (e: any) {
    Alert.alert('Picture not added', e?.data?.message || e?.message || 'Try again');
    return null;
  }
}

/** "Add picture" — or the picture with Replace / Remove. */
export function PicturePick({ value, onChange, upload, label = 'Add a picture', compact = false }: {
  value?: string; onChange: (url: string) => void; upload: (fd: FormData) => Promise<any>; label?: string; compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    setBusy(true);
    try { const url = await pickExamImage(upload); if (url) onChange(url); }
    finally { setBusy(false); }
  };
  if (value) {
    return (
      <View style={{ gap: 6 }}>
        <ExamImage src={value} maxHeight={compact ? 130 : 200} />
        <View style={m.picActs}>
          <TouchableOpacity style={m.picAct} onPress={pick} disabled={busy}>
            {busy ? <ActivityIndicator size="small" color={Colors.primary} /> : <Ionicons name="swap-horizontal" size={14} color={Colors.primary} />}
            <Text style={m.picActText}>Replace</Text>
          </TouchableOpacity>
          <TouchableOpacity style={m.picAct} onPress={() => onChange('')} disabled={busy}>
            <Ionicons name="trash-outline" size={14} color={Colors.danger} />
            <Text style={[m.picActText, { color: Colors.danger }]}>Remove picture</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  return (
    <TouchableOpacity style={[m.add, compact && m.addCompact]} onPress={pick} disabled={busy} accessibilityLabel={label}>
      {busy ? <ActivityIndicator size="small" color={Colors.primary} /> : <Ionicons name="image-outline" size={16} color={Colors.primary} />}
      <Text style={m.addText}>{busy ? 'Uploading…' : label}</Text>
    </TouchableOpacity>
  );
}

// ── Maths keys ────────────────────────────────────────────────────────────────

const KEYS = ['²', '³', 'ⁿ', '⁻', '⁺', '⁰', '¹', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹', 'ˣ', '₁', '₂', '√', '∛', 'π', 'θ', '°', '±', '×', '÷', '≠', '≈', '≤', '≥', '∞', '½'];

/**
 * A text box that takes any language, with a row of exponent and symbol keys
 * under it while it is focused. Keys go in at the cursor.
 */
export function MathInput({ label, value, onChange, multiline, placeholder, maxLength }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string; maxLength?: number;
}) {
  const [sel, setSel] = useState<{ start: number; end: number }>({ start: value.length, end: value.length });
  const [focused, setFocused] = useState(false);
  const put = (k: string) => {
    const a = Math.min(sel.start, value.length);
    const b = Math.min(sel.end, value.length);
    const next = value.slice(0, a) + k + value.slice(b);
    if (maxLength && next.length > maxLength) return;
    onChange(next);
    setSel({ start: a + k.length, end: a + k.length });
  };
  return (
    <View style={m.field}>
      <Text style={m.fieldLabel}>{label}</Text>
      <TextInput
        text="any"
        style={[m.input, multiline && { minHeight: 84, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChange}
        onSelectionChange={(e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => setSel(e.nativeEvent.selection)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        placeholderTextColor={Colors.textLight}
        multiline={multiline}
        maxLength={maxLength}
        autoCapitalize="sentences"
      />
      {focused && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={m.keys}>
          {KEYS.map((k) => (
            <TouchableOpacity key={k} style={m.key} onPress={() => put(k)} accessibilityLabel={`Insert ${k}`}>
              <Text style={m.keyText}>{k}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const m = StyleSheet.create({
  frame: { alignSelf: 'flex-start', width: '100%', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: 4, backgroundColor: '#fff', overflow: 'hidden' },
  zoomBadge: { position: 'absolute', right: 8, bottom: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(15,23,42,0.6)', alignItems: 'center', justifyContent: 'center' },
  broken: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderRadius: Radius.sm, backgroundColor: Colors.surfaceAlt, alignSelf: 'flex-start' },
  brokenText: { fontSize: 11, color: Colors.textSecondary },
  light: { flex: 1, backgroundColor: 'rgba(15,23,42,0.92)', alignItems: 'center', justifyContent: 'center', padding: Spacing.md },
  lightImg: { width: '100%', height: '86%' },
  lightClose: { position: 'absolute', top: 48, right: 18, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  addCompact: { paddingVertical: 7, alignSelf: 'flex-start' },
  addText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  picActs: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  picAct: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  picActText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  field: { gap: 6, marginBottom: Spacing.sm },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: Colors.text, backgroundColor: Colors.surface },
  keys: { gap: 6, paddingVertical: 2 },
  key: { minWidth: 36, height: 36, paddingHorizontal: 8, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 16, color: Colors.text },
});
