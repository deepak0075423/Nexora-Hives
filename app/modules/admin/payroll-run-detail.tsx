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
  // An action that has to be explained (send back, reverse), and a payment record.
  const [asking, setAsking] = useState<null | { title: string; body: string; label: string; run: (why: string) => Promise<any>; done: string }>(null);
  const [why, setWhy] = useState('');
  const [paying, setPaying] = useState<null | { paidOn: string; reference: string }>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try { setRun(unwrap(await payrollApi.getRunDetail(id, { entryStatus }))); }
    catch (err: any) { Alert.alert('Error', err.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [id, entryStatus]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<any>, okTitle?: string, okBody?: string) => {
    setBusy(true);
    try {
      const res: any = await fn();
      await load();
      // A change to a run that had been signed off takes the sign-off with it.
      const reopened = res?.data?.reopened ?? res?.reopened;
      if (reopened) Alert.alert(okTitle || 'Saved', 'This run had already been signed off, so it has gone back to draft. It needs review and approval again.');
      else if (okTitle) Alert.alert(okTitle, okBody || '');
      return res;
    }
    catch (err: any) { Alert.alert('Could not do that', err.message); }
    finally { setBusy(false); }
  };
  const ask = (a: NonNullable<typeof asking>) => { setWhy(''); setAsking(a); };
  const bankReady = run?.status === 'approved' || run?.status === 'published';

  /** The single button that moves this run on, exactly as the web decides it. */
  const next = (() => {
    if (!run) return null;
    if (run.status === 'draft') return { label: 'Mark Reviewed', run: () => payrollApi.updateRunStatus(id!, 'reviewed'), msg: 'Marked reviewed' };
    if (run.status === 'reviewed') return { label: 'Approve Run', run: () => payrollApi.updateRunStatus(id!, 'approved'), msg: 'Approved' };
    if (run.status === 'approved') return {
      label: 'Publish & Pay', run: () => payrollApi.publishRun(id!), msg: 'Published',
      confirm: [`Publish ${run.runName}?`, `${run.totalEmployees} payslips will be issued and every employee told theirs is ready. A published run is locked.`, 'Publish'] as [string, string, string],
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
                {(run.status === 'reviewed' || run.status === 'approved') && (
                  <ActionBtn label="Send back" tone="neutral" small disabled={busy}
                    onPress={() => ask({
                      title: 'Send back to draft', label: 'Send back', done: 'Sent back to draft',
                      body: `${run.runName} loses its review and approval and goes back to whoever prepared it.`,
                      run: (w) => payrollApi.updateRunStatus(id!, 'draft', w),
                    })} />
                )}
                {run.status === 'published' && (
                  <ActionBtn label="Reverse publish" tone="danger" small disabled={busy}
                    onPress={() => ask({
                      title: 'Reverse the publish', label: 'Reverse', done: 'Reversed',
                      body: `The ${run.totalEmployees} payslips issued for ${run.runName} will be withdrawn and the run returned to approved. Everyone who was sent one is told.`,
                      run: (w) => payrollApi.unpublishRun(id!, w),
                    })} />
                )}
                {!locked && (
                  <ActionBtn label="Recompute" tone="neutral" small disabled={busy}
                    onPress={() => act(() => payrollApi.recomputeRun(id!), 'Recomputed', 'Hand-edited entries were kept.')} />
                )}
              </View>

              <View style={st.actions}>
                <ActionBtn label="Salary register" tone="neutral" small
                  onPress={() => saveAndShare(() => payrollApi.downloadRunExport(id!), `salary_register_${run.period.replace(' ', '_')}.csv`, 'text/csv')} />
                {/* An instruction to a bank: only for figures somebody has approved. */}
                {bankReady && (
                  <ActionBtn label="Bank file" tone="neutral" small
                    onPress={() => saveAndShare(() => payrollApi.downloadBankFile(id!), `bank_transfer_${run.period.replace(' ', '_')}.csv`, 'text/csv')} />
                )}
              </View>
              {run.status === 'published' && (
                <>
                  <Facts items={[
                    ['Paid', run.paidOn ? `${new Date(run.paidOn).toLocaleDateString('en-IN')}${run.paymentRef ? ` · ${run.paymentRef}` : ''}` : 'Not recorded yet'],
                  ] as [string, React.ReactNode][]} />
                  <View style={st.actions}>
                    <ActionBtn label={run.paidOn ? 'Change payment' : 'Record payment'} tone="neutral" small
                      onPress={() => setPaying({
                        paidOn: (run.paidOn ? new Date(run.paidOn) : new Date()).toISOString().slice(0, 10),
                        reference: run.paymentRef || '',
                      })} />
                    <ActionBtn label="All payslips" tone="neutral" small
                      onPress={() => saveAndShare(() => payrollApi.downloadRunPayslips(id!), `payslips_${run.period.replace(' ', '_')}.pdf`)} />
                    <ActionBtn label="Send unsent payslips" tone="neutral" small disabled={busy}
                      onPress={async () => {
                        const res: any = await act(() => payrollApi.resendPayslips(id!));
                        const queued = res?.data?.queued ?? 0;
                        Alert.alert('Payslips', queued ? `Sent again to ${queued} employee${queued === 1 ? '' : 's'}.` : 'Everyone has already been sent their payslip.');
                      }} />
                  </View>
                </>
              )}
              {!!run.reversalReason && run.status !== 'published' && run.status !== 'cancelled' && (
                <NoteBox tone="blue" icon="information-circle">Came back for a reason: {run.reversalReason}</NoteBox>
              )}
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
            {locked && !(run.status === 'published' && editing.isOnHold) && (
              <NoteBox tone="slate" icon="lock-closed">
                This run is {run.status === 'published' ? 'published and locked' : 'cancelled'}. Reverse the publish to change an entry.
              </NoteBox>
            )}
            {run.status === 'published' && editing.isOnHold && (
              <>
                <NoteBox tone="amber" icon="pause-circle">
                  Held back when the run was published — no payslip was issued and nothing was recovered or reimbursed.
                  Releasing it now issues the payslip and tells {editing.employee.name}.
                </NoteBox>
                <View style={st.actions}>
                  <ActionBtn label="Release and issue payslip" tone="primary" small disabled={busy}
                    onPress={async () => {
                      await act(() => payrollApi.holdRunEntry(id!, editing._id, { hold: false }), 'Released', 'The payslip has been issued.');
                      setEditing(null);
                    }} />
                </View>
              </>
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

      <FormModal visible={!!asking} title={asking?.title || ''} onClose={() => setAsking(null)}
        submitting={busy} submitLabel={asking?.label || 'Confirm'}
        onSubmit={async () => {
          if (why.trim().length < 3) { Alert.alert('Reason', 'Say why — it is kept with the audit trail.'); return; }
          const a = asking!;
          setAsking(null);
          await act(() => a.run(why.trim()), a.done);
        }}>
        <NoteBox tone="amber">{asking?.body}</NoteBox>
        <Input text="sentence" label="Reason" value={why} onChange={setWhy} multiline placeholder="What has to be corrected?" />
      </FormModal>

      <FormModal visible={!!paying} title="Record payment" onClose={() => setPaying(null)}
        submitting={busy} submitLabel="Save"
        onSubmit={async () => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(paying?.paidOn || '')) { Alert.alert('Date', 'Enter the date as YYYY-MM-DD.'); return; }
          const p = paying!;
          setPaying(null);
          await act(() => payrollApi.recordPayment(id!, { paidOn: p.paidOn, reference: p.reference.trim() }), 'Payment recorded');
        }}>
        <Input text="date" label="Paid on (YYYY-MM-DD)" value={paying?.paidOn || ''}
          onChange={(v: string) => setPaying(p => (p ? { ...p, paidOn: v } : p))} />
        <Input text="code" label="Bank reference (UTR)" value={paying?.reference || ''}
          onChange={(v: string) => setPaying(p => (p ? { ...p, reference: v } : p))} />
        <NoteBox tone="blue" icon="information-circle">
          Marks every payslip in the run as paid on that date. It does not move money — the transfer is made at the bank.
        </NoteBox>
        {!!run?.paidOn && (
          <ActionBtn label="Clear the payment record" tone="danger" small
            onPress={async () => { setPaying(null); await act(() => payrollApi.recordPayment(id!, { clear: true }), 'Payment record cleared'); }} />
        )}
      </FormModal>
    </>
  );
}

const st = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
});
