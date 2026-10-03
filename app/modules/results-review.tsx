/**
 * The class teacher's review of an exam, on the phone (Oct 2026) — every
 * student's marks in every subject, with the total, percentage and grade they
 * come to: what has to be read before the marks are validated
 * (GET /teacher/results/review/:examId, the web's review matrix).
 *
 * Validate sends the exam on to the office to publish; Send back returns it
 * with a reason, which the office reads before reopening it for correction.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Platform, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as R from '@/api/results.api';
import { Empty, LoaderView, FormModal, Input, SearchBar, confirmAsync, unwrap } from '@/components/ui/kit';
import { Tiles, GradePill, PassPill, pct, classLine, plural, fmtRange } from '@/components/results/parts';

const say = (title: string, message: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

export default function ResultsReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { examId } = useLocalSearchParams<{ examId: string }>();
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try { setD(unwrap(await R.examReview(String(examId)))); }
    catch (err: any) { setError(err?.message || 'The marks could not be loaded'); }
  }, [examId]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (d?.students || []).filter((x: any) => !t || `${x.name} ${x.rollNumber}`.toLowerCase().includes(t));
  }, [d, q]);

  const validate = async () => {
    const blank = d?.stats?.blank || 0;
    if (!(await confirmAsync('Validate these marks?', blank
      ? `${plural(blank, 'mark')} ${blank === 1 ? 'is' : 'are'} still blank. Validating sends the exam to the office to publish.`
      : 'Validating sends the exam to the office to publish.', 'Validate'))) return;
    setBusy('validate'); setError('');
    try { await R.validateExam(String(examId)); say('Validated', 'The office can publish the results now.'); router.back(); }
    catch (err: any) { setError(err?.message || 'The marks could not be validated'); }
    finally { setBusy(''); }
  };
  const sendBack = async () => {
    if (!reason.trim()) { setError('Say what needs correcting — the office and the teachers will see it'); return; }
    setBusy('reject'); setError('');
    try { await R.rejectExam(String(examId), reason.trim()); setRejecting(false); say('Sent back', 'The office will reopen the exam so the marks can be corrected.'); router.back(); }
    catch (err: any) { setError(err?.message || 'The marks could not be sent back'); }
    finally { setBusy(''); }
  };

  if (error && !d) return (<><Stack.Screen options={{ title: 'Review Marks' }} /><Empty icon="alert-circle-outline" text={error} /></>);
  if (!d) return (<><Stack.Screen options={{ title: 'Review Marks' }} /><LoaderView /></>);
  const st = d.stats || {};
  const canAct = !!d.can?.validate;

  return (
    <>
      <Stack.Screen options={{ title: 'Review Marks' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>{d.exam.title}</Text>
        <Text style={s.sub}>{[classLine(d.exam), d.exam.examTypeLabel, fmtRange(d.exam.startDate, d.exam.endDate)].filter(Boolean).join(' · ')}</Text>

        <Tiles items={[
          { label: 'Students', value: st.students ?? 0, icon: 'people-outline', tone: 'primary' },
          { label: 'Passing', value: st.passing ?? 0, icon: 'checkmark-circle-outline', tone: 'success' },
          { label: 'Average', value: pct(st.avgPct), icon: 'analytics-outline', tone: 'info' },
          { label: 'Blank Marks', value: st.blank ?? 0, icon: 'alert-circle-outline', tone: st.blank ? 'danger' : 'neutral' },
        ]} />

        <View style={s.subjects}>
          {d.subjects.map((x: any) => (
            <Text key={x._id} style={s.subjectLine}>
              <Text style={{ fontWeight: '700', color: Colors.text }}>{x.subjectName}</Text> · {x.gradeOnly ? 'graded' : `max ${x.maxMarks}, pass ${x.passingMarks}`}{x.components ? ' · in parts' : ''}{x.elective ? ' · elective' : ''}{x.teachers?.length ? ` · ${x.teachers.join(', ')}` : ''}
            </Text>
          ))}
        </View>

        {d.exam.options?.allowGraceMarks ? (
          <Text style={s.graceNote}>Grace marks the exam allows are included, as publishing will add them{st.graced ? ` — ${plural(st.graced, 'student')} carried over the line (marked *)` : ''}.</Text>
        ) : null}
        {error ? <Text style={s.error}>{error}</Text> : null}
        <SearchBar value={q} onChange={setQ} placeholder="Search students…" />

        {shown.map((x: any) => {
          const on = open === x._id;
          return (
            <TouchableOpacity key={x._id} style={s.card} activeOpacity={0.75} onPress={() => setOpen(on ? null : x._id)}
              accessibilityRole="button" accessibilityState={{ expanded: on }}>
              <View style={s.rowTop}>
                <Text style={s.roll}>{x.rollNumber || '—'}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.name} numberOfLines={1}>{x.name}</Text>
                  <Text style={s.rowSub}>{x.total}{x.grace ? '*' : ''} / {x.max} · {pct(x.percentage)}{x.blank ? ` · ${plural(x.blank, 'blank')}` : ''}</Text>
                </View>
                <GradePill grade={x.grade} scale={d.scale} />
                <PassPill passed={!!x.passed} label={x.blank ? 'Blank' : undefined} />
              </View>
              {on ? (
                <View style={s.cells}>
                  {d.subjects.map((sub: any, i: number) => {
                    const c = x.cells[i];
                    return (
                      <View key={sub._id} style={s.cell}>
                        <Text style={s.cellName} numberOfLines={1}>{sub.subjectName}</Text>
                        <Text style={[s.cellV, (!c || c.below || c.absent) && { color: Colors.danger }, c?.na && { color: Colors.textLight }]}>
                          {!c ? 'Blank' : c.na ? 'n/a' : c.absent ? 'AB' : c.grade !== undefined ? (c.grade || '—') : `${c.marks}/${sub.maxMarks}`}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
        {!shown.length ? <Empty icon="search-outline" text="Nobody matches." /> : null}
      </ScrollView>

      {canAct ? (
        <View style={[s.foot, { paddingBottom: Spacing.sm + insets.bottom }]}>
          <TouchableOpacity style={[s.btn, s.btnDanger]} disabled={!!busy} onPress={() => { setError(''); setRejecting(true); }}>
            <Text style={[s.btnText, { color: Colors.danger }]}>Send Back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnPrimary]} disabled={!!busy} onPress={validate}>
            {busy === 'validate' ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[s.btnText, { color: '#fff' }]}>Validate Marks</Text>}
          </TouchableOpacity>
        </View>
      ) : null}

      <FormModal visible={rejecting} title="Send back the marks" onClose={() => setRejecting(false)} onSubmit={sendBack}
        submitting={busy === 'reject'} submitLabel="Send Back">
        <Text style={s.modalNote}>The office reads your reason and reopens the exam, so the teachers can correct their marks.</Text>
        <Input label="What needs correcting" value={reason} onChange={setReason} multiline />
        {error && rejecting ? <Text style={s.error}>{error}</Text> : null}
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  body: { padding: Spacing.md, paddingBottom: 32 },
  title: { ...Typography.h3, color: Colors.text },
  sub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, marginBottom: Spacing.md },
  subjects: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 10, gap: 4 },
  subjectLine: { fontSize: 12, color: Colors.textSecondary },
  graceNote: { fontSize: 12, color: '#5B21B6', backgroundColor: '#F3EEFF', padding: 10, borderRadius: Radius.md, marginBottom: 10 },
  error: { fontSize: 12, color: Colors.danger, backgroundColor: Colors.dangerLight, padding: 10, borderRadius: Radius.md, marginBottom: 10 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: Colors.border },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roll: { width: 26, fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center' },
  name: { fontSize: 13, fontWeight: '600', color: Colors.text },
  rowSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.divider },
  cell: { flexBasis: '31%', flexGrow: 1, padding: 6, borderRadius: Radius.sm, backgroundColor: Colors.surfaceAlt },
  cellName: { fontSize: 10.5, color: Colors.textSecondary },
  cellV: { fontSize: 13, fontWeight: '700', color: Colors.text },
  foot: {
    flexDirection: 'row', gap: 8, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
  },
  btn: { flex: 1, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  btnPrimary: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  btnDanger: { borderColor: Colors.dangerLight, backgroundColor: Colors.dangerLight },
  btnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  modalNote: { fontSize: 12, color: Colors.textSecondary, marginBottom: 12 },
});
