import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as teacherApi from '@/api/teacher.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, ActionBtn, SegTabs,
  FormModal, Input, StatTile, StatRow, fmtDate, confirmAsync,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

// Employee Comp Off — reached from the Leave screen, so it stays inside Leave
// Management rather than becoming its own item in the module grid.

const DAY_LABEL: Record<string, string> = {
  holiday: '🎉 Holiday', weekly_off: '🗓️ Weekly Off', sunday: '☀️ Sunday',
  working_day: '💼 Working Day', unknown: '❔ Unclassified',
};

const TABS = [
  { key: 'requests', label: 'My Requests' },
  { key: 'ledger',   label: 'Ledger' },
];

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function CompOffScreen() {
  const [tab, setTab] = useState('requests');
  const [data, setData] = useState<any>(null);
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async () => {
    try {
      const [main, led]: [any, any] = await Promise.all([
        teacherApi.getMyCompOff(),
        teacherApi.getMyCompOffLedger().catch(() => null),
      ]);
      setData(unwrap(main));
      setLedger(unwrap(led)?.entries ?? []);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  // ── Apply ──────────────────────────────────────────────────────────────────
  const [applyOpen, setApplyOpen] = useState(false);
  const [form, setForm] = useState({ workDate: '', checkIn: '', checkOut: '', reason: '' });
  const [preview, setPreview] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Live verdict from the same engine that will judge the submission
  useEffect(() => {
    if (!applyOpen || !/^\d{4}-\d{2}-\d{2}$/.test(form.workDate)) { setPreview(null); return; }
    let cancelled = false;
    teacherApi.previewCompOffDate({
      date: form.workDate,
      ...(form.checkIn ? { checkIn: form.checkIn } : {}),
      ...(form.checkOut ? { checkOut: form.checkOut } : {}),
    })
      .then((res: any) => { if (!cancelled) setPreview(unwrap(res)); })
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
  }, [applyOpen, form.workDate, form.checkIn, form.checkOut]);

  const submitApply = async () => {
    setSaving(true);
    try {
      await teacherApi.applyCompOff(form);
      setApplyOpen(false);
      setForm({ workDate: '', checkIn: '', checkOut: '', reason: '' });
      setPreview(null);
      load();
    } catch (err: any) { Alert.alert('Error', err?.data?.message ?? err.message); }
    finally { setSaving(false); }
  };

  // ── Ready-to-apply draft ───────────────────────────────────────────────────
  const [draft, setDraft] = useState<any>(null);
  const [draftReason, setDraftReason] = useState('');
  const [draftSaving, setDraftSaving] = useState(false);

  const submitDraft = async () => {
    setDraftSaving(true);
    try {
      await teacherApi.submitCompOffDraft(draft._id, { reason: draftReason });
      setDraft(null);
      load();
    } catch (err: any) { Alert.alert('Error', err?.data?.message ?? err.message); }
    finally { setDraftSaving(false); }
  };

  const withdraw = async (r: any) => {
    if (!(await confirmAsync('Withdraw Comp Off', 'Withdraw this Comp Off request?', 'Withdraw'))) return;
    try { await teacherApi.cancelCompOff(r._id); load(); }
    catch (err: any) { Alert.alert('Error', err?.data?.message ?? err.message); }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Comp Off' }} /><ModuleDisabled /></>);

  const balance  = data?.balance;
  const drafts   = data?.drafts   ?? [];
  const requests = data?.requests ?? [];
  const policy   = data?.policy;

  if (!loading && data?.enabled === false) {
    return (
      <>
        <Stack.Screen options={{ title: 'Comp Off' }} />
        <View style={{ flex: 1, backgroundColor: Colors.background, padding: Spacing.md }}>
          <Empty icon="time-outline" text={data?.reason ?? 'Comp Off is not available'} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Comp Off' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : (
          <>
            {/* Balance */}
            <View style={s.balanceCard}>
              <Text style={s.balanceTitle}>Comp Off Balance · {balance?.academicYear ?? ''}</Text>
              <Text style={s.balanceBig}>{balance?.remaining ?? 0}</Text>
              <Text style={s.balanceSub}>day(s) available</Text>
            </View>
            <StatRow>
              <StatTile label="Earned"  value={balance?.totalAllocated ?? 0} icon="add-circle-outline"  tone="info" />
              <StatTile label="Used"    value={balance?.used    ?? 0}        icon="remove-circle-outline" tone="neutral" />
              <StatTile label="Pending" value={balance?.pending ?? 0}        icon="hourglass-outline"  tone="warning" />
              <StatTile label="Expired" value={balance?.expired ?? 0}        icon="alert-circle-outline" tone="danger" />
            </StatRow>

            {/* Ready to apply — auto-built from approved attendance */}
            {drafts.length > 0 && (
              <>
                <Text style={s.groupLabel}>Ready to apply</Text>
                <Text style={s.hint}>
                  Your approved attendance on these days qualifies for Comp Off. Review and apply — the balance is
                  credited only after an approver signs off.
                </Text>
                {drafts.map((d: any) => (
                  <Card key={d._id} style={{ borderLeftWidth: 3, borderLeftColor: Colors.primary }}>
                    <KV label="Work date" value={fmtDate(d.workDate)} />
                    <KV label="Day" value={`${DAY_LABEL[d.dayCategory] ?? d.dayCategory}${d.dayLabel ? ` · ${d.dayLabel}` : ''}`} />
                    <KV label="Attendance" value={`${d.checkIn || '—'} → ${d.checkOut || '—'} (${d.workedHours}h)`} />
                    <KV label="Comp Off" value={`${d.compOffDays} day(s)`} />
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <View style={{ flex: 1 }}>
                        <ActionBtn label="Apply" tone="success" onPress={() => { setDraftReason(d.reason ?? ''); setDraft(d); }} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <ActionBtn label="Dismiss" tone="danger" onPress={() => withdraw(d)} />
                      </View>
                    </View>
                  </Card>
                ))}
              </>
            )}

            <TouchableOpacity style={s.applyBtn} onPress={() => setApplyOpen(true)}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={s.applyBtnText}>Apply for Comp Off</Text>
            </TouchableOpacity>

            <SegTabs tabs={TABS} active={tab} onChange={setTab} />

            {tab === 'requests' && (
              requests.length === 0
                ? <Empty icon="time-outline" text="No Comp Off requests yet" />
                : requests.map((r: any) => (
                  <Card key={r._id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Text style={s.cardTitle}>{fmtDate(r.workDate)}</Text>
                      <Badge label={r.status} />
                    </View>
                    <KV label="Day" value={`${DAY_LABEL[r.dayCategory] ?? r.dayCategory}${r.dayLabel ? ` · ${r.dayLabel}` : ''}`} />
                    {r.workedHours ? <KV label="Worked" value={`${r.workedHours} h`} /> : null}
                    <KV label="Claimed" value={`${r.compOffDays} day(s)`} />
                    <KV label="Credited" value={r.creditedDays > 0
                      ? `${r.creditedDays} day(s)${r.expiresAt ? ` · expires ${fmtDate(r.expiresAt)}` : ''}`
                      : 'Not credited'} />
                    {r.approvalsRequired > 1 && r.status === 'pending'
                      ? <KV label="Sign-off" value={`${r.approvalLevel ?? 0} of ${r.approvalsRequired}`} /> : null}
                    {r.reason ? <KV label="Reason" value={r.reason} /> : null}
                    {r.adminComment ? <KV label="Comment" value={r.adminComment} /> : null}
                    {r.status === 'pending' && (
                      <View style={{ marginTop: 10 }}>
                        <ActionBtn label="Withdraw" tone="danger" onPress={() => withdraw(r)} />
                      </View>
                    )}
                  </Card>
                ))
            )}

            {tab === 'ledger' && (
              ledger.length === 0
                ? <Empty icon="receipt-outline" text="No ledger entries yet" />
                : ledger.map((e: any) => (
                  <Card key={e._id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Badge label={e.entryType} />
                      <Text style={[s.delta, { color: e.delta >= 0 ? Colors.success : Colors.danger }]}>
                        {e.delta >= 0 ? '+' : ''}{e.delta}
                      </Text>
                    </View>
                    <KV label="When" value={fmtDate(e.createdAt)} />
                    <KV label="Balance after" value={String(e.balanceAfter)} />
                    {e.expiresAt ? <KV label="Valid until" value={fmtDate(e.expiresAt)} /> : null}
                    {e.description ? <KV label="Note" value={e.description} /> : null}
                  </Card>
                ))
            )}
          </>
        )}
      </ScrollView>

      {/* Apply */}
      <FormModal visible={applyOpen} title="Apply for Comp Off" onClose={() => setApplyOpen(false)}
        onSubmit={submitApply} submitting={saving} submitLabel="Apply">
        <Input label="Work date (YYYY-MM-DD)" value={form.workDate}
          onChange={(v: string) => setForm(f => ({ ...f, workDate: v }))} placeholder={todayStr()} />
        <Input label="Check in (HH:mm)" value={form.checkIn}
          onChange={(v: string) => setForm(f => ({ ...f, checkIn: v }))} placeholder="09:00" />
        <Input label="Check out (HH:mm)" value={form.checkOut}
          onChange={(v: string) => setForm(f => ({ ...f, checkOut: v }))} placeholder="18:00" />
        {preview && (
          <View style={[s.preview, { backgroundColor: preview.eligible ? Colors.successLight : Colors.warningLight }]}>
            <Text style={s.previewTitle}>
              {DAY_LABEL[preview.dayCategory] ?? preview.dayCategory}{preview.dayLabel ? ` — ${preview.dayLabel}` : ''}
            </Text>
            {preview.workedHours > 0 ? (
              <Text style={s.previewText}>{preview.workedHours} hour(s) → {preview.compOffDays ?? 0} Comp Off day(s)</Text>
            ) : null}
            {!preview.eligible ? <Text style={s.previewText}>{preview.message}</Text> : null}
          </View>
        )}
        <Input label="Reason" value={form.reason}
          onChange={(v: string) => setForm(f => ({ ...f, reason: v }))} placeholder="What you worked on" multiline />
        {policy ? (
          <Text style={s.policyNote}>
            Minimum {policy.minWorkingHours}h · half day from {policy.halfDayHours}h · full day from {policy.fullDayHours}h.
            Apply within {policy.applyWithinDays || '∞'} day(s). Credited only after approval.
          </Text>
        ) : null}
      </FormModal>

      {/* Ready-to-apply confirmation */}
      <FormModal visible={!!draft} title="Apply for Comp Off" onClose={() => setDraft(null)}
        onSubmit={submitDraft} submitting={draftSaving} submitLabel="Apply">
        {draft && (
          <>
            <KV label="Work date" value={fmtDate(draft.workDate)} />
            <KV label="Day" value={`${DAY_LABEL[draft.dayCategory] ?? draft.dayCategory}${draft.dayLabel ? ` · ${draft.dayLabel}` : ''}`} />
            <KV label="Attendance" value={`${draft.checkIn || '—'} → ${draft.checkOut || '—'}`} />
            <KV label="Hours worked" value={String(draft.workedHours)} />
            <KV label="Comp Off" value={`${draft.compOffDays} day(s)`} />
            <Input label="Reason" value={draftReason} onChange={setDraftReason} multiline />
            <Text style={s.policyNote}>
              Applying sends this for approval. Your balance is credited only once it is approved.
            </Text>
          </>
        )}
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  balanceCard: {
    backgroundColor: Colors.primary, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.md, alignItems: 'center',
  },
  balanceTitle: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 6, fontWeight: '600' },
  balanceBig:   { fontSize: 40, fontWeight: '700', color: '#fff', lineHeight: 44 },
  balanceSub:   { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  groupLabel:   { ...Typography.h4, color: Colors.text, marginTop: Spacing.sm, marginBottom: 4 },
  hint:         { ...Typography.bodySmall, color: Colors.textSecondary, marginBottom: 10, lineHeight: 18 },
  cardTitle:    { ...Typography.label, color: Colors.text },
  delta:        { fontSize: 18, fontWeight: '700' },
  applyBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: Spacing.sm, marginBottom: Spacing.md,
  },
  applyBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  preview:      { borderRadius: Radius.md, padding: 12, marginBottom: 10 },
  previewTitle: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  previewText:  { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  policyNote:   { fontSize: 11, color: Colors.textSecondary, lineHeight: 16, marginTop: 6 },
});
