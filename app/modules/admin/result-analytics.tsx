/**
 * Result analytics, for the office, on the phone (Oct 2026) — published
 * results summed (GET /admin/results/analytics): the figures, results by
 * grade and by score band, each subject and section, the top students and
 * those who need support. No chart library exists in the app, so the bars are
 * drawn from Views, every one labelled with its number.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Radius } from '@/constants/theme';
import * as R from '@/api/results.api';
import { Empty, LoaderView, Select, unwrap } from '@/components/ui/kit';
import { GradePill, gradeColor, pct, classLine } from '@/components/results/parts';
import { Figs, os } from '@/components/results/office';

/** One labelled bar: what it is, how long, its number. */
function Bar({ label, value, max, color, note }: { label: string; value: number; max: number; color: string; note?: string }) {
  return (
    <View style={x.bar}>
      <Text style={x.barLabel} numberOfLines={1}>{label}</Text>
      <View style={x.barTrack}>
        <View style={[x.barFill, { width: `${max ? Math.max(value ? 3 : 0, (value / max) * 100) : 0}%`, backgroundColor: color }]} />
      </View>
      <Text style={x.barValue}>{note ?? value}</Text>
    </View>
  );
}

export default function OfficeAnalyticsScreen() {
  const [q, setQ] = useState<{ academicYear?: string; classNumber?: string }>({});
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setD(unwrap(await R.office.analytics(q))); setError(''); }
    catch (err: any) { setError(err?.message || 'Analytics could not be loaded'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [q]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  const k = d?.kpis || {};
  const gradeMax = Math.max(1, ...((d?.grades || []).map((g: any) => g.count)));
  const bandMax = Math.max(1, ...((d?.bands || []).map((b: any) => b.count)));
  return (
    <>
      <Stack.Screen options={{ title: 'Result Analytics' }} />
      <ScrollView style={os.screen} contentContainerStyle={os.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        {d ? (
          <View style={os.card}>
            <Select label="Academic year" value={q.academicYear || ''} onChange={(v) => setQ((x2) => ({ ...x2, academicYear: v }))}
              options={[{ value: '', label: 'All years' }, ...(d.filters?.years || []).map((y: any) => ({ value: String(y._id), label: `${y.yearName}${y.current ? ' (current)' : ''}` }))]} />
            <Select label="Class" value={q.classNumber || ''} onChange={(v) => setQ((x2) => ({ ...x2, classNumber: v }))}
              options={[{ value: '', label: 'All classes' }, ...(d.filters?.classes || []).map((c: any) => ({ value: String(c.classNumber), label: c.className }))]} />
          </View>
        ) : null}
        {loading && !d ? <LoaderView /> : null}
        {!loading && error && !d ? <Empty icon="cloud-offline-outline" text={error} /> : null}
        {d && !k.results ? <Empty icon="stats-chart-outline" text="No published results here yet." /> : null}

        {d && k.results ? (
          <View style={loading ? { opacity: 0.55 } : undefined}>
            <View style={os.card}>
              <Figs cols={2} items={[
                { label: 'Exams published', value: k.exams },
                { label: 'Results', value: k.results },
                { label: 'Pass rate', value: pct(k.passPct) },
                { label: 'Average', value: pct(k.avgPct) },
                { label: 'Highest', value: pct(k.topPct) },
                { label: `Distinctions (${k.distinctionPercent ?? 75}%+)`, value: k.distinctions },
              ]} />
            </View>

            <View style={os.card}>
              <Text style={os.cap}>RESULTS BY GRADE</Text>
              {(d.grades || []).map((g: any) => (
                <Bar key={g.grade} label={g.grade} value={g.count} max={gradeMax} color={gradeColor(g.grade, d.grades).fg} note={`${g.count} · ${g.pct}%`} />
              ))}
            </View>

            <View style={os.card}>
              <Text style={os.cap}>RESULTS BY SCORE</Text>
              {(d.bands || []).slice().reverse().map((b: any) => (
                <Bar key={b.from} label={`${b.from}–${b.to}%`} value={b.count} max={bandMax} color={b.from >= 33 ? Colors.primary : Colors.danger} />
              ))}
            </View>

            {d.subjects?.length ? (
              <View style={os.card}>
                <Text style={os.cap}>SUBJECTS</Text>
                {d.subjects.map((s2: any) => (
                  <View key={s2.subjectName} style={os.line}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={os.lineName} numberOfLines={1}>{s2.subjectName}</Text>
                      <Text style={os.lineSub}>{s2.appeared} sat{s2.absent ? ` · ${s2.absent} absent` : ''} · {pct(s2.passPct)} passed · top {pct(s2.topPct)}</Text>
                    </View>
                    <Text style={x.big}>{pct(s2.avgPct)}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {d.sections?.length ? (
              <View style={os.card}>
                <Text style={os.cap}>SECTIONS</Text>
                {d.sections.map((s2: any) => (
                  <View key={s2._id} style={os.line}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={os.lineName} numberOfLines={1}>{classLine(s2)}</Text>
                      <Text style={os.lineSub}>{s2.exams} exams · {s2.results} results · {pct(s2.passPct)} passed</Text>
                    </View>
                    <Text style={x.big}>{pct(s2.avgPct)}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {d.top?.length ? (
              <View style={os.card}>
                <Text style={os.cap}>TOP STUDENTS</Text>
                {d.top.slice(0, 10).map((t: any, i: number) => (
                  <View key={`${t._id || t.name}${i}`} style={os.line}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={os.lineName} numberOfLines={1}>{t.name}</Text>
                      <Text style={os.lineSub} numberOfLines={1}>{[classLine(t), t.title].filter(Boolean).join(' · ')}</Text>
                    </View>
                    <Text style={x.big}>{pct(t.percentage)}</Text>
                    <GradePill grade={t.grade} />
                  </View>
                ))}
              </View>
            ) : null}

            {d.support?.length ? (
              <View style={os.card}>
                <Text style={os.cap}>NEED SUPPORT</Text>
                {d.support.slice(0, 10).map((t: any, i: number) => (
                  <View key={`${t._id || t.name}${i}`} style={os.line}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={os.lineName} numberOfLines={1}>{t.name}</Text>
                      <Text style={os.lineSub} numberOfLines={1}>{[classLine(t), t.title, t.failedSubjects ? `${t.failedSubjects} subjects not passed` : ''].filter(Boolean).join(' · ')}</Text>
                    </View>
                    <Text style={[x.big, { color: Colors.danger }]}>{pct(t.percentage)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}

const x = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  barLabel: { width: 58, fontSize: 12, fontWeight: '600', color: Colors.text },
  barTrack: { flex: 1, height: 12, borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: Radius.full },
  barValue: { minWidth: 56, fontSize: 11.5, fontWeight: '700', color: Colors.textSecondary, textAlign: 'right' },
  big: { fontSize: 14, fontWeight: '700', color: Colors.text },
});
