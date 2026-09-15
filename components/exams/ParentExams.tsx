import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as parentApi from '@/api/parent.api';
import {
  LoaderView, Empty, Card, SegTabs, FormModal, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import { MiniColumns, VizCard } from '@/components/ui/viz';
import {
  ExamMark, AttemptPill, ScoreBar, Outcome, StagePill, Pill, Fact, Figures, Figure,
  fmtExamDay, fmtClockRange, fmtGap, plural,
} from './parts';

/**
 * Parent → Aptitude Exams.
 *
 * One child at a time, with a switch when there is more than one — this used to
 * show only the first child. Results with the score split, what is coming up,
 * and what is still waiting on results. The question-by-question paper stays
 * with the student.
 */

const err = (e: any) => e?.data?.message ?? e?.message ?? 'Something went wrong';

export default function ParentExams({ onBlocked }: { onBlocked: () => void }) {
  const [child, setChild] = useState('');
  const [res, setRes] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('results');
  const [open, setOpen] = useState<any>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try { setRes(await parentApi.getExamResults(child ? { child } : undefined)); }
    catch (e: any) {
      if (MODULE_BLOCKED_CODES.includes(e?.data?.code)) onBlocked();
      else Alert.alert('Could not load exams', err(e));
    } finally { setLoading(false); setRefreshing(false); }
  }, [child, onBlocked]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  if (loading && !res) return <LoaderView />;

  const results: any[] = res?.data ?? [];
  const upcoming: any[] = res?.upcoming ?? [];
  const pending: any[] = res?.pending ?? [];
  const children: any[] = res?.children ?? [];
  const current = children.find((c) => String(c._id) === String(res?.child)) ?? children[0];
  const first = current?.name?.split(/\s+/)[0] ?? 'Your child';

  const sat = results.filter((e) => e.attempt);
  const avg = sat.length ? Math.round(sat.reduce((n, e) => n + e.attempt.percentage, 0) / sat.length) : null;
  const passed = sat.filter((e) => e.attempt.passed).length;
  const trend = [...sat].reverse().slice(-6).map((e) => ({ label: e.title.split(' ')[0], value: e.attempt.percentage }));

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {children.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: Spacing.md }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {children.map((c) => {
                const on = String(c._id) === String(res?.child);
                return (
                  <TouchableOpacity key={c._id} style={[s.kid, on && s.kidOn]} onPress={() => setChild(String(c._id))} activeOpacity={0.8}>
                    <View style={[s.kidAvatar, on && { backgroundColor: Colors.primary }]}>
                      <Text style={[s.kidInitial, on && { color: '#fff' }]}>{(c.name ?? '?').slice(0, 1)}</Text>
                    </View>
                    <View>
                      <Text style={[s.kidName, on && { color: Colors.primary }]} numberOfLines={1}>{c.name}</Text>
                      <Text style={s.kidClass} numberOfLines={1}>{c.className || 'No class yet'}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}

        {children.length === 0 ? (
          <Empty icon="people-outline" text="No children linked to your account yet" />
        ) : (
          <>
            <Figures>
              <Figure label="Exams taken" value={sat.length} icon="documents" tone="info" />
              <Figure label="Average" value={avg == null ? '--' : `${avg}%`} icon="trophy" tone="success" />
              <Figure label="Passed" value={sat.length ? `${passed}/${sat.length}` : '--'} icon="checkmark-circle" tone="neutral" />
              <Figure label="Upcoming" value={upcoming.length} icon="calendar" tone={upcoming.some(e => e.stage === 'live') ? 'success' : 'neutral'} />
            </Figures>

            <SegTabs
              active={tab}
              onChange={setTab}
              tabs={[
                { key: 'results', label: `Results ${results.length}` },
                { key: 'upcoming', label: `Coming up ${upcoming.length}` },
                ...(pending.length ? [{ key: 'pending', label: `Awaiting ${pending.length}` }] : []),
                ...(trend.length ? [{ key: 'trend', label: 'Trend' }] : []),
              ]}
            />

            {tab === 'results' && (results.length === 0
              ? <Empty icon="trophy-outline" text={`Results appear once ${first}’s teachers publish them`} />
              : results.map((e) => (
                <TouchableOpacity key={e._id} activeOpacity={e.attempt ? 0.8 : 1} onPress={() => e.attempt && setOpen(e)}>
                  <Card>
                    <View style={s.row}>
                      <ExamMark exam={{ title: e.title, subjectName: e.subject?.subjectName }} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.title} numberOfLines={2}>{e.title}</Text>
                        <Text style={s.sub}>{e.subject?.subjectName ?? 'General Aptitude'} · {fmtExamDay(e)}</Text>
                        {e.attempt && (
                          <View style={{ marginTop: 8, gap: 4 }}>
                            <Text style={s.sub}>{e.attempt.score} of {e.totalMarks} marks</Text>
                            <ScoreBar value={e.attempt.percentage} />
                          </View>
                        )}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        {e.attempt ? <Outcome passed={e.attempt.passed} /> : <AttemptPill status="missed" />}
                        {e.attempt && <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />}
                      </View>
                    </View>
                  </Card>
                </TouchableOpacity>
              )))}

            {tab === 'upcoming' && (upcoming.length === 0
              ? <Empty icon="calendar-outline" text={`Nothing scheduled for ${first}`} />
              : upcoming.map((e) => (
                <Card key={e._id}>
                  <View style={s.row}>
                    <ExamMark exam={{ title: e.title, subjectName: e.subject?.subjectName }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.title} numberOfLines={2}>{e.title}</Text>
                      <Text style={s.sub}>{fmtExamDay(e)} · {fmtClockRange(e)}</Text>
                      <View style={s.facts}>
                        <Fact icon="list-outline" text={plural(e.questionCount, 'question')} />
                        <Fact icon="trophy-outline" text={`${e.totalMarks} marks`} />
                      </View>
                    </View>
                    {e.stage === 'live'
                      ? <StagePill stage="live" />
                      : <Text style={s.inText}>in {fmtGap(+new Date(e.opensAt) - now)}</Text>}
                  </View>
                </Card>
              )))}

            {tab === 'pending' && pending.map((e) => (
              <Card key={e._id}>
                <View style={s.row}>
                  <ExamMark exam={{ title: e.title, subjectName: e.subject?.subjectName }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.title} numberOfLines={2}>{e.title}</Text>
                    <Text style={s.sub}>
                      {['submitted', 'auto_submitted'].includes(e.attemptStatus)
                        ? (e.resultPublishDate ? `Results on ${fmtExamDay({ examDate: e.resultPublishDate })}` : 'Submitted · results pending')
                        : 'Not attempted'}
                    </Text>
                  </View>
                </View>
              </Card>
            ))}

            {tab === 'trend' && (
              <VizCard title="Score trend" subtitle="Last six results, oldest first">
                <MiniColumns data={trend} unit="%" />
              </VizCard>
            )}
          </>
        )}
      </ScrollView>

      <FormModal visible={!!open} title={open?.title ?? 'Result'} onClose={() => setOpen(null)}>
        {open?.attempt && (
          <View style={{ gap: 12 }}>
            <View style={s.detailHead}>
              <View>
                <Text style={s.detailScore}>{open.attempt.score} / {open.totalMarks}</Text>
                <Text style={s.sub}>{open.attempt.percentage}% · pass mark {open.passMark}</Text>
              </View>
              <Outcome passed={open.attempt.passed} />
            </View>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Pill label={`${open.attempt.correct} correct`} tone="good" />
              <Pill label={`${open.attempt.incorrect} incorrect`} tone="bad" />
              <Pill label={`${open.attempt.unanswered} not answered`} />
            </View>
            <Text style={s.sub}>
              {fmtExamDay(open)} · {fmtClockRange(open)} · {plural(open.questionCount, 'question')}
              {open.attempt.status === 'auto_submitted' ? ' · submitted automatically' : ''}
            </Text>
            <Text style={s.note}>{first} can open the full question-by-question review from their own account.</Text>
          </View>
        )}
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  kid: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, maxWidth: 220 },
  kidOn: { borderColor: Colors.primary, backgroundColor: '#EDE9FE' },
  kidAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  kidInitial: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary },
  kidName: { fontSize: 12, fontWeight: '700', color: Colors.text },
  kidClass: { fontSize: 10, color: Colors.textSecondary },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 14, fontWeight: '600', color: Colors.text },
  sub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  inText: { fontSize: 11, fontWeight: '700', color: Colors.primary },

  detailHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailScore: { fontSize: 22, fontWeight: '800', color: Colors.text },
  note: { fontSize: 11, color: Colors.textLight, lineHeight: 16 },
});
