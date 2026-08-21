import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl,
  TouchableOpacity, Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as teacherApi from '@/api/teacher.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { MODULE_BLOCKED_CODES, FormModal, Input, Select, FAB, unwrap } from '@/components/ui/kit';
import LeavePreviewPanel from '@/components/LeavePreviewPanel';
import { validateLeaveDates, dateRuleHint, todayStr } from '@/utils/leaveDates';

const EMPTY_APPLY = { leaveTypeId: '', fromDate: '', toDate: '', leaveMode: 'full_day', reason: '' };

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:  { bg: Colors.warningLight, color: Colors.warning },
  approved: { bg: Colors.successLight, color: Colors.success },
  rejected: { bg: Colors.dangerLight,  color: Colors.danger  },
};

export default function LeaveScreen() {
  const router = useRouter();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [compOff, setCompOff] = useState<any>(null);
  const [isApprover, setIsApprover] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  // ── Apply ──────────────────────────────────────────────────────────────────
  const [policies, setPolicies] = useState<any[]>([]);
  const [applyOpen, setApplyOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_APPLY);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = async () => {
    try {
      const [lv, bal, co, appr, pol]: [any, any, any, any, any] = await Promise.all([
        teacherApi.getLeaves(),
        teacherApi.getLeaveBalance(),
        // Comp Off lives inside Leave Management — pull just enough to show the
        // entry point with its balance and any ready-to-apply count.
        teacherApi.getMyCompOff().catch(() => null),
        // Approvers are picked by designation, so ask whether this user has a queue
        teacherApi.getLeaveApprovals({ status: 'pending' }).catch(() => null),
        // Which types I may apply for, and the rules each one carries
        teacherApi.getLeaveTypePolicies().catch(() => null),
      ]);
      setPolicies(unwrap(pol) ?? []);
      setLeaves((lv as any)?.data ?? lv ?? []);
      setBalance((bal as any)?.data ?? bal);
      setCompOff((co as any)?.data ?? co);
      const apprData = (appr as any)?.data ?? appr;
      setIsApprover(!!apprData?.isApprover);
      setPendingApprovals(apprData?.items?.length ?? 0);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  const selPolicy = policies.find((p: any) => p.leaveType?._id === form.leaveTypeId);
  const dateHint  = dateRuleHint(selPolicy);
  const dateError = (form.fromDate || form.toDate)
    ? validateLeaveDates(form.fromDate, form.toDate, selPolicy)
    : '';

  // Ask the server what these dates cost rather than reimplementing weekend,
  // holiday and sandwich-rule arithmetic here — it must agree with the submit.
  useEffect(() => {
    if (!applyOpen || !form.leaveTypeId) { setPreview(null); return; }
    let live = true;
    setPreviewLoading(true);
    const t = setTimeout(async () => {
      try {
        const res: any = await teacherApi.getLeaveApplyPreview({
          leaveTypeId: form.leaveTypeId,
          ...(dateError ? {} : { fromDate: form.fromDate, toDate: form.toDate }),
          leaveMode: form.leaveMode,
        });
        if (live) setPreview(unwrap(res));
      } catch { if (live) setPreview(null); }
      finally { if (live) setPreviewLoading(false); }
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [applyOpen, form.leaveTypeId, form.fromDate, form.toDate, form.leaveMode, dateError]);

  const submitApply = async () => {
    if (dateError) { Alert.alert('Check the dates', dateError); return; }
    if (!form.reason.trim() || form.reason.trim().length < 10) {
      Alert.alert('Reason required', 'Please give a reason of at least 10 characters.'); return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('leaveTypeId', form.leaveTypeId);
      fd.append('fromDate',    form.fromDate);
      fd.append('toDate',      form.toDate);
      fd.append('leaveMode',   form.leaveMode);
      fd.append('reason',      form.reason);
      await teacherApi.applyLeave(fd);
      setApplyOpen(false); setForm(EMPTY_APPLY); setPreview(null);
      load();
      Alert.alert('Applied', 'Your leave application has been submitted.');
    } catch (err: any) { Alert.alert('Error', err?.data?.message ?? err.message); }
    finally { setSaving(false); }
  };

  const handleCancel = (id: string) => {
    Alert.alert('Cancel Leave', 'Are you sure you want to cancel this leave?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancel Leave', style: 'destructive',
        onPress: async () => {
          try {
            await teacherApi.cancelLeave(id);
            load();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Leave' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Leave' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : (
          <>
            {/* Balance — API returns { items: [{leaveType, remaining, used, …}], leaveSettings, … } */}
            {(balance?.items ?? []).length > 0 && (
              <View style={s.balanceCard}>
                <Text style={s.balanceTitle}>Leave Balance · {balance.academicYear ?? ''}</Text>
                <View style={s.balanceRow}>
                  {(balance.items as any[]).map((item: any, i: number) => (
                    <View key={i} style={s.balanceItem}>
                      <Text style={s.balanceCount}>{item.remaining ?? 0}</Text>
                      <Text style={s.balanceType}>
                        {item.leaveType?.code ?? item.leaveType?.name ?? 'Leave'}
                      </Text>
                      <Text style={s.balanceUsed}>used {item.used ?? 0}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Sign-off queue — only for designation-based approvers */}
            {isApprover && (
              <TouchableOpacity style={s.compOffRow} onPress={() => router.push('/modules/leave-approvals' as any)}>
                <View style={s.compOffIcon}>
                  <Ionicons name="checkmark-done-outline" size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.compOffTitle}>Leave Approvals</Text>
                  <Text style={s.compOffSub}>
                    {pendingApprovals > 0 ? `${pendingApprovals} request(s) awaiting your sign-off` : 'Nothing waiting for you'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
              </TouchableOpacity>
            )}

            {/* Comp Off — same module, its own screen */}
            {compOff?.enabled && (
              <TouchableOpacity style={s.compOffRow} onPress={() => router.push('/modules/comp-off' as any)}>
                <View style={s.compOffIcon}>
                  <Ionicons name="time-outline" size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.compOffTitle}>Comp Off</Text>
                  <Text style={s.compOffSub}>
                    {compOff.balance?.remaining ?? 0} day(s) available
                    {compOff.drafts?.length ? ` · ${compOff.drafts.length} ready to apply` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
              </TouchableOpacity>
            )}

            {/* Leaves */}
            <Text style={s.groupLabel}>My Leaves</Text>
            {leaves.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="airplane-outline" size={48} color={Colors.textLight} />
                <Text style={s.emptyText}>No leave applications</Text>
              </View>
            ) : (
              leaves.map((lv: any, i: number) => {
                const st = STATUS_STYLE[lv.status?.toLowerCase()] ?? STATUS_STYLE.pending;
                return (
                  <View key={i} style={s.card}>
                    <View style={s.cardTop}>
                      <View>
                        <Text style={s.leaveType}>
                          {typeof lv.leaveType === 'string'
                            ? lv.leaveType
                            : lv.leaveType?.name ?? lv.leaveType?.code ?? lv.type ?? 'Leave'}
                        </Text>
                        <Text style={s.dates}>
                          {(lv.fromDate ?? lv.startDate) ? new Date(lv.fromDate ?? lv.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''} –{' '}
                          {(lv.toDate ?? lv.endDate) ? new Date(lv.toDate ?? lv.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                        </Text>
                      </View>
                      <View style={[s.badge, { backgroundColor: st.bg }]}>
                        <Text style={[s.badgeText, { color: st.color }]}>
                          {lv.status ? lv.status.charAt(0).toUpperCase() + lv.status.slice(1) : 'Pending'}
                        </Text>
                      </View>
                    </View>
                    {lv.reason && <Text style={s.reason}>{lv.reason}</Text>}
                    {lv.status === 'pending' && (
                      <TouchableOpacity style={s.cancelBtn} onPress={() => handleCancel(lv._id)}>
                        <Text style={s.cancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {/* Applying was the one thing a teacher could not do from the phone. */}
      {!loading && !disabled && <FAB icon="add" onPress={() => { setForm(EMPTY_APPLY); setPreview(null); setApplyOpen(true); }} />}

      <FormModal
        visible={applyOpen}
        title="Apply for Leave"
        onClose={() => setApplyOpen(false)}
        onSubmit={submitApply}
        submitting={saving}
        submitLabel="Apply"
      >
        <Select
          label="Leave Type"
          value={form.leaveTypeId}
          onChange={(v: string) => setForm(f => ({ ...f, leaveTypeId: v }))}
          options={policies
            .filter((p: any) => p.eligible)
            .map((p: any) => ({ label: `${p.leaveType.name} (${p.leaveType.code})`, value: p.leaveType._id }))}
          placeholder="Select type…"
        />
        {/* A type this employee does not qualify for is shown with the reason
            rather than silently missing from the list. */}
        {policies.some((p: any) => !p.eligible) ? (
          <Text style={s.applyNote}>
            Not available to you:{' '}
            {policies.filter((p: any) => !p.eligible)
              .map((p: any) => `${p.leaveType.code} (${p.ineligibleReason})`).join(', ')}
          </Text>
        ) : null}

        <LeavePreviewPanel preview={preview} loading={previewLoading} />

        <Input label="From (YYYY-MM-DD)" value={form.fromDate} placeholder={todayStr()}
          onChange={(v: string) => setForm(f => ({
            ...f, fromDate: v,
            // Carry a now-earlier To along rather than leave an impossible range
            toDate: f.toDate && f.toDate < v ? v : (f.leaveMode === 'half_day' ? v : f.toDate),
          }))} />
        <Input label="To (YYYY-MM-DD)" value={form.toDate} placeholder={todayStr()}
          editable={form.leaveMode !== 'half_day'}
          onChange={(v: string) => setForm(f => ({ ...f, toDate: v }))} />
        {dateError ? <Text style={s.applyErr}>{dateError}</Text> : null}
        {dateHint && !dateError ? <Text style={s.applyNote}>{dateHint}</Text> : null}

        <Select
          label="Leave Mode"
          value={form.leaveMode}
          onChange={(v: string) => setForm(f => ({ ...f, leaveMode: v, toDate: v === 'half_day' ? f.fromDate : f.toDate }))}
          options={[{ label: 'Full Day', value: 'full_day' }, { label: 'Half Day', value: 'half_day' }]}
        />

        <Input label="Reason" value={form.reason} multiline
          onChange={(v: string) => setForm(f => ({ ...f, reason: v }))}
          placeholder="At least 10 characters" />
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', paddingTop: 80 },
  balanceCard: {
    backgroundColor: Colors.primary, borderRadius: Radius.xl, padding: Spacing.md, marginBottom: Spacing.md,
  },
  balanceTitle: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 10, fontWeight: '600' },
  balanceRow: { flexDirection: 'row', gap: 20 },
  balanceItem: { alignItems: 'center' },
  balanceCount: { fontSize: 24, fontWeight: '700', color: '#fff' },
  balanceType: { fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'capitalize', marginTop: 2 },
  balanceUsed: { fontSize: 9, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  compOffRow: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md,
    marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  compOffIcon: {
    width: 34, height: 34, borderRadius: Radius.md, backgroundColor: Colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  compOffTitle: { ...Typography.label, color: Colors.text },
  compOffSub:   { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  groupLabel: { ...Typography.h4, color: Colors.text, marginBottom: 8 },
  empty: { alignItems: 'center', paddingTop: 40, gap: 12 },
  emptyText: { ...Typography.body, color: Colors.textSecondary },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: 10, borderWidth: 1, borderColor: Colors.border,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  leaveType: { ...Typography.label, color: Colors.text },
  dates: { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  badgeText: { fontSize: 11, fontWeight: '600' },
  reason: { ...Typography.bodySmall, color: Colors.textSecondary, marginBottom: 8, lineHeight: 18 },
  cancelBtn: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingVertical: 8, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  applyNote: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: -4, marginBottom: 8, lineHeight: 18 },
  applyErr:  { ...Typography.bodySmall, color: Colors.danger, marginTop: -4, marginBottom: 8, lineHeight: 18 },
});
