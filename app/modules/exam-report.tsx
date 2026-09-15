import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap, LoaderView, Empty, SegTabs, SearchBar } from '@/components/ui/kit';
import { MiniColumns, Meter, VizCard, VIZ, pctText } from '@/components/ui/viz';
import { examApi, sideForRole, ExamSide } from '@/components/exams/examApi';
import {
  ExamMark, StagePill, Insights, Pill, AttemptPill, Outcome, ScoreBar, FactCell, Figures, Figure,
  QUESTION_TYPE_LABEL, fmtExamDay, fmtClockRange, fmtSpent, plural,
} from '@/components/exams/parts';

/**
 * One aptitude exam's analytics report — for the school office and for the
 * teacher who wrote it or class-teaches it.
 *
 * Its figures and what stands out, the marks distribution, section-wise and
 * student-wise results, and question analysis: how many got each question
 * right, whether it separates stronger from weaker students (discrimination),
 * and which options were chosen.
 */

const err = (e: any) => e?.data?.message ?? e?.message ?? 'Something went wrong';

/** Discrimination, read in words. */
const discLabel = (d?: number | null) => (d == null ? null
  : d < 0 ? { label: 'Check key', tone: 'bad' as const }
    : d < 0.2 ? { label: 'Weak separation', tone: 'warn' as const }
      : d < 0.4 ? { label: 'Fair separation', tone: 'neutral' as const }
        : { label: 'Good separation', tone: 'good' as const });

export default function ExamReportScreen() {
  const { id, side: sideParam } = useLocalSearchParams<{ id: string; side?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const side: ExamSide = sideParam === 'admin' || sideParam === 'teacher' ? sideParam : sideForRole(user?.role);
  const xapi = examApi(side);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('overview');
  const [who, setWho] = useState('');
  const [studentFilter, setStudentFilter] = useState('all');
  const [qSort, setQSort] = useState('number');

  const load = useCallback(async () => {
    try { setData(unwrap(await xapi.report(String(id)))); }
    catch (e: any) { Alert.alert('Could not open this report', err(e)); router.back(); }
    finally { setLoading(false); setRefreshing(false); }
  }, [id, side]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (id) load(); }, [id, load]);

  const students = useMemo(() => {
    const q = who.trim().toLowerCase();
    return (data?.students ?? [])
      .filter((st: any) => studentFilter === 'all'
        || (studentFilter === 'passed' && st.passed === true)
        || (studentFilter === 'failed' && st.passed === false)
        || (studentFilter === 'absent' && st.score == null))
      .filter((st: any) => !q || st.name.toLowerCase().includes(q) || String(st.rollNumber).toLowerCase().includes(q) || (st.className ?? '').toLowerCase().includes(q));
  }, [data, who, studentFilter]);

  const questions = useMemo(() => {
    const list = [...(data?.questions ?? [])];
    if (qSort === 'hardest') list.sort((a, b) => (a.successRate ?? 101) - (b.successRate ?? 101));
    if (qSort === 'discrimination') list.sort((a, b) => (a.discrimination ?? 9) - (b.discrimination ?? 9));
    return list;
  }, [data, qSort]);

  if (loading || !data) return (<><Stack.Screen options={{ title: 'Exam report' }} /><LoaderView /></>);

  const e = data.exam ?? {};
  const k = data.kpis ?? {};
  const count = (f: (st: any) => boolean) => (data.students ?? []).filter(f).length;

  return (
    <>
      <Stack.Screen options={{ title: 'Exam report' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <View style={s.head}>
          <View style={s.headTop}>
            <ExamMark exam={e} size={44} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.title} numberOfLines={3}>{e.title}</Text>
              <View style={s.tags}>
                <StagePill stage={e.stage} />
                <Text style={s.sub}>{e.subjectName ?? 'General Aptitude'}</Text>
              </View>
            </View>
          </View>
          <View style={s.facts}>
            <FactCell label="Date" value={fmtExamDay(e)} />
            <FactCell label="Time" value={fmtClockRange(e)} />
            <FactCell label="Classes" value={e.audience?.label ?? '--'} />
            <FactCell label="Marks" value={`${k.totalMarks} · pass ${k.passMark}`} />
          </View>
        </View>

        <Figures>
          <Figure label="Average" value={pctText(k.average)} icon="trophy" tone="success" />
          <Figure label="Pass rate" value={pctText(k.passRate)} icon="checkmark-circle" tone="info" />
          <Figure label="Submitted" value={`${k.submitted}/${k.eligible}`} icon="people" tone="warning" />
          <Figure label="High / low" value={k.highest == null ? '--' : `${k.highest}/${k.lowest}`} icon="stats-chart" tone="neutral" />
        </Figures>

        {(data.insights ?? []).length > 0 && (
          <VizCard title="What stands out">
            <Insights items={data.insights} />
          </VizCard>
        )}

        <SegTabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'overview', label: 'Overview' },
            { key: 'students', label: `Students ${data.students?.length ?? 0}` },
            { key: 'questions', label: `Questions ${data.questions?.length ?? 0}` },
            ...((data.sections ?? []).length > 1 ? [{ key: 'sections', label: 'Sections' }] : []),
          ]}
        />

        {tab === 'overview' && (
          <>
            <VizCard title="Marks distribution" subtitle={`${plural(k.submitted, 'paper')} in bands of 10%`}>
              {k.submitted ? (
                <>
                  <MiniColumns data={(data.distribution ?? []).map((b: any) => ({ label: String(b.from), value: b.count }))} format={(n) => plural(n, 'student')} />
                  <Text style={s.axisNote}>Score band starts at (%)</Text>
                </>
              ) : <Text style={s.none}>No submissions yet.</Text>}
            </VizCard>

            <VizCard title="Participation">
              <View style={{ gap: 10 }}>
                <Meter label="Completion" value={k.completion} right={`${k.submitted} of ${k.eligible}`} tone="accent" />
                <View style={s.grid}>
                  <Stat label="Not attempted" value={k.notAttempted} />
                  <Stat label="In progress" value={k.inProgress} />
                  <Stat label="Auto-submitted" value={k.autoSubmitted} />
                  <Stat label="App switches" value={`${k.violations} · ${plural(k.studentsWithViolations, 'student')}`} />
                </View>
              </View>
            </VizCard>

            <VizCard title="Scores & time">
              <View style={s.grid}>
                <Stat label="Median" value={pctText(k.median)} />
                <Stat label="Spread (SD)" value={k.stdDev == null ? '--' : `${k.stdDev} pts`} />
                <Stat label="Average marks" value={k.averageScore == null ? '--' : `${k.averageScore} / ${k.totalMarks}`} />
                <Stat label="Average time" value={`${fmtSpent(k.averageTime)} of ${k.duration} min`} />
                <Stat label="Fastest" value={fmtSpent(k.fastest)} />
                <Stat label="Slowest" value={fmtSpent(k.slowest)} />
              </View>
              {data.subjectContext && (
                <Text style={s.context}>
                  {data.subjectContext.subjectName} averaged {data.subjectContext.average}% across {plural(data.subjectContext.exams, 'other exam')} this year.
                </Text>
              )}
            </VizCard>

            {(data.types ?? []).length > 0 && (
              <VizCard title="By question type">
                <View style={{ gap: 10 }}>
                  {data.types.map((t: any) => (
                    <Meter key={t.type} label={`${QUESTION_TYPE_LABEL[t.type] ?? t.type} · ${plural(t.questions, 'question')} · ${t.marks} marks`}
                      value={t.successRate} right={pctText(t.successRate)} />
                  ))}
                </View>
              </VizCard>
            )}
          </>
        )}

        {tab === 'sections' && (
          <VizCard title="Section-wise" subtitle="Average score and completion per section">
            <View style={{ gap: 14 }}>
              {data.sections.map((sec: any) => (
                <View key={sec._id}>
                  <Meter label={sec.label} value={sec.average} right={pctText(sec.average)} />
                  <Text style={s.rowNote}>
                    {sec.submitted} of {sec.eligible} sat ({pctText(sec.completion)}) · pass {pctText(sec.passRate)} · range {pctText(sec.lowest)}–{pctText(sec.highest)}
                  </Text>
                </View>
              ))}
            </View>
          </VizCard>
        )}

        {tab === 'students' && (
          <>
            <SearchBar value={who} onChange={setWho} placeholder="Search name, roll or class…" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginVertical: 10 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[
                  { key: 'all', label: `All ${data.students?.length ?? 0}` },
                  { key: 'passed', label: `Passed ${count(st => st.passed === true)}` },
                  { key: 'failed', label: `Not passed ${count(st => st.passed === false)}` },
                  { key: 'absent', label: `No score ${count(st => st.score == null)}` },
                ].map((f) => (
                  <TouchableOpacity key={f.key} style={[s.chip, studentFilter === f.key && s.chipOn]} onPress={() => setStudentFilter(f.key)}>
                    <Text style={[s.chipText, studentFilter === f.key && s.chipTextOn]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            {students.length === 0 ? <Empty icon="people-outline" text="No students match" /> : students.map((st: any) => (
              <View key={st._id} style={s.student}>
                <View style={[s.rank, st.rank == null && { backgroundColor: Colors.surfaceAlt }]}>
                  <Text style={[s.rankText, st.rank == null && { color: Colors.textLight }]}>{st.rank ?? '–'}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.studentName} numberOfLines={1}>{st.name}</Text>
                  <Text style={s.studentSub} numberOfLines={1}>
                    {[st.className, st.rollNumber && `Roll ${st.rollNumber}`].filter(Boolean).join(' · ') || '--'}
                  </Text>
                  {st.score != null && (
                    <View style={{ marginTop: 6, gap: 4 }}>
                      <Text style={s.studentSub}>
                        {st.score}/{k.totalMarks} · {st.correct}✓ {st.incorrect}✗ {st.unanswered}– · {fmtSpent(st.timeTaken)}
                        {st.violations ? ` · ${plural(st.violations, 'switch', 'switches')}` : ''}
                      </Text>
                      <ScoreBar value={st.percentage} />
                    </View>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  {st.score != null ? <Outcome passed={st.passed} /> : null}
                  {(st.score == null || st.status === 'auto_submitted') && <AttemptPill status={st.status} />}
                </View>
              </View>
            ))}
          </>
        )}

        {tab === 'questions' && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[
                  { key: 'number', label: 'In order' },
                  { key: 'hardest', label: 'Hardest first' },
                  { key: 'discrimination', label: 'Weakest separation' },
                ].map((f) => (
                  <TouchableOpacity key={f.key} style={[s.chip, qSort === f.key && s.chipOn]} onPress={() => setQSort(f.key)}>
                    <Text style={[s.chipText, qSort === f.key && s.chipTextOn]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <Text style={s.help}>
              Separation compares the top 27% of scorers with the bottom 27%: below zero, stronger students got it wrong more often — usually a wrong key.
            </Text>
            {questions.length === 0 ? <Empty icon="help-circle-outline" text="No questions" /> : questions.map((q: any) => {
              const d = discLabel(q.discrimination);
              const sat = q.answered + q.unanswered;
              return (
                <View key={q._id} style={s.q}>
                  <View style={s.qHead}>
                    <View style={s.qNum}><Text style={s.qNumText}>Q{q.number}</Text></View>
                    <Pill label={QUESTION_TYPE_LABEL[q.questionType] ?? q.questionType} />
                    {d && <Pill label={`${d.label} ${q.discrimination}`} tone={d.tone} />}
                    <View style={{ flex: 1 }} />
                    <Text style={s.qMarks}>{plural(q.marks, 'mark')}</Text>
                  </View>
                  <Text style={s.qText}>{q.questionText}</Text>
                  <Meter label="Fully right" value={q.successRate} right={q.successRate == null ? '--' : `${q.successRate}% · ${q.correct} of ${sat}`} />
                  <Text style={s.rowNote}>{q.incorrect} wrong · {q.unanswered} left blank</Text>
                  <View style={{ marginTop: 10, gap: 6 }}>
                    {q.options.map((o: any) => {
                      const share = sat ? Math.round((o.chosen / sat) * 100) : 0;
                      return (
                        <View key={o.optionId} style={s.opt}>
                          <View style={[s.optLetter, o.isKey && { backgroundColor: Colors.success }]}>
                            <Text style={[s.optLetterText, o.isKey && { color: '#fff' }]}>{o.letter}</Text>
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={s.optHead}>
                              <Text style={s.optText} numberOfLines={2}>{o.text}{o.isKey ? '  ✓ key' : ''}</Text>
                              <Text style={s.optCount}>{o.chosen}</Text>
                            </View>
                            <View style={s.optTrack}>
                              <View style={{ width: `${share}%`, height: '100%', borderRadius: 4, backgroundColor: o.isKey ? VIZ.good : '#A5B4FC' }} />
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={s.figure}>
      <Text style={s.figureLabel}>{label}</Text>
      <Text style={s.figureValue}>{value ?? '--'}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  head: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  headTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 16, fontWeight: '800', color: Colors.text },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  sub: { fontSize: 12, color: Colors.textSecondary },
  facts: { flexDirection: 'row', flexWrap: 'wrap', marginTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: 6 },

  axisNote: { fontSize: 10, color: Colors.textLight, textAlign: 'center', marginTop: 4 },
  none: { fontSize: 12, color: Colors.textSecondary, paddingVertical: 8 },
  rowNote: { fontSize: 10, color: Colors.textLight, marginTop: 3 },
  context: { fontSize: 11, color: Colors.textSecondary, marginTop: 10, lineHeight: 16 },
  help: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16, marginBottom: 10 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  figure: { flexGrow: 1, flexBasis: '45%', minWidth: 120, backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, padding: 10 },
  figureLabel: { fontSize: 10, color: Colors.textSecondary },
  figureValue: { fontSize: 14, fontWeight: '700', color: Colors.text, marginTop: 2 },

  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipOn: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextOn: { color: '#fff' },

  student: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 8 },
  rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 11, fontWeight: '800', color: '#4F46E5' },
  studentName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  studentSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },

  q: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: 10 },
  qHead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  qNum: { backgroundColor: '#EDE9FE', borderRadius: Radius.sm, paddingHorizontal: 7, paddingVertical: 3 },
  qNumText: { fontSize: 11, fontWeight: '800', color: '#4F46E5' },
  qMarks: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  qText: { fontSize: 13, color: Colors.text, lineHeight: 19, marginVertical: 10 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  optLetter: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  optLetterText: { fontSize: 10, fontWeight: '800', color: Colors.textSecondary },
  optHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  optText: { flex: 1, minWidth: 0, fontSize: 12, color: Colors.text },
  optCount: { fontSize: 12, fontWeight: '700', color: Colors.text },
  optTrack: { height: 6, borderRadius: 4, backgroundColor: VIZ.track, overflow: 'hidden', marginTop: 3 },
});
