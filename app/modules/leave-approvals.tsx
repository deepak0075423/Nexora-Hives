import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { FocusRow } from '@/components/FocusHighlight';
import { Stack } from 'expo-router';
import { Colors, Spacing, Typography } from '@/constants/theme';
import * as teacherApi from '@/api/teacher.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, ActionBtn, SegTabs,
  FormModal, Input, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

// Leave sign-off queue for approvers picked by designation (e.g. a Principal).
// They are teachers, so the admin screens are closed to them — this is where
// their queue lives. Reached from the Leave screen.

const TABS = [
  { key: 'pending',  label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: '',         label: 'All' },
];

export default function LeaveApprovalsScreen() {
  // First hook in the component on purpose: the early module-disabled
  // return sits below, and a hook after it would not run every render.
  // Held so a notification can scroll its record into view.
  const scrollRef = useRef<ScrollView>(null);
  const [status, setStatus] = useState('pending');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const [action, setAction] = useState<{ type: 'approve' | 'reject'; leave: any } | null>(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async (st = status) => {
    try {
      const res: any = await teacherApi.getLeaveApprovals(st ? { status: st } : {});
      setData(unwrap(res));
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);
  const changeTab = (st: string) => { setStatus(st); setLoading(true); load(st); };

  const run = async () => {
    if (!action) return;
    setSaving(true);
    try {
      if (action.type === 'approve') {
        const res: any = await teacherApi.approveLeaveRequest(action.leave._id, { adminComment: comment });
        const left = res?.pendingLevels ?? 0;
        Alert.alert('Done', left > 0
          ? `Approval recorded — ${left} more sign-off needed`
          : 'Leave approved');
      } else {
        await teacherApi.rejectLeaveRequest(action.leave._id, { adminComment: comment });
        Alert.alert('Done', 'Leave rejected');
      }
      setAction(null); setComment('');
      load();
    } catch (err: any) { Alert.alert('Error', err?.data?.message ?? err.message); }
    finally { setSaving(false); }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Leave Approvals' }} /><ModuleDisabled /></>);

  const items = data?.items ?? [];

  return (
    <>
      <Stack.Screen options={{ title: 'Leave Approvals' }} />
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : data?.isApprover === false ? (
          <Empty icon="checkmark-done-outline" text="You are not an approver for any leave type" />
        ) : (
          <>
            <SegTabs tabs={TABS} active={status} onChange={changeTab} />
            {items.length === 0 ? (
              <Empty icon="checkmark-done-outline" text="Nothing waiting for you" />
            ) : items.map((lv: any) => (
              <FocusRow key={lv._id} id={lv._id} scrollRef={scrollRef}>
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text style={s.title}>{lv.teacher?.name ?? '--'}</Text>
                  <Badge label={lv.status} />
                </View>
                <KV label="Type" value={lv.leaveType?.name ?? lv.leaveType?.code ?? '--'} />
                <KV label="Dates" value={`${fmtDate(lv.fromDate)} – ${fmtDate(lv.toDate)} (${lv.totalDays}d)`} />
                {lv.reason ? <KV label="Reason" value={lv.reason} /> : null}
                {lv.approvalsRequired > 1 && lv.status === 'pending'
                  ? <KV label="Sign-off" value={`${lv.approvalLevel ?? 0} of ${lv.approvalsRequired}`} /> : null}
                {lv.status === 'pending' && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <View style={{ flex: 1 }}>
                      <ActionBtn label="Approve" tone="success"
                        onPress={() => { setComment(''); setAction({ type: 'approve', leave: lv }); }} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ActionBtn label="Reject" tone="danger"
                        onPress={() => { setComment(''); setAction({ type: 'reject', leave: lv }); }} />
                    </View>
                  </View>
                )}
              </Card>
              </FocusRow>
            ))}
          </>
        )}
      </ScrollView>

      <FormModal
        visible={!!action}
        title={action?.type === 'approve' ? 'Approve Leave' : 'Reject Leave'}
        onClose={() => setAction(null)}
        onSubmit={run}
        submitting={saving}
        submitLabel={action?.type === 'approve' ? 'Approve' : 'Reject'}
      >
        {action && (
          <>
            <KV label="Employee" value={action.leave.teacher?.name ?? '--'} />
            <KV label="Type" value={action.leave.leaveType?.name ?? '--'} />
            <KV label="Dates" value={`${fmtDate(action.leave.fromDate)} – ${fmtDate(action.leave.toDate)}`} />
            {action.type === 'approve'
              && action.leave.approvalsRequired > 1
              && (action.leave.approvalLevel ?? 0) + 1 < action.leave.approvalsRequired ? (
              <Text style={s.note}>
                This is the first of two sign-offs — the leave is not approved and no balance moves until the second one.
              </Text>
            ) : null}
            <Input label="Comment" value={comment} onChange={setComment} placeholder="Optional note" multiline />
          </>
        )}
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  title: { ...Typography.label, color: Colors.text },
  note:  { ...Typography.bodySmall, color: Colors.textSecondary, marginVertical: 8, lineHeight: 18 },
});
