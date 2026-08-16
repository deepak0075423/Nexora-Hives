import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as videoApi from '@/api/video.api';
import ModuleDisabled from '@/components/ModuleDisabled';

type Tab = 'library' | 'approvals';

export default function AdminVideosScreen() {
  const [tab, setTab] = useState<Tab>('library');
  const [items, setItems] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = useCallback(async () => {
    try {
      const [br, ap, ov]: any[] = await Promise.all([
        videoApi.adminBrowse({ limit: 30 }), videoApi.adminApprovals('pending'), videoApi.adminOverview(),
      ]);
      setItems(((br as any)?.data ?? br)?.items ?? []);
      setApprovals((ap as any)?.data ?? ap ?? []);
      setOverview((ov as any)?.data ?? ov);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const toggle = async (v: any) => {
    try { await videoApi.adminEnable(v._id, { enabled: !v.enabled }); load(); }
    catch (err: any) { Alert.alert('Error', err?.message || 'Could not update'); }
  };
  const approve = async (id: string) => { try { await videoApi.adminApprove(id); load(); } catch (e: any) { Alert.alert('Error', e?.message); } };
  const reject = (id: string) => {
    Alert.alert('Reject video?', 'The teacher will be notified.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: async () => { try { await videoApi.adminReject(id, { reason: '' }); load(); } catch (e: any) { Alert.alert('Error', e?.message); } } },
    ]);
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Video Learning' }} /><ModuleDisabled /></>);
  if (loading) return (<><Stack.Screen options={{ title: 'Video Learning' }} /><View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View></>);

  return (
    <>
      <Stack.Screen options={{ title: 'Video Learning' }} />
      {overview ? (
        <View style={s.statRow}>
          <Stat label="Enabled" value={overview.counts?.enabledCount ?? 0} />
          <Stat label="Assignments" value={overview.counts?.assignmentCount ?? 0} />
          <Stat label="Pending" value={overview.counts?.pendingApprovals ?? 0} />
        </View>
      ) : null}

      <View style={s.tabs}>
        {(['library', 'approvals'] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabTxt, tab === t && s.tabTxtActive]}>
              {t === 'library' ? 'Library' : `Approvals${approvals.length ? ` (${approvals.length})` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={s.screen} contentContainerStyle={{ padding: Spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
        {tab === 'library' ? (
          items.length === 0 ? <Text style={s.muted}>No published master videos to show.</Text> : items.map((v) => (
            <View key={v._id} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} numberOfLines={2}>{v.title}</Text>
                <Text style={s.rowSub}>{(v.taxonomy?.board || []).slice(0, 2).join(', ')} · {String(v.category || '').replace(/_/g, ' ')}</Text>
              </View>
              <TouchableOpacity style={[s.toggleBtn, v.enabled ? s.on : s.off]} onPress={() => toggle(v)}>
                <Ionicons name={v.enabled ? 'checkmark' : 'add'} size={14} color={v.enabled ? '#16A34A' : Colors.primary} />
                <Text style={[s.toggleTxt, { color: v.enabled ? '#16A34A' : Colors.primary }]}>{v.enabled ? 'Enabled' : 'Enable'}</Text>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          approvals.length === 0 ? <Text style={s.muted}>Nothing pending approval.</Text> : approvals.map((v) => (
            <View key={v._id} style={s.approvalCard}>
              <Text style={s.rowTitle} numberOfLines={2}>{v.title}</Text>
              <Text style={s.rowSub}>By {v.createdBy?.name || '—'} · {v.source}</Text>
              <View style={s.approvalActions}>
                <TouchableOpacity style={s.approveBtn} onPress={() => approve(v._id)}><Text style={s.approveTxt}>Approve</Text></TouchableOpacity>
                <TouchableOpacity style={s.rejectBtn} onPress={() => reject(v._id)}><Text style={s.rejectTxt}>Reject</Text></TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (<View style={s.stat}><Text style={s.statVal}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>);
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  muted: { color: Colors.textSecondary, ...Typography.body, padding: Spacing.md },
  statRow: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, paddingBottom: 0 },
  stat: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '700', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textSecondary },
  tabs: { flexDirection: 'row', backgroundColor: Colors.surface, paddingHorizontal: Spacing.md, gap: Spacing.sm, paddingVertical: Spacing.sm, marginTop: Spacing.md },
  tab: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: Radius.sm },
  tabActive: { backgroundColor: Colors.primary },
  tabTxt: { ...Typography.label, color: Colors.textSecondary },
  tabTxtActive: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.sm },
  rowTitle: { ...Typography.label, color: Colors.text, fontWeight: '600' },
  rowSub: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1 },
  on: { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' },
  off: { backgroundColor: '#EEF2FF', borderColor: '#E0E7FF' },
  toggleTxt: { fontSize: 12, fontWeight: '600' },
  approvalCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  approvalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  approveBtn: { flex: 1, backgroundColor: '#16A34A', borderRadius: Radius.sm, paddingVertical: 9, alignItems: 'center' },
  approveTxt: { color: '#fff', fontWeight: '600' },
  rejectBtn: { flex: 1, backgroundColor: '#FEE2E2', borderRadius: Radius.sm, paddingVertical: 9, alignItems: 'center' },
  rejectTxt: { color: '#DC2626', fontWeight: '600' },
});
