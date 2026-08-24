import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { FocusRow } from '@/components/FocusHighlight';
import { Stack, useRouter } from 'expo-router';
import { Colors, Spacing, Typography } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, ActionBtn, SegTabs, RowItem,
  FormModal, Input, Select, FAB, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import LeavePreviewPanel from '@/components/LeavePreviewPanel';
import { validateLeaveDates, dateRuleHint, todayStr } from '@/utils/leaveDates';

const EMPTY_APPLY = { teacherId: '', leaveTypeId: '', fromDate: '', toDate: '', leaveMode: 'full_day', halfDaySession: 'first', reason: '' };

const STATUS_TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: '', label: 'All' },
];

export default function AdminLeaveScreen() {
  // First hook in the component on purpose: the early module-disabled
  // return sits below, and a hook after it would not run every render.
  // Held so a notification can scroll its record into view.
  const scrollRef = useRef<ScrollView>(null);
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

  // ── Apply on behalf of a teacher ───────────────────────────────────────────
  const [teachers, setTeachers] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [applyOpen, setApplyOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_APPLY);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = async (st = status) => {
    try {
      const res: any = await adminApi.getLeaveRequests({ ...(st ? { status: st } : {}), page: 1, limit: 50 });
      setList((res as any)?.data ?? unwrap(res) ?? []);
      // Comp Off belongs to the same module — surface its pending count here so
      // the queue is not hidden behind a second navigation guess.
      const co: any = await adminApi.getCompOffRequests({ status: 'pending', limit: 1 }).catch(() => null);
      const coData = unwrap(co);
      setCompOffPending(coData?.enabled === false ? null : (coData?.total ?? 0));

      // Needed by the apply-on-behalf form. The type list carries each type's
      // effective policy, so the date rules come with it.
      const [tRes, tyRes]: [any, any] = await Promise.all([
        adminApi.getTeachers({ limit: 500 }).catch(() => null),
        adminApi.getLeaveTypes().catch(() => null),
      ]);
      setTeachers(unwrap(tRes)?.data ?? unwrap(tRes) ?? []);
      setTypes((unwrap(tyRes) ?? []).filter((t: any) => t.isActive));
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

  const selType   = types.find((t: any) => t._id === form.leaveTypeId);
  // Admin files on behalf: back-dating still binds, the notice period does not.
  const dateRules = selType ? { ...selType, advanceNoticeDays: 0 } : null;
  const dateHint  = dateRuleHint(dateRules);
  const dateError = (form.fromDate || form.toDate)
    ? validateLeaveDates(form.fromDate, form.toDate, dateRules)
    : '';

  useEffect(() => {
    if (!applyOpen || !form.teacherId || !form.leaveTypeId) { setPreview(null); return; }
    let live = true;
    setPreviewLoading(true);
    const t = setTimeout(async () => {
      try {
        const res: any = await adminApi.getLeaveApplyPreview({
          teacherId: form.teacherId,
          leaveTypeId: form.leaveTypeId,
          ...(dateError ? {} : { fromDate: form.fromDate, toDate: form.toDate }),
          leaveMode: form.leaveMode,
        });
        if (live) setPreview(unwrap(res));
      } catch { if (live) setPreview(null); }
      finally { if (live) setPreviewLoading(false); }
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [applyOpen, form.teacherId, form.leaveTypeId, form.fromDate, form.toDate, form.leaveMode, dateError]);

  const submitApply = async () => {
    if (dateError) { Alert.alert('Check the dates', dateError); return; }
    if (!form.reason.trim()) { Alert.alert('Reason required', 'Please give a reason.'); return; }
    // Every warning the preview returns is a rule the POST would reject anyway.
    if (preview?.warning) { Alert.alert('Cannot apply', preview.warning); return; }
    if (preview?.sufficient === false) { Alert.alert('Insufficient balance', 'This teacher does not have enough days.'); return; }
    setApplying(true);
    try {
      const fd = new FormData();
      fd.append('teacherId',   form.teacherId);
      fd.append('leaveTypeId', form.leaveTypeId);
      fd.append('fromDate',    form.fromDate);
      fd.append('toDate',      form.toDate);
      fd.append('leaveMode',   form.leaveMode);
      if (form.leaveMode === 'half_day') fd.append('halfDaySession', form.halfDaySession);
      fd.append('reason',      form.reason);
      await adminApi.adminApplyLeave(fd);
      setApplyOpen(false); setForm(EMPTY_APPLY); setPreview(null);
      load();
      Alert.alert('Applied', 'Leave has been filed for the teacher.');
    } catch (err: any) { Alert.alert('Error', err?.data?.message ?? err.message); }
    finally { setApplying(false); }
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
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <RowItem
          icon="pricetags-outline" iconColor={Colors.primary} iconBg={Colors.surfaceAlt}
          title="Leave Types"
          sub="Create, edit and remove the types teachers can apply for"
          onPress={() => router.push('/modules/admin/leave-types' as any)}
        />
        <RowItem
          icon="wallet-outline" iconColor={Colors.primary} iconBg={Colors.surfaceAlt}
          title="Allocations"
          sub="Allocate, clear, carry forward and accrue leave balances"
          onPress={() => router.push('/modules/admin/leave-allocations' as any)}
        />
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
            // The leave notification names its application — this scrolls to it
            // and flags it on arrival.
            <FocusRow key={lv._id} id={lv._id} scrollRef={scrollRef}>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <KV label="Teacher" value={lv.teacher?.name ?? '--'} />
              </View>
              <KV label="Type" value={lv.leaveType?.name ?? lv.leaveType?.code ?? '--'} />
              <KV label="Dates" value={`${fmtDate(lv.fromDate)} – ${fmtDate(lv.toDate)}${lv.totalDays ? ` (${lv.totalDays}d)` : ''}`} />
              {lv.leaveMode === 'half_day'
                ? <KV label="Half" value={lv.halfDaySession === 'second' ? 'Second (afternoon)' : 'First (morning)'} /> : null}
              {lv.lopDays > 0
                ? <KV label="Loss of pay" value={`${lv.lopDays} day(s)`} /> : null}
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
            </FocusRow>
          ))
        )}
      </ScrollView>

      {!loading && <FAB icon="add" onPress={() => { setForm(EMPTY_APPLY); setPreview(null); setApplyOpen(true); }} />}

      <FormModal
        visible={applyOpen}
        title="Apply Leave for Teacher"
        onClose={() => setApplyOpen(false)}
        onSubmit={submitApply}
        submitting={applying}
        submitLabel="Apply"
      >
        <Select label="Teacher" value={form.teacherId} placeholder="Select teacher…"
          onChange={(v: string) => setForm(f => ({ ...f, teacherId: v }))}
          options={teachers.map((t: any) => ({ label: t.name, value: t._id }))} />
        <Select label="Leave Type" value={form.leaveTypeId} placeholder="Select type…"
          onChange={(v: string) => setForm(f => ({ ...f, leaveTypeId: v }))}
          options={types.map((t: any) => ({ label: `${t.name} (${t.code})`, value: t._id }))} />

        <LeavePreviewPanel preview={preview} loading={previewLoading} />

        <Input label="From (YYYY-MM-DD)" value={form.fromDate} placeholder={todayStr()}
          onChange={(v: string) => setForm(f => ({
            ...f, fromDate: v,
            toDate: f.toDate && f.toDate < v ? v : (f.leaveMode === 'half_day' ? v : f.toDate),
          }))} />
        <Input label="To (YYYY-MM-DD)" value={form.toDate} placeholder={todayStr()}
          editable={form.leaveMode !== 'half_day'}
          onChange={(v: string) => setForm(f => ({ ...f, toDate: v }))} />
        {dateError ? <Text style={s.err}>{dateError}</Text> : null}
        {dateHint && !dateError ? <Text style={s.note}>{dateHint}</Text> : null}

        <Select label="Leave Mode" value={form.leaveMode}
          onChange={(v: string) => setForm(f => ({ ...f, leaveMode: v, toDate: v === 'half_day' ? f.fromDate : f.toDate }))}
          options={[{ label: 'Full Day', value: 'full_day' }, { label: 'Half Day', value: 'half_day' }]} />
        {/* Which half decides which periods need cover. */}
        {form.leaveMode === 'half_day' ? (
          <Select label="Which half" value={form.halfDaySession}
            onChange={(v: string) => setForm(f => ({ ...f, halfDaySession: v }))}
            options={[
              { label: 'First half (morning)', value: 'first' },
              { label: 'Second half (afternoon)', value: 'second' },
            ]} />
        ) : null}

        <Input label="Reason" value={form.reason} multiline
          onChange={(v: string) => setForm(f => ({ ...f, reason: v }))} />
      </FormModal>

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
  err:  { ...Typography.bodySmall, color: Colors.danger, marginTop: -4, marginBottom: 8, lineHeight: 18 },
});
