/**
 * Results for the office, on the phone (Oct 2026) — the web board's screen at
 * phone width (GET /admin/results/overview + /exams). It used to be one long
 * list of every exam with two buttons, no tabs, no search and no paging: an
 * office with a hundred exams scrolled through all of them, and could only
 * publish or reject.
 *
 *   tiles      what needs the office, what is under way, what is out
 *   tabs       one per stage, with counts; a search over title, code, class
 *   exams      twenty at a time ("Show more"), each opening its own screen
 *              (result-exam) where every step the exam may take is offered
 *   the rest   class tests, re-check requests, the merit list, analytics and
 *              report cards — the office's other Results pages
 *
 * A new exam is created from the + button (result-form).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import * as R from '@/api/results.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Empty, LoaderView, SegTabs, SearchBar, FAB, unwrap, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import { Tiles, Pill, fmtRange, classLine, plural } from '@/components/results/parts';
import { statusOf, ATTENTION, LinkRow, os } from '@/components/results/office';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'marks', label: 'Mark Entry' },
  { key: 'validation', label: 'Validation' },
  { key: 'published', label: 'Published' },
  { key: 'archived', label: 'Archived' },
];
const LIMIT = 20;

export default function AdminResultsScreen() {
  const router = useRouter();
  const [tab, setTabRaw] = useState('all');
  // A tile's view over the tabs: what waits on the office ('attention').
  const [view, setView] = useState('');
  const setTab = (k: string) => { setTabRaw(k); setView(''); };
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);         // { total, page, pages, tabs }
  const [ov, setOv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');
  const [showRest, setShowRest] = useState(false);
  const seq = useRef(0);

  // The search waits for the typing to stop.
  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 350); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async (page = 1) => {
    const mine = ++seq.current;
    if (page > 1) setMore(true);
    try {
      const [list, o] = await Promise.all([
        R.office.exams({ tab, page, limit: LIMIT, ...(q ? { search: q } : null), ...(view ? { view } : null) }),
        page === 1 ? R.office.overview() : Promise.resolve(null),
      ]);
      if (mine !== seq.current) return;
      const body: any = list;
      setRows((r) => (page > 1 ? [...r, ...(body?.data || [])] : body?.data || []));
      setMeta({ total: body?.total || 0, page: body?.page || page, pages: body?.pages || 1, tabs: body?.tabs || {} });
      if (o) setOv(unwrap(o));
      setError('');
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else setError(err?.message || 'Results could not be loaded');
    } finally { if (mine === seq.current) { setLoading(false); setRefreshing(false); setMore(false); } }
  }, [tab, q, view]);
  useEffect(() => { setLoading(true); load(1); }, [load]);
  // Back from an exam: what it did shows here.
  const first = useRef(true);
  useFocusEffect(useCallback(() => { if (first.current) { first.current = false; return; } load(1); }, [load]));

  if (disabled) return (<><Stack.Screen options={{ title: 'Results' }} /><ModuleDisabled /></>);
  const t = ov?.tiles || {};
  const tabs = meta?.tabs || {};

  return (
    <>
      <Stack.Screen options={{
        title: 'Results',
        headerRight: () => (
          <TouchableOpacity onPress={() => setShowRest((v) => !v)} hitSlop={10} style={os.headBtn} accessibilityLabel="More results pages">
            <Ionicons name={showRest ? 'close' : 'grid-outline'} size={20} color={Colors.primary} />
          </TouchableOpacity>
        ),
      }} />
      <ScrollView style={os.screen} contentContainerStyle={os.body} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1); }} tintColor={Colors.primary} />}>
        {showRest || (!loading && !rows.length && !q && tab === 'all') ? (
          <View style={{ marginBottom: 6 }}>
            <LinkRow icon="clipboard-outline" title="Class Tests" sub="Every class test: approve, send back, hand over" onPress={() => router.push('/modules/admin/result-tests' as any)} />
            <LinkRow icon="search-outline" title="Re-check Requests" sub="Families asking for a paper to be checked again"
              badge={ov?.rechecksOpen ? String(ov.rechecksOpen) : undefined} onPress={() => router.push('/modules/admin/result-rechecks' as any)} />
            <LinkRow icon="trophy-outline" title="Merit List" sub="A class in order, across its sections" onPress={() => router.push('/modules/admin/result-merit' as any)} />
            <LinkRow icon="stats-chart-outline" title="Analytics" sub="Published results, summed" onPress={() => router.push('/modules/admin/result-analytics' as any)} />
            <LinkRow icon="ribbon-outline" title="Report Cards" sub="Remarks, release to families, email to parents" onPress={() => router.push({ pathname: '/modules/report-cards', params: { office: '1' } } as any)} />
            <LinkRow icon="people-outline" title="Electives" sub="Who takes which optional subject" onPress={() => router.push({ pathname: '/modules/results-electives', params: { office: '1' } } as any)} />
            <LinkRow icon="settings-outline" title="Result Settings" sub="Grading, exam types, terms, report cards, reminders" onPress={() => router.push('/modules/admin/result-settings' as any)} />
          </View>
        ) : null}

        <Tiles items={[
          { label: 'Need You', value: t.pending ?? 0, icon: 'alert-circle-outline', tone: t.pending ? 'danger' : 'neutral',
            cap: t.toPublish ? `${t.toPublish} to publish` : t.toOpen ? `${t.toOpen} to open` : 'Nothing waiting',
            onPress: () => { setTabRaw('all'); setView(view === 'attention' ? '' : 'attention'); }, on: view === 'attention' },
          { label: 'Under Way', value: t.inProgress ?? 0, icon: 'time-outline', tone: 'warning', cap: `${t.validation ?? 0} to validate`,
            onPress: () => { setTabRaw('all'); setView(view === 'progress' ? '' : 'progress'); }, on: view === 'progress' },
          { label: 'Published', value: t.published ?? 0, icon: 'checkmark-done-outline', tone: 'success', cap: t.total ? `${t.publishedPct ?? 0}% of all exams` : undefined,
            onPress: () => setTab('published'), on: tab === 'published' },
          { label: 'Drafts', value: t.drafts ?? 0, icon: 'document-outline', tone: 'primary', onPress: () => setTab('draft'), on: tab === 'draft' },
        ]} />

        <SegTabs active={tab} onChange={setTab} tabs={TABS.map((x) => ({ key: x.key, label: tabs[x.key] ? `${x.label} (${tabs[x.key]})` : x.label }))} />
        {view ? (
          <TouchableOpacity onPress={() => setView('')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }} accessibilityRole="button">
            <Text style={{ fontSize: 12, fontWeight: '700', color: view === 'attention' ? Colors.danger : Colors.warning }}>
              {view === 'attention' ? 'Showing what needs the office' : 'Showing exams under way'}
            </Text>
            <Ionicons name="close-circle" size={15} color={Colors.textLight} />
          </TouchableOpacity>
        ) : null}
        <SearchBar value={search} onChange={setSearch} placeholder="Search by exam, code or class…" />

        {loading && !rows.length ? <LoaderView /> : null}
        {!loading && error && !rows.length ? <Empty icon="cloud-offline-outline" text={error} /> : null}
        {!loading && !error && !rows.length ? (
          <Empty icon="document-text-outline" text={q ? 'Nothing matches this search.' : tab === 'all' ? 'No exams yet. Create one with the + button.' : 'No exams at this step.'} />
        ) : null}

        <View style={loading && rows.length ? { opacity: 0.55 } : undefined}>
          {rows.map((r) => {
            const st = statusOf(r.status);
            const need = !r.archived && r.attention ? ATTENTION[r.attention] : '';
            return (
              <TouchableOpacity key={r._id} style={os.card} activeOpacity={0.75}
                onPress={() => router.push({ pathname: '/modules/admin/result-exam', params: { id: String(r._id) } } as any)}>
                <View style={os.rowTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={os.title} numberOfLines={2}>{r.title}</Text>
                    <Text style={os.sub} numberOfLines={2}>{[classLine(r), r.yearName, r.examTypeLabel, r.code].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Pill label={r.archived ? 'Archived' : st.label} fg={r.archived ? Colors.textSecondary : st.fg} bg={r.archived ? Colors.surfaceAlt : st.bg} />
                    {r.overdue ? <Pill label="Overdue" fg={Colors.danger} bg={Colors.dangerLight} /> : null}
                    {r.withheldCount ? <Pill label={`${r.withheldCount} withheld`} fg="#8A4B05" bg={Colors.warningLight} /> : null}
                  </View>
                </View>
                <Text style={os.lineSub}>
                  {fmtRange(r.startDate, r.endDate)}
                  {r.status === 'DRAFT' ? ` · ${plural(r.subjectCount || 0, 'subject')}` : ` · ${Math.min(r.sheetsSubmitted || 0, r.subjectCount || 0)} of ${plural(r.subjectCount || 0, 'subject')} in`}
                  {r.students ? ` · ${plural(r.students, 'student')}` : ''}
                </Text>
                {need ? <Text style={[os.lineSub, { color: r.attention === 'reopen' ? Colors.danger : Colors.warning, fontWeight: '600' }]}>{need}</Text> : null}
              </TouchableOpacity>
            );
          })}
          {meta && meta.page < meta.pages ? (
            <TouchableOpacity style={os.more} onPress={() => load(meta.page + 1)} disabled={more}>
              <Text style={os.moreText}>{more ? 'Loading…' : `Show more (${meta.total - rows.length} left)`}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
      <FAB icon="add" onPress={() => router.push('/modules/admin/result-form' as any)} />
    </>
  );
}
