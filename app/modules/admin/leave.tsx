import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors, Spacing, Typography } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, ActionBtn, SegTabs, RowItem,
  FormModal, Input, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

const STATUS_TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: '', label: 'All' },
];

export default function AdminLeaveScreen() {
  const router = useRouter();
  const [status, setStatus] = useState('pending');
  const [compOffPending, setCompOffPending] = useState<number | null>(null);
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  // One modal serves both destructive actions — each just needs a comment
  const [action, setAction] = useState<{ type: 'reject' | 'reverse'; leave: any } | null>(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async (st = status) => {
    try {
      const res: any = await adminApi.getLeaveRequests({ ...(st ? { status: st } : {}), page: 1, limit: 50 });
      setList((res as any)?.data ?? unwrap(res) ?? []);
      // Comp Off belongs to the same module — surface its pending count here so
      // the queue is not hidden behind a second navigation guess.
      const co: any = await adminApi.getCompOffRequests({ status: 'pending', limit: 1 }).catch(() => null);
      const coData = unwrap(co);
      setCompOffPending(coData?.enabled === false ? null : (coData?.total ?? 0));
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);
  const changeTab = (st: string) => { setStatus(st); setLoading(true); load(st); };

  const approve = async (r: any) => {
    try { await adminApi.approveLeave(r._id); load(); }
    catch (err: any) { Alert.alert('Error', err?.data?.message ?? err.message); }
  };

  const submitAction = async () => {
    if (!action) return;
    setSaving(true);
    try {
      if (action.type === 'reject') {
        await adminApi.rejectLeave(action.leave._id, { reason: comment, adminComment: comment });
      } else {
        await adminApi.reverseApprovedLeave(action.leave._id, { adminComment: comment });
        Alert.alert('Done', `Leave reversed — ${action.leave.totalDays ?? 0} day(s) restored to the balance`);
      }
      setAction(null); setComment('');
      load();
    } catch (err: any) { Alert.alert('Error', err?.data?.message ?? err.message); }
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
        <RowItem
          icon="options-outline" iconColor={Colors.primary} iconBg={Colors.surfaceAlt}
          title="Leave Policies"
          sub="Configure the rules for each leave type"
          onPress={() => router.push('/modules/admin/leave-policies' as any)}
        />
        {compOffPending !== null && (
          <RowItem
            icon="time-outline" iconColor={Colors.primary} iconBg={Colors.surfaceAlt}
            title="Comp Off"
            sub={compOffPending > 0 ? `${compOffPending} request(s) awaiting approval` : 'No requests waiting'}
            onPress={() => router.push('/modules/admin/comp-off' as any)}
          />
        )}
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
                    <ActionBtn label="Reject" tone="danger" onPress={() => { setComment(''); setAction({ type: 'reject', leave: lv }); }} />
                  </View>
                </View>
              )}
              {/* Undoing an approval is the only way to hand the days back — and
                  the Comp Off screen refuses to withdraw a credit until the
                  leave that spent it has been reversed here. */}
              {lv.status === 'approved' && (
                <View style={{ marginTop: 10 }}>
                  <ActionBtn label="Reverse" tone="danger" onPress={() => { setComment(''); setAction({ type: 'reverse', leave: lv }); }} />
                </View>
              )}
            </Card>
          ))
        )}
      </ScrollView>

      <FormModal
        visible={!!action}
        title={action?.type === 'reverse' ? 'Reverse Approved Leave' : 'Reject Leave'}
        onClose={() => setAction(null)}
        onSubmit={submitAction}
        submitting={saving}
        submitLabel={action?.type === 'reverse' ? 'Reverse' : 'Reject'}
      >
        {action && (
          <>
            <KV label="Teacher" value={action.leave.teacher?.name ?? '--'} />
            <KV label="Dates" value={`${fmtDate(action.leave.fromDate)} – ${fmtDate(action.leave.toDate)}`} />
            {action.type === 'reverse' ? (
              <Text style={s.note}>
                This undoes the approval and returns {action.leave.totalDays ?? 0} day(s) to the teacher's balance.
                {action.leave.leaveType?.category === 'compoff'
                  ? ' The Comp Off days go back into the lots they were spent from.'
                  : ''}
              </Text>
            ) : null}
            <Input
              label="Reason"
              value={comment}
              onChange={setComment}
              placeholder={action.type === 'reverse' ? 'Why is this being reversed?' : 'Why is this rejected?'}
              multiline
            />
          </>
        )}
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  note: { ...Typography.bodySmall, color: Colors.textSecondary, marginVertical: 8, lineHeight: 18 },
});
