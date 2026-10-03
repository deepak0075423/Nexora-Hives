/**
 * The merit list, for the office, on the phone (Oct 2026) — a class's
 * students in order of their results across all its sections, for one exam or
 * for the year's overall result (GET /admin/results/merit). Ties share a rank.
 * A withheld result is listed with its badge: families never see this list.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { Colors } from '@/constants/theme';
import * as R from '@/api/results.api';
import { Empty, LoaderView, Select, unwrap } from '@/components/ui/kit';
import { Pill, GradePill, PassPill, pct } from '@/components/results/parts';
import { os } from '@/components/results/office';

export default function OfficeMeritScreen() {
  const [q, setQ] = useState<{ academicYear?: string; classNumber?: string; exam?: string; limit: number }>({ limit: 50 });
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setD(unwrap(await R.office.merit(q))); setError(''); }
    catch (err: any) { setError(err?.message || 'The merit list could not be loaded'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [q]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  const rows = d?.rows || [];
  const distinction = d?.distinctionPercent ?? 75;
  return (
    <>
      <Stack.Screen options={{ title: 'Merit List' }} />
      <ScrollView style={os.screen} contentContainerStyle={os.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        {d ? (
          <View style={os.card}>
            <Select label="Academic year" value={String(d.year?._id || '')} onChange={(v) => setQ((x) => ({ ...x, academicYear: v, exam: undefined }))}
              options={(d.filters?.years || []).map((y: any) => ({ value: String(y._id), label: `${y.yearName}${y.current ? ' (current)' : ''}` }))} />
            <Select label="Class" value={d.classNumber != null ? String(d.classNumber) : ''} onChange={(v) => setQ((x) => ({ ...x, classNumber: v, exam: undefined }))}
              options={(d.filters?.classes || []).map((c: any) => ({ value: String(c.classNumber), label: c.className }))} />
            <Select label="Exam" value={String(d.exam || '')} onChange={(v) => setQ((x) => ({ ...x, exam: v }))}
              options={[...(d.exams || []).map((e: any) => ({ value: e.key, label: `${e.title}${e.sections > 1 ? ` · ${e.sections} sections` : ''}` })), { value: 'overall', label: 'The year’s overall result' }]} />
          </View>
        ) : null}
        {loading && !d ? <LoaderView /> : null}
        {!loading && error && !d ? <Empty icon="cloud-offline-outline" text={error} /> : null}
        {d && !rows.length ? (
          <Empty icon="trophy-outline" text={!d.year ? 'There is no academic year yet.' : d.exam === 'overall' ? 'No exam of this class counts in the overall result yet.' : 'This class has no published results this year.'} />
        ) : null}
        <View style={loading && d ? { opacity: 0.55 } : undefined}>
          {rows.map((r: any) => (
            <View key={r.student._id} style={[os.card, { paddingVertical: 10 }]}>
              <View style={[os.rowTop, { alignItems: 'center' }]}>
                <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: r.rank <= 3 ? '#FDF1D3' : Colors.surfaceAlt }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: Colors.text }}>{r.rank}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={os.lineName} numberOfLines={1}>{r.student.name}</Text>
                  <Text style={os.lineSub} numberOfLines={1}>{[r.sectionName ? `Section ${r.sectionName}` : '', r.student.rollNumber ? `Roll ${r.student.rollNumber}` : '', `${r.marks}/${r.max}`, r.sectionRank ? `#${r.sectionRank} in section` : ''].filter(Boolean).join(' · ')}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.text }}>{pct(r.percentage)}</Text>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <GradePill grade={r.grade} />
                    {r.withheld ? <Pill label="Withheld" fg="#8A4B05" bg={Colors.warningLight} /> : <PassPill passed={!!r.isPassed} label={r.isPassed ? 'Pass' : 'Fail'} />}
                  </View>
                </View>
              </View>
              {r.isPassed && r.percentage >= distinction ? <Text style={[os.lineSub, { color: '#6D28D9', fontWeight: '700', marginLeft: 40 }]}>Distinction ({distinction}%+)</Text> : null}
            </View>
          ))}
          {d?.total > rows.length ? <Text style={[os.lineSub, { textAlign: 'center', marginTop: 6 }]}>The top {rows.length} of {d.total}.</Text> : null}
        </View>
      </ScrollView>
    </>
  );
}
