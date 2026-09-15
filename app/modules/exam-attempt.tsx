import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  BackHandler, AppState, Modal, ActivityIndicator,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as studentApi from '@/api/student.api';
import { LoaderView } from '@/components/ui/kit';
import { ExamMark, QUESTION_TYPE_LABEL, plural } from '@/components/exams/parts';

/**
 * Student → sitting an aptitude exam.
 *
 * The rules are the server's, not this screen's: the countdown runs to
 * `serverEndTime` (never a locally started duration — a reopened app must not
 * win back time), every choice is saved the moment it is made as
 * `selectedOptions`, and leaving the app is reported so the server can
 * auto-submit past the allowed number of violations.
 *
 * Options are lettered by POSITION: they arrive shuffled per student, so a
 * stored optionId of "C" can legitimately be the first tile.
 *
 * "Marked for review" is the student's own note to themselves — it lives in
 * this screen only, and is never sent or scored.
 */

const fmtTimer = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? `${String(h).padStart(2, '0')}:` : '') + `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const letter = (i: number) => String.fromCharCode(65 + i);
const msg = (e: any) => e?.data?.message ?? e?.message ?? '';

export default function ExamAttemptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [violations, setViolations] = useState(0);
  const [review, setReview] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [confirm, setConfirm] = useState(false);
  const [palette, setPalette] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submitted = useRef(false);
  const pending = useRef(0);

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res: any = await studentApi.getAttempt(id);
        const d = res?.data ?? res;
        setData(d);
        setViolations(d.violationCount || 0);
        const saved: Record<string, string[]> = {};
        (d.savedAnswers || []).forEach((a: any) => { saved[String(a.question)] = a.selectedOptions || []; });
        setAnswers(saved);
      } catch (e: any) {
        setError(msg(e) || 'Could not load exam');
      } finally { setLoading(false); }
    })();
  }, [id]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const doSubmit = useCallback(async (auto = false) => {
    if (submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    try {
      await studentApi.submitExam(id!);
      Alert.alert(auto ? 'Time up' : 'Submitted', auto ? 'Your exam was submitted automatically.' : 'Your exam has been submitted.');
    } catch (e: any) {
      // Already auto-submitted server-side is fine — anything else, say so.
      if (!/no active attempt/i.test(msg(e))) Alert.alert('Submit failed', msg(e) || 'Could not submit');
    } finally {
      router.replace('/modules/exams' as any);
    }
  }, [id, router]);

  // ── Countdown — the server's end time, not a local duration ──────────────────
  useEffect(() => {
    if (!data?.serverEndTime) return;
    const end = new Date(data.serverEndTime).getTime();
    const tick = () => {
      const left = end - Date.now();
      setRemaining(left);
      if (left <= 0) doSubmit(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [data?.serverEndTime, doSubmit]);

  // ── Anti-cheat: leaving the app is a violation ───────────────────────────────
  useEffect(() => {
    if (!data) return;
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active' || submitted.current) return;
      try {
        const res: any = await studentApi.logViolation(id!);
        const r = res?.data ?? res;
        setViolations(r.violationCount ?? 0);
        if (r.autoSubmitted) {
          submitted.current = true;
          Alert.alert('Exam closed', 'Too many violations — your exam was submitted automatically.');
          router.replace('/modules/exams' as any);
        }
      } catch { /* the attempt may already be closed */ }
    });
    return () => sub.remove();
  }, [data, id, router]);

  // ── Hardware back asks first ────────────────────────────────────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (submitted.current) return false;
      Alert.alert('Leave the exam?', 'Your answers are saved, but the clock keeps running while you are away.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => router.back() },
      ]);
      return true;
    });
    return () => sub.remove();
  }, [router]);

  // ── Answering ───────────────────────────────────────────────────────────────
  const persist = async (qid: string, next: string[]) => {
    pending.current += 1;
    setSaveState('saving');
    try {
      await studentApi.saveAnswer(id!, { questionId: qid, selectedOptions: next });
      setSaveState(pending.current > 1 ? 'saving' : 'saved');
    } catch (e: any) {
      if (/auto submitted|time ended/i.test(msg(e))) {
        submitted.current = true;
        Alert.alert('Time is up', 'Your exam has been submitted.');
        router.replace('/modules/exams' as any);
      } else {
        setSaveState('failed');
      }
    } finally { pending.current -= 1; }
  };

  const select = (q: any, optionId: string) => {
    const qid = String(q._id);
    const cur = answers[qid] || [];
    const next = q.questionType === 'mcq_multiple'
      ? (cur.includes(optionId) ? cur.filter(x => x !== optionId) : [...cur, optionId])
      : [optionId];
    setAnswers(a => ({ ...a, [qid]: next }));
    persist(qid, next);
  };

  const clear = (q: any) => {
    const qid = String(q._id);
    if (!(answers[qid] || []).length) return;
    setAnswers(a => ({ ...a, [qid]: [] }));
    persist(qid, []);
  };

  const toggleReview = (qid: string) => setReview(prev => {
    const next = new Set(prev);
    if (next.has(qid)) next.delete(qid); else next.add(qid);
    return next;
  });

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return <><Stack.Screen options={{ title: 'Exam' }} /><LoaderView /></>;

  if (error || !data) {
    return (
      <>
        <Stack.Screen options={{ title: 'Exam' }} />
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={44} color={Colors.warning} />
          <Text style={s.errTitle}>This exam can’t be opened</Text>
          <Text style={s.errText}>{error}</Text>
          <TouchableOpacity style={s.errBtn} onPress={() => router.replace('/modules/exams' as any)}>
            <Text style={s.errBtnText}>Back to my exams</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  const { exam, questions } = data as { exam: any; questions: any[] };
  const q = questions[current];
  const qid = String(q._id);
  const chosen = answers[qid] || [];
  const isAnswered = (x: any) => (answers[String(x._id)] || []).length > 0;
  const answeredCount = questions.filter(isAnswered).length;
  const marked = questions.map((x, i) => ({ x, i })).filter(({ x }) => review.has(String(x._id)));
  const unanswered = questions.map((x, i) => ({ x, i })).filter(({ x }) => !isAnswered(x));
  const critical = remaining != null && remaining < 60_000;
  const low = remaining != null && remaining < 5 * 60_000;
  const last = current === questions.length - 1;

  // Three states, three separate marks — fill for answered, a corner dot for
  // marked, an outer ring for the current question — so any combination reads.
  const Cell = ({ i, on, flag, onPress }: { i: number; on?: boolean; flag?: boolean; onPress: () => void }) => (
    <View style={[s.cellRing, i === current && s.cellRingOn]}>
      <TouchableOpacity
        style={[s.cell, on && s.cellOn]}
        onPress={onPress}
        accessibilityLabel={`Question ${i + 1}${on ? ', answered' : ', not answered'}${flag ? ', marked for review' : ''}${i === current ? ', current' : ''}`}
      >
        <Text style={[s.cellText, on && { color: '#fff' }]}>{i + 1}</Text>
        {flag && <View style={s.cellFlag} />}
      </TouchableOpacity>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: exam.title, headerBackVisible: false }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        {/* Bar — who, how far, how long left */}
        <View style={s.bar}>
          <ExamMark exam={{ title: exam.title, subjectName: exam.subjectName }} size={36} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.barTitle} numberOfLines={1}>{exam.title}</Text>
            <Text style={s.barSub} numberOfLines={1}>
              {answeredCount} of {questions.length} answered
              {saveState === 'saving' ? ' · saving…' : saveState === 'saved' ? ' · saved' : saveState === 'failed' ? ' · not saved' : ''}
            </Text>
          </View>
          <View style={[s.timer, low && s.timerLow, critical && s.timerCritical]}>
            <Ionicons name="time-outline" size={14} color={critical ? Colors.danger : low ? Colors.warning : Colors.text} />
            <Text style={[s.timerText, critical && { color: Colors.danger }, !critical && low && { color: Colors.warning }]}>
              {remaining == null ? '--' : fmtTimer(remaining)}
            </Text>
          </View>
        </View>
        <View style={s.track}><View style={[s.trackFill, { width: `${(answeredCount / questions.length) * 100}%` }]} /></View>

        <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 130 }}>
          <View style={s.qCard}>
            <View style={s.qHead}>
              <Text style={s.qNum}>Question {current + 1} <Text style={s.qNumOf}>of {questions.length}</Text></Text>
              <View style={s.chip}><Text style={s.chipText}>{QUESTION_TYPE_LABEL[q.questionType] ?? q.questionType}</Text></View>
              <View style={s.chip}><Text style={s.chipText}>{plural(q.marks, 'mark')}</Text></View>
            </View>

            <Text style={s.qText}>{q.questionText}</Text>
            {q.questionType === 'mcq_multiple' && (
              <Text style={s.hint}>Select all that apply — it scores only if every correct option is chosen.</Text>
            )}

            <View style={{ gap: 10, marginTop: 4 }}>
              {(q.options ?? []).map((o: any, i: number) => {
                const on = chosen.includes(o.optionId);
                return (
                  <TouchableOpacity
                    key={o.optionId}
                    style={[s.opt, on && s.optOn]}
                    onPress={() => select(q, o.optionId)}
                    activeOpacity={0.8}
                    accessibilityRole={q.questionType === 'mcq_multiple' ? 'checkbox' : 'radio'}
                    accessibilityState={{ checked: on }}
                  >
                    <View style={[s.optLetter, on && { backgroundColor: Colors.primary }]}>
                      <Text style={[s.optLetterText, on && { color: '#fff' }]}>
                        {q.questionType === 'true_false' ? (o.optionId === 'true' ? 'T' : 'F') : letter(i)}
                      </Text>
                    </View>
                    <Text style={[s.optText, on && { fontWeight: '600', color: Colors.primary }]}>{o.text}</Text>
                    {on && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={s.qTools}>
              <TouchableOpacity style={[s.tool, review.has(qid) && s.toolOn]} onPress={() => toggleReview(qid)}>
                <Ionicons name={review.has(qid) ? 'star' : 'star-outline'} size={14} color={review.has(qid) ? Colors.warning : Colors.textSecondary} />
                <Text style={[s.toolText, review.has(qid) && { color: Colors.warning }]}>
                  {review.has(qid) ? 'Marked for review' : 'Mark for review'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.tool} onPress={() => clear(q)} disabled={!chosen.length}>
                <Ionicons name="close-circle-outline" size={14} color={chosen.length ? Colors.textSecondary : Colors.textLight} />
                <Text style={[s.toolText, !chosen.length && { color: Colors.textLight }]}>Clear response</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Stay on this screen */}
          <View style={[s.rules, violations > 0 && { borderColor: Colors.warning, backgroundColor: Colors.warningLight }]}>
            <Ionicons name="shield-outline" size={16} color={violations > 0 ? Colors.warning : Colors.textSecondary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.rulesTitle}>Stay on this screen</Text>
              <Text style={s.rulesText}>
                Leaving the app is recorded. At {exam.maxViolations} your exam is submitted automatically —
                {' '}{violations} of {exam.maxViolations} used.
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Bottom bar */}
        <View style={s.nav}>
          <TouchableOpacity style={[s.navBtn, current === 0 && s.navBtnOff]} disabled={current === 0} onPress={() => setCurrent(c => c - 1)}>
            <Ionicons name="chevron-back" size={18} color={current === 0 ? Colors.textLight : Colors.primary} />
            <Text style={[s.navBtnText, current === 0 && { color: Colors.textLight }]}>Prev</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.gridBtn} onPress={() => setPalette(true)} accessibilityLabel="All questions">
            <Ionicons name="grid-outline" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
          {last
            ? <TouchableOpacity style={s.submitBtn} onPress={() => setConfirm(true)}>
                <Text style={s.submitBtnText}>Review &amp; submit</Text>
              </TouchableOpacity>
            : <TouchableOpacity style={s.navPrimary} onPress={() => setCurrent(c => c + 1)}>
                <Text style={s.navPrimaryText}>Next</Text>
                <Ionicons name="chevron-forward" size={18} color="#fff" />
              </TouchableOpacity>}
        </View>
      </View>

      {/* Palette */}
      <Modal visible={palette} animationType="slide" transparent onRequestClose={() => setPalette(false)}>
        <View style={s.sheetWrap}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>Questions</Text>
              <TouchableOpacity onPress={() => setPalette(false)}><Ionicons name="close" size={22} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: Spacing.md }}>
              <View style={s.grid}>
                {questions.map((x, i) => (
                  <Cell key={x._id} i={i} on={isAnswered(x)} flag={review.has(String(x._id))}
                    onPress={() => { setCurrent(i); setPalette(false); }} />
                ))}
              </View>
              <View style={s.legend}>
                <View style={s.legendItem}><View style={[s.dot, { backgroundColor: Colors.primary }]} /><Text style={s.legendText}>Answered {answeredCount}</Text></View>
                <View style={s.legendItem}><View style={[s.dot, { backgroundColor: Colors.border }]} /><Text style={s.legendText}>Not answered {questions.length - answeredCount}</Text></View>
                <View style={s.legendItem}><View style={[s.dot, { backgroundColor: Colors.warning }]} /><Text style={s.legendText}>Marked for review {marked.length}</Text></View>
                <View style={s.legendItem}><View style={[s.dot, { backgroundColor: 'transparent', borderWidth: 2, borderColor: Colors.info }]} /><Text style={s.legendText}>Current question</Text></View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Submit */}
      <Modal visible={confirm} animationType="fade" transparent onRequestClose={() => setConfirm(false)}>
        <View style={s.dlgWrap}>
          <View style={s.dlg}>
            <Text style={s.dlgTitle}>Submit your exam?</Text>
            <Text style={s.dlgSub}>You can’t change answers after submitting.</Text>

            <View style={s.counts}>
              <View style={s.count}><Text style={[s.countNum, { color: Colors.success }]}>{answeredCount}</Text><Text style={s.countLabel}>answered</Text></View>
              <View style={s.count}><Text style={[s.countNum, unanswered.length ? { color: Colors.warning } : null]}>{unanswered.length}</Text><Text style={s.countLabel}>not answered</Text></View>
              <View style={s.count}><Text style={[s.countNum, marked.length ? { color: Colors.warning } : null]}>{marked.length}</Text><Text style={s.countLabel}>marked</Text></View>
              <View style={s.count}><Text style={s.countNum}>{remaining == null ? '--' : fmtTimer(remaining)}</Text><Text style={s.countLabel}>left</Text></View>
            </View>

            {unanswered.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={s.jumpLabel}>Not answered — tap to go back:</Text>
                <View style={s.grid}>
                  {unanswered.map(({ i }) => <Cell key={i} i={i} onPress={() => { setCurrent(i); setConfirm(false); }} />)}
                </View>
              </View>
            )}
            {marked.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={s.jumpLabel}>Marked for review:</Text>
                <View style={s.grid}>
                  {marked.map(({ i }) => <Cell key={i} i={i} flag onPress={() => { setCurrent(i); setConfirm(false); }} />)}
                </View>
              </View>
            )}

            <View style={s.dlgBtns}>
              <TouchableOpacity style={s.dlgGhost} onPress={() => setConfirm(false)}>
                <Text style={s.dlgGhostText}>Keep working</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.dlgGo} onPress={() => { setConfirm(false); doSubmit(false); }} disabled={submitting}>
                {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.dlgGoText}>Submit exam</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: Spacing.lg, backgroundColor: Colors.background },
  errTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  errText: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },
  errBtn: { marginTop: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  errBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.md, paddingVertical: 10, backgroundColor: Colors.surface, borderBottomWidth: 1, borderColor: Colors.border },
  barTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  barSub: { fontSize: 10, color: Colors.textSecondary, marginTop: 1 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  timerLow: { backgroundColor: Colors.warningLight, borderColor: Colors.warning },
  timerCritical: { backgroundColor: Colors.dangerLight, borderColor: Colors.danger },
  timerText: { fontSize: 13, fontWeight: '800', color: Colors.text, fontVariant: ['tabular-nums'] },
  track: { height: 3, backgroundColor: Colors.border },
  trackFill: { height: 3, backgroundColor: Colors.primary },

  qCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  qHead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  qNum: { fontSize: 13, fontWeight: '800', color: Colors.text },
  qNumOf: { fontSize: 11, fontWeight: '500', color: Colors.textSecondary },
  chip: { backgroundColor: Colors.surfaceAlt, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 10, fontWeight: '600', color: Colors.textSecondary },
  qText: { fontSize: 16, color: Colors.text, lineHeight: 24, marginTop: 12, marginBottom: 10 },
  hint: { fontSize: 11, color: Colors.textSecondary, marginBottom: 10 },

  opt: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  optOn: { borderColor: Colors.primary, backgroundColor: '#EEF2FF' },
  optLetter: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  optLetterText: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary },
  optText: { flex: 1, minWidth: 0, fontSize: 14, color: Colors.text, lineHeight: 20 },

  qTools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  toolOn: { borderColor: Colors.warning, backgroundColor: Colors.warningLight },
  toolText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },

  rules: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginTop: Spacing.md, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  rulesTitle: { fontSize: 12, fontWeight: '700', color: Colors.text },
  rulesText: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16, marginTop: 2 },

  nav: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, padding: Spacing.md, backgroundColor: Colors.surface, borderTopWidth: 1, borderColor: Colors.border },
  navBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12, paddingHorizontal: 14, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border },
  navBtnOff: { backgroundColor: Colors.surfaceAlt },
  navBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  gridBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border },
  navPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.primary },
  navPrimaryText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  submitBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.success },
  submitBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  cellRing: { padding: 2, borderRadius: Radius.sm + 3, borderWidth: 2, borderColor: 'transparent' },
  cellRingOn: { borderColor: Colors.info },
  cell: { width: 38, height: 38, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  cellOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  cellFlag: { position: 'absolute', top: -4, right: -4, width: 11, height: 11, borderRadius: 6, backgroundColor: Colors.warning, borderWidth: 2, borderColor: Colors.surface },
  cellText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  legend: { gap: 6, marginTop: Spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: Colors.textSecondary },

  sheetWrap: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '75%', backgroundColor: Colors.surface, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, borderBottomWidth: 1, borderColor: Colors.border },
  sheetTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },

  dlgWrap: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: Spacing.md },
  dlg: { width: '100%', maxWidth: 460, maxHeight: '86%', backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, gap: 12 },
  dlgTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  dlgSub: { fontSize: 12, color: Colors.textSecondary, marginTop: -8 },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  count: { flex: 1, minWidth: 74, backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, paddingVertical: 9, alignItems: 'center' },
  countNum: { fontSize: 15, fontWeight: '800', color: Colors.text },
  countLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  jumpLabel: { fontSize: 11, color: Colors.textSecondary },
  dlgBtns: { flexDirection: 'row', gap: 10, marginTop: 2 },
  dlgGhost: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  dlgGhostText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  dlgGo: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.primary },
  dlgGoText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
