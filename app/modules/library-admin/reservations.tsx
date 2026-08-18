import React, { useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as libApi from '@/api/library.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  LoaderView, Empty, RowItem, Badge, SegTabs, ActionBtn, confirmAsync, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

export default function LibraryReservationsScreen() {
  const [tab, setTab] = useState('pending');
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async (st = tab) => {
    try {
      const res: any = await libApi.getReservations({ page: 1, limit: 50, ...(st ? { status: st } : {}) });
      setList((res as any)?.data ?? []);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code) || err?.status === 403) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);
  const changeTab = (st: string) => { setTab(st); setLoading(true); load(st); };

  const markReady = async (r: any) => {
    if (!(await confirmAsync('Mark Ready', `Mark "${r.book?.title}" ready for pickup by ${r.reservedBy?.name}?`, 'Mark Ready'))) return;
    try { await libApi.markReservationReady(r._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const cancel = async (r: any) => {
    if (!(await confirmAsync('Cancel Reservation', `Cancel reservation for "${r.book?.title}"?`, 'Cancel Reservation'))) return;
    try { await libApi.cancelReservation(r._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Reservations' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Reservations' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <SegTabs
          tabs={[{ key: 'pending', label: 'Pending' }, { key: 'ready', label: 'Ready' }, { key: '', label: 'All' }]}
          active={tab} onChange={changeTab}
        />
        {loading ? <LoaderView /> : list.length === 0 ? (
          <Empty icon="bookmark-outline" text="No reservations" />
        ) : (
          list.map((r: any) => (
            <View key={r._id} style={{ marginBottom: 4 }}>
              <RowItem
                icon="bookmark" iconColor="#059669" iconBg="#D1FAE5"
                title={r.book?.title ?? '--'}
                sub={`${r.reservedBy?.name ?? '--'} · queue #${r.queuePosition ?? '-'} · ${fmtDate(r.reservedAt)}`}
                right={<Badge label={r.status} />}
              />
              {(r.status === 'pending' || r.status === 'ready') && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: -4, marginBottom: 8 }}>
                  {r.status === 'pending' && (
                    <View style={{ flex: 1 }}>
                      <ActionBtn label="Mark Ready" tone="success" small onPress={() => markReady(r)} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <ActionBtn label="Cancel" tone="danger" small onPress={() => cancel(r)} />
                  </View>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
}
