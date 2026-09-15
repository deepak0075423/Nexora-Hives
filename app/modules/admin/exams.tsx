import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { unwrap, LoaderView, Empty, SearchBar, Select, FAB, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import { Meter, MiniColumns } from '@/components/ui/viz';
import { ExamRow, Pill, fmtExamDay, fmtClock, STAGES } from '@/components/exams/parts';
import ExamForm from '@/components/exams/ExamForm';

/**
 * School admin → Aptitude Exams.
 *
 * The web calendar on a phone: five figures for the academic year against the
 * one before, what is live or next, how closed exams went, and every exam with
 * search and filters. An exam opens in the shared workspace on the office's
 * side (side=admin) — questions, publish checklist, submissions and the
 * results sign-off.
 */

const err = (e: any) => e?.data?.message ?? e?.message ?? 'Something went wrong';

const STAGE_FILTERS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'live', label: 'Live' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const RESULT_LABEL: Record<string, { label: string; tone: 'good' | 'warn' | 'bad' | 'accent' | 'neutral' }> = {
  awaiting:  { label: 'Results awaiting sign-off', tone: 'warn' },
  scheduled: { label: 'Results scheduled', tone: 'accent' },
  released:  { label: 'Results out', tone: 'good' },
  withheld:  { label: 'Results withheld', tone: 'bad' },
};

const PAGE = 15;

export default function AdminExamsScreen() {
  const router = useRouter();
  const [overview, setOverview] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [period, setPeriod] = useState('year');
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('');
  const [subject, setSubject] = useState('');
  const [classNumber, setClassNumber] = useState('');
  const [year, setYear] = useState('');

  // Search settles before it asks the server.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setQuery(search.trim()), 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [search]);

  const blocked = (e: any) => {
    if (MODULE_BLOCKED_CODES.includes(e?.data?.code)) { setDisabled(true); return true; }
    return false;
  };

  const loadTop = useCallback(async () => {
    try { setOverview(unwrap(await adminApi.getExamOverview())); }
    catch (e: any) { if (!blocked(e)) Alert.alert('Could not load exams', err(e)); }
  }, []);

  const loadInsights = useCallback(async () => {
    try { setInsights(unwrap(await adminApi.getExamInsights({ period }))); }
    catch { /* the list still stands without it */ }
  }, [period]);

  const loadList = useCallback(async (nextPage = 1) => {
    setListLoading(true);
    try {
      const res: any = await adminApi.getExams({
        page: nextPage, limit: PAGE, search: query || undefined, stage: stage || undefined,
        subject: subject || undefined, classNumber: classNumber || undefined, academicYear: year || undefined,
      });
      setRows((prev) => (nextPage === 1 ? res.data ?? [] : [...prev, ...(res.data ?? [])]));
      setTotal(res.total ?? 0);
      setPage(nextPage);
    } catch (e: any) { if (!blocked(e)) Alert.alert('Could not load exams', err(e)); }
    finally { setListLoading(false); }
  }, [query, stage, subject, classNumber, year]);

  useEffect(() => { Promise.all([loadTop(), loadList(1)]).finally(() => setLoading(false)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loading) loadList(1); }, [query, stage, subject, classNumber, year]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadInsights(); }, [loadInsights]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadTop(), loadInsights(), loadList(1)]);
    setRefreshing(false);
  };

  const open = (e: any, tab = '') => router.push({ pathname: '/modules/exam-workspace', params: { id: e._id, side: 'admin', tab } } as any);

  if (disabled) return (<><Stack.Screen options={{ title: 'Aptitude Exams' }} /><ModuleDisabled /></>);
  if (loading) return (<><Stack.Screen options={{ title: 'Aptitude Exams' }} /><LoaderView /></>);

  const t = overview?.tiles ?? {};
  const was = overview?.comparedWith?.name;
  const opts = overview?.options ?? {};
  const filtered = !!(query || stage || subject || classNumber || year);

  return (
    <>
      <Stack.Screen options={{ title: 'Aptitude Exams' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}
      >
        {/* Hero */}
        <View style={s.hero}>
          <View style={s.heroMark}><Ionicons name="stats-chart" size={22} color="#fff" /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.heroTitle}>Aptitude Exams</Text>
            <Text style={s.heroSub} numberOfLines={2}>
              {overview?.academicYear ? `Academic year ${overview.academicYear.name}` : 'No active academic year'}
            </Text>
          </View>
          <TouchableOpacity style={s.heroBtn} onPress={() => router.push({ pathname: '/modules/exam-analytics', params: { side: 'admin' } } as any)}>
            <Ionicons name="analytics" size={15} color={Colors.primary} />
            <Text style={s.heroBtnText}>Analytics</Text>
          </TouchableOpacity>
        </View>

        {/* Tiles */}
        <View style={s.tiles}>
          <Tile icon="documents" tint="#EEF2FF" color="#4F46E5" label="Total exams" value={t.total?.value ?? 0}
            change={t.total?.change} changeUnit="%" was={was} />
          <Tile icon="create" tint="#FFF7ED" color="#EA580C" label="Drafts" value={t.drafts?.value ?? 0}
            note={t.drafts?.needQuestions ? `${t.drafts.needQuestions} need questions` : 'All have questions'} />
          <Tile icon="calendar" tint="#E0F2FE" color="#0284C7" label="Scheduled" value={t.scheduled?.value ?? 0}
            note={t.scheduled?.live ? `${t.scheduled.live} live now` : t.scheduled?.next ? `Next ${fmtNext(t.scheduled.next)}` : 'Nothing booked'} />
          <Tile icon="checkmark-done" tint="#F5F3FF" color="#7C3AED" label="Completed" value={t.completed?.value ?? 0}
            note={t.completed?.awaiting ? `${t.completed.awaiting} awaiting results` : undefined}
            change={t.completed?.awaiting ? undefined : t.completed?.change} changeUnit="%" was={was} />
          <Tile icon="trophy" tint="#ECFDF5" color="#059669" label="Average score" value={t.average?.value == null ? '--' : `${t.average.value}%`}
            change={t.average?.change} changeUnit=" pts" was={was} wide />
        </View>

        {/* Upcoming & active */}
        <Panel icon="time" title="Upcoming & active" sub="Live first, then the next to open">
          {(overview?.upcoming ?? []).length === 0
            ? <Text style={s.none}>Nothing scheduled — create an exam to get started.</Text>
            : overview.upcoming.map((e: any) => (
              <TouchableOpacity key={e._id} style={s.up} onPress={() => open(e)} activeOpacity={0.75}>
                <View style={[s.upDay, e.stage === 'live' && { backgroundColor: Colors.successLight }]}>
                  <Text style={[s.upDayNum, e.stage === 'live' && { color: Colors.success }]}>{fmtExamDay(e).slice(0, 2)}</Text>
                  <Text style={s.upDayMon}>{fmtExamDay(e).slice(3, 6)}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.upTitle} numberOfLines={2}>{e.title}</Text>
                  <Text style={s.upSub} numberOfLines={1}>{fmtClock(e.startTime)} · {e.audience?.label ?? '--'}</Text>
                </View>
                <Pill label={STAGES[e.stage]?.label ?? e.stage}
                  tone={e.stage === 'live' ? 'good' : e.stage === 'draft' ? 'warn' : 'accent'} />
              </TouchableOpacity>
            ))}
        </Panel>

        {/* Insights */}
        <Panel icon="pie-chart" title="Exam insights" sub={insights ? `${insights.exams} closed ${insights.exams === 1 ? 'exam' : 'exams'}` : 'Closed exams'}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(insights?.periods ?? [{ value: 'year', label: 'This academic year' }]).map((p: any) => (
                <TouchableOpacity key={p.value} style={[s.chip, period === p.value && s.chipOn]} onPress={() => setPeriod(p.value)}>
                  <Text style={[s.chipText, period === p.value && s.chipTextOn]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <View style={{ gap: 12 }}>
            <Meter label="Completion rate" value={insights?.completion?.rate}
              right={insights?.completion?.rate == null ? '--' : `${insights.completion.rate}%`} />
            <Text style={s.meterNote}>
              {insights?.completion?.eligible ? `${insights.completion.submitted} of ${insights.completion.eligible} students submitted` : 'No closed exams in this period'}
            </Text>
            <Meter label="Average score" value={insights?.average}
              right={insights?.average == null ? '--' : `${insights.average}%`} />
          </View>
          {(insights?.recent ?? []).length > 0 && (
            <View style={{ marginTop: Spacing.md }}>
              <Text style={s.chartTitle}>Average score · recent exams</Text>
              <MiniColumns data={insights.recent.map((r: any, i: number) => ({ label: `${i + 1}. ${r.title.split(' ')[0]}`, value: r.average }))} unit="%" />
              {insights.recent.map((r: any, i: number) => (
                <Text key={r._id} style={s.legendLine} numberOfLines={1}>{i + 1}. {r.title} — {r.average}% · {r.submitted} sat</Text>
              ))}
            </View>
          )}
        </Panel>

        {/* All exams */}
        <Text style={s.listHead}>All exams</Text>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by title or subject…" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginVertical: 10 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {STAGE_FILTERS.map((f) => (
              <TouchableOpacity key={f.key} style={[s.chip, stage === f.key && s.chipOn]} onPress={() => setStage(f.key)}>
                <Text style={[s.chipText, stage === f.key && s.chipTextOn]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <View style={s.filters}>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Select label="Subject" value={subject} onChange={setSubject} placeholder="All subjects"
              options={[{ value: '', label: 'All subjects' }, ...(opts.subjects ?? [])]} />
          </View>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Select label="Class" value={classNumber} onChange={setClassNumber} placeholder="All classes"
              options={[{ value: '', label: 'All classes' }, ...(opts.classes ?? [])]} />
          </View>
          {(opts.academicYears ?? []).length > 1 && (
            <View style={{ flex: 1, minWidth: 140 }}>
              <Select label="Academic year" value={year} onChange={setYear} placeholder="Current year"
                options={[
                  { value: '', label: 'Current year' },
                  ...opts.academicYears.filter((y: any) => !y.current).map((y: any) => ({ value: String(y._id), label: `${y.name} · ${y.count}` })),
                  { value: 'all', label: 'All years' },
                ]} />
            </View>
          )}
        </View>
        <View style={s.countRow}>
          <Text style={s.count}>{total} {total === 1 ? 'exam' : 'exams'}{filtered ? ' match' : ''}</Text>
          {filtered && (
            <TouchableOpacity onPress={() => { setSearch(''); setStage(''); setSubject(''); setClassNumber(''); setYear(''); }}>
              <Text style={s.clear}>Clear filters</Text>
            </TouchableOpacity>
          )}
        </View>

        {rows.length === 0 && !listLoading ? (
          <Empty icon="bulb-outline" text={filtered ? 'No exams match these filters' : 'No aptitude exams this academic year yet'} />
        ) : rows.map((e) => {
          const res = RESULT_LABEL[e.results?.state];
          const firstGap = e.stage === 'draft' && !e.readiness?.ready ? e.readiness?.checks?.find((c: any) => !c.ok)?.detail : null;
          return (
            <ExamRow
              key={e._id}
              exam={e}
              onPress={() => open(e)}
              footer={(res || firstGap || e.createdBy || e.averageScore != null) ? (
                <View style={s.rowFoot}>
                  {firstGap && <Text style={s.rowWarn} numberOfLines={2}>{firstGap}</Text>}
                  <View style={s.rowTags}>
                    {res && <Pill label={res.label} tone={res.tone} />}
                    {e.averageScore != null && <Pill label={`Avg ${e.averageScore}%`} />}
                  </View>
                  {e.createdBy?.name && <Text style={s.rowBy} numberOfLines={1}>By {e.createdBy.name}</Text>}
                </View>
              ) : undefined}
            />
          );
        })}

        {listLoading && <ActivityIndicator style={{ marginVertical: 12 }} color={Colors.primary} />}
        {!listLoading && rows.length < total && (
          <TouchableOpacity style={s.more} onPress={() => loadList(page + 1)}>
            <Text style={s.moreText}>Show more · {total - rows.length} left</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <FAB icon="add" onPress={() => setFormOpen(true)} />
      <ExamForm visible={formOpen} side="admin" onClose={() => setFormOpen(false)} onSaved={(id) => {
        setFormOpen(false);
        refresh();
        router.push({ pathname: '/modules/exam-workspace', params: { id, side: 'admin', tab: 'questions' } } as any);
      }} />
    </>
  );
}

const fmtNext = (d: string) => {
  const t = new Date(d);
  return t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

function Tile({ icon, tint, color, label, value, note, change, changeUnit, was, wide }: {
  icon: string; tint: string; color: string; label: string; value: string | number;
  note?: string; change?: number | null; changeUnit?: string; was?: string; wide?: boolean;
}) {
  const up = (change ?? 0) > 0; const flat = !change;
  return (
    <View style={[s.tile, { backgroundColor: tint }, wide && { flexBasis: '100%' }]}>
      <View style={s.tileTop}>
        <View style={[s.tileIcon, { backgroundColor: '#fff' }]}><Ionicons name={icon as any} size={15} color={color} /></View>
        <Text style={s.tileLabel} numberOfLines={2}>{label}</Text>
      </View>
      <Text style={s.tileValue}>{value}</Text>
      {change != null ? (
        <View style={s.tileChange}>
          <Ionicons name={flat ? 'remove' : up ? 'arrow-up' : 'arrow-down'} size={11} color={flat ? Colors.textSecondary : up ? Colors.success : Colors.danger} />
          <Text style={[s.tileChangeText, { color: flat ? Colors.textSecondary : up ? Colors.success : Colors.danger }]}>
            {up ? '+' : ''}{change}{changeUnit}
          </Text>
          {was && <Text style={s.tileWas} numberOfLines={1}>vs {was}</Text>}
        </View>
      ) : note ? <Text style={s.tileNote} numberOfLines={2}>{note}</Text> : null}
    </View>
  );
}

function Panel({ icon, title, sub, children }: { icon: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <View style={s.panel}>
      <View style={s.panelHead}>
        <View style={s.panelMark}><Ionicons name={icon as any} size={16} color={Colors.primary} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.panelTitle}>{title}</Text>
          {sub ? <Text style={s.panelSub}>{sub}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  heroMark: { width: 42, height: 42, borderRadius: Radius.md, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  heroSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  heroBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  heroBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.md },
  tile: { flexGrow: 1, flexBasis: '46%', minWidth: 140, borderRadius: Radius.lg, padding: 12 },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tileIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { flex: 1, minWidth: 0, fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  tileValue: { fontSize: 24, fontWeight: '800', color: Colors.text, marginTop: 8 },
  tileNote: { fontSize: 10, color: Colors.textSecondary, marginTop: 3 },
  tileChange: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3, flexWrap: 'wrap' },
  tileChangeText: { fontSize: 10, fontWeight: '700' },
  tileWas: { fontSize: 10, color: Colors.textSecondary, flexShrink: 1 },

  panel: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  panelMark: { width: 32, height: 32, borderRadius: Radius.md, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  panelTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  panelSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  none: { fontSize: 12, color: Colors.textSecondary, paddingVertical: 8 },

  up: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: Colors.divider },
  upDay: { width: 44, paddingVertical: 5, borderRadius: Radius.md, backgroundColor: '#EEF2FF', alignItems: 'center' },
  upDayNum: { fontSize: 15, fontWeight: '800', color: '#4F46E5' },
  upDayMon: { fontSize: 9, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase' },
  upTitle: { fontSize: 13, fontWeight: '600', color: Colors.text },
  upSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipOn: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextOn: { color: '#fff' },
  meterNote: { fontSize: 10, color: Colors.textSecondary, marginTop: -6 },
  chartTitle: { fontSize: 12, fontWeight: '600', color: Colors.text, marginBottom: 4 },
  legendLine: { fontSize: 10, color: Colors.textSecondary, marginTop: 3 },

  listHead: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 8, marginTop: 4 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  count: { fontSize: 12, color: Colors.textSecondary },
  clear: { fontSize: 12, fontWeight: '600', color: Colors.primary },

  rowFoot: { marginTop: 8, gap: 5 },
  rowTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rowWarn: { fontSize: 11, color: Colors.warning, fontWeight: '600' },
  rowBy: { fontSize: 10, color: Colors.textLight },

  more: { alignItems: 'center', paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  moreText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
});
