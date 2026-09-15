import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap, LoaderView, Empty, Select, SegTabs } from '@/components/ui/kit';
import { MiniColumns, Meter, VizCard, pctText } from '@/components/ui/viz';
import { examApi, sideForRole, ExamSide } from '@/components/exams/examApi';
import { ExamMark, Pill, StagePill, Figures, Figure, fmtExamDay, fmtSpent, plural } from '@/components/exams/parts';

/**
 * Aptitude exam analytics — the overview, for the school office (every exam)
 * and for a teacher (the exams they wrote or that reach a section they
 * class-teach; the server draws that line).
 *
 * How exams went across a year: headline figures, subject-wise and class-wise
 * results, the trend, the score spread, and the students to celebrate or
 * support. Every exam opens its own report.
 */

const err = (e: any) => e?.data?.message ?? e?.message ?? 'Something went wrong';

export default function ExamAnalyticsScreen() {
  const { side: sideParam } = useLocalSearchParams<{ side?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const side: ExamSide = sideParam === 'admin' || sideParam === 'teacher' ? sideParam : sideForRole(user?.role);
  const xapi = examApi(side);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [year, setYear] = useState('');
  const [subject, setSubject] = useState('');
  const [classNumber, setClassNumber] = useState('');
  const [tab, setTab] = useState('overview');

  const load = useCallback(async () => {
    try {
      setData(unwrap(await xapi.analytics({ year: year || undefined, subject: subject || undefined, classNumber: classNumber || undefined })));
    } catch (e: any) { Alert.alert('Could not load analytics', err(e)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [side, year, subject, classNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return (<><Stack.Screen options={{ title: 'Exam Analytics' }} /><LoaderView /></>);

  const k = data?.kpis ?? {};
  const openReport = (id: string) => router.push({ pathname: '/modules/exam-report', params: { id, side } } as any);
  const years: any[] = data?.academicYears ?? [];
  const opts = data?.options ?? {};

  return (
    <>
      <Stack.Screen options={{ title: 'Exam Analytics' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <Text style={s.lead}>
          {side === 'admin' ? 'Every aptitude exam in the school' : 'Exams you wrote, and exams set for the classes you lead'}
        </Text>

        <View style={s.filters}>
          {years.length > 0 && (
            <View style={s.filter}>
              <Select label="Academic year" value={year} onChange={setYear} placeholder="Current year"
                options={[
                  { value: '', label: 'Current year' },
                  ...years.filter((y) => !y.current).map((y) => ({ value: String(y._id), label: `${y.name} · ${y.count}` })),
                  { value: 'all', label: 'All years' },
                ]} />
            </View>
          )}
          <View style={s.filter}>
            <Select label="Subject" value={subject} onChange={setSubject} placeholder="All subjects"
              options={[{ value: '', label: 'All subjects' }, ...(opts.subjects ?? [])]} />
          </View>
          <View style={s.filter}>
            <Select label="Class" value={classNumber} onChange={setClassNumber} placeholder="All classes"
              options={[{ value: '', label: 'All classes' }, ...(opts.classes ?? [])]} />
          </View>
        </View>

        <Figures>
          <Figure label="Average score" value={pctText(k.average)} icon="trophy" tone="success" />
          <Figure label="Pass rate" value={pctText(k.passRate)} icon="checkmark-circle" tone="info" />
          <Figure label="Completion" value={pctText(k.completion)} icon="people" tone="warning" />
          <Figure label="Closed exams" value={`${k.closed ?? 0}/${k.exams ?? 0}`} icon="documents" tone="neutral" />
        </Figures>
        <Text style={s.kpiNote}>
          {plural(k.attempts ?? 0, 'paper')} from {plural(k.students ?? 0, 'student')}
          {k.median != null ? ` · median ${k.median}%` : ''}
          {k.averageTime != null ? ` · ${fmtSpent(k.averageTime)} average time` : ''}
          {k.autoSubmitted ? ` · ${k.autoSubmitted} auto-submitted` : ''}
          {' '}· pass mark {k.passMark ?? 40}%
        </Text>

        <SegTabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'overview', label: 'Overview' },
            { key: 'subjects', label: 'Subjects & classes' },
            { key: 'students', label: 'Students' },
            { key: 'exams', label: `Exams ${data?.exams?.length ?? 0}` },
          ]}
        />

        {tab === 'overview' && (
          !k.attempts ? <Empty icon="analytics-outline" text="No closed exam with submissions in this selection yet" /> : (
            <>
              <VizCard title="Average score by exam" subtitle="Closed exams, oldest first">
                <MiniColumns data={(data.trend ?? []).slice(-8).map((t: any, i: number) => ({ label: `${i + 1}`, value: t.average ?? 0 }))} unit="%" />
                <View style={{ marginTop: 8, gap: 3 }}>
                  {(data.trend ?? []).slice(-8).map((t: any, i: number) => (
                    <TouchableOpacity key={t._id} onPress={() => openReport(t._id)}>
                      <Text style={s.legendLine} numberOfLines={1}>{i + 1}. {t.title} — {pctText(t.average)} · pass {pctText(t.passRate)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </VizCard>
              <VizCard title="Marks distribution" subtitle={`${plural(k.attempts, 'paper')} in bands of 10%`}>
                <MiniColumns data={(data.distribution ?? []).map((b: any) => ({ label: String(b.from), value: b.count }))} format={(n) => plural(n, 'student')} />
                <Text style={s.axisNote}>Score band starts at (%)</Text>
              </VizCard>
            </>
          )
        )}

        {tab === 'subjects' && (
          <>
            <VizCard title="Subject-wise" subtitle="Average score across closed exams">
              {(data?.subjects ?? []).length === 0 ? <Text style={s.none}>No closed exams yet.</Text> : (
                <View style={{ gap: 12 }}>
                  {data.subjects.map((g: any) => (
                    <View key={g.name}>
                      <Meter label={`${g.name} · ${plural(g.exams, 'exam')}`} value={g.average} right={pctText(g.average)} />
                      <Text style={s.rowNote}>
                        Pass {pctText(g.passRate)} · {plural(g.attempts, 'paper')}{g.best ? ` · best: ${g.best.title} (${g.best.average}%)` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </VizCard>
            <VizCard title="Class-wise" subtitle="By the section each student sat in">
              {(data?.classes ?? []).length === 0 ? <Text style={s.none}>No submissions yet.</Text> : (
                <View style={{ gap: 12 }}>
                  {data.classes.map((c: any) => (
                    <View key={c.key}>
                      <Meter label={c.label} value={c.average} right={pctText(c.average)} />
                      <Text style={s.rowNote}>
                        {plural(c.students, 'student')} · pass {pctText(c.passRate)} · range {pctText(c.lowest)}–{pctText(c.highest)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </VizCard>
          </>
        )}

        {tab === 'students' && (
          <>
            <VizCard title="Top performers" subtitle="Average across the exams they sat">
              <StudentList rows={data?.topStudents ?? []} empty="No results yet." />
            </VizCard>
            <VizCard title="Needs support" subtitle={`Averaging below the ${k.passMark ?? 40}% pass mark`}>
              <StudentList rows={data?.needsSupport ?? []} empty="Nobody is below the pass mark." warn />
            </VizCard>
          </>
        )}

        {tab === 'exams' && (
          (data?.exams ?? []).length === 0 ? <Empty icon="bulb-outline" text="No exams in this selection" /> :
            data.exams.map((e: any) => (
              <TouchableOpacity key={e._id} style={s.exam} onPress={() => openReport(e._id)} activeOpacity={0.75}>
                <View style={s.examTop}>
                  <ExamMark exam={e} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.examTitle} numberOfLines={2}>{e.title}</Text>
                    <Text style={s.examSub} numberOfLines={1}>{e.subjectName ?? 'General Aptitude'} · {fmtExamDay(e)} · {e.audience?.label ?? '--'}</Text>
                  </View>
                  <StagePill stage={e.stage} />
                </View>
                {e.stage === 'completed' && (
                  <View style={s.examFacts}>
                    <Pill label={`Avg ${pctText(e.average)}`} tone="accent" />
                    <Pill label={`Pass ${pctText(e.passRate)}`} />
                    <Pill label={`${e.submitted}/${e.eligible} sat`} />
                  </View>
                )}
              </TouchableOpacity>
            ))
        )}
      </ScrollView>
    </>
  );
}

function StudentList({ rows, empty, warn }: { rows: any[]; empty: string; warn?: boolean }) {
  if (!rows.length) return <Text style={s.none}>{empty}</Text>;
  return (
    <View>
      {rows.map((r, i) => (
        <View key={r._id} style={[s.student, i > 0 && s.studentBorder]}>
          <View style={[s.rank, warn && { backgroundColor: Colors.warningLight }]}>
            {warn ? <Ionicons name="alert" size={13} color={Colors.warning} /> : <Text style={s.rankText}>{i + 1}</Text>}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.studentName} numberOfLines={1}>{r.name}</Text>
            <Text style={s.studentSub} numberOfLines={1}>
              {[r.className, r.rollNumber && `Roll ${r.rollNumber}`].filter(Boolean).join(' · ') || '--'} · {plural(r.exams, 'exam')}
            </Text>
          </View>
          <Text style={[s.studentPct, warn && { color: Colors.danger }]}>{r.average}%</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  lead: { fontSize: 12, color: Colors.textSecondary, marginBottom: 10 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  filter: { flexGrow: 1, flexBasis: 140, minWidth: 140 },
  kpiNote: { fontSize: 11, color: Colors.textSecondary, marginTop: -4, marginBottom: 12, lineHeight: 16 },
  legendLine: { fontSize: 11, color: Colors.textSecondary },
  axisNote: { fontSize: 10, color: Colors.textLight, textAlign: 'center', marginTop: 4 },
  none: { fontSize: 12, color: Colors.textSecondary, paddingVertical: 8 },
  rowNote: { fontSize: 10, color: Colors.textLight, marginTop: 3 },

  student: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  studentBorder: { borderTopWidth: 1, borderTopColor: Colors.divider },
  rank: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 11, fontWeight: '800', color: '#4F46E5' },
  studentName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  studentSub: { fontSize: 10, color: Colors.textSecondary, marginTop: 1 },
  studentPct: { fontSize: 14, fontWeight: '800', color: Colors.text },

  exam: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: 10 },
  examTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  examTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  examSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  examFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
});
