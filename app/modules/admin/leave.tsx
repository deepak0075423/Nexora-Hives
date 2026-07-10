import React, { useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, ActionBtn, SegTabs,
  FormModal, Input, fmtDate,
} from '@/components/ui/kit';

const STATUS_TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: '', label: 'All' },
];

export default function AdminLeaveScreen() {
  const [status, setStatus] = useState('pending');
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [rejecting, setRejecting] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async (st = status) => {
    try {
      const res: any = await adminApi.getLeaveRequests({ ...(st ? { status: st } : {}), page: 1, limit: 50 });
      setList((res as any)?.data ?? unwrap(res) ?? []);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);
  const changeTab = (st: string) => { setStatus(st); setLoading(true); load(st); };

  const approve = async (r: any) => {
    try { await adminApi.approveLeave(r._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const submitReject = async () => {
    setSaving(true);
    try {
      await adminApi.rejectLeave(rejecting._id, { reason: rejectReason, adminComment: rejectReason });
      setRejecting(null); setRejectReason('');
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Leave Requests' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Leave Requests' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <SegTabs tabs={STATUS_TABS} active={status} onChange={changeTab} />
        {loading ? <LoaderView /> : list.length === 0 ? (
          <Empty icon="airplane-outline" text="No leave requests" />
        ) : (
          list.map((lv: any) => (
            <Card key={lv._id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <KV label="Teacher" value={lv.teacher?.name ?? '--'} />
              </View>
              <KV label="Type" value={lv.leaveType?.name ?? lv.leaveType?.code ?? '--'} />
              <KV label="Dates" value={`${fmtDate(lv.fromDate)} – ${fmtDate(lv.toDate)}${lv.totalDays ? ` (${lv.totalDays}d)` : ''}`} />
              {lv.reason ? <KV label="Reason" value={lv.reason} /> : null}
              <KV label="Status" value={<Badge label={lv.status} />} />
              {lv.status === 'pending' && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <View style={{ flex: 1 }}>
                    <ActionBtn label="Approve" tone="success" onPress={() => approve(lv)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ActionBtn label="Reject" tone="danger" onPress={() => setRejecting(lv)} />
                  </View>
                </View>
              )}
            </Card>
          ))
        )}
      </ScrollView>

      <FormModal visible={!!rejecting} title="Reject Leave" onClose={() => setRejecting(null)} onSubmit={submitReject} submitting={saving} submitLabel="Reject">
        <Input label="Reason" value={rejectReason} onChange={setRejectReason} placeholder="Why is this rejected?" multiline />
      </FormModal>
    </>
  );
}
