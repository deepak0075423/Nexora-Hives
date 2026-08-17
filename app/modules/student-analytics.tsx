import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as analyticsApi from '@/api/analytics.api';
import {
  unwrap, LoaderView, Empty, Badge, SearchBar, Select, StatTile, StatRow, fmtMoney,
} from '@/components/ui/kit';
import { VIZ, VizCard, Meter, BandBar, Hero, toneForPercent, TONE_COLOR } from '@/components/ui/viz';

// Filters that need a computed metric are gated on the module that produces it —
// no point offering "has dues" to a school without the fees module.
const FILTER_DEFS: { key: string; label: string; module?: string; options: [string, string][] }[] = [
  { key: 'gender', label: 'Gender', options: [['male', 'Male'], ['female', 'Female'], ['other', 'Other']] },
  { key: 'status', label: 'Account', options: [['active', 'Active'], ['inactive', 'Inactive']] },
  { key: 'attendance', label: 'Attendance', module: 'attendance', options: [
    ['90plus', '90% and above'], ['75to90', '75–90%'], ['60to75', '60–75%'],
    ['below60', 'Below 60%'], ['below75', 'Below 75% (at risk)'], ['untracked', 'Not marked yet'],
  ] },
  { key: 'result', label: 'Result', module: 'result', options: [
    ['75plus', '75% and above'], ['60to75', '60–75%'], ['40to60', '40–60%'],
    ['below40', 'Below 40%'], ['unassessed', 'Not assessed'],
  ] },
  { key: 'fees', label: 'Fees', module: 'fees', options: [['due', 'Has dues'], ['clear', 'Cleared']] },
  { key: 'library', label: 'Library', module: 'library', options: [['out', 'Books out'], ['overdue', 'Has overdue']] },
  { key: 'transport', label: 'Transport', module: 'transport', options: [['assigned', 'Assigned'], ['none', 'Not assigned']] },
];

const SORT_DEFS: { key: string; label: string; module?: string }[] = [
  { key: 'roll',       label: 'Roll number' },
  { key: 'name',       label: 'Name (A–Z)' },
  { key: 'attendance', label: 'Attendance — lowest first', module: 'attendance' },
  { key: 'result',     label: 'Result — lowest first',     module: 'result' },
  { key: 'dues',       label: 'Dues — highest first',      module: 'fees' },
];

const EMPTY_FILTERS: Record<string, string> = {
  gender: '', status: '', attendance: '', result: '', fees: '', library: '', transport: '',
};

// One screen for two audiences. A school admin sees every section; a teacher
// only the sections they are class teacher / vice class teacher of, or teach a
// subject in — the backend decides, this screen renders what came back.
export default function StudentAnalyticsScreen() {
  const router = useRouter();

  const [scope,    setScope]    = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [pages,    setPages]    = useState(1);

  const [classId,   setClassId]   = useState('');
  const [sectionId, setSectionId] = useState('');
  const [search,    setSearch]    = useState('');
  const [term,      setTerm]      = useState('');
  const [filters,   setFilters]   = useState<Record<string, string>>(EMPTY_FILTERS);
  const [sortBy,    setSortBy]    = useState('roll');
  const [showMore,  setShowMore]  = useState(false);

  const [loading,    setLoading]    = useState(true);
  const [listBusy,   setListBusy]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState('');
  // Kept apart from `error`: a failed /scope means the screen cannot render at
  // all, and must not be mistaken for "this teacher has no sections".
  const [scopeError, setScopeError] = useState<{ message: string; status?: number } | null>(null);

  const params = useMemo(() => {
    const p: any = {};
    if (sectionId) p.sectionId = sectionId;
    else if (classId) p.classId = classId;
    if (term) p.search = term;
    Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v; });
    if (sortBy && sortBy !== 'roll') p.sortBy = sortBy;
    return p;
  }, [classId, sectionId, term, filters, sortBy]);

  const setFilter = (k: string, v: string) => {
    setFilters(f => ({ ...f, [k]: v }));
    setPage(1);
  };
  const resetFilters = () => {
    setClassId(''); setSectionId(''); setSearch(''); setTerm('');
    setFilters(EMPTY_FILTERS); setSortBy('roll'); setPage(1);
  };

  // Debounce the search box so each keystroke doesn't hit the API.
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadScope = useCallback(async () => {
    try {
      setScope(unwrap(await analyticsApi.getScope()));
      setScopeError(null);
    } catch (e: any) {
      setScope(null);
      setScopeError({ message: e.message, status: e.status });
    }
  }, []);

  const loadData = useCallback(async (p = 1, append = false) => {
    try {
      setListBusy(true);
      const [ov, list]: any = await Promise.all([
        p === 1 ? analyticsApi.getOverview(params) : Promise.resolve(null),
        analyticsApi.getStudents({ ...params, page: p, limit: 20 }),
      ]);
      if (ov) setOverview(unwrap(ov));
      const d = unwrap(list);
      const rows = d?.students ?? [];
      if (append) setStudents(prev => [...prev, ...rows]);
      else setStudents(rows);
      setTotal(d?.total ?? 0);
      setPages(d?.pages ?? 1);
      setPage(p);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setListBusy(false); setLoading(false); setRefreshing(false);
    }
  }, [params]);

  useEffect(() => { loadScope(); }, [loadScope]);
  useEffect(() => { setLoading(true); loadData(1); }, [loadData]);

  const sections = scope?.sections ?? [];
  const classes = useMemo(() => {
    const map = new Map<string, string>();
    sections.forEach((s: any) => { if (!map.has(s.classId)) map.set(s.classId, s.className); });
    return [...map].map(([value, label]) => ({ value, label }));
  }, [sections]);
  const sectionChoices = (classId ? sections.filter((s: any) => s.classId === classId) : sections)
    .map((s: any) => ({ value: s._id, label: `${s.className} — ${s.sectionName}` }));

  const modules = overview?.modules ?? scope?.modules ?? {};

  const availableFilters = FILTER_DEFS.filter(f => !f.module || modules[f.module]);
  const availableSorts   = SORT_DEFS.filter(x => !x.module || modules[x.module]);
  const activeFilters    = availableFilters
    .filter(f => filters[f.key])
    .map(f => ({
      key: f.key,
      label: f.label,
      valueLabel: f.options.find(([v]) => v === filters[f.key])?.[1] ?? filters[f.key],
    }));

  if (loading) {
    return (<><Stack.Screen options={{ title: 'Student Analytics' }} /><LoaderView /></>);
  }

  // Could not reach the endpoint at all — say so plainly rather than letting it
  // look like an empty roster. A 404 here means the server is up but running a
  // build without this module, which is worth naming: it is the difference
  // between "nothing to show" and "your backend needs updating".
  if (scopeError) {
    return (
      <>
        <Stack.Screen options={{ title: 'Student Analytics' }} />
        <View style={s.errorPane}>
          <Ionicons name="cloud-offline-outline" size={44} color={Colors.textLight} />
          <Text style={s.errorTitle}>Could not load analytics</Text>
          <Text style={s.errorBody}>
            {scopeError.status === 404
              ? 'This server does not have the Student Analytics module yet. It needs to be updated to the latest backend build.'
              : scopeError.message}
          </Text>
          <TouchableOpacity style={s.retry} activeOpacity={0.8}
            onPress={() => { setLoading(true); loadScope(); loadData(1); }}>
            <Text style={s.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  if (!sections.length) {
    return (
      <>
        <Stack.Screen options={{ title: 'Student Analytics' }} />
        <Empty icon="school-outline" text={scope?.canSeeAll
          ? 'No active sections in the current academic year. Create classes and sections first, then analytics will appear here.'
          : 'You will see analytics here once you are made class teacher, vice class teacher or subject teacher of a section.'} />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Student Analytics' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); loadScope(); loadData(1); }} />}
      >
        {!!error && <Text style={s.error}>{error}</Text>}

        <Text style={s.scopeNote}>
          {scope?.canSeeAll
            ? `Every student in the school${scope?.academicYear ? ` · ${scope.academicYear.yearName}` : ''}`
            : `${sections.length} section${sections.length === 1 ? '' : 's'} you teach${scope?.academicYear ? ` · ${scope.academicYear.yearName}` : ''}`}
        </Text>

        {/* Filters — the roll-up below reflects exactly this selection */}
        <View style={s.filters}>
          <Select label="Class" value={classId}
            placeholder="All classes"
            options={[{ value: '', label: 'All classes' }, ...classes]}
            onChange={(v) => { setClassId(v); setSectionId(''); setPage(1); }} />
          <Select label="Section" value={sectionId}
            placeholder="All sections"
            options={[{ value: '', label: 'All sections' }, ...sectionChoices]}
            onChange={(v) => { setSectionId(v); setPage(1); }} />
          <SearchBar value={search} onChange={setSearch} placeholder="Name, admission or roll no…" />

          <TouchableOpacity style={s.moreToggle} onPress={() => setShowMore(v => !v)} activeOpacity={0.7}>
            <Text style={s.moreToggleText}>
              {showMore ? 'Hide filters' : 'More filters'}{activeFilters.length ? ` (${activeFilters.length})` : ''}
            </Text>
            <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={15} color={VIZ.accent} />
          </TouchableOpacity>

          {showMore && (
            <View style={{ marginTop: Spacing.sm }}>
              {availableFilters.map(f => (
                <Select key={f.key} label={f.label} value={filters[f.key]} placeholder="Any"
                  options={[{ value: '', label: 'Any' }, ...f.options.map(([value, label]) => ({ value, label }))]}
                  onChange={(v) => setFilter(f.key, v)} />
              ))}
              <Select label="Sort by" value={sortBy}
                options={availableSorts.map(x => ({ value: x.key, label: x.label }))}
                onChange={(v) => { setSortBy(v); setPage(1); }} />
            </View>
          )}

          {(activeFilters.length > 0 || classId || sectionId || term || sortBy !== 'roll') && (
            <View style={s.chipWrap}>
              {activeFilters.map(f => (
                <TouchableOpacity key={f.key} style={s.chip} onPress={() => setFilter(f.key, '')} activeOpacity={0.7}>
                  <Text style={s.chipText}>{f.label}: {f.valueLabel}</Text>
                  <Ionicons name="close" size={12} color={VIZ.accent} />
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={s.clearAll} onPress={resetFilters} activeOpacity={0.7}>
                <Text style={s.clearAllText}>Clear all</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Which hat the viewer wears over the chosen section */}
        {!scope?.canSeeAll && !!sectionId && (
          <View style={s.roleRow}>
            {(sections.find((x: any) => x._id === sectionId)?.roles ?? []).map((r: string) => (
              <Badge key={r} label={r} tone="info" />
            ))}
          </View>
        )}

        {/* Headline numbers */}
        <StatRow>
          <StatTile label="Students" value={overview?.totals?.students ?? 0} icon="people" tone="info" />
          {modules.attendance && (
            <StatTile label="Avg attendance"
              value={overview?.attendance?.average != null ? `${overview.attendance.average}%` : '--'}
              icon="checkmark-circle" tone="success" />
          )}
          {modules.result && (
            <StatTile label="Avg result"
              value={overview?.results?.average != null ? `${overview.results.average}%` : '--'}
              icon="bar-chart" tone="warning" />
          )}
        </StatRow>

        {modules.fees && (
          <VizCard title="Fees" subtitle={`${fmtMoney(overview?.fees?.collected)} collected in this view`}>
            <Hero value={fmtMoney(overview?.fees?.outstanding)} label="Outstanding"
              tone={(overview?.fees?.outstanding ?? 0) > 0 ? 'bad' : 'good'}
              sub={`${overview?.fees?.defaulters ?? 0} student${overview?.fees?.defaulters === 1 ? '' : 's'} with a balance`} />
            {!!overview?.fees?.topDues?.length && (
              <View style={{ marginTop: Spacing.md }}>
                <Text style={s.subhead}>Largest dues</Text>
                {overview.fees.topDues.map((r: any) => (
                  <RankRow key={r._id} row={r} value={fmtMoney(r.feeBalance)} tone="bad"
                    onPress={() => router.push(`/modules/student-analytics-detail?id=${r._id}` as any)} />
                ))}
              </View>
            )}
          </VizCard>
        )}

        {modules.attendance && (overview?.attendance?.tracked ?? 0) > 0 && (
          <VizCard title="Attendance spread"
            subtitle={`${overview.attendance.tracked} student${overview.attendance.tracked === 1 ? '' : 's'} with marked attendance`}>
            <BandBar segments={[
              { label: '90%+',      value: overview.attendance.bands.above90,    color: VIZ.bands[3] },
              { label: '75–90%',    value: overview.attendance.bands.from75to90, color: VIZ.bands[2] },
              { label: '60–75%',    value: overview.attendance.bands.from60to75, color: VIZ.bands[1] },
              { label: 'Below 60%', value: overview.attendance.bands.below60,    color: VIZ.bands[0] },
            ]} />
            {!!overview.attendance.lowest?.length && (
              <View style={{ marginTop: Spacing.md }}>
                <Text style={s.subhead}>Lowest attendance</Text>
                {overview.attendance.lowest.map((r: any) => (
                  <RankRow key={r._id} row={r} value={`${r.attendancePercent}%`}
                    tone={toneForPercent(r.attendancePercent)}
                    onPress={() => router.push(`/modules/student-analytics-detail?id=${r._id}` as any)} />
                ))}
              </View>
            )}
          </VizCard>
        )}

        {modules.result && (overview?.results?.assessed ?? 0) > 0 && (
          <VizCard title="Academic standing"
            subtitle={`${overview.results.assessed} assessed · ${overview.results.failing} with a failed exam`}>
            <Text style={s.subhead}>Top performers</Text>
            {overview.results.toppers.map((r: any) => (
              <RankRow key={`t-${r._id}`} row={r} value={`${r.avgPercent}%`} tone="good"
                onPress={() => router.push(`/modules/student-analytics-detail?id=${r._id}` as any)} />
            ))}
            <Text style={[s.subhead, { marginTop: Spacing.md }]}>Needs attention</Text>
            {overview.results.needHelp.map((r: any) => (
              <RankRow key={`n-${r._id}`} row={r} value={`${r.avgPercent}%`} tone={toneForPercent(r.avgPercent)}
                onPress={() => router.push(`/modules/student-analytics-detail?id=${r._id}` as any)} />
            ))}
          </VizCard>
        )}

        {/* Roster */}
        <Text style={s.listHead}>Students · {total}</Text>
        {students.length === 0 && !listBusy && <Empty icon="search-outline" text="No students match these filters" />}
        {students.map((st: any) => (
          <TouchableOpacity key={st._id} activeOpacity={0.7} style={s.studentCard}
            onPress={() => router.push(`/modules/student-analytics-detail?id=${st._id}` as any)}>
            <View style={s.studentHead}>
              <View style={s.avatar}><Text style={s.avatarText}>{(st.name || '?').charAt(0).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.studentName} numberOfLines={1}>{st.name}</Text>
                <Text style={s.studentSub} numberOfLines={1}>
                  {`${st.className} ${st.sectionName}`.trim()}{st.rollNumber ? ` · Roll ${st.rollNumber}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
            </View>

            <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
              {modules.attendance && st.attendancePercent != null && (
                <Meter value={st.attendancePercent} label="Attendance" right={`${st.attendancePercent}%`} />
              )}
              {modules.result && st.avgPercent != null && (
                <Meter value={st.avgPercent} label="Avg result" right={`${st.avgPercent}%`} />
              )}
            </View>

            <View style={s.chipRow}>
              {modules.fees && (
                st.feeBalance > 0
                  ? <Badge label={`${fmtMoney(st.feeBalance)} due`} tone="danger" />
                  : <Badge label="Fees clear" tone="success" />
              )}
              {modules.library && st.booksOut > 0 && (
                <Badge label={`${st.booksOut} book${st.booksOut === 1 ? '' : 's'} out`}
                  tone={st.booksOverdue ? 'danger' : 'info'} />
              )}
              {!st.isActive && <Badge label="Inactive" tone="neutral" />}
            </View>
          </TouchableOpacity>
        ))}

        {page < pages && (
          <TouchableOpacity style={s.more} onPress={() => loadData(page + 1, true)} disabled={listBusy}>
            <Text style={s.moreText}>{listBusy ? 'Loading…' : 'Load more'}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </>
  );
}

function RankRow({ row, value, tone, onPress }: {
  row: any; value: string; tone: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.rankRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={s.rankName} numberOfLines={1}>
        {row.name}
        <Text style={s.rankClass}>{`  ${row.className ?? ''} ${row.sectionName ?? ''}`}</Text>
      </Text>
      <Text style={[s.rankValue, { color: TONE_COLOR[tone] ?? Colors.text }]}>{value}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  error:     { color: Colors.danger, fontSize: 12, marginBottom: Spacing.sm },

  errorPane:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, backgroundColor: Colors.background },
  errorTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginTop: Spacing.md },
  errorBody:  { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  retry:      { marginTop: Spacing.lg, backgroundColor: VIZ.accent, borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 22 },
  retryText:  { color: '#fff', fontWeight: '600', fontSize: 13 },
  scopeNote: { fontSize: 12, color: Colors.textSecondary, marginBottom: Spacing.md },
  filters:   { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  roleRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.md },

  moreToggle:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.sm },
  moreToggleText: { color: VIZ.accent, fontWeight: '600', fontSize: 13 },
  chipWrap:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.sm },
  chip:           { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EDE9FE', borderRadius: Radius.full, paddingVertical: 4, paddingHorizontal: 10 },
  chipText:       { color: VIZ.accent, fontSize: 11, fontWeight: '600' },
  clearAll:       { paddingVertical: 4, paddingHorizontal: 8 },
  clearAllText:   { color: Colors.textSecondary, fontSize: 11, fontWeight: '600', textDecorationLine: 'underline' },
  subhead:   { fontSize: 12, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  listHead:  { fontSize: 14, fontWeight: '700', color: Colors.text, marginTop: Spacing.sm, marginBottom: Spacing.sm },

  studentCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  studentHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  avatar:      { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  avatarText:  { color: VIZ.accent, fontWeight: '700', fontSize: 14 },
  studentName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  studentSub:  { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.sm },

  rankRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  rankName:  { fontSize: 12, color: Colors.text, flex: 1 },
  rankClass: { fontSize: 10, color: Colors.textLight },
  rankValue: { fontSize: 12, fontWeight: '700', marginLeft: Spacing.sm },

  more:     { alignItems: 'center', paddingVertical: Spacing.md },
  moreText: { color: VIZ.accent, fontWeight: '600', fontSize: 13 },
});
