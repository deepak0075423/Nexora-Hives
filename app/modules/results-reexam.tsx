/**
 * Re-exam marks on the phone (Oct 2026), for a subject teacher — the papers
 * of their subjects that were not passed, once the office has set up the
 * re-exam (GET|PUT /teacher/results/exams/:id/re-exam). The office sets the
 * date and how a pass counts; the teacher enters what each student scored, or
 * that they were absent. The server rewrites only the results that change and
 * tells those families.
 *
 * `?office=1` (Oct 2026) is the office's: every failed paper, and the re-exam's
 * day, note and how a pass counts — each paper may also have a day of its own;
 * the students who still have to sit are told. A student who failed more papers
 * than the school allows a re-exam in is listed as not eligible.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Platform, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { TextInput } from '@/components/ui/TextInput';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as R from '@/api/results.api';
import { Empty, LoaderView, FormModal, Input, unwrap } from '@/components/ui/kit';
import { PassPill, Pill, fmtDay, classLine, plural } from '@/components/results/parts';
import { DayPicker } from '@/components/attendance/parts';

const dayKey = (d: any) => (d ? String(d).slice(0, 10) : '');

type Cell = { marks: string; absent: boolean };
const keyOf = (sid: string, sub: string) => `${sid}:${sub}`;
const say = (title: string, message: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

export default function ResultsReExamScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { examId, office: officeParam } = useLocalSearchParams<{ examId: string; office?: string }>();
  const office = officeParam === '1';
  // The office's settings: the re-exam's day, its note, how a pass counts; each paper's own day.
  const [meta, setMeta] = useState({ date: '', note: '', rule: 'scored' });
  const [papers, setPapers] = useState<Record<string, string>>({});
  const [picking, setPicking] = useState<string | null>(null);   // '' = the re-exam's day; a subject = that paper's
  const [b, setB] = useState<any>(null);
  const [draft, setDraft] = useState<Record<string, Cell>>({});
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = unwrap(office ? await R.office.reExam(String(examId)) : await R.teacherReExam(String(examId)));
      setB(d);
      setMeta({ date: dayKey(d.date), note: d.note || '', rule: d.rule || 'scored' });
      setPapers(Object.fromEntries((d.papers || []).map((x: any) => [String(x.subject), dayKey(x.date)])));
      const next: Record<string, Cell> = {};
      d.students.forEach((st: any) => st.papers.forEach((p: any) => {
        next[keyOf(st._id, p.subject)] = { marks: p.reExam && !p.reExam.isAbsent ? String(p.reExam.marksObtained) : '', absent: !!p.reExam?.isAbsent };
      }));
      setDraft(next);
    } catch (err: any) { setLoadError(err?.message || 'The re-exam could not be loaded'); }
  }, [examId, office]);
  useEffect(() => { load(); }, [load]);

  /** The office's settings that moved. */
  const settings = useMemo(() => {
    if (!office || !b) return {};
    const out: any = {};
    if (meta.date !== dayKey(b.date)) out.date = meta.date || null;
    if (meta.note.trim() !== (b.note || '')) out.note = meta.note.trim();
    if (meta.rule !== (b.rule || 'scored')) out.rule = meta.rule;
    const moved = (b.papers || []).filter((x: any) => (papers[String(x.subject)] || '') !== dayKey(x.date))
      .map((x: any) => ({ subject: x.subject, date: papers[String(x.subject)] || null, startTime: x.startTime || '', endTime: x.endTime || '' }));
    if (moved.length) out.papers = moved;
    return out;
  }, [office, b, meta, papers]);
  const settingsMoved = Object.keys(settings).length > 0;

  const entries = useMemo(() => {
    if (!b) return [];
    const out: any[] = [];
    b.students.forEach((st: any) => st.papers.forEach((p: any) => {
      const now = draft[keyOf(st._id, p.subject)] || { marks: '', absent: false };
      const was = p.reExam;
      if (now.absent) { if (!was?.isAbsent) out.push({ student: st._id, subject: p.subject, isAbsent: true }); return; }
      if (now.marks === '') { if (was) out.push({ student: st._id, subject: p.subject, clear: true }); return; }
      if (!was || was.isAbsent || Number(now.marks) !== Number(was.marksObtained)) {
        out.push({ student: st._id, subject: p.subject, marksObtained: Number(now.marks), max: p.maxMarks, who: st.name, name: p.subjectName });
      }
    }));
    return out;
  }, [b, draft]);

  const save = async () => {
    const wrong = entries.find((e) => e.marksObtained !== undefined && (!Number.isFinite(e.marksObtained) || e.marksObtained < 0 || e.marksObtained > e.max));
    if (wrong) { setError(`${wrong.who}, ${wrong.name}: marks are between 0 and ${wrong.max}`); return; }
    setBusy(true); setError('');
    try {
      const before = b.counts.passedNow;
      const body = { ...settings, entries: entries.map(({ max, who, name, ...e }) => e) };
      const d = unwrap(office ? await R.office.saveReExam(String(examId), body) : await R.saveTeacherReExam(String(examId), body));
      say('Re-exam saved', d.counts.passedNow > before ? `${plural(d.counts.passedNow - before, 'more student')} now ${d.counts.passedNow - before === 1 ? 'passes' : 'pass'}.` : 'The marks are in.');
      router.back();
    } catch (err: any) { setError(err?.message || 'The re-exam could not be saved'); }
    finally { setBusy(false); }
  };

  if (loadError) return (<><Stack.Screen options={{ title: 'Re-exam' }} /><Empty icon="alert-circle-outline" text={loadError} /></>);
  if (!b) return (<><Stack.Screen options={{ title: 'Re-exam' }} /><LoaderView /></>);

  return (
    <>
      <Stack.Screen options={{ title: 'Re-exam Marks' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={s.screen} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>{b.exam.title}</Text>
          <Text style={s.sub}>{classLine(b.exam)}</Text>
          {office ? (
            <View style={s.card}>
              <Text style={s.cap}>THE RE-EXAM</Text>
              <TouchableOpacity style={s.field} onPress={() => setPicking('')} accessibilityRole="button">
                <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
                <Text style={s.fieldText}>{meta.date ? `On ${fmtDay(meta.date)}` : 'Set the day'}</Text>
                {meta.date ? <TouchableOpacity onPress={() => setMeta((m) => ({ ...m, date: '' }))} hitSlop={8}><Text style={s.clear}>Clear</Text></TouchableOpacity> : null}
              </TouchableOpacity>
              <Input label="Note for families (optional)" value={meta.note} onChange={(v) => setMeta((m) => ({ ...m, note: v.slice(0, 300) }))} placeholder="e.g. Hall 2, 9 am" />
              <View style={s.rules}>
                {[['scored', 'As scored'], ['pass', 'At the pass mark']].map(([v, label]) => (
                  <TouchableOpacity key={v} style={[s.rule, meta.rule === v && s.ruleOn]} onPress={() => setMeta((m) => ({ ...m, rule: v }))}
                    accessibilityRole="radio" accessibilityState={{ checked: meta.rule === v }}>
                    <Text style={[s.ruleText, meta.rule === v && { color: Colors.textInverse }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.whoSub}>{meta.rule === 'pass' ? 'A re-exam pass counts as exactly the pass mark; a fail as scored.' : 'The re-exam marks replace the first sitting\'s.'} Students still to sit — and their parents — are told the day when it is set.</Text>
              {(b.papers || []).length ? (
                <>
                  <Text style={[s.cap, { marginTop: 12 }]}>EACH PAPER’S OWN DAY (OPTIONAL)</Text>
                  {b.papers.map((x: any) => (
                    <TouchableOpacity key={x.subject} style={s.field} onPress={() => setPicking(String(x.subject))} accessibilityRole="button">
                      <Text style={[s.fieldText, { flex: 1 }]} numberOfLines={1}>{x.subjectName}</Text>
                      <Text style={s.fieldDay}>{papers[String(x.subject)] ? fmtDay(papers[String(x.subject)]) : 'Same day'}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              ) : null}
            </View>
          ) : (
            <View style={s.note}>
              <Text style={s.noteText}>
                {b.date ? `Sat on ${fmtDay(b.date)}${b.note ? ` — ${b.note}` : ''}. ` : 'The office has not set a date yet. '}
                A re-exam pass counts {b.rule === 'pass' ? 'as exactly the pass mark' : 'as scored'}.
              </Text>
            </View>
          )}
          {b.counts?.notEligible ? (
            <Text style={s.warn}>{plural(b.counts.notEligible, 'student')} failed more than {b.maxSubjects} papers — the school allows a re-exam in at most {b.maxSubjects}.</Text>
          ) : null}
          {error ? <Text style={s.error}>{error}</Text> : null}
          {!b.students.length ? <Empty icon="checkmark-done-outline" text="Nobody failed a paper of your subjects." /> : b.students.map((st: any) => (
            <View key={st._id} style={s.card}>
              <View style={s.who}>
                <Text style={s.name} numberOfLines={1}>{st.name}</Text>
                {st.eligible === false ? <Pill label="Not eligible" fg={Colors.textSecondary} bg={Colors.surfaceAlt} />
                  : <PassPill passed={!!st.passedNow} label={st.passedNow ? 'Passes now' : 'Not passed'} />}
              </View>
              <Text style={s.whoSub}>{[st.rollNumber ? `Roll ${st.rollNumber}` : '', st.admissionNumber].filter(Boolean).join(' · ')}</Text>
              {st.eligible === false ? <Text style={s.whoSub}>{st.notEligibleReason}</Text> : null}
              {st.eligible === false ? null : st.papers.map((p: any) => {
                const k = keyOf(st._id, p.subject);
                const v = draft[k] || { marks: '', absent: false };
                const bad = !v.absent && v.marks !== '' && (!Number.isFinite(Number(v.marks)) || Number(v.marks) < 0 || Number(v.marks) > p.maxMarks);
                return (
                  <View key={p.subject} style={s.paper}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.paperName}>{p.subjectName}</Text>
                      <Text style={[s.paperSub, bad && { color: Colors.danger }]}>
                        {bad ? `0 to ${p.maxMarks}` : `First: ${p.first.isAbsent ? 'absent' : `${p.first.marksObtained}/${p.maxMarks}`} · pass ${p.passingMarks}${p.sitting?.date ? ` · sits ${fmtDay(p.sitting.date)}` : ''}`}
                      </Text>
                    </View>
                    <TextInput
                      style={[s.input, bad && s.inputBad, v.absent && { opacity: 0.5 }]}
                      value={v.absent ? '' : v.marks} placeholder={v.absent ? 'AB' : '—'} placeholderTextColor={Colors.textLight}
                      editable={!v.absent} keyboardType="decimal-pad"
                      onChangeText={(t) => { setDraft((d) => ({ ...d, [k]: { marks: t.replace(',', '.'), absent: false } })); setError(''); }}
                      accessibilityLabel={`${st.name}: re-exam marks in ${p.subjectName}`}
                    />
                    <TouchableOpacity style={[s.ab, v.absent && s.abOn]} onPress={() => setDraft((d) => ({ ...d, [k]: { marks: '', absent: !v.absent } }))}
                      accessibilityRole="checkbox" accessibilityState={{ checked: v.absent }} accessibilityLabel={`${st.name} absent`}>
                      <Text style={[s.abText, v.absent && { color: Colors.textInverse }]}>AB</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
        <View style={[s.foot, { paddingBottom: Spacing.sm + insets.bottom }]}>
          <Text style={s.tally}>{entries.length || settingsMoved ? `${entries.length ? plural(entries.length, 'change') : 'No change'} to marks${settingsMoved ? ', and the re-exam\'s details' : ''}` : 'Everything is saved'}</Text>
          <TouchableOpacity style={[s.btn, !entries.length && !settingsMoved && { opacity: 0.5 }]} disabled={(!entries.length && !settingsMoved) || busy} onPress={save}>
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>Save Re-exam</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      <FormModal visible={picking !== null} title={picking ? `${(b.papers || []).find((x: any) => String(x.subject) === picking)?.subjectName || 'Paper'} — its day` : 'The re-exam\'s day'}
        onClose={() => setPicking(null)}>
        <DayPicker value={picking ? papers[picking] || meta.date || '' : meta.date}
          onChange={(k) => { if (picking) setPapers((x) => ({ ...x, [picking]: k })); else setMeta((m) => ({ ...m, date: k })); setPicking(null); }} />
        {picking && papers[picking] ? (
          <TouchableOpacity onPress={() => { setPapers((x) => ({ ...x, [picking]: '' })); setPicking(null); }} style={{ paddingVertical: 10 }}>
            <Text style={s.clear}>Use the re-exam’s day</Text>
          </TouchableOpacity>
        ) : null}
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  body: { padding: Spacing.md, paddingBottom: 24 },
  title: { ...Typography.h3, color: Colors.text },
  sub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, marginBottom: 10 },
  note: { backgroundColor: Colors.infoLight, padding: 10, borderRadius: Radius.md, marginBottom: 10 },
  noteText: { fontSize: 12, color: '#075985' },
  error: { fontSize: 12, color: Colors.danger, backgroundColor: Colors.dangerLight, padding: 10, borderRadius: Radius.md, marginBottom: 10 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  who: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.text },
  whoSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  paper: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.divider },
  paperName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  paperSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  input: {
    width: 64, height: 38, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
    textAlign: 'right', paddingHorizontal: 8, fontSize: 15, fontWeight: '600', color: Colors.text,
  },
  inputBad: { borderColor: Colors.danger, backgroundColor: Colors.dangerLight },
  ab: { width: 38, height: 38, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  abOn: { backgroundColor: Colors.textSecondary, borderColor: Colors.textSecondary },
  abText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  foot: { backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  tally: { fontSize: 11, color: Colors.textSecondary, marginBottom: 8 },
  btn: { height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent },
  btnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  cap: { fontSize: 10, fontWeight: '800', color: '#1E2452', letterSpacing: 0.8, marginBottom: 8 },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 42, paddingHorizontal: 12, marginBottom: 8,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
  },
  fieldText: { fontSize: 14, fontWeight: '600', color: Colors.text },
  fieldDay: { fontSize: 13, color: Colors.textSecondary },
  clear: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  rules: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 6 },
  rule: { flex: 1, height: 38, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  ruleOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  ruleText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  warn: { fontSize: 12, color: '#7A4A06', backgroundColor: Colors.warningLight, padding: 10, borderRadius: Radius.md, marginBottom: 10 },
});
