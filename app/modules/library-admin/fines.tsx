import React, { useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as libApi from '@/api/library.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  LoaderView, Empty, RowItem, Badge, SegTabs, ActionBtn, FormModal, Input,
  confirmAsync, fmtMoney, fmtDate,
} from '@/components/ui/kit';

export default function LibraryFinesScreen() {
  const [tab, setTab] = useState('pending');
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [waiving, setWaiving] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async (st = tab) => {
    try {
      const res: any = await libApi.getFines({ page: 1, limit: 50, ...(st ? { status: st } : {}) });
      setList((res as any)?.data ?? []);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED' || err?.status === 403) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);
  const changeTab = (st: string) => { setTab(st); setLoading(true); load(st); };

  const collect = async (f: any) => {
    if (!(await confirmAsync('Collect Fine', `Collect ${fmtMoney(f.amount)} from ${f.user?.name}?`, 'Collect'))) return;
    try { await libApi.collectFine(f._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const submitWaive = async () => {
    setSaving(true);
    try {
      await libApi.waiveFine(waiving._id, { reason });
      setWaiving(null); setReason('');
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Fines' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Library Fines' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <SegTabs
          tabs={[{ key: 'pending', label: 'Pending' }, { key: 'paid', label: 'Paid' }, { key: 'waived', label: 'Waived' }, { key: '', label: 'All' }]}
          active={tab} onChange={changeTab}
        />
        {loading ? <LoaderView /> : list.length === 0 ? (
          <Empty icon="cash-outline" text="No fines here" />
        ) : (
          list.map((f: any) => (
            <View key={f._id} style={{ marginBottom: 4 }}>
              <RowItem
                icon="cash" iconColor={Colors.warning} iconBg={Colors.warningLight}
                title={`${fmtMoney(f.amount)} · ${f.user?.name ?? '--'}`}
                sub={`${f.fineType?.replace('_', ' ') ?? ''} · ${f.daysOverdue ?? 0} day(s) overdue · ${fmtDate(f.createdAt)}`}
                right={<Badge label={f.status} />}
              />
              {f.status === 'pending' && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: -4, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <ActionBtn label="Collect" tone="success" small onPress={() => collect(f)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ActionBtn label="Waive" tone="warning" small onPress={() => setWaiving(f)} />
                  </View>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <FormModal visible={!!waiving} title="Waive Fine" onClose={() => setWaiving(null)} onSubmit={submitWaive} submitting={saving} submitLabel="Waive">
        <Input label="Reason" value={reason} onChange={setReason} placeholder="Why is this fine waived?" multiline />
      </FormModal>
    </>
  );
}
