import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as ttApi from '@/api/timetable.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Card, Select, Badge, FAB, confirmAsync, ActionBtn, fmtDateTime,
  SegTabs, SearchBar, FormModal, Input, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import { Tiles, plural } from '@/components/timetable/viewKit';
import { StatusBadge, tk } from '@/components/timetable/ttKit';

export default function TimetableVersionsScreen() {
  const [versions, setVersions] = useState<any[]>([]);
  const [years, setYears] = useState<any[]>([]);
  const [yearId, setYearId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string>('');   // expanded card
  const [summary, setSummary] = useState<any>({});
  const [generators, setGenerators] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [author, setAuthor] = useState('');
  const [q, setQ] = useState('');
  const [notes, setNotes] = useState<any>(null);       // { id, label, description }
  const [diff, setDiff] = useState<Record<string, any>>({});

  const load = useCallback(async (yid?: string) => {
    try {
      const [vRes, mRes] = await Promise.all([
        ttApi.getVersions({
          ...(yid ? { yearId: yid } : {}), ...(status ? { status } : {}), ...(author ? { generatedBy: author } : {}),
        }),
        years.length ? null : ttApi.getMeta(),
      ]);
      const d = unwrap(vRes);
      setVersions(d?.versions ?? []);
      // The tiles count the YEAR, never the filtered list — the server says so.
      setSummary(d?.summary ?? {});
      setGenerators(d?.generators ?? []);
      if (!yid) setYearId(d?.selectedYearId ?? '');
      if (mRes) setYears(unwrap(mRes)?.years ?? []);
      setError('');
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else setError(err?.message ?? 'Failed to load versions');
    } finally { setLoading(false); setRefreshing(false); }
  }, [years.length, status, author]);

  useEffect(() => { load(yearId || undefined); }, [status, author]); // eslint-disable-line

  /** Publish, after saying what it overwrites. */
  const publish = async (v: any) => {
    let preview: any = null;
    try { preview = unwrap(await ttApi.publishPreview(v._id)); } catch { /* the confirm still says enough */ }
    const lines = [
      'This becomes the timetable teachers, students and parents see. The version it replaces is kept.',
      preview?.sections != null ? `Sections rewritten: ${preview.sections}.` : '',
      v.errorCount > 0 ? `It still has ${plural(v.errorCount, 'error')} — those clashes go live with it.` : '',
    ].filter(Boolean).join('\n\n');
    await act(v._id, () => ttApi.publishVersion(v._id, {}), [`Publish v${v.versionNumber}?`, lines, 'Publish']);
  };

  const compare = async (v: any, liveId: string) => {
    setDiff((d) => ({ ...d, [v._id]: { loading: true } }));
    try {
      const d = unwrap(await ttApi.compareVersions(liveId, v._id));
      setDiff((x) => ({ ...x, [v._id]: d }));
    } catch (err: any) {
      setDiff((x) => ({ ...x, [v._id]: null }));
      setError(err?.message ?? 'Could not compare');
    }
  };

  const saveNotes = async () => {
    setBusy('notes');
    try {
      await ttApi.updateVersion(notes.id, { label: notes.label, description: notes.description });
      setNotes(null);
      await load(yearId);
    } catch (err: any) { setError(err?.message ?? 'Could not save notes'); }
    finally { setBusy(''); }
  };

  const act = async (key: string, fn: () => Promise<any>, confirm?: [string, string, string]) => {
    if (confirm && !(await confirmAsync(confirm[0], confirm[1], confirm[2]))) return;
    setBusy(key);
    try { await fn(); await load(yearId); }
    catch (err: any) { setError(err?.message ?? 'Action failed'); }
    finally { setBusy(''); }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Timetable Versions' }} /><ModuleDisabled /></>);
  if (loading) return (<><Stack.Screen options={{ title: 'Timetable Versions' }} /><LoaderView /></>);

  const published = versions.find((v) => v.status === 'published');
  const shown = versions.filter((v) => !q || [`v${v.versionNumber}`, v.label, v.description, v.generatedBy?.name]
    .filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <Stack.Screen options={{ title: 'Timetable Versions' }} />
      <ScrollView
        style={s.screen}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(yearId); }} tintColor={Colors.primary} />}
      >
        <Select label="Academic Year" value={yearId}
          options={years.map((y: any) => ({ label: y.yearName, value: y._id }))}
          onChange={(v) => { setYearId(v); setLoading(true); load(v); }} />

        <Tiles items={[
          { label: 'Versions', value: summary.total ?? 0, icon: 'layers', tone: 'info' },
          { label: 'Published', value: summary.published ?? 0, icon: 'checkmark-circle', tone: 'success' },
          { label: 'Drafts', value: summary.drafts ?? 0, icon: 'time', tone: 'warning' },
          { label: 'Conflicts', value: summary.conflicts ?? 0, icon: 'alert-circle', tone: summary.conflicts ? 'danger' : 'neutral' },
        ]} />
        {summary.archived ? <Text style={tk.hint}>{summary.archived} archived — hidden from the active list.</Text> : null}

        <SegTabs
          tabs={[
            { key: '', label: 'All' }, { key: 'published', label: 'Published' },
            { key: 'generated', label: 'Generated' }, { key: 'draft', label: 'Draft' },
            { key: 'conflict', label: 'Conflict' }, { key: 'archived', label: 'Archived' },
          ]}
          active={status} onChange={setStatus} />
        {generators.length > 1 && (
          <Select label="Generated by" value={author} onChange={setAuthor} placeholder="All users"
            options={[{ label: 'All users', value: '' }, ...generators.map((g: any) => ({ label: g.name, value: String(g._id) }))]} />
        )}
        <SearchBar value={q} onChange={setQ} placeholder="Search versions…" />

        {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}

        {published ? (
          <View style={s.liveBanner}>
            <Ionicons name="radio-button-on" size={14} color={Colors.success} />
            <Text style={s.liveText}>
              v{published.versionNumber} · {published.label} is live — teachers and students see this schedule.
            </Text>
          </View>
        ) : null}

        {!versions.length ? (
          <Empty icon="calendar-outline" text="No timetable versions yet — generate one to get started" />
        ) : !shown.length ? (
          <Empty icon="search-outline" text="Nothing matches that search." />
        ) : shown.map((v: any) => {
          const expanded = open === v._id;
          return (
            <Card key={v._id}>
              <TouchableOpacity activeOpacity={0.7} onPress={() => setOpen(expanded ? '' : v._id)}>
                <View style={s.cardHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.title}>v{v.versionNumber} · {v.label || 'Untitled'}</Text>
                    <Text style={s.sub}>
                      {v.scopeType === 'school' ? 'Entire school' : v.scopeType === 'multiple' ? 'Multiple classes' : 'Single class'}
                      {' · '}{plural(v.sectionCount ?? 0, 'section')}
                      {v.stats?.entriesGenerated != null ? ` · ${v.stats.entriesGenerated} periods` : ''}
                    </Text>
                  </View>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
                </View>

                <View style={s.badgeRow}>
                  <StatusBadge status={v.status} />
                  {v.errorCount > 0 ? <Badge label={plural(v.errorCount, 'error')} tone="danger" /> : null}
                  {v.warningCount > 0 ? <Badge label={`${v.warningCount} warning`} tone="warning" /> : null}
                </View>
                {v.description ? <Text style={s.notes} numberOfLines={2}>{v.description}</Text> : null}
                <Text style={s.meta}>
                  Generated {fmtDateTime(v.generatedAt ?? v.createdAt)}{v.generatedBy?.name ? ` by ${v.generatedBy.name}` : ''}
                  {v.publishedAt ? ` · Published ${fmtDateTime(v.publishedAt)}` : ''}
                </Text>
              </TouchableOpacity>

              {expanded && (
                <View style={[s.actions, busy === v._id && { opacity: 0.5 }]} pointerEvents={busy === v._id ? 'none' : 'auto'}>
                  <ActionBtn label="Open" tone="info" small
                    onPress={() => router.push({ pathname: '/modules/admin/timetable-version', params: { id: v._id } } as any)} />
                  {v.status !== 'published' && v.status !== 'archived' && (
                    <ActionBtn label="Set as published" tone="success" small onPress={() => publish(v)} />
                  )}
                  <ActionBtn label="Edit notes" small
                    onPress={() => setNotes({ id: v._id, label: v.label || '', description: v.description || '' })} />
                  {published && published._id !== v._id && (
                    <ActionBtn label="Compare to live" small onPress={() => compare(v, published._id)} />
                  )}
                  {v.status === 'archived' ? (
                    <ActionBtn label="Restore" tone="success" small
                      onPress={() => act(v._id, async () => {
                        const d = unwrap(await ttApi.restoreVersion(v._id));
                        router.push({ pathname: '/modules/admin/timetable-version', params: { id: d.versionId } } as any);
                      })} />
                  ) : (
                    <ActionBtn label="Duplicate" tone="neutral" small
                      onPress={() => act(v._id, () => ttApi.duplicateVersion(v._id))} />
                  )}
                  <ActionBtn label="Regenerate" tone="warning" small
                    onPress={() => act(v._id, async () => {
                      const d = unwrap(await ttApi.regenerate(v._id, { options: { preserveManualEdits: true } }));
                      router.push({ pathname: '/modules/admin/timetable-version', params: { id: d.versionId } } as any);
                    }, ['Regenerate', 'Create a new version from this one? The published timetable is not touched.', 'Regenerate'])} />
                  {v.status !== 'published' && v.status !== 'archived' && (
                    <ActionBtn label="Archive" tone="neutral" small
                      onPress={() => act(v._id, () => ttApi.archiveVersion(v._id), ['Archive', `Archive v${v.versionNumber}?`, 'Archive'])} />
                  )}
                  {v.status !== 'published' && (
                    <ActionBtn label="Delete" tone="danger" small
                      onPress={() => act(v._id, () => ttApi.deleteVersion(v._id), ['Delete version', `Delete v${v.versionNumber}? Its draft periods are removed.`, 'Delete'])} />
                  )}
                </View>
              )}

              {expanded && diff[v._id] && (
                diff[v._id].loading ? <LoaderView /> : (
                  <View style={s.diff}>
                    <Text style={s.diffHead}>
                      Against the live v{diff[v._id].from?.versionNumber}:
                      {' '}{diff[v._id].summary?.added ?? 0} added · {diff[v._id].summary?.removed ?? 0} removed ·
                      {' '}{diff[v._id].summary?.changed ?? 0} changed
                    </Text>
                    {!(diff[v._id].changes ?? []).length ? (
                      <Text style={s.sub}>These two schedule every period the same way.</Text>
                    ) : (diff[v._id].changes as any[]).slice(0, 12).map((c, i) => (
                      <Text key={i} style={s.diffRow} numberOfLines={2}>
                        {c.section} · {c.dayOfWeek?.slice(0, 3)} P{c.periodNumber}:
                        {' '}{c.from ? c.from.subject : '—'} → {c.to ? c.to.subject : '—'}
                      </Text>
                    ))}
                    {(diff[v._id].changes ?? []).length > 12 && (
                      <Text style={s.sub}>+{diff[v._id].changes.length - 12} more changes.</Text>
                    )}
                  </View>
                )
              )}
            </Card>
          );
        })}

        <Text style={tk.hint}>
          Publishing never destroys a previous schedule — the version it replaces is archived and can be restored.
        </Text>
      </ScrollView>

      <FAB icon="flash" onPress={() => router.push('/modules/admin/timetable-generate' as any)} />

      <FormModal visible={!!notes} title="Version notes" onClose={() => setNotes(null)}
        onSubmit={saveNotes} submitting={busy === 'notes'}>
        {notes && (
          <>
            <Input label="Name" value={notes.label} onChange={(v) => setNotes((n: any) => ({ ...n, label: v }))} />
            <Input label="Notes" multiline value={notes.description} placeholder="What is different about this run?"
              onChange={(v) => setNotes((n: any) => ({ ...n, description: v }))} />
          </>
        )}
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 },
  meta: { fontSize: 10.5, color: Colors.textLight, marginTop: 6 },
  notes: { fontSize: 11.5, color: Colors.text, marginTop: 6, backgroundColor: Colors.surfaceAlt, padding: 7, borderRadius: Radius.sm },
  diff: { marginTop: 10, padding: 9, borderRadius: Radius.sm, backgroundColor: Colors.surfaceAlt, gap: 4 },
  diffHead: { fontSize: 11.5, fontWeight: '700', color: Colors.text },
  diffRow: { fontSize: 11, color: Colors.textSecondary },
  actions: {
    flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 10,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  liveBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.successLight,
    borderRadius: Radius.md, padding: 10, marginBottom: 10,
  },
  liveText: { fontSize: 11.5, color: Colors.success, flex: 1, fontWeight: '600' },
  errorBox: { backgroundColor: Colors.dangerLight, borderRadius: Radius.md, padding: 10, marginBottom: 10 },
  errorText: { color: Colors.danger, fontSize: 12.5 },
});
