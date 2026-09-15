import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as studentApi from '@/api/student.api';
import { LoaderView, SegTabs } from '@/components/ui/kit';
import { TONE_COLOR, toneForPercent, VIZ } from '@/components/ui/viz';
import { ExamMark, Outcome, QuestionCard, fmtExamDay, fmtSpent, plural } from '@/components/exams/parts';

/**
 * Student → one exam's result.
 *
 * The score and whether it passed against what pass mark, how the answers
 * split, then every question with the student's answer and the correct one
 * marked in words as well as colour — filterable to just the ones they got
 * wrong or skipped.
 */

const msg = (e: any) => e?.data?.message ?? e?.message ?? '';

const fmtStamp = (d?: string | null) => {
  if (!d) return '--';
  const t = new Date(d);
  return `${t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}, ${t.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
};

export default function ExamResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = async () => {
    try {
      const res: any = await studentApi.getExamResult(id!);
      setData(res?.data ?? res); setError(null);
    } catch (e: any) { setError(msg(e) || 'Results are not published yet.'); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { if (id) load(); }, [id]);

  const groups = useMemo(() => {
    const all = (data?.questions ?? []).map((q: any, i: number) => ({ q, i }));
    return {
      all,
      incorrect: all.filter(({ q }: any) => q.selected?.length && !q.isCorrect),
      unanswered: all.filter(({ q }: any) => !q.selected?.length),
      correct: all.filter(({ q }: any) => q.isCorrect),
    };
  }, [data]);

  if (loading) return <><Stack.Screen options={{ title: 'Result' }} /><LoaderView /></>;

  if (error || !data?.exam) {
    return (
      <>
        <Stack.Screen options={{ title: 'Result' }} />
        <View style={s.center}>
          <Ionicons name="time-outline" size={44} color={Colors.textLight} />
          <Text style={s.errTitle}>Result not available yet</Text>
          <Text style={s.errText}>{error || 'Results are not published yet.'}</Text>
          <TouchableOpacity style={s.errBtn} onPress={() => router.back()}>
            <Text style={s.errBtnText}>Back to my exams</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  const exam = data.exam;
  const color = TONE_COLOR[toneForPercent(data.percentage)];
  const shown = (groups as any)[filter] ?? groups.all;

  return (
    <>
      <Stack.Screen options={{ title: 'Result' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <View style={s.hero}>
          <View style={s.heroTop}>
            <ExamMark exam={{ title: exam.title, subjectName: exam.subjectName }} size={34} />
            <Text style={s.heroSub} numberOfLines={2}>{exam.subjectName || 'General Aptitude'} · {fmtExamDay(exam)}</Text>
          </View>
          <Text style={s.heroTitle}>{exam.title}</Text>

          <View style={s.scoreRow}>
            <View style={s.ring}>
              <Text style={s.ringValue}>{data.percentage}%</Text>
              <Text style={s.ringLabel}>score</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <Text style={s.scoreLine}>
                You scored <Text style={s.b}>{data.score}</Text> out of <Text style={s.b}>{exam.totalMarks}</Text>
              </Text>
              <Outcome passed={data.passed} />
              <Text style={s.meta}>
                Pass mark {data.passMark} · submitted {fmtStamp(data.submittedAt)} · took {fmtSpent(data.timeTaken)}
              </Text>
            </View>
          </View>

          <View style={s.bar}>
            <View style={[s.barFill, { width: `${Math.max(0, Math.min(100, data.percentage))}%`, backgroundColor: color }]} />
          </View>

          {data.status === 'auto_submitted' && (
            <View style={s.warn}>
              <Ionicons name="alert-circle" size={15} color={Colors.warning} />
              <Text style={s.warnText}>
                This paper was submitted automatically
                {data.violationCount ? ` after ${plural(data.violationCount, 'violation')}` : ' when time ran out'}.
              </Text>
            </View>
          )}

          <View style={s.split}>
            <Split icon="checkmark-circle" color={Colors.success} value={data.correct} label="Correct" />
            <Split icon="close-circle" color={Colors.danger} value={data.incorrect} label="Incorrect" />
            <Split icon="remove-circle" color={Colors.textLight} value={data.unanswered} label="Not answered" />
          </View>
        </View>

        <Text style={s.section}>Question review</Text>
        <Text style={s.sectionSub}>Your answer and the correct answer for every question</Text>
        <SegTabs
          active={filter}
          onChange={setFilter}
          tabs={[
            { key: 'all', label: `All ${groups.all.length}` },
            { key: 'incorrect', label: `Wrong ${groups.incorrect.length}` },
            { key: 'unanswered', label: `Skipped ${groups.unanswered.length}` },
            { key: 'correct', label: `Right ${groups.correct.length}` },
          ]}
        />
        {shown.length === 0
          ? <Text style={s.none}>No questions in this group.</Text>
          : shown.map(({ q, i }: any) => <QuestionCard key={q._id} q={q} index={i} viewer="student" />)}
      </ScrollView>
    </>
  );
}

function Split({ icon, color, value, label }: { icon: string; color: string; value: number; label: string }) {
  return (
    <View style={s.splitItem}>
      <Ionicons name={icon as any} size={18} color={color} />
      <Text style={s.splitValue}>{value ?? 0}</Text>
      <Text style={s.splitLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: Spacing.lg, backgroundColor: Colors.background },
  errTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  errText: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },
  errBtn: { marginTop: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  errBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  hero: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 10, marginBottom: Spacing.md },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroSub: { flex: 1, minWidth: 0, fontSize: 11, color: Colors.textSecondary },
  heroTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  // A plain badge, not a progress arc — the bar below carries the amount.
  ring: { width: 84, height: 84, borderRadius: 42, borderWidth: 7, borderColor: VIZ.track, alignItems: 'center', justifyContent: 'center' },
  ringValue: { fontSize: 18, fontWeight: '800', color: Colors.text },
  ringLabel: { fontSize: 9, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  scoreLine: { fontSize: 13, color: Colors.text, lineHeight: 19 },
  b: { fontWeight: '800' },
  meta: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
  bar: { height: 7, borderRadius: 8, backgroundColor: VIZ.track, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 8 },
  warn: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', backgroundColor: Colors.warningLight, borderRadius: Radius.md, padding: 9 },
  warnText: { flex: 1, minWidth: 0, fontSize: 11, color: Colors.text, lineHeight: 16 },
  split: { flexDirection: 'row', gap: 8 },
  splitItem: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2, backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 4 },
  splitValue: { fontSize: 17, fontWeight: '800', color: Colors.text },
  splitLabel: { fontSize: 10, color: Colors.textSecondary, textAlign: 'center' },

  section: { fontSize: 15, fontWeight: '700', color: Colors.text },
  sectionSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, marginBottom: 10 },
  none: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', paddingVertical: 24 },
});
