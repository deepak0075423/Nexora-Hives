/**
 * The office's Results screens on the phone (Oct 2026): what they share.
 *
 *   STATUS / ATTENTION   an exam's step and what it waits on the office for —
 *                        the web's resultMeta names, so both say the same
 *   say                  a message, the way the rest of the app shows one (and
 *                        on the web harness, where Alert does nothing)
 *   AskSheet             a bottom sheet that asks before a step: what will
 *                        happen, an optional reason, optional choices
 *   Fig / Figs           small figures, two or four across
 *
 * Whether a step is ALLOWED is never decided here: every exam arrives with
 * `can` from the server, and the server refuses anything else regardless.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { TextInput } from '@/components/ui/TextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

export const STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  DRAFT:          { label: 'Draft',              fg: Colors.textSecondary, bg: Colors.surfaceAlt },
  MARKS_PENDING:  { label: 'Mark Entry',         fg: Colors.warning, bg: Colors.warningLight },
  REOPENED:       { label: 'Reopened',           fg: Colors.warning, bg: Colors.warningLight },
  REJECTED:       { label: 'Rejected',           fg: Colors.danger, bg: Colors.dangerLight },
  SUBMITTED:      { label: 'Pending Validation', fg: Colors.info, bg: Colors.infoLight },
  CLASS_APPROVED: { label: 'Ready to Publish',   fg: '#6D28D9', bg: '#EDE9FE' },
  FINAL_APPROVED: { label: 'Published',          fg: Colors.success, bg: Colors.successLight },
};
export const statusOf = (s?: string) => STATUS[s || ''] || { label: s || '—', fg: Colors.textSecondary, bg: Colors.surfaceAlt };

/** Why an exam waits on the office — keys are the server's `attention`. */
export const ATTENTION: Record<string, string> = {
  publish: 'The marks are validated and ready to publish.',
  reopen: 'The marks were rejected. Reopen the exam so they can be corrected.',
  validate: 'This section has no class teacher, so the marks wait for the office to validate.',
  open: 'The exam is over and mark entry has not been opened.',
  marks: 'A subject has no teacher in this section — its marks wait for the office.',
};

export const say = (title: string, message: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

export type Choice = { value: string; label: string; note?: string };
export type Ask = {
  title: string;
  /** What will happen, said plainly — one line each. */
  lines: string[];
  confirm: string;
  danger?: boolean;
  reason?: { label: string; required?: boolean; placeholder?: string };
  /** Ticked choices (subjects to reopen, students to withhold…); `none` is what ticking none means. */
  choices?: { label: string; options: Choice[]; none?: string; ticked?: string[] };
  run: (reason: string, picked: string[]) => Promise<any>;
  done?: (res: any) => string;
};

/** Ask, then do: the sheet stays up while it runs, and a refusal is shown in it. */
export function AskSheet({ ask, onClose, onDone }: { ask: Ask | null; onClose: () => void; onDone: (message: string) => void }) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setReason(''); setPicked(ask?.choices?.ticked || []); setBusy(false); setError(''); }, [ask]);
  if (!ask) return null;
  const go = async () => {
    if (ask.reason?.required && !reason.trim()) { setError(`${ask.reason.label} is needed`); return; }
    setBusy(true); setError('');
    try {
      const res = await ask.run(reason.trim(), picked);
      setBusy(false);
      onDone(ask.done ? ask.done(res) : '');
    } catch (e: any) { setError(e?.message || 'That did not work'); setBusy(false); }
  };
  const toggle = (v: string) => setPicked((list) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]));
  return (
    <Modal visible transparent animationType="slide" onRequestClose={busy ? () => {} : onClose}>
      <KeyboardAvoidingView style={o.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[o.sheet, { paddingBottom: Spacing.md + insets.bottom }]}>
          <View style={o.head}>
            <Text style={o.title}>{ask.title}</Text>
            <TouchableOpacity onPress={onClose} disabled={busy} style={o.close} accessibilityLabel="Close"><Ionicons name="close" size={18} color={Colors.textSecondary} /></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
            {ask.lines.map((l, i) => (
              <View key={i} style={o.line}><View style={o.dot} /><Text style={o.lineText}>{l}</Text></View>
            ))}
            {ask.choices ? (
              <View style={{ marginTop: 10 }}>
                <Text style={o.label}>{ask.choices.label}</Text>
                {ask.choices.options.map((c) => {
                  const on = picked.includes(c.value);
                  return (
                    <TouchableOpacity key={c.value} style={[o.choice, on && o.choiceOn]} onPress={() => toggle(c.value)} disabled={busy}
                      accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? Colors.primary : Colors.textLight} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={o.choiceText} numberOfLines={1}>{c.label}</Text>
                        {c.note ? <Text style={o.choiceNote} numberOfLines={1}>{c.note}</Text> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {ask.choices.none && !picked.length ? <Text style={o.hint}>{ask.choices.none}</Text> : null}
              </View>
            ) : null}
            {ask.reason ? (
              <View style={{ marginTop: 10 }}>
                <Text style={o.label}>{ask.reason.label}{ask.reason.required ? ' *' : ''}</Text>
                <TextInput style={o.input} value={reason} onChangeText={(v) => { setReason(v.slice(0, 500)); setError(''); }} multiline
                  placeholder={ask.reason.placeholder} placeholderTextColor={Colors.textLight} editable={!busy} />
              </View>
            ) : null}
            {error ? <Text style={o.error}>{error}</Text> : null}
          </ScrollView>
          <View style={o.btns}>
            <TouchableOpacity style={o.ghost} onPress={onClose} disabled={busy}><Text style={o.ghostText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={[o.btn, ask.danger && o.btnDanger]} onPress={go} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={o.btnText}>{ask.confirm}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Figures, `cols` across: a number and what it counts. */
export function Figs({ items, cols = 4 }: { items: { label: string; value: any; tone?: string }[]; cols?: number }) {
  return (
    <View style={o.figs}>
      {items.map((f) => (
        <View key={f.label} style={[o.fig, { flexBasis: cols === 2 ? '48%' : '23%' }]}>
          <Text style={[o.figV, f.tone ? { color: f.tone } : null]} numberOfLines={1}>{String(f.value ?? '—')}</Text>
          <Text style={o.figL} numberOfLines={2}>{f.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** A tappable line in a list: an icon, a title, a sub-line, a chevron. */
export function LinkRow({ icon, title, sub, onPress, badge }: { icon: string; title: string; sub?: string; onPress: () => void; badge?: string }) {
  return (
    <TouchableOpacity style={o.link} onPress={onPress} activeOpacity={0.75} accessibilityRole="button">
      <View style={o.linkIcon}><Ionicons name={icon as any} size={18} color={Colors.primary} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={o.linkTitle}>{title}</Text>
        {sub ? <Text style={o.linkSub} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {badge ? <View style={o.badge}><Text style={o.badgeText}>{badge}</Text></View> : null}
      <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
    </TouchableOpacity>
  );
}

export const os = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  body: { padding: Spacing.md, paddingBottom: 110 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  title: { ...Typography.h4, color: Colors.text },
  sub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2 },
  cap: { fontSize: 10, fontWeight: '800', color: '#1E2452', letterSpacing: 0.8, marginTop: 6, marginBottom: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  note: { fontSize: 12, color: '#075985', backgroundColor: Colors.infoLight, padding: 10, borderRadius: Radius.md, marginBottom: 10 },
  warn: { fontSize: 12, color: '#7A4A06', backgroundColor: Colors.warningLight, padding: 10, borderRadius: Radius.md, marginBottom: 10 },
  bad: { fontSize: 12, color: Colors.danger, backgroundColor: Colors.dangerLight, padding: 10, borderRadius: Radius.md, marginBottom: 10 },
  ok: { fontSize: 12, color: '#14532D', backgroundColor: Colors.successLight, padding: 10, borderRadius: Radius.md, marginBottom: 10 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  btn: { flexGrow: 1, minHeight: 40, paddingHorizontal: 12, borderRadius: Radius.md, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  ghost: { flexGrow: 1, minHeight: 40, paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  dangerGhost: { borderColor: Colors.dangerLight, backgroundColor: Colors.dangerLight },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: Colors.divider },
  lineName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  lineSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  more: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 18, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, marginTop: 4 },
  moreText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  headBtn: { paddingHorizontal: 6, paddingVertical: 4 },
});

const o = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: Spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  title: { flex: 1, ...Typography.h4, color: Colors.text },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 3 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.textLight, marginTop: 7 },
  lineText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, marginBottom: 6 },
  choiceOn: { borderColor: Colors.primary, backgroundColor: '#F5F3FF' },
  choiceText: { fontSize: 13, fontWeight: '600', color: Colors.text },
  choiceNote: { fontSize: 11, color: Colors.textSecondary },
  hint: { fontSize: 11.5, color: Colors.textSecondary },
  input: { minHeight: 80, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt, padding: 10, fontSize: 14, color: Colors.text, textAlignVertical: 'top' },
  error: { fontSize: 12, color: Colors.danger, backgroundColor: Colors.dangerLight, padding: 10, borderRadius: Radius.md, marginTop: 10 },
  btns: { flexDirection: 'row', gap: 8, marginTop: 12 },
  ghost: { flex: 1, height: 44, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  btn: { flex: 1, height: 44, borderRadius: Radius.md, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  btnDanger: { backgroundColor: Colors.danger },
  btnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  figs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  fig: { flexGrow: 1, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, borderRadius: Radius.md, backgroundColor: Colors.surfaceAlt },
  figV: { fontSize: 15, fontWeight: '700', color: Colors.text },
  figL: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  linkIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  linkTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  linkSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 1 },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
});
