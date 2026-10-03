/**
 * Every class test in the school, for the office, on the phone (Oct 2026) —
 * the web's Class Tests page (GET /admin/results/class-tests): what waits for
 * approval, what is still being marked, what families can see.
 *
 * A test opens as its marks sheet (results-sheet, office mode): one waiting
 * for approval can be approved or sent back, as its class teacher would. A
 * test can be handed to another teacher of its subject in the section, and
 * one set by mistake deleted — never one whose marks were approved.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/theme';
import * as R from '@/api/results.api';
import { Empty, LoaderView, SegTabs, SearchBar } from '@/components/ui/kit';
import { Pill, fmtDay, classLine, plural } from '@/components/results/parts';
import { AskSheet, Ask, os } from '@/components/results/office';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'approved', label: 'Approved' },
  { key: 'open', label: 'Being Marked' },
  { key: 'rejected', label: 'Sent Back' },
];
const TONE: Record<string, { fg: string; bg: string }> = {
  DRAFT: { fg: Colors.textSecondary, bg: Colors.surfaceAlt },
  SUBMITTED: { fg: Colors.info, bg: Colors.infoLight },
  FINAL_APPROVED: { fg: Colors.success, bg: Colors.successLight },
  REJECTED: { fg: Colors.danger, bg: Colors.dangerLight },
  REOPENED: { fg: Colors.warning, bg: Colors.warningLight },
};

export default function OfficeClassTestsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState('waiting');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [ask, setAsk] = useState<Ask | null>(null);
  const [flash, setFlash] = useState('');
  const seq = useRef(0);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 350); return () => clearTimeout(t); }, [search]);
  const load = useCallback(async (page = 1) => {
    const mine = ++seq.current;
    try {
      const body: any = await R.office.tests({ tab, page, limit: 20, ...(q ? { search: q } : null) });
      if (mine !== seq.current) return;
      setRows((r) => (page > 1 ? [...r, ...(body?.data || [])] : body?.data || []));
      setMeta({ page: body?.page || 1, pages: body?.pages || 1, total: body?.total || 0, tabs: body?.tabs || {} });
      setError('');
    } catch (err: any) { setError(err?.message || 'Class tests could not be loaded'); }
    finally { if (mine === seq.current) { setLoading(false); setRefreshing(false); } }
  }, [tab, q]);
  useEffect(() => { setLoading(true); load(1); }, [load]);
  const first = useRef(true);
  useFocusEffect(useCallback(() => { if (first.current) { first.current = false; return; } load(1); }, [load]));

  const handOver = (t: any) => setAsk({
    title: `Hand over ${t.title}`, confirm: 'Hand Over',
    lines: [`The test becomes theirs to mark and submit. ${t.setBy || 'Its teacher'} no longer sees it as their own.`, 'Tick one teacher.'],
    choices: { label: `Who teaches ${t.subjectName} in ${classLine(t)}`, options: (t.others || []).map((o: any) => ({ value: String(o._id), label: o.name })), ticked: t.others?.length === 1 ? [String(t.others[0]._id)] : [] },
    run: (_r, picked) => {
      if (picked.length !== 1) throw new Error('Tick exactly one teacher');
      return R.office.handOverTest(t._id, picked[0]);
    },
    done: () => 'Handed over — the teacher has been told',
  });
  const remove = (t: any) => setAsk({
    title: `Delete ${t.title}`, confirm: 'Delete', danger: true,
    lines: [`Delete the class test ${t.title} (${t.subjectName}, ${classLine(t)})${t.entered ? `, with the ${plural(t.entered, 'mark')} entered on it` : ''}? This cannot be undone.`,
      'Its marks were never approved, so no family has seen them.'],
    run: () => R.office.deleteTest(t._id), done: () => 'Class test deleted',
  });

  const tabs = meta?.tabs || {};
  return (
    <>
      <Stack.Screen options={{ title: 'Class Tests' }} />
      <ScrollView style={os.screen} contentContainerStyle={os.body} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1); }} tintColor={Colors.primary} />}>
        <SegTabs active={tab} onChange={setTab} tabs={TABS.map((t) => ({ key: t.key, label: tabs[t.key] ? `${t.label} (${tabs[t.key]})` : t.label }))} />
        <SearchBar value={search} onChange={setSearch} placeholder="Search by test, topic, teacher or class…" />
        {flash ? <TouchableOpacity onPress={() => setFlash('')}><Text style={os.ok}>{flash}</Text></TouchableOpacity> : null}
        {loading && !rows.length ? <LoaderView /> : null}
        {!loading && error && !rows.length ? <Empty icon="cloud-offline-outline" text={error} /> : null}
        {!loading && !error && !rows.length ? <Empty icon="clipboard-outline" text={q ? 'Nothing matches this search.' : tab === 'waiting' ? 'Nothing is waiting for approval.' : 'No class tests here.'} /> : null}
        {rows.map((t) => {
          const tone = TONE[t.status] || TONE.DRAFT;
          return (
            <TouchableOpacity key={t._id} style={os.card} activeOpacity={0.75}
              onPress={() => router.push({ pathname: '/modules/results-sheet', params: { testId: String(t._id), office: '1' } } as any)}>
              <View style={os.rowTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={os.title} numberOfLines={2}>{t.title}</Text>
                  <Text style={os.sub}>{[t.subjectName, classLine(t), fmtDay(t.testDate)].filter(Boolean).join(' · ')}</Text>
                </View>
                <Pill label={t.statusLabel} fg={tone.fg} bg={tone.bg} />
              </View>
              <Text style={os.lineSub}>
                {[t.setBy ? `by ${t.setBy}` : '', `${t.entered} of ${t.roll} marked`, t.average != null ? `average ${Math.round(t.average * 10) / 10}/${t.maxMarks}` : ''].filter(Boolean).join(' · ')}
              </Text>
              {t.status === 'SUBMITTED' && !t.hasValidator ? <Text style={[os.lineSub, { color: Colors.warning, fontWeight: '600' }]}>No class teacher — waiting for the office</Text> : null}
              {t.status === 'REJECTED' && t.rejectionReason ? <Text style={[os.lineSub, { color: Colors.danger }]}>Sent back: “{t.rejectionReason}”</Text> : null}
              {t.can?.handOver || t.can?.delete ? (
                <View style={os.btnRow}>
                  {t.can.handOver ? (
                    <TouchableOpacity style={os.ghost} onPress={() => handOver(t)}><Text style={os.ghostText}>Hand Over</Text></TouchableOpacity>
                  ) : null}
                  {t.can.delete ? (
                    <TouchableOpacity style={[os.ghost, os.dangerGhost]} onPress={() => remove(t)}><Text style={[os.ghostText, { color: Colors.danger }]}>Delete</Text></TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
        {meta && meta.page < meta.pages ? (
          <TouchableOpacity style={os.more} onPress={() => load(meta.page + 1)}><Text style={os.moreText}>Show more ({meta.total - rows.length} left)</Text></TouchableOpacity>
        ) : null}
      </ScrollView>
      <AskSheet ask={ask} onClose={() => setAsk(null)} onDone={(m) => { setAsk(null); if (m) setFlash(m); load(1); }} />
    </>
  );
}
