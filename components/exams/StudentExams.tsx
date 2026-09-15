import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as studentApi from '@/api/student.api';
import {
  unwrap, LoaderView, Empty, Card, SegTabs, FormModal, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import {
  ExamMark, AttemptPill, ScoreBar, Outcome, Fact, Figures, Figure, fmtExamDay, fmtClock, fmtClockRange,
  fmtEndClock, fmtGap, plural,
} from './parts';

/**
 * Student → My Aptitude Exams.
 *
 * What matters in the order it matters: a paper open right now with the time it
 * closes, what is coming up, what is waiting on results, and results that are
 * out. Starting goes through the instructions first — the timer begins the
 * moment the paper opens.
 */

const FINISHED = ['submitted', 'auto_submitted'];
const err = (e: any) => e?.data?.message ?? e?.message ?? 'Something went wrong';

function standing(e: any, now: number) {
  const done = FINISHED.includes(e.attempt?.status);
  if (done && e.resultsReleased) return 'result';
  if (done) return 'awaiting';
  if (e.canAttempt) return 'live';
  if (now < new Date(e.opensAt).getTime()) return 'upcoming';
  return 'missed';
}

export default function StudentExams({ onBlocked }: { onBlocked: () => void }) {
  const router = useRouter();
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<string | null>(null);
  const [starting, setStarting] = useState<any>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try { setExams(unwrap(await studentApi.getExams()) ?? []); }
    catch (e: any) {
      if (MODULE_BLOCKED_CODES.includes(e?.data?.code)) onBlocked();
      else Alert.alert('Could not load exams', err(e));
    } finally { setLoading(false); setRefreshing(false); }
  }, [onBlocked]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const g = useMemo(() => {
    const out: Record<string, any[]> = { live: [], upcoming: [], awaiting: [], missed: [], result: [] };
    exams.forEach((e) => out[standing(e, now)].push(e));
    out.upcoming.sort((a, b) => +new Date(a.opensAt) - +new Date(b.opensAt));
    return out;
  }, [exams, Math.floor(now / 30000)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LoaderView />;

  const results = g.result;
  const avg = results.length ? Math.round(results.reduce((n, e) => n + (e.result?.percentage ?? 0), 0) / results.length) : null;
  const active = tab ?? (g.upcoming.length ? 'upcoming' : results.length ? 'results' : 'awaiting');

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {g.live.map((e) => {
          const inProgress = e.attempt?.status === 'in_progress';
          return (
            <View key={e._id} style={s.live}>
              <View style={s.liveTop}>
                <View style={s.liveBadge}><View style={s.liveDot} /><Text style={s.liveBadgeText}>LIVE NOW</Text></View>
                <Text style={s.liveClock}>{fmtGap(+new Date(e.closesAt) - now)} left</Text>
              </View>
              <Text style={s.liveTitle}>{e.title}</Text>
              <Text style={s.liveMeta}>
                {e.subject?.subjectName ?? 'General Aptitude'} · {plural(e.questionCount, 'question')} · {e.totalMarks} marks · closes {fmtEndClock(e)}
              </Text>
              <TouchableOpacity
                style={s.liveCta}
                activeOpacity={0.85}
                onPress={() => (inProgress ? router.push({ pathname: '/modules/exam-attempt', params: { id: e._id } } as any) : setStarting(e))}
              >
                <Text style={s.liveCtaText}>{inProgress ? 'Resume exam' : 'Start exam'}</Text>
                <Ionicons name="arrow-forward" size={15} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          );
        })}

        <Figures>
          <Figure label="Upcoming" value={g.upcoming.length} icon="calendar" tone="info" />
          <Figure label="Awaiting" value={g.awaiting.length} icon="hourglass" tone="warning" />
          <Figure label="Results" value={results.length} icon="trophy" tone="success" />
          <Figure label="Average" value={avg == null ? '--' : `${avg}%`} icon="stats-chart" tone="neutral" />
        </Figures>

        <SegTabs
          active={active}
          onChange={setTab}
          tabs={[
            { key: 'upcoming', label: `Upcoming ${g.upcoming.length}` },
            { key: 'awaiting', label: `Awaiting results ${g.awaiting.length + g.missed.length}` },
            { key: 'results', label: `Results ${results.length}` },
          ]}
        />

        {active === 'upcoming' && (g.upcoming.length === 0
          ? <Empty icon="calendar-outline" text="Nothing coming up" />
          : g.upcoming.map((e) => (
            <Card key={e._id}>
              <View style={s.row}>
                <View style={s.date}>
                  <Text style={s.dateMon}>{fmtExamDay(e).split(' ')[1]}</Text>
                  <Text style={s.dateDay}>{fmtExamDay(e).split(' ')[0]}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.title} numberOfLines={2}>{e.title}</Text>
                  <Text style={s.sub}>{e.subject?.subjectName ?? 'General Aptitude'}</Text>
                  <View style={s.facts}>
                    <Fact icon="time-outline" text={fmtClockRange(e)} />
                    <Fact icon="list-outline" text={plural(e.questionCount, 'question')} />
                    <Fact icon="trophy-outline" text={`${e.totalMarks} marks`} />
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.opensLabel}>Opens in</Text>
                  <Text style={s.opensIn}>{fmtGap(+new Date(e.opensAt) - now)}</Text>
                </View>
              </View>
            </Card>
          )))}

        {active === 'awaiting' && (g.awaiting.length + g.missed.length === 0
          ? <Empty icon="hourglass-outline" text="Nothing waiting on results" />
          : [...g.awaiting, ...g.missed].map((e) => {
            const missed = !FINISHED.includes(e.attempt?.status);
            return (
              <Card key={e._id}>
                <View style={s.row}>
                  <ExamMark exam={e} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.title} numberOfLines={2}>{e.title}</Text>
                    <Text style={s.sub}>{e.subject?.subjectName ?? 'General Aptitude'} · {fmtExamDay(e)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <AttemptPill status={missed ? 'missed' : e.attempt.status} />
                    <Text style={s.sub}>
                      {missed ? 'Not attempted'
                        : e.resultPublishDate ? `Results ${fmtExamDay({ examDate: e.resultPublishDate })}` : 'Results pending'}
                    </Text>
                  </View>
                </View>
              </Card>
            );
          }))}

        {active === 'results' && (results.length === 0
          ? <Empty icon="trophy-outline" text="No results published yet" />
          : results.map((e) => (
            <TouchableOpacity key={e._id} activeOpacity={0.8} onPress={() => router.push({ pathname: '/modules/exam-result', params: { id: e._id } } as any)}>
              <Card>
                <View style={s.row}>
                  <ExamMark exam={e} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.title} numberOfLines={2}>{e.title}</Text>
                    <Text style={s.sub}>{e.subject?.subjectName ?? 'General Aptitude'} · {fmtExamDay(e)}</Text>
                    <View style={{ marginTop: 8, gap: 4 }}>
                      <Text style={s.sub}>{e.result.score} of {e.totalMarks} marks</Text>
                      <ScoreBar value={e.result.percentage} />
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Outcome passed={e.result.passed} />
                    <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          )))}
      </ScrollView>

      <FormModal
        visible={!!starting}
        title="Before you start"
        onClose={() => setStarting(null)}
        submitLabel="Start now"
        onSubmit={() => { const e = starting; setStarting(null); router.push({ pathname: '/modules/exam-attempt', params: { id: e._id } } as any); }}
      >
        {starting && (
          <View style={{ gap: 12 }}>
            <Text style={s.rulesTitle}>{starting.title}</Text>
            <View style={s.rulesFacts}>
              <RuleFact value={starting.questionCount} label="questions" />
              <RuleFact value={starting.totalMarks} label="marks" />
              <RuleFact value={starting.duration} label="minutes" />
            </View>
            {[
              `The timer starts as soon as the paper opens and does not pause. The exam also ends at ${fmtEndClock(starting)}.`,
              'Answers save the moment you pick them. You can move between questions until you submit.',
              `Leaving the app is recorded. After ${plural(starting.maxViolations ?? 3, 'switch', 'switches')} your paper is submitted automatically.`,
              'Multiple-choice questions score only when every correct option is chosen.',
            ].map((t) => (
              <View key={t} style={s.rule}>
                <Ionicons name="ellipse" size={6} color={Colors.primary} style={{ marginTop: 6 }} />
                <Text style={s.ruleText}>{t}</Text>
              </View>
            ))}
          </View>
        )}
      </FormModal>
    </>
  );
}

const RuleFact = ({ value, label }: { value: any; label: string }) => (
  <View style={s.ruleFact}>
    <Text style={s.ruleFactValue}>{value ?? '--'}</Text>
    <Text style={s.ruleFactLabel}>{label}</Text>
  </View>
);

const s = StyleSheet.create({
  live: { backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md },
  liveTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 9, paddingVertical: 3, borderRadius: Radius.full },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#6EE7B7' },
  liveBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.6 },
  liveClock: { fontSize: 13, fontWeight: '800', color: '#fff' },
  liveTitle: { fontSize: 17, fontWeight: '700', color: '#fff', marginTop: 10 },
  liveMeta: { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 3, lineHeight: 16 },
  liveCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff', borderRadius: Radius.md, paddingVertical: 11, marginTop: 12 },
  liveCtaText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 14, fontWeight: '600', color: Colors.text },
  sub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  date: { width: 46, height: 50, borderRadius: Radius.md, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  dateMon: { fontSize: 10, fontWeight: '800', color: '#4338CA', textTransform: 'uppercase' },
  dateDay: { fontSize: 18, fontWeight: '800', color: '#4338CA' },
  opensLabel: { fontSize: 10, color: Colors.textLight },
  opensIn: { fontSize: 13, fontWeight: '800', color: Colors.primary },

  rulesTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  rulesFacts: { flexDirection: 'row', gap: 8 },
  ruleFact: { flex: 1, alignItems: 'center', backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, paddingVertical: 10 },
  ruleFactValue: { fontSize: 18, fontWeight: '800', color: Colors.text },
  ruleFactLabel: { fontSize: 10, color: Colors.textSecondary },
  rule: { flexDirection: 'row', gap: 8 },
  ruleText: { flex: 1, minWidth: 0, fontSize: 12, color: Colors.text, lineHeight: 18 },
});
