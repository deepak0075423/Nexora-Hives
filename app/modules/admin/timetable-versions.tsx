import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as ttApi from '@/api/timetable.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { unwrap, LoaderView, Empty, Card, Select, Badge, FAB, confirmAsync, ActionBtn, fmtDateTime } from '@/components/ui/kit';
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

  const load = useCallback(async (yid?: string) => {
    try {
      const [vRes, mRes] = await Promise.all([
        ttApi.getVersions(yid ? { yearId: yid } : {}),
        years.length ? null : ttApi.getMeta(),
      ]);
      const d = unwrap(vRes);
      setVersions(d?.versions ?? []);
      if (!yid) setYearId(d?.selectedYearId ?? '');
      if (mRes) setYears(unwrap(mRes)?.years ?? []);
      setError('');
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
      else setError(err?.message ?? 'Failed to load versions');
    } finally { setLoading(false); setRefreshing(false); }
  }, [years.length]);

  useEffect(() => { load(); }, []); // eslint-disable-line

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
        ) : versions.map((v: any) => {
          const expanded = open === v._id;
          return (
            <Card key={v._id}>
              <TouchableOpacity activeOpacity={0.7} onPress={() => setOpen(expanded ? '' : v._id)}>
                <View style={s.cardHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.title}>v{v.versionNumber} · {v.label || 'Untitled'}</Text>
                    <Text style={s.sub}>
                      {v.scopeType === 'school' ? 'Entire school' : v.scopeType === 'multiple' ? 'Multiple classes' : 'Single class'}
                      {' · '}{v.sectionCount} section(s)
                      {v.stats?.entriesGenerated != null ? ` · ${v.stats.entriesGenerated} periods` : ''}
                    </Text>
                  </View>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
                </View>

                <View style={s.badgeRow}>
                  <StatusBadge status={v.status} />
                  {v.errorCount > 0 ? <Badge label={`${v.errorCount} error`} tone="danger" /> : null}
                  {v.warningCount > 0 ? <Badge label={`${v.warningCount} warning`} tone="warning" /> : null}
                </View>
                <Text style={s.meta}>
                  Generated {fmtDateTime(v.generatedAt ?? v.createdAt)}{v.generatedBy?.name ? ` by ${v.generatedBy.name}` : ''}
                  {v.publishedAt ? ` · Published ${fmtDateTime(v.publishedAt)}` : ''}
                </Text>
              </TouchableOpacity>

              {expanded && (
                <View style={[s.actions, busy === v._id && { opacity: 0.5 }]} pointerEvents={busy === v._id ? 'none' : 'auto'}>
                  <ActionBtn label="Open" tone="info" small
                    onPress={() => router.push({ pathname: '/modules/admin/timetable-version', params: { id: v._id } } as any)} />
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
            </Card>
          );
        })}

        <Text style={tk.hint}>
          Publishing never destroys a previous schedule — the version it replaces is archived and can be restored.
        </Text>
      </ScrollView>

      <FAB icon="flash" onPress={() => router.push('/modules/admin/timetable-generate' as any)} />
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
