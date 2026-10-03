/**
 * Results on the phone (Oct 2026), on the same read models as the web pages.
 *
 *   teacher   Mark Entry (each subject owed, opened to enter on the phone),
 *             Validation (as class teacher: exams to validate, class tests to
 *             approve), Class Tests (their own — set here too), Published
 *             (their sections'), Re-exams (papers of their subjects, once the
 *             office sets one up); a class teacher's Report Cards
 *   student   their published results — the year's overall result, each exam
 *   parent    as a scorecard, class tests — and, for a parent, one child at a
 *             time with the switch every parent screen uses
 *
 * Notices open this screen with `?tab=` (marks, validation, tests). The exam
 * schedule is its own screen, from the header.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { Stack, useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as R from '@/api/results.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Empty, LoaderView, SegTabs, FAB, unwrap, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import ClassTestForm from '@/components/results/ClassTestForm';
import {
  Tiles, KidSwitch, Scorecard, Overall, Pill, GradePill, pct, fmtDay, fmtRange, classLine, plural, moveText,
} from '@/components/results/parts';

const SHEET: Record<string, { label: string; fg: string; bg: string }> = {
  NOT_STARTED: { label: 'Not started', fg: Colors.textSecondary, bg: Colors.surfaceAlt },
  DRAFT: { label: 'In progress', fg: Colors.warning, bg: Colors.warningLight },
  SUBMITTED: { label: 'Submitted', fg: Colors.success, bg: Colors.successLight },
};
const TEST: Record<string, { fg: string; bg: string }> = {
  DRAFT: { fg: Colors.textSecondary, bg: Colors.surfaceAlt },
  SUBMITTED: { fg: Colors.info, bg: Colors.infoLight },
  FINAL_APPROVED: { fg: Colors.success, bg: Colors.successLight },
  REJECTED: { fg: Colors.danger, bg: Colors.dangerLight },
  REOPENED: { fg: Colors.warning, bg: Colors.warningLight },
};
/** Where an exam is, said for the teacher whose sheet is in it. */
const EXAM_NOTE: Record<string, string> = {
  SUBMITTED: 'With the class teacher for validation',
  CLASS_APPROVED: 'Validated — waiting to be published',
  REJECTED: 'Sent back — the office will reopen it for correction',
};

/** A notice, or another screen, can name the tab to open on. */
const tabFrom = (keys: string[], wanted?: string, fallback = keys[0]) => (wanted && keys.includes(wanted) ? wanted : fallback);
const TEACHER_TABS = ['marks', 'validation', 'tests', 'published', 'reexams'];

export default function ResultsScreen() {
  const { user } = useAuth();
  if (!user?.role) return <LoaderView />;
  return user.role === 'teacher' ? <TeacherResults /> : <FamilyResults parent={user.role === 'parent'} />;
}

/* ══════════════════════════════════════════════════════════════════════════
   Teacher
══════════════════════════════════════════════════════════════════════════ */

function TeacherResults() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState(() => tabFrom(TEACHER_TABS, params.tab));
  const [newTest, setNewTest] = useState(false);
  const [b, setB] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setB(unwrap(await R.teacherBoard()));
      setError('');
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else setError(err?.message || 'Results could not be loaded');
    } finally { setRefreshing(false); }
  }, []);
  // Fresh every time the screen comes back — after a sheet is saved, above all.
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { if (params.tab) setTab((t) => tabFrom(TEACHER_TABS, params.tab, t)); }, [params.tab]);

  if (disabled) return (<><Stack.Screen options={{ title: 'Results' }} /><ModuleDisabled /></>);
  const t = b?.tiles || {};
  const go = (pathname: string, p: Record<string, string>) => router.push({ pathname, params: p } as any);

  return (
    <>
      <Stack.Screen options={{
        title: 'Results & Marks',
        headerRight: () => (
          <TouchableOpacity onPress={() => router.push('/modules/exam-schedule' as any)} hitSlop={10} style={s.headBtn} accessibilityLabel="Exam schedule">
            <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
        ),
      }} />
      <ScrollView style={s.screen} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        {!b && !error ? <LoaderView /> : null}
        {!b && error ? <Empty icon="cloud-offline-outline" text={error} /> : null}
        {b ? (
          <>
            {b.classTeacherOf?.length ? (
              <TouchableOpacity style={s.entry} activeOpacity={0.75} onPress={() => router.push('/modules/report-cards' as any)}>
                <View style={s.entryIcon}><Ionicons name="ribbon-outline" size={18} color={Colors.primary} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.entryTitle}>Report Cards</Text>
                  <Text style={s.sub} numberOfLines={1}>{b.classTeacherOf.join(', ')} · remarks and co-scholastic grades</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
              </TouchableOpacity>
            ) : null}
            {b.classTeacherOf?.length ? (
              <TouchableOpacity style={s.entry} activeOpacity={0.75} onPress={() => router.push('/modules/results-electives' as any)}>
                <View style={s.entryIcon}><Ionicons name="people-outline" size={18} color={Colors.primary} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.entryTitle}>Electives</Text>
                  <Text style={s.sub} numberOfLines={1}>Who in your class takes which optional subject</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
              </TouchableOpacity>
            ) : null}
            <Tiles items={[
              { label: 'Marks to Enter', value: t.toEnter ?? 0, icon: 'create-outline', tone: 'primary', onPress: () => setTab('marks'), on: tab === 'marks' },
              { label: 'To Validate', value: t.toValidate ?? 0, icon: 'shield-checkmark-outline', tone: 'info', onPress: () => setTab('validation'), on: tab === 'validation' },
              { label: 'Class Tests', value: t.tests ?? 0, icon: 'clipboard-outline', tone: 'warning', cap: t.testsOpen ? `${t.testsOpen} need you` : undefined, onPress: () => setTab('tests'), on: tab === 'tests' },
              { label: 'Published', value: t.published ?? 0, icon: 'checkmark-done-outline', tone: 'success', onPress: () => setTab('published'), on: tab === 'published' },
            ]} />
            <SegTabs active={tab} onChange={setTab} tabs={[
              { key: 'marks', label: `Mark Entry${t.toEnter ? ` (${t.toEnter})` : ''}` },
              { key: 'validation', label: `Validation${t.toValidate ? ` (${t.toValidate})` : ''}` },
              { key: 'tests', label: 'Class Tests' },
              { key: 'published', label: 'Published' },
              ...(b.reExams?.length || tab === 'reexams' ? [{ key: 'reexams', label: `Re-exams${t.reExamsOwed ? ` (${t.reExamsOwed})` : ''}` }] : []),
            ]} />

            {tab === 'marks' ? (
              b.marks.length ? b.marks.map((e: any) => (
                <View key={e._id} style={s.card}>
                  <View style={s.rowTop}>
                    <Text style={[s.title, { flex: 1 }]} numberOfLines={2}>{e.title}</Text>
                    {e.late && e.owed ? <Pill label="Overdue" fg={Colors.danger} bg={Colors.dangerLight} /> : null}
                  </View>
                  <Text style={s.sub}>{[classLine(e), e.examTypeLabel, fmtRange(e.startDate, e.endDate)].filter(Boolean).join(' · ')}</Text>
                  {e.marksDueDate ? <Text style={[s.sub, e.late && e.owed ? { color: Colors.danger, fontWeight: '600' } : null]}>Marks due by {fmtDay(e.marksDueDate)}</Text> : null}
                  {!e.open ? <Text style={s.note}>{EXAM_NOTE[e.status] || e.statusLabel}</Text> : null}
                  {e.subjects.map((x: any) => {
                    const sh = SHEET[x.sheet.status] || SHEET.NOT_STARTED;
                    return (
                      <TouchableOpacity key={x._id} style={s.line} activeOpacity={0.7}
                        onPress={() => go('/modules/results-sheet', { examId: String(e._id), subjectId: String(x._id) })}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.lineName} numberOfLines={1}>{x.subjectName}</Text>
                          <Text style={s.lineSub}>{x.sheet.entered} of {x.sheet.total} entered · {x.gradeOnly ? 'graded' : `${x.inParts ? 'in parts · ' : ''}max ${x.maxMarks}`}{x.examDate ? ` · ${fmtDay(x.examDate)}` : ''}</Text>
                        </View>
                        <Pill label={sh.label} fg={sh.fg} bg={sh.bg} />
                        <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )) : <Empty icon="checkmark-done-outline" text="No exam is waiting for your marks." />
            ) : null}

            {tab === 'validation' ? (
              <>
                {!b.classTeacherOf?.length ? <Text style={s.hint}>You are not a class teacher this year, so nothing comes here to validate.</Text> : null}
                {b.validation.exams.map((e: any) => (
                  <TouchableOpacity key={e._id} style={s.card} activeOpacity={0.75} onPress={() => go('/modules/results-review', { examId: String(e._id) })}>
                    <View style={s.rowTop}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.title} numberOfLines={2}>{e.title}</Text>
                        <Text style={s.sub}>{[classLine(e), e.examTypeLabel].filter(Boolean).join(' · ')}</Text>
                      </View>
                      <Pill label="Validate" fg={Colors.textInverse} bg={Colors.primary} />
                    </View>
                    <Text style={s.lineSub}>All {plural(e.subjectCount, 'subject')} in · {plural(e.roster, 'student')}{e.inAt ? ` · last in ${fmtDay(e.inAt)}` : ''}</Text>
                  </TouchableOpacity>
                ))}
                {b.validation.tests.map((x: any) => (
                  <TouchableOpacity key={x._id} style={s.card} activeOpacity={0.75} onPress={() => go('/modules/results-sheet', { testId: String(x._id), review: '1' })}>
                    <View style={s.rowTop}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.title} numberOfLines={2}>{x.title}</Text>
                        <Text style={s.sub}>{[`Class test · ${x.subjectName}`, classLine(x), x.setBy ? `by ${x.setBy}` : ''].filter(Boolean).join(' · ')}</Text>
                      </View>
                      <Pill label="Approve" fg={Colors.textInverse} bg={Colors.primary} />
                    </View>
                  </TouchableOpacity>
                ))}
                {!b.validation.exams.length && !b.validation.tests.length ? <Empty icon="shield-checkmark-outline" text="Nothing is waiting for you to validate." /> : null}
              </>
            ) : null}

            {tab === 'tests' ? (
              <>
                <Text style={s.hint}>Set a test with the + button, then enter its marks.</Text>
                {b.tests.length ? b.tests.map((x: any) => {
                  const tone = TEST[x.status] || TEST.DRAFT;
                  return (
                    <TouchableOpacity key={x._id} style={s.card} activeOpacity={0.75} onPress={() => go('/modules/results-sheet', { testId: String(x._id) })}>
                      <View style={s.rowTop}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.title} numberOfLines={2}>{x.title}</Text>
                          <Text style={s.sub}>{[x.subjectName, classLine(x), fmtDay(x.testDate)].filter(Boolean).join(' · ')}</Text>
                        </View>
                        <Pill label={x.statusLabel} fg={tone.fg} bg={tone.bg} />
                      </View>
                      <Text style={s.lineSub}>{x.entered} of {x.roster} entered · max {x.maxMarks}{x.status === 'REJECTED' && x.rejectionReason ? ` · sent back: “${x.rejectionReason}”` : ''}</Text>
                    </TouchableOpacity>
                  );
                }) : <Empty icon="clipboard-outline" text="You have not set a class test yet." />}
              </>
            ) : null}

            {tab === 'reexams' ? (
              b.reExams?.length ? b.reExams.map((e: any) => (
                <TouchableOpacity key={e._id} style={s.card} activeOpacity={0.75} onPress={() => go('/modules/results-reexam', { examId: String(e._id) })}>
                  <View style={s.rowTop}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.title} numberOfLines={2}>{e.title}</Text>
                      <Text style={s.sub}>{[classLine(e), e.date ? `re-exam ${fmtDay(e.date)}` : 'date not set yet'].filter(Boolean).join(' · ')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
                  </View>
                  {e.subjects.map((x: any) => (
                    <Text key={x._id} style={s.lineSub}>{x.subjectName}: {x.owed ? `${x.owed} to enter` : 'all entered'}{x.entered ? ` · ${x.entered} entered` : ''}</Text>
                  ))}
                </TouchableOpacity>
              )) : <Empty icon="refresh-outline" text="When the office sets up a re-exam for papers of your subjects, it appears here." />
            ) : null}

            {tab === 'published' ? (
              b.published.length ? b.published.map((e: any) => (
                <View key={e._id} style={s.card}>
                  <Text style={s.title} numberOfLines={2}>{e.title}</Text>
                  <Text style={s.sub}>{[classLine(e), e.examTypeLabel, e.publishedOn ? `published ${fmtDay(e.publishedOn)}` : ''].filter(Boolean).join(' · ')}{e.classTeacher ? ' · your class' : ''}</Text>
                  <View style={s.figs}>
                    <View style={s.fig}><Text style={s.figV}>{e.students}</Text><Text style={s.figL}>Students</Text></View>
                    <View style={s.fig}><Text style={s.figV}>{pct(e.passPct)}</Text><Text style={s.figL}>Passed</Text></View>
                    <View style={s.fig}><Text style={s.figV}>{pct(e.avgPct)}</Text><Text style={s.figL}>Average</Text></View>
                    <View style={s.fig}><Text style={s.figV}>{pct(e.topPct)}</Text><Text style={s.figL}>Highest</Text></View>
                  </View>
                  {e.mySubjects?.length ? (
                    <Text style={s.lineSub}>Your subjects: {e.mySubjects.map((m: any) => `${m.subjectName} ${pct(m.avgPct)}`).join(' · ')}</Text>
                  ) : null}
                </View>
              )) : <Empty icon="bar-chart-outline" text="No results have been published for your sections yet." />
            ) : null}
          </>
        ) : null}
      </ScrollView>
      {b && tab === 'tests' ? <FAB icon="add" onPress={() => setNewTest(true)} /> : null}
      <ClassTestForm visible={newTest} onClose={() => setNewTest(false)}
        onSaved={(made) => { setNewTest(false); load(); if (made?._id) go('/modules/results-sheet', { testId: String(made._id) }); }} />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Student and parent
══════════════════════════════════════════════════════════════════════════ */

function FamilyResults({ parent }: { parent: boolean }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; child?: string }>();
  const [childId, setChildId] = useState(String(params.child || ''));
  const [tab, setTab] = useState(() => tabFrom(['exams', 'tests'], params.tab));
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setD(unwrap(parent ? await R.parentOverview(childId || undefined) : await R.studentOverview()));
      setError('');
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else setError(err?.message || 'Results could not be loaded');
    } finally { setLoading(false); setRefreshing(false); }
  }, [parent, childId]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  if (disabled) return (<><Stack.Screen options={{ title: 'Results' }} /><ModuleDisabled /></>);
  const children = d?.children || [];
  const who = d?.student;
  const st = d?.stats;
  const exams = d?.exams || [];
  const tests = d?.classTests || [];
  const promoted = d?.promotion;

  return (
    <>
      <Stack.Screen options={{
        title: parent ? 'Results' : 'My Results',
        headerRight: () => (
          <TouchableOpacity hitSlop={10} style={s.headBtn} accessibilityLabel="Exam schedule"
            onPress={() => router.push({ pathname: '/modules/exam-schedule', params: parent && d?.child ? { child: String(d.child) } : {} } as any)}>
            <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
        ),
      }} />
      <ScrollView style={s.screen} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        {parent ? <KidSwitch kids={children} value={d?.child} onPick={(id) => { setChildId(id); }} showSchool={!!d?.multiSchool} /> : null}
        {loading && !d ? <LoaderView /> : null}
        {!d && error ? <Empty icon="cloud-offline-outline" text={error} /> : null}
        {d && parent && !children.length ? <Empty icon="people-outline" text="No children are linked to your account yet. Ask the school office to link them." /> : null}
        {d && parent && children.length > 0 && d.resultsOn === false ? <Empty icon="bar-chart-outline" text={`${d.school?.name || 'This school'} does not use the Results module.`} /> : null}

        {d && who ? (
          <View style={loading ? { opacity: 0.55 } : undefined}>
            <Text style={s.who}>{who.name}</Text>
            <Text style={s.whoSub}>{[classLine(who), who.rollNumber ? `Roll ${who.rollNumber}` : '', who.yearName].filter(Boolean).join(' · ')}</Text>

            {promoted ? (
              <View style={s.promo}>
                <Ionicons name="school" size={18} color={Colors.success} />
                <Text style={s.promoText}>
                  {moveText(promoted)} {[promoted.to?.className, promoted.to?.sectionName].filter(Boolean).join(' – ')}
                  {promoted.to?.yearName ? ` for ${promoted.to.yearName}` : ''}
                </Text>
              </View>
            ) : null}

            <Tiles items={[
              { label: 'Exams Published', value: st?.exams ?? 0, icon: 'document-text-outline', tone: 'primary', cap: st?.exams ? `${st.passed} passed` : 'None yet' },
              { label: 'Average Score', value: pct(st?.avgPct), icon: 'analytics-outline', tone: 'info', cap: 'Across every exam' },
              { label: 'Best Result', value: st?.best ? pct(st.best.percentage) : '—', icon: 'trophy-outline', tone: 'success', cap: st?.best ? st.best.title : 'No result yet' },
              { label: 'Class Tests', value: st?.tests ?? 0, icon: 'clipboard-outline', tone: 'warning', cap: st?.testAvgPct != null ? `Average ${pct(st.testAvgPct)}` : 'No marks yet' },
            ]} />

            <Overall o={d.overall} />
            {exams.length ? (
              <TouchableOpacity style={s.entry} activeOpacity={0.75}
                onPress={() => router.push({ pathname: '/modules/report-card', params: parent && d?.child ? { child: String(d.child) } : {} } as any)}>
                <View style={s.entryIcon}><Ionicons name="ribbon-outline" size={18} color={Colors.primary} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.entryTitle}>Report Card</Text>
                  <Text style={s.sub} numberOfLines={1}>The year on one sheet — share it as a PDF</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
              </TouchableOpacity>
            ) : null}

            <SegTabs active={tab} onChange={setTab} tabs={[
              { key: 'exams', label: `Exams${exams.length ? ` (${exams.length})` : ''}` },
              { key: 'tests', label: `Class Tests${tests.length ? ` (${tests.length})` : ''}` },
            ]} />

            {tab === 'exams' ? (
              exams.length ? exams.map((r: any, i: number) => (
                <Scorecard key={r._id} r={r} open={i === 0}
                  onRecheck={async (body) => {
                    await (parent ? R.parentRecheck({ ...body, childId: d?.child || undefined }) : R.studentRecheck(body));
                    await load();
                  }} />
              ))
                : <Empty icon="bar-chart-outline" text="No results have been published yet." />
            ) : null}

            {tab === 'tests' ? (
              tests.length ? tests.map((x: any) => {
                const m = x.mine;
                return (
                  <View key={x._id} style={s.card}>
                    <View style={s.rowTop}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.title} numberOfLines={2}>{x.title}</Text>
                        <Text style={s.sub}>{[x.subjectName, x.topic, fmtDay(x.testDate)].filter(Boolean).join(' · ')}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={s.score}>{!m ? '—' : m.isAbsent ? 'AB' : m.marksObtained == null ? '—' : `${m.marksObtained}/${x.maxMarks}`}</Text>
                        {m?.grade ? <GradePill grade={m.grade} scale={x.scale} /> : null}
                      </View>
                    </View>
                    <Text style={s.lineSub}>
                      {!m ? 'No mark recorded' : m.isAbsent ? 'Absent' : m.isPassed ? 'Passed' : `Below the pass mark (${x.passingMarks})`}
                      {x.classFigures?.average != null ? ` · class average ${Math.round(x.classFigures.average * 10) / 10}/${x.maxMarks}` : ''}
                    </Text>
                  </View>
                );
              }) : <Empty icon="clipboard-outline" text="No class test marks yet." />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  body: { padding: Spacing.md, paddingBottom: 100 },
  headBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { ...Typography.h4, color: Colors.text },
  sub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  note: { fontSize: 11, color: Colors.warning, fontWeight: '600', marginTop: 6 },
  hint: { fontSize: 12, color: Colors.textSecondary, marginBottom: 10 },
  line: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  lineName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  lineSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 6 },
  figs: { flexDirection: 'row', gap: 6, marginTop: 10 },
  fig: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.md, backgroundColor: Colors.surfaceAlt },
  figV: { fontSize: 14, fontWeight: '700', color: Colors.text },
  figL: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  who: { ...Typography.h3, color: Colors.text },
  whoSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, marginBottom: Spacing.md },
  promo: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, marginBottom: Spacing.md,
    borderRadius: Radius.lg, backgroundColor: Colors.successLight,
  },
  promoText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#14532D' },
  score: { fontSize: 15, fontWeight: '700', color: Colors.text },
  entry: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: 12, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  entryIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  entryTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
});
