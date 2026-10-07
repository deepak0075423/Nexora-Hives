/**
 * One marks sheet on the phone (Oct 2026): an exam subject, or a class test —
 * every student on the section's roll in roll order, a mark or an absence each.
 *
 *   ?examId=&subjectId=   the subject teacher's own sheet
 *   ?testId=              a class test the teacher set
 *   ?testId=&review=1     a class test waiting for this class teacher to approve
 *   …&office=1            the office's: any exam subject (entered or corrected
 *                         for a teacher), or any class test to read, approve or
 *                         send back
 *
 * Since Oct 2026 a paper may be marked in parts (theory, practical — a box
 * each, the total worked out) or graded only (a grade picked from the class's
 * scale); an elective lists its takers only; a student who has left the
 * section but was marked is shown, and need not be filled in. A save carries
 * the sheet's version: one made over somebody else's newer changes is refused,
 * and the sheet offers to reload rather than overwrite them.
 *
 * The teacher who set a class test can also correct its details while it is
 * a draft or reopened, delete a draft, and reopen one sent back or approved.
 *
 * The server says whether the sheet can be written (`editable`). A sheet that
 * has been submitted, and is still open, is corrected rather than drafted: a
 * change goes in as submitted, so nobody can be left blank. What is typed is
 * checked here as the web grid checks it, and again by the server; a sheet
 * with changes asks before it is left.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { TextInput } from '@/components/ui/TextInput';
import { Stack, useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as R from '@/api/results.api';
import { Empty, LoaderView, FormModal, Input, confirmAsync, unwrap } from '@/components/ui/kit';
import { Pill, fmtDay, classLine, plural } from '@/components/results/parts';
import ClassTestForm from '@/components/results/ClassTestForm';

type Row = {
  _id: string; name: string; rollNumber: string; admissionNumber: string; marks: string; absent: boolean; remarks: string;
  parts: Record<string, string>; grade: string; offRoll: boolean; offRollReason: string;
};
type Part = { key: string; label: string; maxMarks: number; passingMarks?: number };

const LOCKED: Record<string, string> = {
  DRAFT: 'Mark entry has not been opened for this exam yet.',
  REJECTED: 'These marks were sent back. They can be corrected once the exam is reopened.',
  FINAL_APPROVED: 'These marks are final.',
  SUBMITTED: 'These marks are with the class teacher.',
  CLASS_APPROVED: 'These marks have been validated and are waiting to be published.',
};

/** Tell the user, the way the rest of the app does — and on the web harness, where Alert does nothing. */
const say = (title: string, message: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

export default function ResultsSheetScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ examId?: string; subjectId?: string; testId?: string; review?: string; office?: string }>();
  const testId = params.testId ? String(params.testId) : '';
  const office = params.office === '1';
  // The office reads a class test to approve or send back, as its class teacher would.
  const review = !!testId && (params.review === '1' || office);

  const [data, setData] = useState<any>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [dirty, setDirty] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [editingTest, setEditingTest] = useState(false);
  const [reason, setReason] = useState('');
  const [stale, setStale] = useState(false);       // saved over by somebody else since it was opened
  const [picking, setPicking] = useState<string | null>(null);   // the row whose grade is being picked
  const inputs = useRef<(TextInput | null)[]>([]);
  // Read by the leave guard, which is set up once.
  const guard = useRef({ dirty: false, busy: false });
  guard.current = { dirty, busy: !!busy };

  const load = useCallback(async () => {
    try {
      const res = testId
        ? (office ? await R.office.testSheet(testId) : await R.testSheet(testId))
        : office ? await R.office.sheet(String(params.examId), String(params.subjectId))
          : await R.teacherSheet(String(params.examId), String(params.subjectId));
      const d = unwrap(res);
      setData(d);
      const parts: Part[] = d.config?.components || [];
      setRows((d.students || []).map((x: any) => ({
        _id: String(x._id), name: x.name, rollNumber: x.rollNumber || '', admissionNumber: x.admissionNumber || '',
        marks: x.marksObtained == null ? '' : String(x.marksObtained), absent: !!x.isAbsent, remarks: x.remarks || '',
        parts: Object.fromEntries(parts.map((c) => [c.key, x.parts?.[c.key] == null ? '' : String(x.parts[c.key])])),
        grade: x.grade || '', offRoll: !!x.offRoll, offRollReason: x.offRollReason || '',
      })));
      setDirty(false); setStale(false);
    } catch (err: any) { setLoadError(err?.message || 'The sheet could not be loaded'); }
  }, [testId, office, params.examId, params.subjectId]);
  useEffect(() => { load(); }, [load]);

  // Changes not saved: ask before leaving.
  useEffect(() => navigation.addListener('beforeRemove', (e: any) => {
    if (!guard.current.dirty || guard.current.busy) return;
    e.preventDefault();
    confirmAsync('Discard unsaved marks?', 'The marks you changed on this sheet have not been saved.', 'Discard').then((ok) => {
      if (ok) { guard.current.dirty = false; navigation.dispatch(e.data.action); }
    });
  }), [navigation]);

  const max = Number(data?.config?.maxMarks ?? 0);
  const pass = Number(data?.config?.passingMarks ?? 0);
  const parts: Part[] = data?.config?.components || [];
  const graded = !!data?.config?.gradeOnly;
  const grades: { grade: string; pass?: boolean }[] = data?.config?.grades || [];
  const editable = !review && !!data?.editable;
  // The office corrects a sheet that has gone forward (the server says so); a
  // teacher corrects their own submitted sheet while the exam is still open.
  const correcting = editable && !testId && (office ? !!data?.correcting : data?.sheet?.status === 'SUBMITTED');

  const num = (v: string) => Number(String(v).replace(',', '.'));
  const outOf = (v: string, top: number) => v !== '' && (!Number.isFinite(num(v)) || num(v) < 0 || num(v) > top);
  const bad = (r: Row) => !r.absent && (parts.length ? parts.some((c) => outOf(r.parts[c.key] ?? '', Number(c.maxMarks))) : !graded && outOf(r.marks, max));
  const answered = (r: Row) => r.absent || (graded ? !!r.grade : parts.length ? parts.every((c) => (r.parts[c.key] ?? '') !== '') : r.marks !== '');
  const totalOf = (r: Row) => (parts.length ? parts.reduce((t, c) => t + (num(r.parts[c.key] || '0') || 0), 0) : num(r.marks));
  const below = (r: Row) => !graded && !r.absent && answered(r) && !bad(r)
    && (totalOf(r) < pass || parts.some((c) => Number(c.passingMarks) > 0 && num(r.parts[c.key]) < Number(c.passingMarks)));
  const tally = useMemo(() => ({
    entered: rows.filter(answered).length,
    absent: rows.filter((r) => r.absent).length,
    below: rows.filter(below).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rows, pass, data]);

  const setRow = (id: string, patch: Partial<Row>) => {
    setRows((list) => list.map((r) => (r._id === id ? { ...r, ...patch } : r)));
    setDirty(true); setError('');
  };

  const save = async (submit: boolean) => {
    const wrong = rows.find(bad);
    if (wrong) {
      setError(parts.length ? `${wrong.name}: each part must be between 0 and its maximum` : `${wrong.name}: marks must be between 0 and ${max}`);
      return;
    }
    const final = submit || correcting;
    if (final) {
      // A student who has left the section need not be filled in.
      const blank = rows.filter((r) => !r.offRoll && !answered(r)).length;
      if (blank) { setError(`${graded ? 'Give a grade' : 'Enter marks'} or mark absent for every student first — ${plural(blank, 'student')} still blank`); return; }
    }
    const entries = rows.map((r) => ({
      student: r._id, isAbsent: r.absent, remarks: r.remarks || '',
      ...(graded ? { grade: r.absent ? '' : r.grade }
        : parts.length ? { parts: Object.fromEntries(parts.map((c) => [c.key, r.absent || (r.parts[c.key] ?? '') === '' ? null : num(r.parts[c.key])])) }
          : { marksObtained: r.absent || r.marks === '' ? null : num(r.marks) }),
    }));
    const version = data?.sheet?.version;
    setBusy(final ? 'submit' : 'draft'); setError('');
    try {
      const res: any = testId
        ? await R.saveTestSheet(testId, { marks: entries, submit: final })
        : office
          ? await R.office.saveSheet(String(params.examId), String(params.subjectId), { submit: final, entries, version })
          : await R.saveSheet(String(params.examId), String(params.subjectId), { submit: final, entries, version });
      const out = unwrap(res);
      guard.current.dirty = false; setDirty(false);
      say(
        correcting ? 'Correction saved' : final ? 'Marks submitted' : 'Draft saved',
        testId && final
          ? (res?.autoApproved || out?.autoApproved ? 'Submitted and approved — students can see their marks now.' : 'Submitted — the class teacher approves the marks before students see them.')
          : final ? (res?.examStatus === 'SUBMITTED' || out?.examStatus === 'SUBMITTED' ? 'Every subject is in, so the exam has gone to the class teacher.' : 'Your marks are in.')
            : 'You can finish the sheet later.',
      );
      router.back();
    } catch (err: any) {
      if (err?.data?.code === 'SHEET_CHANGED') setStale(true);
      setError(err?.message || 'The marks could not be saved');
    } finally { setBusy(''); }
  };

  const approve = async () => {
    if (!(await confirmAsync('Approve these marks?', 'Students and parents will see them.', 'Approve'))) return;
    setBusy('approve');
    try { await (office ? R.office.approveTest(testId) : R.approveTest(testId)); say('Approved', 'Students can see their marks now.'); router.back(); }
    catch (err: any) { setError(err?.message || 'The marks could not be approved'); }
    finally { setBusy(''); }
  };
  const sendBack = async () => {
    if (!reason.trim()) { setError('Say what needs correcting — the teacher will see it'); return; }
    setBusy('reject');
    try { await (office ? R.office.rejectTest(testId, reason.trim()) : R.rejectTest(testId, reason.trim())); setRejecting(false); say('Sent back', 'The teacher will correct the marks and submit them again.'); router.back(); }
    catch (err: any) { setError(err?.message || 'The marks could not be sent back'); }
    finally { setBusy(''); }
  };

  // A class test this teacher set: its details, its deletion, its reopening.
  const mine = !!testId && !review && !!data?.test?.mine;
  const status = data?.exam?.status;
  const removeTest = async () => {
    if (!(await confirmAsync('Delete this test?', 'A draft test nobody has entered marks for is removed for good.', 'Delete'))) return;
    setBusy('delete');
    try { await R.deleteTest(testId); guard.current.dirty = false; say('Deleted', 'The test has been removed.'); router.back(); }
    catch (err: any) { setError(err?.message || 'The test could not be deleted'); }
    finally { setBusy(''); }
  };
  const reopen = async () => {
    const approved = status === 'FINAL_APPROVED';
    if (!(await confirmAsync('Reopen this test?', approved
      ? 'Students stop seeing these marks until the corrected marks are approved again.'
      : 'You can correct the marks and submit them again.', 'Reopen'))) return;
    setBusy('reopen');
    try { await R.reopenTest(testId); await load(); }
    catch (err: any) { setError(err?.message || 'The test could not be reopened'); }
    finally { setBusy(''); }
  };

  const title = data ? (testId ? data.exam?.title : data.subject?.subjectName) : 'Marks';
  if (loadError) return (<><Stack.Screen options={{ title: 'Marks' }} /><Empty icon="alert-circle-outline" text={loadError} /></>);
  if (!data) return (<><Stack.Screen options={{ title: 'Marks' }} /><LoaderView /></>);

  const lockedText = review
    ? (data.exam?.status === 'SUBMITTED'
      ? `Read the marks, then approve them for students to see — or send them back to ${data.teachers?.[0] || 'the teacher'} with a reason.`
      : data.exam?.status === 'FINAL_APPROVED' ? 'Approved — students and parents can see these marks.' : 'This test is with its teacher; its marks are changed by the teacher who set it.')
    : LOCKED[data.exam?.status] || (data.exam?.archived ? 'This exam is archived.' : 'These marks can no longer be changed here.');
  const canReview = review && data.exam?.status === 'SUBMITTED';

  return (
    <>
      <Stack.Screen options={{ title: title || 'Marks' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={s.screen} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <View style={s.head}>
            <Text style={s.headTitle}>{testId ? `${data.subject?.subjectName} · class test` : data.exam?.title}</Text>
            <Text style={s.headSub}>{[classLine(data.exam), data.exam?.yearName].filter(Boolean).join(' · ')}</Text>
            <View style={s.facts}>
              {graded ? <Text style={s.fact}>Graded — <Text style={s.factV}>no marks</Text></Text> : (
                <>
                  <Text style={s.fact}>Max <Text style={s.factV}>{max}</Text></Text>
                  <Text style={s.fact}>Pass <Text style={s.factV}>{pass}</Text></Text>
                </>
              )}
              {parts.length ? <Text style={s.fact}>{parts.map((c) => `${c.label} ${c.maxMarks}`).join(' + ')}</Text> : null}
              {data.config?.elective ? <Pill label="Elective" fg={Colors.info} bg={Colors.infoLight} /> : null}
              {data.config?.examDate ? <Text style={s.fact}>{fmtDay(data.config.examDate)}</Text> : null}
              <Pill label={testId ? (data.exam?.statusLabel || data.exam?.status) : ({ SUBMITTED: 'Submitted', DRAFT: 'In progress', NOT_STARTED: 'Not started' } as any)[data.sheet?.status] || 'Sheet'}
                fg={Colors.primary} bg={Colors.surfaceAlt} />
            </View>
            {data.test?.rejectionReason && data.exam?.status !== 'FINAL_APPROVED' ? (
              <Text style={s.warn}>Sent back: “{data.test.rejectionReason}”</Text>
            ) : null}
            {mine ? (
              <View style={s.acts}>
                {['DRAFT', 'REOPENED'].includes(status) ? (
                  <TouchableOpacity style={s.act} onPress={() => setEditingTest(true)} disabled={!!busy}>
                    <Ionicons name="create-outline" size={14} color={Colors.primary} /><Text style={s.actText}>Edit details</Text>
                  </TouchableOpacity>
                ) : null}
                {['REJECTED', 'FINAL_APPROVED'].includes(status) ? (
                  <TouchableOpacity style={s.act} onPress={reopen} disabled={!!busy}>
                    <Ionicons name="refresh-outline" size={14} color={Colors.primary} /><Text style={s.actText}>{status === 'FINAL_APPROVED' ? 'Reopen to correct' : 'Reopen'}</Text>
                  </TouchableOpacity>
                ) : null}
                {status === 'DRAFT' ? (
                  <TouchableOpacity style={[s.act, s.actDanger]} onPress={removeTest} disabled={!!busy}>
                    <Ionicons name="trash-outline" size={14} color={Colors.danger} /><Text style={[s.actText, { color: Colors.danger }]}>Delete</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>

          {correcting ? <Text style={s.note}>This sheet has been submitted. A correction is saved as submitted, so no student can be left blank{office && ['SUBMITTED', 'CLASS_APPROVED'].includes(data.exam?.status) ? ' — and the class teacher validates the marks again' : ''}.</Text>
            : !editable ? <Text style={s.note}>{lockedText}</Text> : null}
          {data.config?.elective ? <Text style={s.hint}>An elective: only the students who take {data.subject?.subjectName} are listed.</Text> : null}
          {error ? (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
              {stale ? (
                <TouchableOpacity onPress={() => { setError(''); load(); }} style={s.reload} accessibilityRole="button">
                  <Ionicons name="refresh" size={14} color={Colors.danger} /><Text style={s.reloadText}>Reload the sheet</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {!rows.length ? <Empty icon="people-outline" text="No students are on this section's roll." /> : rows.map((r, i) => {
            const low = below(r);
            const sub = bad(r) ? (parts.length ? 'A part is out of range' : `0 to ${max}`) : low ? 'Below pass'
              : r.offRoll ? r.offRollReason || 'No longer in this section' : r.admissionNumber || ' ';
            const absentBtn = (
              <TouchableOpacity disabled={!editable} onPress={() => setRow(r._id, { absent: !r.absent, marks: '', grade: '', parts: Object.fromEntries(parts.map((c) => [c.key, ''])) })}
                style={[s.ab, r.absent && s.abOn, !editable && { opacity: 0.5 }]} accessibilityLabel={`${r.name} absent`}
                accessibilityRole="checkbox" accessibilityState={{ checked: r.absent }}>
                <Text style={[s.abText, r.absent && { color: Colors.textInverse }]}>AB</Text>
              </TouchableOpacity>
            );
            const who = (
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.name} numberOfLines={1}>{r.name}</Text>
                <Text style={[s.rowSub, low && { color: Colors.warning }, bad(r) && { color: Colors.danger }, r.offRoll && !bad(r) && !low && { color: Colors.info }]} numberOfLines={1}>{sub}</Text>
              </View>
            );
            if (graded) {
              return (
                <View key={r._id} style={[s.row, r.absent && s.rowAbsent]}>
                  <Text style={s.roll}>{r.rollNumber || '—'}</Text>
                  {who}
                  <TouchableOpacity disabled={!editable || r.absent} onPress={() => setPicking(r._id)} style={[s.gradeBtn, (!editable || r.absent) && s.inputOff]}
                    accessibilityLabel={`Grade for ${r.name}`} accessibilityRole="button">
                    <Text style={[s.gradeText, !r.grade && { color: Colors.textLight }]}>{r.absent ? 'AB' : r.grade || 'Grade'}</Text>
                  </TouchableOpacity>
                  {absentBtn}
                </View>
              );
            }
            if (parts.length) {
              return (
                <View key={r._id} style={[s.row, s.rowParts, r.absent && s.rowAbsent]}>
                  <View style={s.partsHead}>
                    <Text style={s.roll}>{r.rollNumber || '—'}</Text>
                    {who}
                    <Text style={s.partsTotal}>{r.absent ? 'AB' : answered(r) && !bad(r) ? `${Math.round(totalOf(r) * 100) / 100}/${max}` : '—'}</Text>
                    {absentBtn}
                  </View>
                  <View style={s.partsRow}>
                    {parts.map((c) => {
                      const v = r.parts[c.key] ?? '';
                      return (
                        <View key={c.key} style={s.part}>
                          <Text style={s.partLabel} numberOfLines={1}>{c.label} /{c.maxMarks}</Text>
                          <TextInput style={[s.input, s.partInput, outOf(v, Number(c.maxMarks)) && s.inputBad, (!editable || r.absent) && s.inputOff]}
                            value={r.absent ? '' : v} placeholder={r.absent ? 'AB' : '—'} placeholderTextColor={Colors.textLight}
                            editable={editable && !r.absent} keyboardType="decimal-pad"
                            onChangeText={(t) => setRow(r._id, { parts: { ...r.parts, [c.key]: t.replace(',', '.') } })}
                            accessibilityLabel={`${c.label} marks for ${r.name}`} />
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            }
            return (
              <View key={r._id} style={[s.row, r.absent && s.rowAbsent]}>
                <Text style={s.roll}>{r.rollNumber || '—'}</Text>
                {who}
                <TextInput
                  ref={(el) => { inputs.current[i] = el; }}
                  style={[s.input, bad(r) && s.inputBad, low && s.inputLow, (!editable || r.absent) && s.inputOff]}
                  value={r.absent ? '' : r.marks}
                  placeholder={r.absent ? 'AB' : '—'}
                  placeholderTextColor={Colors.textLight}
                  editable={editable && !r.absent}
                  keyboardType="decimal-pad"
                  returnKeyType={i < rows.length - 1 ? 'next' : 'done'}
                  blurOnSubmit={i === rows.length - 1}
                  onSubmitEditing={() => inputs.current.slice(i + 1).find((x, j) => x && !rows[i + 1 + j]?.absent)?.focus()}
                  onChangeText={(v) => setRow(r._id, { marks: v.replace(',', '.') })}
                  accessibilityLabel={`Marks for ${r.name}`}
                />
                {absentBtn}
              </View>
            );
          })}
        </ScrollView>

        <View style={[s.foot, { paddingBottom: Spacing.sm + insets.bottom }]}>
          <Text style={s.tally}>
            {tally.entered} of {plural(rows.length, 'student')} entered{tally.absent ? ` · ${tally.absent} absent` : ''}{tally.below ? ` · ${tally.below} below pass` : ''}
          </Text>
          <View style={s.btns}>
            {canReview ? (
              <>
                <TouchableOpacity style={[s.btn, s.btnDanger]} disabled={!!busy} onPress={() => { setError(''); setRejecting(true); }}>
                  <Text style={[s.btnText, { color: Colors.danger }]}>Send Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, s.btnPrimary]} disabled={!!busy} onPress={approve}>
                  {busy === 'approve' ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[s.btnText, { color: '#fff' }]}>Approve</Text>}
                </TouchableOpacity>
              </>
            ) : editable ? (
              <>
                {!correcting ? (
                  <TouchableOpacity style={s.btn} disabled={!!busy} onPress={() => save(false)}>
                    {busy === 'draft' ? <ActivityIndicator color={Colors.primary} size="small" /> : <Text style={s.btnText}>Save Draft</Text>}
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={[s.btn, s.btnPrimary, correcting && !dirty && { opacity: 0.5 }]} disabled={!!busy || (correcting && !dirty)} onPress={() => save(true)}>
                  {busy === 'submit' ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={[s.btnText, { color: '#fff' }]}>{correcting ? 'Save Correction' : testId ? 'Submit for Approval' : 'Submit Marks'}</Text>}
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>

      {mine ? (
        <ClassTestForm visible={editingTest} onClose={() => setEditingTest(false)}
          test={{
            _id: testId, title: data.exam?.title, testDate: data.config?.examDate, maxMarks: data.config?.maxMarks, passingMarks: data.config?.passingMarks,
            topic: data.test?.topic, description: data.test?.description,
            subjectName: data.subject?.subjectName, className: data.exam?.className, sectionName: data.exam?.sectionName,
          }}
          onSaved={() => { setEditingTest(false); load(); }} />
      ) : null}

      <FormModal visible={!!picking} title={`Grade — ${rows.find((r) => r._id === picking)?.name || ''}`} onClose={() => setPicking(null)}>
        <View style={s.gradeGrid}>
          {grades.map((g) => {
            const row = rows.find((r) => r._id === picking);
            const on = row?.grade === g.grade;
            return (
              <TouchableOpacity key={g.grade} style={[s.gradeOpt, on && s.gradeOptOn]} onPress={() => { if (picking) setRow(picking, { grade: g.grade }); setPicking(null); }}
                accessibilityRole="radio" accessibilityState={{ checked: on }}>
                <Text style={[s.gradeOptText, on && { color: Colors.textInverse }]}>{g.grade}</Text>
                {g.pass === false ? <Text style={[s.gradeOptSub, on && { color: Colors.textInverse }]}>not a pass</Text> : null}
              </TouchableOpacity>
            );
          })}
        </View>
        {rows.find((r) => r._id === picking)?.grade ? (
          <TouchableOpacity style={s.clearGrade} onPress={() => { if (picking) setRow(picking, { grade: '' }); setPicking(null); }}>
            <Text style={s.reloadText}>Clear the grade</Text>
          </TouchableOpacity>
        ) : null}
      </FormModal>

      <FormModal visible={rejecting} title="Send back the marks" onClose={() => setRejecting(false)} onSubmit={sendBack}
        submitting={busy === 'reject'} submitLabel="Send Back">
        <Text style={s.modalNote}>{data.teachers?.[0] || 'The teacher'} will see your reason, reopen the test and submit the marks again.</Text>
        <Input label="What needs correcting" value={reason} onChange={setReason} multiline />
        {error && rejecting ? <Text style={s.error}>{error}</Text> : null}
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  body: { padding: Spacing.md, paddingBottom: 24 },
  head: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, marginBottom: 10 },
  headTitle: { ...Typography.h4, color: Colors.text },
  headSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 10 },
  fact: { fontSize: 12, color: Colors.textSecondary },
  factV: { fontWeight: '700', color: Colors.text },
  warn: { fontSize: 12, color: Colors.danger, marginTop: 8 },
  note: { fontSize: 12, color: Colors.info, backgroundColor: Colors.infoLight, padding: 10, borderRadius: Radius.md, marginBottom: 10 },
  error: { fontSize: 12, color: Colors.danger, backgroundColor: Colors.dangerLight, padding: 10, borderRadius: Radius.md, marginBottom: 10 },
  errorBox: { backgroundColor: Colors.dangerLight, padding: 10, borderRadius: Radius.md, marginBottom: 10, gap: 8 },
  errorText: { fontSize: 12, color: Colors.danger },
  reload: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  reloadText: { fontSize: 12, fontWeight: '700', color: Colors.danger },
  hint: { fontSize: 12, color: Colors.textSecondary, marginBottom: 10 },
  rowParts: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  partsHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  partsTotal: { fontSize: 13, fontWeight: '700', color: Colors.text },
  partsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 36 },
  part: { flexBasis: 96, flexGrow: 1, gap: 3 },
  partLabel: { fontSize: 10.5, fontWeight: '600', color: Colors.textSecondary },
  partInput: { width: '100%' as any },
  gradeBtn: {
    minWidth: 64, height: 38, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
  },
  gradeText: { fontSize: 15, fontWeight: '700', color: Colors.text },
  gradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
  gradeOpt: { minWidth: 64, paddingVertical: 10, paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  gradeOptOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  gradeOptText: { fontSize: 16, fontWeight: '700', color: Colors.text },
  gradeOptSub: { fontSize: 10, color: Colors.danger, marginTop: 2 },
  clearGrade: { alignSelf: 'flex-start', paddingVertical: 6 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: Radius.md,
    paddingVertical: 8, paddingHorizontal: 10, marginBottom: 6, borderWidth: 1, borderColor: Colors.border,
  },
  rowAbsent: { backgroundColor: Colors.surfaceAlt },
  roll: { width: 26, fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center' },
  name: { fontSize: 13, fontWeight: '600', color: Colors.text },
  rowSub: { fontSize: 10.5, color: Colors.textLight, marginTop: 1 },
  input: {
    width: 64, height: 38, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
    textAlign: 'right', paddingHorizontal: 8, fontSize: 15, fontWeight: '600', color: Colors.text,
  },
  inputBad: { borderColor: Colors.danger, backgroundColor: Colors.dangerLight },
  inputLow: { borderColor: Colors.warning },
  inputOff: { opacity: 0.6 },
  ab: { width: 38, height: 38, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  abOn: { backgroundColor: Colors.textSecondary, borderColor: Colors.textSecondary },
  abText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  foot: { backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  tally: { fontSize: 11, color: Colors.textSecondary, marginBottom: 8 },
  btns: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  btnPrimary: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  btnDanger: { borderColor: Colors.dangerLight, backgroundColor: Colors.dangerLight },
  btnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  modalNote: { fontSize: 12, color: Colors.textSecondary, marginBottom: 12 },
  acts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  act: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 32, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
  },
  actDanger: { borderColor: Colors.dangerLight, backgroundColor: Colors.dangerLight },
  actText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
});
