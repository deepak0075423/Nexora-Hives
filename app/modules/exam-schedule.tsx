/**
 * Exam Schedule on the phone (Oct 2026) — the exams' own papers, as the web's
 * Exam Schedule pages show them (school-backend services/resultSchedule):
 *
 *   student   their section's exams
 *   parent    each child's, one child at a time, at any school they are a
 *             parent at
 *   teacher   the sections they teach or look after — their own papers marked
 *
 * The next paper still to be sat leads the screen. Exams that are on or still
 * to come are listed first; finished ones are folded away beneath them.
 *
 * Since Oct 2026, from the school's published exam day plans: a teacher's
 * invigilation duties lead their screen, and a student's room and seat sit
 * beside each paper; a family shares the school's admit card for an exam.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as R from '@/api/results.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Empty, LoaderView, unwrap, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import { saveAndShare } from '@/components/payroll/parts';
import { KidSwitch, Pill, fmtDayShort, fmtRange, fmtTimeRange, classLine, plural } from '@/components/results/parts';

const WHEN: Record<string, { label: string; fg: string; bg: string }> = {
  ongoing: { label: 'On now', fg: Colors.success, bg: Colors.successLight },
  upcoming: { label: 'Coming up', fg: Colors.info, bg: Colors.infoLight },
  completed: { label: 'Finished', fg: Colors.textSecondary, bg: Colors.surfaceAlt },
};

const timeOf = (p: any) => fmtTimeRange(p.startTime, p.endTime);

function ExamCard({ e, teacher, seats, onAdmitCard }: { e: any; teacher: boolean; seats?: Map<string, any>; onAdmitCard?: (e: any) => void }) {
  const w = WHEN[e.when] || WHEN.upcoming;
  return (
    <View style={s.card}>
      <View style={s.rowTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={2}>{e.title}</Text>
          <Text style={s.sub}>{[e.examTypeLabel, classLine(e), fmtRange(e.startDate, e.endDate)].filter(Boolean).join(' · ')}</Text>
        </View>
        <Pill label={w.label} fg={w.fg} bg={w.bg} />
      </View>
      {teacher && e.myClass ? <Text style={s.mine}>Your class</Text> : null}
      {e.description ? <Text style={s.desc}>{e.description}</Text> : null}
      <View style={s.papers}>
        {e.papers.map((p: any) => (
          <View key={p.subjectId} style={[s.paper, p.done && s.paperDone, p.today && s.paperToday]}>
            <View style={s.paperDay}>
              <Text style={[s.paperDate, p.today && { color: Colors.accent }]}>{p.date ? fmtDayShort(p.date) : 'Date to come'}</Text>
              {timeOf(p) ? <Text style={s.paperTime}>{timeOf(p)}</Text> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.paperName, p.done && { color: Colors.textSecondary }]} numberOfLines={1}>
                {p.subjectName}{teacher && p.mine ? '  ·  yours' : ''}
              </Text>
              <Text style={s.paperSub}>Max {p.maxMarks} · pass {p.passingMarks}{p.today ? ' · today' : p.done ? ' · done' : ''}</Text>
              {seats?.get(`${e._id}:${p.subjectId}`) ? (() => {
                const x = seats.get(`${e._id}:${p.subjectId}`);
                return <Text style={s.seat}>{x.roomName}{x.roomNumber && x.roomNumber !== x.roomName ? ` (${x.roomNumber})` : ''} · seat {x.seat}</Text>;
              })() : null}
            </View>
          </View>
        ))}
        {!e.papers.length ? <Text style={s.paperSub}>No papers set yet.</Text> : null}
      </View>
      {e.results?.published ? (
        <Text style={s.res}>{e.results.visible === false ? 'Results published — they reach families on the result date.' : 'Results are out — see Results.'}</Text>
      ) : onAdmitCard && e.when !== 'completed' ? (
        <TouchableOpacity style={s.admit} onPress={() => onAdmitCard(e)} accessibilityRole="button">
          <Ionicons name="id-card-outline" size={15} color={Colors.primary} />
          <Text style={s.admitText}>Share the admit card</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function ExamScheduleScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ child?: string }>();
  const role = user?.role;
  const [childId, setChildId] = useState(String(params.child || ''));
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    if (!role) return;
    try {
      const res = role === 'teacher' ? await R.teacherSchedule()
        : role === 'parent' ? await R.parentSchedule(childId || undefined) : await R.studentSchedule();
      setD(unwrap(res)); setError('');
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else setError(err?.message || 'The exam schedule could not be loaded');
    } finally { setLoading(false); setRefreshing(false); }
  }, [role, childId]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  if (disabled) return (<><Stack.Screen options={{ title: 'Exam Schedule' }} /><ModuleDisabled /></>);
  const teacher = role === 'teacher';
  const exams = d?.exams || [];
  const live = exams.filter((e: any) => e.when !== 'completed');
  const done = exams.filter((e: any) => e.when === 'completed');
  const next = d?.next;
  const children = d?.children || [];
  const seats = new Map<string, any>((d?.seats || []).map((x: any) => [`${x.exam}:${x.subject}`, x]));
  const admitCard = async (e: any) => {
    const who = String(d?.student?.name || 'student').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await saveAndShare(() => (role === 'parent' ? R.parentAdmitCard(d?.child || childId || undefined, String(e._id)) : R.studentAdmitCard(String(e._id))),
      `admit-card-${who}-${String(e.title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Exam Schedule' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        {role === 'parent' ? <KidSwitch kids={children} value={d?.child} onPick={setChildId} caption="WHOSE EXAMS" showSchool={!!d?.multiSchool} /> : null}
        {loading && !d ? <LoaderView /> : null}
        {!d && error ? <Empty icon="cloud-offline-outline" text={error} /> : null}
        {d && role === 'parent' && !children.length ? <Empty icon="people-outline" text="No children are linked to your account yet." /> : null}
        {d && role === 'parent' && children.length > 0 && d.resultsOn === false ? <Empty icon="calendar-outline" text={`${d.school?.name || 'This school'} does not use the Results module.`} /> : null}

        {d && (role !== 'parent' || (children.length && d.resultsOn !== false)) ? (
          <View style={loading ? { opacity: 0.55 } : undefined}>
            {d.student ? <Text style={s.who}>{d.student.name}{classLine(d.student) ? ` · ${classLine(d.student)}` : ''}</Text> : null}
            {teacher && d.sections?.length ? (
              <Text style={s.who}>{plural(d.sections.filter((x: any) => x.current).length, 'section')} you teach or look after</Text>
            ) : null}

            {teacher && d.duties?.length ? (
              <View style={s.card}>
                <Text style={s.dutyCap}>YOUR INVIGILATION DUTIES</Text>
                {d.duties.map((x: any, i: number) => (
                  <View key={`${x.date}${x.startTime}${x.roomName}${i}`} style={[s.duty, i === 0 && { borderTopWidth: 0 }]}>
                    <Text style={s.paperDate}>{fmtDayShort(x.date)}{x.startTime ? ` · ${fmtTimeRange(x.startTime, x.endTime)}` : ''}</Text>
                    <Text style={s.paperName}>{x.roomName}{x.roomNumber && x.roomNumber !== x.roomName ? ` (${x.roomNumber})` : ''}{x.building ? ` · ${x.building}` : ''} · {plural(x.students, 'student')}</Text>
                    <Text style={s.paperSub}>{x.papers.map((p: any) => `${p.subjectName} ${classLine(p)}`).join(', ')}{x.with?.length ? ` · with ${x.with.join(', ')}` : ''}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {next ? (
              <View style={s.next}>
                <View style={s.nextIcon}><Ionicons name="alarm-outline" size={20} color={Colors.textInverse} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.nextCap}>{next.today ? 'TODAY' : 'NEXT PAPER'}</Text>
                  <Text style={s.nextName} numberOfLines={1}>{next.subjectName} · {next.exam?.title}</Text>
                  <Text style={s.nextSub}>{[fmtDayShort(next.date), timeOf(next), teacher ? classLine(next.exam) : ''].filter(Boolean).join(' · ')}</Text>
                </View>
              </View>
            ) : null}

            {live.length ? live.map((e: any) => <ExamCard key={e._id} e={e} teacher={teacher} seats={seats} onAdmitCard={teacher ? undefined : admitCard} />)
              : <Empty icon="calendar-outline" text={exams.length ? 'No exam is on or coming up.' : 'No exams have been scheduled yet.'} />}

            {done.length ? (
              <>
                <TouchableOpacity style={s.fold} onPress={() => setShowDone((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showDone }}>
                  <Text style={s.foldText}>{showDone ? 'Hide' : 'Show'} {plural(done.length, 'finished exam')}</Text>
                  <Ionicons name={showDone ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
                {showDone ? done.map((e: any) => <ExamCard key={e._id} e={e} teacher={teacher} />) : null}
              </>
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
  who: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: Spacing.md },
  next: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: Spacing.md,
    borderRadius: Radius.lg, backgroundColor: Colors.primary,
  },
  nextIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  nextCap: { fontSize: 10, fontWeight: '700', color: Colors.accentLight, letterSpacing: 0.8 },
  nextName: { fontSize: 15, fontWeight: '700', color: Colors.textInverse, marginTop: 2 },
  nextSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { ...Typography.h4, color: Colors.text },
  sub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  mine: { fontSize: 11, fontWeight: '700', color: Colors.accent, marginTop: 6 },
  desc: { fontSize: 12, color: Colors.textSecondary, marginTop: 6 },
  papers: { marginTop: 10, gap: 6 },
  paper: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border,
  },
  paperDone: { opacity: 0.6 },
  paperToday: { borderColor: Colors.accent, backgroundColor: '#FFF7ED' },
  paperDay: { width: 104 },
  paperDate: { fontSize: 12, fontWeight: '700', color: Colors.text },
  paperTime: { fontSize: 10.5, color: Colors.textSecondary, marginTop: 1 },
  paperName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  paperSub: { fontSize: 10.5, color: Colors.textSecondary, marginTop: 1 },
  res: { fontSize: 11, color: Colors.success, fontWeight: '600', marginTop: 10 },
  seat: { fontSize: 11, fontWeight: '700', color: '#3A3F8F', marginTop: 2 },
  admit: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  admitText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  dutyCap: { fontSize: 10, fontWeight: '800', color: '#1E2452', letterSpacing: 0.8, marginBottom: 4 },
  duty: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.divider, gap: 1 },
  fold: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  foldText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
});
