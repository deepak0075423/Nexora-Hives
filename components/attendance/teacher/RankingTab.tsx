/**
 * Teacher → Attendance → Class Ranking, on the phone.
 *
 * A section over a period: today's figures, the class average against the
 * period before, the top three, how the class is spread across attendance
 * bands, and every student ranked. Percentages count marks — Late as attended,
 * a Half-Day as half — so a subject-wise school ranks by registers attended.
 *
 * An attendance alert links here naming the section and flagging the student.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as teacherApi from '@/api/teacher.api';
import { FocusRow } from '@/components/FocusHighlight';
import {
  MUTE, TEXT, LINE, Card, Tiles, Tile, Chips, Change, Callout, Blank, Loading, Avatar, Podium, Bands, num, errText,
} from '../parts';
import { Pct } from '../StudentView';

const unwrap = (res: any) => res?.data ?? res;
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '0%');
const PERIODS = [
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'this-year', label: 'This Academic Year' },
];
const SORTS = [
  { value: 'rank', label: 'Rank' }, { value: 'name', label: 'Name' }, { value: 'low', label: 'Lowest first' },
];

export default function RankingTab({ initialSection = '', refreshKey, onBlocked, scrollRef }: {
  initialSection?: string; refreshKey: number; onBlocked: (e: any) => boolean; scrollRef: React.RefObject<ScrollView | null>;
}) {
  const [period, setPeriod] = useState('this-month');
  const [section, setSection] = useState(initialSection);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('rank');

  useEffect(() => {
    let live = true;
    setLoading(true); setError('');
    teacherApi.getAttendanceRanking({ period, section: section || undefined })
      .then((res: any) => {
        if (!live) return;
        const d = unwrap(res);
        setData(d);
        if (d?.section?._id && String(d.section._id) !== section) setSection(String(d.section._id));
      })
      .catch((e) => { if (live && !onBlocked(e)) setError(errText(e)); })
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [period, section, refreshKey]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (data?.rows || []).filter((r: any) => !q || r.student.name.toLowerCase().includes(q) || String(r.student.rollNumber).toLowerCase().includes(q));
    if (sort === 'name') return [...list].sort((a, b) => a.student.name.localeCompare(b.student.name));
    if (sort === 'low') return [...list].sort((a, b) => (a.percentage ?? 101) - (b.percentage ?? 101));
    return list;
  }, [data, query, sort]);

  if (loading && !data) return <Loading />;
  if (error) return <Card><Blank icon="alert-circle-outline" title="The ranking could not be loaded" body={error} /></Card>;

  const sections: any[] = data?.sections || [];
  const periodLabel = PERIODS.find((p) => p.value === period)?.label || 'This Month';
  const unit = data?.unit || 'days';
  const t = data?.today;

  return (
    <View style={loading ? { opacity: 0.6 } : null}>
      <View style={{ gap: 8, marginBottom: 12 }}>
        <Chips label="Period" value={period} onChange={setPeriod} options={PERIODS} />
        {sections.length > 1 ? (
          <Chips label="Section" value={section} onChange={setSection}
            options={sections.map((x) => ({ value: String(x._id), label: x.label }))} />
        ) : null}
      </View>

      {!data?.section ? (
        <Card><Blank icon="trophy-outline" title="No class to rank" body="You are not taking attendance for any section this year." /></Card>
      ) : (
        <>
          {data.scopeNote ? <Callout tone="info" body={data.scopeNote} /> : null}
          <Tiles>
            <Tile icon="people-outline" tone="green" value={t?.students ?? 0} label="Total Students" caption={data.section.label} />
            <Tile icon="shield-checkmark" solid tone="green" value={t?.present ?? 0} label="Present Today"
              caption={t?.marked ? `${pct(t.present, t.students)} attendance` : 'Not marked yet'} captionTone={t?.marked ? 'green' : undefined} />
            <Tile icon="person-remove-outline" tone="red" value={t?.absent ?? 0} label="Absent Today"
              caption={t?.marked ? pct(t.absent, t.students) : '—'} captionTone={t?.marked ? 'red' : undefined} />
            <Tile icon="speedometer-outline" tone="amber" value={t?.late ?? 0} label="Late Today"
              caption={t?.marked ? `${pct(t.late, t.students)}${t.halfDay ? ` · ${t.halfDay} half day` : ''}` : '—'} captionTone={t?.marked ? 'amber' : undefined} />
            <Tile wide icon="stats-chart" tone="indigo" value={data.average?.value == null ? '—' : `${data.average.value}%`} label="Class Average"
              note={data.period?.previous && data.average?.change != null ? <Change value={data.average.change} /> : undefined}
              caption={data.period?.previous ? `vs ${period === 'last-month' ? 'the month before' : 'last month'}` : periodLabel} />
          </Tiles>

          <Card title="Top 3 Students" sub={`By attendance percentage · ${periodLabel}`} icon="trophy" iconTone="gold">
            {data.top?.length ? <Podium top={data.top} unit={unit} />
              : <Blank icon="trophy-outline" title="Nothing marked yet" body="The podium fills as registers are taken this period." />}
          </Card>

          <Card title="Attendance Distribution" sub={`Students per band · ${periodLabel}`} icon="bar-chart-outline" iconTone="green">
            <Bands bands={data.distribution || []} />
          </Card>

          <Card title="Complete Class Ranking" sub={periodLabel} icon="list" flush>
            <View style={{ paddingHorizontal: 14, gap: 8, marginBottom: 6 }}>
              <View style={r.search}>
                <Ionicons name="search" size={16} color={MUTE} />
                <TextInput value={query} onChangeText={setQuery} placeholder="Search by name or roll number" placeholderTextColor="#94A3B8"
                  style={r.searchInput} accessibilityLabel="Search students" />
              </View>
              <Chips label="Sort" value={sort} onChange={setSort} options={SORTS} />
            </View>
            {rows.length === 0 ? <Blank icon="people-outline" title={query ? 'No student matches' : 'No students in this section'} /> : rows.map((row: any, i: number) => (
              <FocusRow key={row.student._id} id={row.student._id} scrollRef={scrollRef}>
                <View style={[r.row, i > 0 && r.rowLine]}>
                  <Text style={[r.rank, row.rank && row.rank <= 3 && { color: '#F59E0B' }]}>{row.rank ?? '—'}</Text>
                  <Avatar name={row.student.name} size={32} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={r.name} numberOfLines={1}>{row.student.name}</Text>
                    <Text style={r.muted} numberOfLines={1}>
                      Roll {row.student.rollNumber || '—'} · P {row.present} · A {row.absent} · L {row.late} · ½ {row.halfDay}
                    </Text>
                    {row.total ? <Text style={r.muted}>{num(row.attended)} of {row.total} {unit} attended</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <Pct value={row.percentage} />
                    {data.period?.previous ? <Change value={row.trend} /> : null}
                  </View>
                </View>
              </FocusRow>
            ))}
          </Card>
        </>
      )}
    </View>
  );
}

const r = StyleSheet.create({
  muted: { fontSize: 11.5, color: MUTE },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 11, borderRadius: 9, borderWidth: 1, borderColor: LINE },
  searchInput: { flex: 1, fontSize: 13.5, color: TEXT },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  rowLine: { borderTopWidth: 1, borderTopColor: '#F1F3F7' },
  rank: { width: 22, textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#334155' },
  name: { fontSize: 13.5, fontWeight: '600', color: TEXT },
});
