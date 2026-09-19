/**
 * Admin → Timetable → Reports (phone).
 *
 * The same seven views as the web Reports screen, over the same endpoints, all
 * reading the LIVE published week: a report drawn from a draft would describe a
 * school that does not exist yet. Each tab owns its fetch — seven tables loaded
 * up front would spend a phone's data on six nobody opened.
 *
 * Charts are plain bars. Every figure is also printed beside its bar, so the
 * colour is never the only way to read a number.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as ttApi from '@/api/timetable.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Select, Card, SectionTitle, SegTabs, 
  SearchBar, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import { DAY_SHORT, plural, subjectTone, Tiles } from '@/components/timetable/viewKit';

const TABS = [
  { key: 'overview',  label: 'Overview' },
  { key: 'load',      label: 'Teaching Load' },
  { key: 'rooms',     label: 'Room Use' },
  { key: 'subjects',  label: 'Subjects' },
  { key: 'free',      label: 'Free Periods' },
  { key: 'conflicts', label: 'Conflicts' },
  { key: 'years',     label: 'Year Comparison' },
];

const FETCH: Record<string, (y?: string, x?: string) => Promise<any>> = {
  overview:  (y) => ttApi.getReportOverview(y),
  load:      (y) => ttApi.getTeacherWorkload(y),
  rooms:     (y) => ttApi.getRoomUtilisation(y),
  subjects:  (y) => ttApi.getSubjectSplit(y),
  free:      (y) => ttApi.getFreePeriods(y),
  conflicts: (y) => ttApi.getLiveConflicts(y),
  years:     (y, x) => ttApi.getYearComparison(y, x),
};

const CONFLICT_LABEL: Record<string, string> = {
  TEACHER_CLASH: 'Teacher double-booked',
  ROOM_CLASH: 'Room double-booked',
  CLASS_CLASH: 'Two lessons at once',
  WEEKLY_LIMIT_EXCEEDED: 'Over the weekly ceiling',
  EMPTY_SLOTS: 'Empty periods',
};

export default function TimetableReportsScreen() {
  const [tab, setTab]           = useState('overview');
  const [years, setYears]       = useState<any[]>([]);
  const [yearId, setYearId]     = useState('');
  const [against, setAgainst]   = useState('');
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    ttApi.getMeta()
      .then((res: any) => {
        const d = unwrap(res);
        setYears(d?.years ?? []);
        setYearId(String(d?.selectedYearId ?? ''));
      })
      .catch((err: any) => { if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true); });
  }, []);

  const load = useCallback(async () => {
    if (!yearId) return;
    setLoading(true);
    try {
      setData(unwrap(await FETCH[tab](yearId, against || undefined)));
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      setData(null);
    } finally { setLoading(false); setRefreshing(false); }
  }, [tab, yearId, against]);

  useEffect(() => { load(); }, [load]);

  if (disabled) {
    return (<><Stack.Screen options={{ title: 'Timetable Reports' }} /><ModuleDisabled /></>);
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Timetable Reports' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <Select label="Academic year" value={yearId} onChange={setYearId}
          options={years.map((y: any) => ({
            label: `${y.yearName}${y.status === 'active' ? ' (Active)' : ''}`, value: String(y._id),
          }))} />

        <SegTabs tabs={TABS} active={tab} onChange={(k) => { setTab(k); setData(null); }} />

        {loading || !data ? (loading ? <LoaderView /> : <Empty icon="bar-chart-outline" text="Nothing to report on yet." />) : (
          <>
            {tab === 'overview'  && <Overview d={data} />}
            {tab === 'load'      && <TeachingLoad d={data} />}
            {tab === 'rooms'     && <RoomUse d={data} />}
            {tab === 'subjects'  && <Subjects d={data} />}
            {tab === 'free'      && <FreePeriods d={data} />}
            {tab === 'conflicts' && <Conflicts d={data} />}
            {tab === 'years'     && <Years d={data} against={against} onAgainst={setAgainst} />}
          </>
        )}
      </ScrollView>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Pieces
══════════════════════════════════════════════════════════════════════════ */

/** A labelled bar: the name, the track, and the number it stands for. */
function BarRow({ label, sub, value, max, suffix = '', colour = Colors.primary, right }: {
  label: string; sub?: string; value: number; max: number; suffix?: string; colour?: string; right?: string;
}) {
  const w = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <View style={r.barRow}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={r.barLabel} numberOfLines={1}>{label}</Text>
        <Text style={r.barValue}>{right ?? `${value}${suffix}`}</Text>
      </View>
      {!!sub && <Text style={r.barSub} numberOfLines={1}>{sub}</Text>}
      <View style={r.track}><View style={[r.fill, { width: `${w}%`, backgroundColor: colour }]} /></View>
    </View>
  );
}

/** A status reading of a load percentage, the same three bands as the web. */
const loadColour = (pct: number) => (pct > 100 ? Colors.danger : pct >= 85 ? Colors.success : Colors.warning);

function Chip({ text, colour, bg }: { text: string; colour: string; bg: string }) {
  return <View style={[r.chip, { backgroundColor: bg }]}><Text style={[r.chipText, { color: colour }]}>{text}</Text></View>;
}

/* ══════════════════════════════════════════════════════════════════════════
   Tabs
══════════════════════════════════════════════════════════════════════════ */

function Overview({ d }: { d: any }) {
  if (!d.hasTimetable) {
    return (
      <Card>
        <Empty icon="calendar-outline"
          text="These reports describe the live timetable. Generate a version and publish it, and every figure here fills in." />
      </Card>
    );
  }
  const s = d.summary || {};
  const bandMax = Math.max(1, ...d.loadBands.map((b: any) => b.value));
  const subjMax = Math.max(1, ...(d.subjects || []).map((x: any) => x.periods));
  return (
    <>
      <Tiles items={[
        { label: 'Teachers', value: s.teachers, icon: 'people', tone: 'info' },
        { label: 'Utilisation', value: `${s.utilisation}%`, icon: 'checkmark-circle', tone: 'success' },
        { label: 'Conflicts', value: s.conflicts, icon: 'alert-circle', tone: s.conflicts ? 'danger' : 'neutral' },
        { label: 'Rooms', value: s.rooms, icon: 'business', tone: 'neutral' },
      ]} />
      <Text style={r.caption}>
        {s.scheduled} of {s.totalSlots} periods scheduled · {d.perSectionWeek} per section a week ·
        {' '}{s.labs} labs, {s.classrooms} classrooms
      </Text>

      <SectionTitle>Teaching load distribution</SectionTitle>
      <Card>
        <View style={r.cols}>
          {d.loadBands.map((b: any) => (
            <View key={b.label} style={r.colWrap}>
              <Text style={r.colValue}>{b.value || ''}</Text>
              <View style={[r.col, { height: Math.max(3, (b.value / bandMax) * 90) }]} />
              <Text style={r.colLabel}>{b.label}</Text>
            </View>
          ))}
        </View>
        <Text style={[r.caption, { textAlign: 'center', marginTop: 6 }]}>Teachers, by periods a week</Text>
      </Card>

      <SectionTitle>Room utilisation</SectionTitle>
      <Card>
        <BarRow label="In use" value={d.roomSplit.inUse} max={d.roomSplit.slots}
          right={`${d.roomSplit.slots ? Math.round((d.roomSplit.inUse / d.roomSplit.slots) * 100) : 0}% · ${d.roomSplit.inUse}`}
          colour={Colors.success} />
        <BarRow label="Free" value={d.roomSplit.free} max={d.roomSplit.slots}
          right={`${d.roomSplit.slots ? Math.round((d.roomSplit.free / d.roomSplit.slots) * 100) : 0}% · ${d.roomSplit.free}`}
          colour={Colors.textLight} />
        <Text style={r.caption}>{plural(d.roomSplit.roomsIdle, 'room')} never used.</Text>
      </Card>

      <SectionTitle>Subjects</SectionTitle>
      <Card>
        {(d.subjects || []).slice(0, 8).map((x: any) => (
          <BarRow key={x._id} label={x.name} value={x.periods} max={subjMax}
            right={`${x.share}% · ${x.periods}`} colour={subjectTone(x._id).fg} />
        ))}
      </Card>

      <SectionTitle>Teaching load by teacher</SectionTitle>
      <Card>
        {(d.teachers || []).slice(0, 20).map((t: any) => (
          <BarRow key={t._id} label={t.name}
            sub={t.subjects.map((x: any) => x.name).join(', ') || 'No subjects'}
            value={t.periods} max={t.cap || 1}
            right={`${t.periods}${t.cap ? `/${t.cap}` : ''}`}
            colour={loadColour(t.loadPct)} />
        ))}
        {(d.teachers || []).length > 20 && <Text style={r.caption}>+{d.teachers.length - 20} more on the Teaching Load tab.</Text>}
      </Card>
    </>
  );
}

function TeachingLoad({ d }: { d: any }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => (d.teachers || []).filter((t: any) => !q
    || t.name.toLowerCase().includes(q.toLowerCase())), [d, q]);
  const s = d.summary || {};
  return (
    <>
      <Tiles items={[
        { label: 'Teaching', value: s.teaching, icon: 'people', tone: 'info' },
        { label: 'Average', value: s.average, icon: 'stats-chart', tone: 'neutral' },
        { label: 'Busiest', value: s.busiest, icon: 'trending-up', tone: 'warning' },
        { label: 'Over cap', value: s.overCap, icon: 'alert-circle', tone: s.overCap ? 'danger' : 'neutral' },
      ]} />
      <SearchBar value={q} onChange={setQ} placeholder="Search teachers…" />
      <Card>
        {!rows.length ? <Empty text="Nothing published yet." /> : rows.map((t: any) => (
          <BarRow key={t._id} label={t.name}
            sub={`${t.busiestDay ? `Heaviest ${DAY_SHORT[t.busiestDay] || t.busiestDay} · ` : ''}${plural(t.sections, 'section')} · ${t.freePeriods} free`}
            value={t.periods} max={t.cap || Math.max(1, s.busiest)}
            right={`${t.periods}${t.cap ? `/${t.cap}` : ''}`}
            colour={t.overCap ? Colors.danger : Colors.primary} />
        ))}
      </Card>
    </>
  );
}

function RoomUse({ d }: { d: any }) {
  const s = d.summary || {};
  return (
    <>
      <Tiles items={[
        { label: 'Rooms', value: s.total, icon: 'business', tone: 'info' },
        { label: 'In use', value: s.used, icon: 'checkmark-circle', tone: 'success' },
        { label: 'Never used', value: s.idle, icon: 'close-circle', tone: s.idle ? 'warning' : 'neutral' },
        { label: 'No room', value: s.periodsWithoutARoom, icon: 'alert-circle', tone: 'neutral' },
      ]} />
      <Card>
        {!(d.rooms || []).length ? <Empty text="No rooms configured." /> : d.rooms.map((x: any) => (
          <BarRow key={x._id} label={x.roomName}
            sub={`${x.roomType} · ${x.periods} periods · ${x.freeSlots} free`}
            value={x.utilisation} max={100} suffix="%"
            colour={x.utilisation > 85 ? Colors.danger : x.utilisation > 0 ? Colors.success : Colors.textLight} />
        ))}
      </Card>
    </>
  );
}

function Subjects({ d }: { d: any }) {
  const max = Math.max(1, ...(d.subjects || []).map((x: any) => x.periods));
  const uneven = (d.subjects || []).filter((x: any) => x.uneven);
  return (
    <>
      <Card>
        {!(d.subjects || []).length ? <Empty text="Nothing published yet." /> : d.subjects.map((x: any) => (
          <BarRow key={x._id} label={x.name}
            sub={x.uneven
              ? `Uneven: ${x.perSectionMin}–${x.perSectionMax} a week across sections`
              : `${x.perSectionMax} a week in each of ${plural(x.sectionCount, 'section')} · ${plural(x.teachers, 'teacher')}`}
            value={x.periods} max={max} right={`${x.share}% · ${x.periods}`}
            colour={subjectTone(x._id).fg} />
        ))}
      </Card>
      {uneven.length > 0 && (
        <View style={r.warn}>
          <Text style={r.warnText}>
            {plural(uneven.length, 'subject gets', 'subjects get')} a different number of periods in
            different sections — usually a requirement set on one section and not the rest.
          </Text>
        </View>
      )}
      {(d.notTimetabled || []).length > 0 && (
        <>
          <SectionTitle>Never timetabled</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {d.notTimetabled.map((x: any) => (
                <Chip key={x._id} text={x.name} colour={Colors.textSecondary} bg={Colors.surfaceAlt} />
              ))}
            </View>
          </Card>
        </>
      )}
    </>
  );
}

function FreePeriods({ d }: { d: any }) {
  const [side, setSide] = useState<'teachers' | 'sections'>('teachers');
  const s = d.summary || {};
  const rows = side === 'teachers' ? (d.teachers || []) : (d.sections || []);
  const max = Math.max(1, ...rows.map((x: any) => x.free));
  return (
    <>
      <Tiles items={[
        { label: 'Teacher free', value: s.teacherFree, icon: 'time', tone: 'info' },
        { label: 'Class gaps', value: s.sectionFree, icon: 'grid', tone: s.sectionFree ? 'warning' : 'neutral' },
        { label: 'Fully booked', value: s.fullyBooked, icon: 'checkmark-circle', tone: 'success' },
        { label: 'Unused', value: s.unused, icon: 'person', tone: 'neutral' },
      ]} />
      <SegTabs tabs={[{ key: 'teachers', label: 'Teachers' }, { key: 'sections', label: 'Classes' }]}
        active={side} onChange={(k) => setSide(k as any)} />
      <Card>
        {!rows.length ? <Empty text="Nothing to show." /> : rows.map((x: any) => (
          <BarRow key={x._id} label={x.name || x.label}
            sub={side === 'teachers'
              ? `${x.periods} timetabled${x.busiestDay ? ` · heaviest ${DAY_SHORT[x.busiestDay] || x.busiestDay}` : ''}`
              : `${x.filled} of ${x.slots} slots filled`}
            value={x.free} max={max} right={`${x.free} free`}
            colour={side === 'sections' && x.free ? Colors.warning : Colors.info} />
        ))}
      </Card>
    </>
  );
}

function Conflicts({ d }: { d: any }) {
  const s = d.summary || {};
  return (
    <>
      <Tiles items={[
        { label: 'Clashes', value: s.errors, icon: 'alert-circle', tone: s.errors ? 'danger' : 'neutral' },
        { label: 'Warnings', value: s.warnings, icon: 'information-circle', tone: s.warnings ? 'warning' : 'neutral' },
        { label: 'Findings', value: s.total, icon: 'list', tone: 'neutral' },
      ]} />
      {!s.total ? (
        <View style={r.good}>
          <Text style={r.goodText}>
            The published week holds together: nobody is in two rooms at once, no room takes two
            classes, and every section’s slots are filled.
          </Text>
        </View>
      ) : (
        <Card>
          {(d.conflicts || []).map((c: any, i: number) => (
            <View key={i} style={r.finding}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Chip text={c.severity === 'error' ? 'CLASH' : 'WARNING'}
                  colour={c.severity === 'error' ? Colors.danger : Colors.warning}
                  bg={c.severity === 'error' ? Colors.dangerLight : Colors.warningLight} />
                <Text style={r.findingKind}>{CONFLICT_LABEL[c.type] || c.type}</Text>
                {!!c.dayOfWeek && (
                  <Text style={r.findingWhen}>{DAY_SHORT[c.dayOfWeek] || c.dayOfWeek} P{c.periodNumber}</Text>
                )}
              </View>
              <Text style={r.findingText}>{c.message}</Text>
              {!!c.detail && <Text style={r.findingDetail}>{c.detail}</Text>}
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

function Years({ d, against, onAgainst }: { d: any; against: string; onAgainst: (v: string) => void }) {
  const a = d.current;
  const b = d.compare;
  if (!a) return <Card><Empty text="Nothing to compare yet." /></Card>;
  const rows: [string, string][] = [
    ['Sections', 'sections'], ['Teachers', 'teachers'], ['Teachers with periods', 'teachersTeaching'],
    ['Subjects timetabled', 'subjects'], ['Rooms in service', 'rooms'], ['Periods scheduled', 'scheduled'],
    ['Slots in the week', 'slots'], ['Utilisation %', 'utilisation'], ['Average teacher load', 'averageLoad'],
    ['Busiest teacher', 'busiestLoad'],
  ];
  return (
    <>
      <Select label="Compare against" value={against || (b ? String(b._id) : '')} onChange={onAgainst}
        options={(d.years || []).filter((y: any) => String(y._id) !== String(a._id))
          .map((y: any) => ({ label: y.yearName, value: String(y._id) }))} />
      {!b ? (
        <Card><Empty text="Only one year has a published timetable, so there is nothing to compare it with yet." /></Card>
      ) : (
        <Card>
          <View style={[r.yRow, r.yHead]}>
            <Text style={[r.yMeasure, r.yHeadText]}>Measure</Text>
            <Text style={[r.yNum, r.yHeadText]} numberOfLines={1}>{a.yearName}</Text>
            <Text style={[r.yNum, r.yHeadText]} numberOfLines={1}>{b.yearName}</Text>
          </View>
          {rows.map(([label, k]) => {
            const delta = (Number(a[k]) || 0) - (Number(b[k]) || 0);
            return (
              <View key={k} style={r.yRow}>
                <Text style={r.yMeasure}>{label}</Text>
                <Text style={[r.yNum, { fontWeight: '800' }]}>{a[k]}</Text>
                <Text style={[r.yNum, { color: Colors.textSecondary }]}>
                  {b[k]}{delta ? (
                    <Text style={{ color: delta > 0 ? Colors.success : Colors.danger, fontWeight: '700' }}>
                      {`  ${delta > 0 ? '+' : ''}${Math.round(delta * 10) / 10}`}
                    </Text>
                  ) : null}
                </Text>
              </View>
            );
          })}
        </Card>
      )}
    </>
  );
}

const r = StyleSheet.create({
  caption: { fontSize: 11, color: Colors.textSecondary, marginBottom: Spacing.sm, lineHeight: 16 },
  barRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  barLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.text },
  barValue: { fontSize: 12, fontWeight: '700', color: Colors.text },
  barSub: { fontSize: 10.5, color: Colors.textSecondary, marginTop: 1 },
  track: { height: 7, borderRadius: 4, backgroundColor: Colors.divider, marginTop: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },

  cols: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 130 },
  colWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  colValue: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary, marginBottom: 3 },
  col: { width: '100%', borderTopLeftRadius: 5, borderTopRightRadius: 5, backgroundColor: '#818CF8' },
  colLabel: { fontSize: 9, color: Colors.textSecondary, marginTop: 4 },

  chip: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  chipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },

  finding: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: 4 },
  findingKind: { fontSize: 12, fontWeight: '700', color: Colors.text },
  findingWhen: { fontSize: 11, color: Colors.textSecondary },
  findingText: { fontSize: 12.5, color: Colors.text },
  findingDetail: { fontSize: 11, color: Colors.textSecondary },

  warn: { backgroundColor: Colors.warningLight, borderRadius: Radius.md, padding: 12, marginTop: Spacing.sm, marginBottom: Spacing.md },
  warnText: { fontSize: 12, color: Colors.warning, lineHeight: 17 },
  good: { backgroundColor: Colors.successLight, borderRadius: Radius.md, padding: 12 },
  goodText: { fontSize: 12.5, color: Colors.success, lineHeight: 18 },

  yRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: 8 },
  yHead: { paddingTop: 0 },
  yHeadText: { fontSize: 10, fontWeight: '800', color: Colors.textSecondary, letterSpacing: 0.4 },
  yMeasure: { flex: 1.4, fontSize: 12.5, color: Colors.text },
  yNum: { flex: 1, fontSize: 12.5, color: Colors.text, textAlign: 'right' },
});
