import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as libApi from '@/api/library.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  LoaderView, Empty, RowItem, Badge, SegTabs, ActionBtn, confirmAsync, fmtDate,
  FormModal, Input, KV, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

export default function LibraryReservationsScreen() {
  const [tab, setTab] = useState('');   // All — matches the web default
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

  // Handing over a held book is what this queue exists for. The row already
  // knows the book and the person, and the server names the copy to give out,
  // so there is no reason to send the librarian to the Circulation screen.
  const issueToHolder = async (r: any) => {
    const copy = r.availableCopy;
    if (!copy) return Alert.alert('No copy free', 'Every copy of this book is currently out.');
    const ok = await confirmAsync(
      'Hand over the book',
      `Give ${copy.uniqueCode}${copy.rackLocation ? ` (${copy.rackLocation})` : ''} of "${r.book?.title}" to ${r.reservedBy?.name}?`,
      'Issue',
    );
    if (!ok) return;
    try {
      await libApi.issueBook({
        bookId: r.book?._id ?? r.book,
        copyId: copy._id,
        userId: r.reservedBy?._id ?? r.reservedBy,
      });
      Alert.alert('Issued', `${copy.uniqueCode} is now with ${r.reservedBy?.name}.`);
      load(tab);
    } catch (err: any) { Alert.alert('Cannot issue', err.message); }
  };

  const markReady = async (r: any) => {
    if (!(await confirmAsync('Mark Ready', `Mark "${r.book?.title}" ready for pickup by ${r.reservedBy?.name}?`, 'Mark Ready'))) return;
    try { await libApi.markReservationReady(r._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  // The member gets a notification when their reservation is cancelled, so the
  // reason is collected here — a bare "cancelled" is not much of a message.
  const [cancelling, setCancelling] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSaving, setCancelSaving] = useState(false);

  const submitCancel = async () => {
    setCancelSaving(true);
    try {
      await libApi.cancelReservation(cancelling._id, cancelReason.trim() || undefined);
      setCancelling(null); setCancelReason('');
      load(tab);
      Alert.alert('Cancelled', `${cancelling.reservedBy?.name ?? 'The member'} has been notified.`);
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setCancelSaving(false); }
  };

  const cancel = (r: any) => { setCancelReason(''); setCancelling(r); };

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
          tabs={[{ key: 'pending', label: 'Pending' }, { key: 'ready', label: 'Ready' }, { key: 'collected', label: 'Collected' }, { key: '', label: 'All' }]}
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
                sub={[
                  r.reservedBy?.name ?? '--',
                  `queue #${r.queuePosition ?? '-'}`,
                  r.availableCopy ? `give ${r.availableCopy.uniqueCode}` : 'no copy free',
                  fmtDate(r.reservedAt),
                ].join(' · ')}
                right={<Badge label={r.status} />}
              />
              {(r.status === 'pending' || r.status === 'ready') && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: -4, marginBottom: 8 }}>
                  {r.availableCopy && (
                    <View style={{ flex: 1 }}>
                      <ActionBtn label="Issue" tone="success" small onPress={() => issueToHolder(r)} />
                    </View>
                  )}
                  {r.status === 'pending' && (
                    <View style={{ flex: 1 }}>
                      <ActionBtn label="Mark Ready" tone="info" small onPress={() => markReady(r)} />
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

      <FormModal visible={!!cancelling} title="Cancel Reservation"
        onClose={() => setCancelling(null)} onSubmit={submitCancel}
        submitting={cancelSaving} submitLabel="Cancel reservation">
        <KV label="Book" value={cancelling?.book?.title} />
        <KV label="Reserved by" value={cancelling?.reservedBy?.name} />
        <Input label="Reason (optional)" value={cancelReason} onChange={setCancelReason}
          placeholder="e.g. copy withdrawn for rebinding" />
        <Text style={{ color: Colors.textLight, fontSize: 12, paddingHorizontal: 2 }}>
          Included in the notification the member receives.
        </Text>
      </FormModal>
    </>
  );
}
