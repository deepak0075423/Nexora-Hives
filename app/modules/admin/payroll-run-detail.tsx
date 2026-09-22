/**
 * Payroll → one run, on the phone.
 *
 * The whole lifecycle lives here, because on a phone there is no rail to put
 * it in: the stepper, the figures, whatever the run wants to warn about, the
 * one button that moves it on, and every entry — each of which opens its own
 * sheet for the things an admin actually changes at the last minute.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '@/constants/theme';
import * as payrollApi from '@/api/payroll.api';
import {
  unwrap, LoaderView, ActionBtn, FormModal, Input, confirmAsync, SegTabs,
} from '@/components/ui/kit';
import {
  Panel, Facts, Steps, StatusPill, PersonRow, NoteBox, Blank, Ledger, NetBar, Pill,
  MiniRow, MiniStat, saveAndShare, money, compactMoney, RUN_STEPS,
} from '@/components/payroll/parts';

const ENTRY_FILTERS = [
  { key: '', label: 'Everyone' },
  { key: 'lop', label: 'Short month' },
  { key: 'edited', label: 'Edited' },
  { key: 'hold', label: 'On hold' },
];

export default function AdminPayrollRunDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [run, setRun] = useState<any>(null);
  const [entryStatus, setEntryStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try { setRun(unwrap(await payrollApi.getRunDetail(id, { entryStatus }))); }
    catch (err: any) { Alert.alert('Error', err.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [id, entryStatus]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<any>, okTitle?: string, okBody?: string) => {
    setBusy(true);
    try { await fn(); await load(); if (okTitle) Alert.alert(okTitle, okBody || ''); }
    catch (err: any) { Alert.alert('Could not do that', err.message); }
    finally { setBusy(false); }
  };

  /** The single button that moves this run on, exactly as the web decides it. */
  const next = (() => {
    if (!run) return null;
    if (run.status === 'draft') return { label: 'Mark Reviewed', run: () => payrollApi.updateRunStatus(id!, 'reviewed'), msg: 'Marked reviewed' };
    if (run.status === 'reviewed') return { label: 'Approve Run', run: () => payrollApi.updateRunStatus(id!, 'approved'), msg: 'Approved' };
    if (run.status === 'approved') return {
      label: 'Publish & Pay', run: () => payrollApi.publishRun(id!), msg: 'Published',
      confirm: [`Publish ${run.runName}?`, `${run.totalEmployees} payslips will be issued and every employee told their net pay. A published run is locked.`, 'Publish'] as [string, string, string],
    };
    return null;
  })();

  const openEntry = (e: any) => {
    setEditing(e);
    setForm({
      lopDays: String(e.lopDays ?? 0),
      arrears: String(e.arrears ?? 0),
      bonus: String(e.bonus ?? 0),
      otherDeductions: String(e.otherDeductions ?? 0),
      overtimeHours: String(e.overtimeHours ?? 0),
      overtimeRate: String(e.overtimeRate ?? 0),
      remarks: e.remarks ?? '',
    });
  };

  const saveEntry = async () => {
    setSaving(true);
    try {
      await payrollApi.updateRunEntry(id!, editing._id, {
        lopDays: Number(form.lopDays) || 0,
        arrears: Number(form.arrears) || 0,
        bonus: Number(form.bonus) || 0,
        otherDeductions: Number(form.otherDeductions) || 0,
        overtimeHours: Number(form.overtimeHours) || 0,
        overtimeRate: Number(form.overtimeRate) || 0,
        remarks: form.remarks,
      });
      setEditing(null);
      await load();
    } catch (err: any) {
      // The server questions an adjustment above a year's gross; offer to
      // confirm rather than making the admin guess what to change.
      if (/more than a year/i.test(err.message || '')) {
        const go = await confirmAsync('Unusually large', err.message, 'Record it anyway');
        if (go) {
          try {
            await payrollApi.updateRunEntry(id!, editing._id, {
              lopDays: Number(form.lopDays) || 0, arrears: Number(form.arrears) || 0,
              bonus: Number(form.bonus) || 0, otherDeductions: Number(form.otherDeductions) || 0,
              overtimeHours: Number(form.overtimeHours) || 0, overtimeRate: Number(form.overtimeRate) || 0,
              remarks: form.remarks, force: true,
            });
            setEditing(null); await load();
          } catch (e2: any) { Alert.alert('Error', e2.message); }
        }
      } else Alert.alert('Error', err.message);
    } finally { setSaving(false); }
  };

  const entries: any[] = run?.entries ?? [];
  const locked = run?.status === 'published' || run?.status === 'cancelled';

  return (
    <>
      <Stack.Screen options={{ title: run?.runName || 'Payroll Run' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : !run ? (
          <Blank icon="alert-circle-outline" title="Run not found" />
        ) : (
          <>
            <Panel icon="play-circle" tone="indigo" title={run.runName} sub={`${run.periodRange} ${run.year}`}
              right={<StatusPill status={run.status} />}>
              {run.status === 'failed' ? (
                <NoteBox tone="red">{run.failureReason || 'This run could not be computed.'}</NoteBox>
              ) : run.status === 'cancelled' ? (
                <NoteBox tone="slate" icon="ban">This run was cancelled.</NoteBox>
              ) : (
                <Steps step={RUN_STEPS.indexOf(run.stageLabel) + 1 || 1} />
              )}

              <Facts items={[
                ['Employees', `${run.totalEmployees}`],
                ['Working days', `${run.workingDays} days`],
                ['Gross pay', money(run.totalGross)],
                ['Deductions', money(run.totalDeductions)],
                ['Net pay', money(run.totalNet)],
                ...(run.totalEmployerCost > 0 ? [['Employer cost', money(run.totalEmployerCost)]] : []),
              ] as [string, React.ReactNode][]} />

              {run.held > 0 && (
                <View style={{ marginTop: Spacing.sm }}>
                  <NoteBox tone="amber" icon="pause-circle">
                    {run.held} {run.held === 1 ? 'entry is' : 'entries are'} on hold — {money(run.heldAmount)} is outside these totals.
                  </NoteBox>
                </View>
              )}

              {Array.isArray(run.warnings) && run.warnings.length > 0 && (
                <View style={{ marginTop: Spacing.sm }}>
                  <NoteBox tone="amber">
                    {run.warnings.length} {run.warnings.length === 1 ? 'entry needs' : 'entries need'} a second look.
                    {' '}{run.warnings.slice(0, 2).map((w: any) => `${w.name}: ${w.message}`).join('; ')}
                    {run.warnings.length > 2 ? ` and ${run.warnings.length - 2} more.` : ''}
                  </NoteBox>
                </View>
              )}

              {Array.isArray(run.skipped) && run.skipped.length > 0 && (
                <View style={{ marginTop: Spacing.sm }}>
                  <NoteBox tone="red">
                    {run.skipped.length} left out of this run.
                    {' '}{run.skipped.slice(0, 2).map((x: any) => `${x.name}: ${x.reason}`).join('; ')}
                  </NoteBox>
                </View>
              )}

              <View style={st.actions}>
                {next && (
                  <ActionBtn label={next.label} tone="primary" disabled={busy}
                    onPress={async () => {
                      if (next.confirm && !(await confirmAsync(...next.confirm))) return;
                      act(next.run, next.msg);
                    }} />
                )}
                {run.status === 'published' && (
                  <ActionBtn label="Reverse publish" tone="danger" small disabled={busy}
                    onPress={async () => {
                      if (!(await confirmAsync('Reverse the publish?', `The ${run.totalEmployees} payslips issued for ${run.runName} will be withdrawn and the run returned to approved.`, 'Reverse'))) return;
                      act(() => payrollApi.unpublishRun(id!), 'Reversed');
                    }} />
                )}
                {!locked && (
                  <ActionBtn label="Recompute" tone="neutral" small disabled={busy}
                    onPress={() => act(() => payrollApi.recomputeRun(id!), 'Recomputed', 'Hand-edited entries were kept.')} />
                )}
              </View>

              <View style={st.actions}>
                <ActionBtn label="Salary register" tone="neutral" small
                  onPress={() => saveAndShare(() => payrollApi.downloadRunExport(id!), `salary_register_${run.period.replace(' ', '_')}.csv`, 'text/csv')} />
                <ActionBtn label="Bank file" tone="neutral" small
                  onPress={() => saveAndShare(() => payrollApi.downloadBankFile(id!), `bank_transfer_${run.period.replace(' ', '_')}.csv`, 'text/csv')} />
              </View>
            </Panel>

            <View style={{ marginBottom: Spacing.sm }}>
              <SegTabs tabs={ENTRY_FILTERS} active={entryStatus} onChange={setEntryStatus} />
            </View>

            <Panel icon="people" tone="blue" title={`Entries (${entries.length})`}>
              {entries.length === 0 ? (
                <Blank icon="people-outline" title="Nothing here"
                  body={entryStatus ? 'No entry matches this filter.' : 'Recompute the run to build its entries.'} />
              ) : entries.map(e => (
                <PersonRow key={e._id} name={e.employee.name} tone="blue"
                  sub={`${e.paidDays}/${e.workingDays} days · gross ${money(e.grossSalary)} · net ${money(e.netSalary)}`}
                  right={e.isOnHold ? <Pill label="On hold" tone="amber" />
                    : e.payslip ? <Pill label="Paid" tone="green" />
                    : e.isEdited ? <Pill label="Edited" tone="blue" />
                    : <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />}
                  onPress={() => openEntry(e)} />
              ))}
            </Panel>
          </>
        )}
      </ScrollView>

      <FormModal visible={!!editing} title={editing?.employee?.name || 'Entry'} onClose={() => setEditing(null)}
        onSubmit={locked ? undefined as any : saveEntry} submitting={saving}
        submitLabel={locked ? '' : 'Save Entry'}>
        {!!editing && (
          <>
            {locked && (
              <NoteBox tone="slate" icon="lock-closed">
                This run is {run.status === 'published' ? 'published and locked' : 'cancelled'}. Reverse the publish to change an entry.
              </NoteBox>
            )}

            <MiniRow>
              <MiniStat label="CTC" value={compactMoney(editing.annualCtc)} />
              <MiniStat label="Paid days" value={`${editing.paidDays}/${editing.workingDays}`} />
              <MiniStat label="Net" value={compactMoney(editing.netSalary)} tone="green" />
            </MiniRow>

            {!locked && (
              <>
                <Input label={`Loss-of-pay days (of ${editing.workingDays})`} value={form.lopDays}
                  onChange={(v: string) => setForm((f: any) => ({ ...f, lopDays: v }))} keyboardType="numeric" />
                <Input label="Arrears" value={form.arrears}
                  onChange={(v: string) => setForm((f: any) => ({ ...f, arrears: v }))} keyboardType="numeric" />
                <Input label="Bonus" value={form.bonus}
                  onChange={(v: string) => setForm((f: any) => ({ ...f, bonus: v }))} keyboardType="numeric" />
                <Input label="Other deductions" value={form.otherDeductions}
                  onChange={(v: string) => setForm((f: any) => ({ ...f, otherDeductions: v }))} keyboardType="numeric" />
                <Input label="Overtime hours" value={form.overtimeHours}
                  onChange={(v: string) => setForm((f: any) => ({ ...f, overtimeHours: v }))} keyboardType="numeric" />
                <Input label="Overtime rate per hour" value={form.overtimeRate}
                  onChange={(v: string) => setForm((f: any) => ({ ...f, overtimeRate: v }))} keyboardType="numeric" />
                <Input label="Remarks" value={form.remarks}
                  onChange={(v: string) => setForm((f: any) => ({ ...f, remarks: v }))} />
              </>
            )}

            <View style={{ marginTop: Spacing.sm }}>
              <Ledger title="Earnings" total={editing.grossSalary}
                rows={(editing.earnings || []).map((x: any) => ({
                  name: x.name, amount: x.amount,
                  note: x.fullAmount > x.amount ? `${money(x.fullAmount)} for a full month` : undefined,
                }))} />
              <Ledger title="Deductions" tone="red" total={editing.totalDeductions + editing.otherDeductions}
                rows={[
                  ...(editing.deductions || []),
                  ...(editing.otherDeductions > 0 ? [{ name: 'Other deductions', amount: editing.otherDeductions }] : []),
                ]} />
              {(editing.arrears > 0 || editing.bonus > 0 || editing.reimbursement > 0 || editing.overtimeAmount > 0) && (
                <Ledger title="Additions"
                  total={editing.arrears + editing.bonus + editing.reimbursement}
                  rows={[
                    ...(editing.arrears > 0 ? [{ name: 'Arrears', amount: editing.arrears }] : []),
                    ...(editing.bonus > 0 ? [{ name: 'Bonus', amount: editing.bonus }] : []),
                    ...(editing.reimbursement > 0 ? [{ name: 'Expenses reimbursed', amount: editing.reimbursement, note: 'Not taxable, outside gross' }] : []),
                  ]} />
              )}
              {editing.advanceRecovery > 0 && (
                <Ledger title="Recovered" tone="red" total={editing.advanceRecovery}
                  rows={[{ name: 'Advance instalment', amount: editing.advanceRecovery }]} />
              )}
              <NetBar value={editing.netSalary} />
              {editing.unrecovered > 0 && (
                <NoteBox tone="amber">
                  {money(editing.unrecovered)} could not be recovered this month — the net floors at zero rather than
                  going negative. It stays outstanding.
                </NoteBox>
              )}
            </View>

            {!locked && (
              <View style={st.actions}>
                <ActionBtn label={editing.isOnHold ? 'Release' : 'Hold payment'} small
                  tone={editing.isOnHold ? 'neutral' : 'danger'}
                  onPress={async () => {
                    await act(() => payrollApi.holdRunEntry(id!, editing._id, { hold: !editing.isOnHold }));
                    setEditing(null);
                  }} />
              </View>
            )}

            {!!editing.payslip && (
              <View style={st.actions}>
                <ActionBtn label="Download payslip" tone="neutral" small
                  onPress={() => saveAndShare(() => payrollApi.adminDownloadPayslip(editing.payslip._id),
                    `payslip_${String(editing.employee.name).replace(/\s+/g, '_')}.pdf`)} />
              </View>
            )}
          </>
        )}
      </FormModal>
    </>
  );
}

const st = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
});
