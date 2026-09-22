/**
 * Payroll → Adjustments, on the phone.
 *
 * Advances being taken back, and expenses being paid back. They share a screen
 * because they are the same question from opposite sides — what does this month
 * collect, and what does it owe — and because one payroll run settles both.
 *
 * Neither moves until a run is PUBLISHED.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as payrollApi from '@/api/payroll.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  LoaderView, FAB, FormModal, Select, Input, SegTabs, Toggle, ActionBtn, confirmAsync,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import {
  Figures, Panel, Pill, PersonRow, NoteBox, Blank, money, compactMoney, MONTHS,
} from '@/components/payroll/parts';

const ADVANCE_STATUS: Record<string, ['blue' | 'green' | 'slate', string]> = {
  active: ['blue', 'Recovering'], closed: ['green', 'Cleared'], cancelled: ['slate', 'Cancelled'],
};
const CLAIM_STATUS: Record<string, ['amber' | 'blue' | 'green' | 'red', string]> = {
  pending: ['amber', 'Awaiting decision'], approved: ['blue', 'Approved'],
  paid: ['green', 'Paid'], rejected: ['red', 'Rejected'],
};
const CATEGORIES = ['Travel', 'Accommodation', 'Meals', 'Materials', 'Phone & Internet', 'Medical', 'Training', 'Other'];

export default function AdminPayrollAdjustmentsScreen() {
  const now = new Date();
  const [tab, setTab] = useState('advances');
  const [status, setStatus] = useState('active');
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const [employees, setEmployees] = useState<any[]>([]);
  const [showAdv, setShowAdv] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [saving, setSaving] = useState(false);
  const [advForm, setAdvForm] = useState<any>({});
  const [claimForm, setClaimForm] = useState<any>({});

  const isAdv = tab === 'advances';

  const load = useCallback(async () => {
    try {
      const res: any = isAdv
        ? await payrollApi.getAdvances({ status, limit: 100 })
        : await payrollApi.getClaims({ status, limit: 100 });
      setRows(res?.data ?? []);
      setSummary(res?.summary ?? {});
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  }, [isAdv, status]);

  useEffect(() => { load(); }, [load]);

  const loadEmployees = async () => {
    try { const r: any = await payrollApi.getEmployees({ limit: 200 }); setEmployees(r?.data ?? []); }
    catch { setEmployees([]); }
  };

  const openAdv = () => {
    const m = now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2;
    const y = now.getMonth() + 2 > 12 ? now.getFullYear() + 1 : now.getFullYear();
    setAdvForm({ employeeId: '', kind: 'advance', amount: '', instalments: '1', startMonth: String(m), startYear: String(y), reason: '' });
    setShowAdv(true); loadEmployees();
  };
  const openClaim = () => {
    setClaimForm({ employeeId: '', category: 'Travel', amount: '', description: '', approve: true, taxable: false });
    setShowClaim(true); loadEmployees();
  };

  const saveAdv = async (force = false) => {
    setSaving(true);
    try {
      await payrollApi.createAdvance({
        ...advForm, amount: Number(advForm.amount) || 0,
        instalments: Number(advForm.instalments) || 1,
        startMonth: Number(advForm.startMonth), startYear: Number(advForm.startYear), force,
      });
      setShowAdv(false); setTab('advances'); setStatus('active'); load();
    } catch (err: any) {
      // The server questions an instalment bigger than a month's pay.
      if (/more than/i.test(err.message || '')) {
        if (await confirmAsync('Large instalment', err.message, 'Record it anyway')) return saveAdv(true);
      } else Alert.alert('Could not record', err.message);
    } finally { setSaving(false); }
  };

  const saveClaim = async () => {
    setSaving(true);
    try {
      await payrollApi.createClaim({ ...claimForm, amount: Number(claimForm.amount) || 0 });
      setShowClaim(false); setTab('claims'); setStatus(claimForm.approve ? 'approved' : 'pending'); load();
    } catch (err: any) { Alert.alert('Could not record', err.message); }
    finally { setSaving(false); }
  };

  const act = async (fn: () => Promise<any>) => {
    setBusy(true);
    try { await fn(); await load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
    finally { setBusy(false); }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Adjustments' }} /><ModuleDisabled /></>);

  return (
    <>
      <Stack.Screen options={{ title: 'Adjustments' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          <NoteBox tone="blue" icon="information-circle">
            Nothing here moves until a payroll run is published. A draft shows what the month intends to take and pay;
            reversing a publish gives it all back.
          </NoteBox>

          {isAdv ? (
            <Figures items={[
              { icon: 'cash', tone: 'indigo', label: 'Being recovered', value: summary.active ?? '--', caption: 'Active advances' },
              { icon: 'wallet', tone: 'blue', label: 'Lent', value: compactMoney(summary.lent), caption: 'Across active' },
              { icon: 'checkmark-circle', tone: 'green', label: 'Recovered', value: compactMoney(summary.recovered), caption: 'Taken back' },
              { icon: 'time', tone: 'amber', label: 'Outstanding', value: compactMoney(summary.outstanding), caption: 'Still to come' },
            ]} />
          ) : (
            <Figures items={[
              { icon: 'time', tone: 'amber', label: 'Awaiting decision', value: summary.pending ?? '--', caption: 'To approve or reject' },
              { icon: 'document-text', tone: 'blue', label: 'Pending value', value: compactMoney(summary.pendingAmount), caption: 'Not yet decided' },
              { icon: 'checkmark-circle', tone: 'indigo', label: 'Approved', value: compactMoney(summary.approvedAmount), caption: 'Due next run' },
              { icon: 'wallet', tone: 'green', label: 'Paid', value: compactMoney(summary.paidAmount), caption: 'Reimbursed' },
            ]} />
          )}

          <View style={{ marginBottom: Spacing.sm }}>
            <SegTabs
              tabs={[{ key: 'advances', label: 'Advances & Loans' }, { key: 'claims', label: 'Reimbursements' }]}
              active={tab}
              onChange={v => { setTab(v); setStatus(v === 'advances' ? 'active' : 'pending'); setLoading(true); }} />
          </View>
          <View style={{ marginBottom: Spacing.sm }}>
            <SegTabs
              tabs={isAdv
                ? [{ key: 'active', label: 'Recovering' }, { key: 'closed', label: 'Cleared' }, { key: 'all', label: 'All' }]
                : [{ key: 'pending', label: 'Pending' }, { key: 'approved', label: 'Approved' }, { key: 'paid', label: 'Paid' }, { key: 'all', label: 'All' }]}
              active={status} onChange={setStatus} />
          </View>

          {loading ? <LoaderView /> : rows.length === 0 ? (
            <Blank icon={isAdv ? 'cash-outline' : 'document-text-outline'}
              title={isAdv ? 'No advances here' : 'No claims here'}
              body={isAdv
                ? 'An advance is money paid ahead of salary and taken back over one or more months.'
                : 'A reimbursement is money an employee spent for the school, paid back through payroll.'} />
          ) : (
            <Panel icon={isAdv ? 'cash' : 'document-text'} tone={isAdv ? 'indigo' : 'green'}
              title={`${rows.length} ${isAdv ? 'advance' : 'claim'}${rows.length === 1 ? '' : 's'}`}>
              {rows.map(r => (isAdv ? (
                <PersonRow key={r._id} name={r.employee.name} tone="indigo"
                  sub={`${r.kind === 'loan' ? 'Loan' : 'Advance'} ${money(r.amount)} · ${money(r.instalmentAmount)} × ${r.instalments} from ${r.startLabel}\nRecovered ${money(r.recovered)} · outstanding ${money(r.outstanding)}`}
                  right={<Pill label={ADVANCE_STATUS[r.status]?.[1] || r.status} tone={ADVANCE_STATUS[r.status]?.[0] || 'slate'} />}
                  onPress={r.status !== 'active' ? undefined : async () => {
                    const writeOff = r.recovered > 0;
                    const go = await confirmAsync(
                      writeOff ? 'Write off the rest?' : 'Cancel this advance?',
                      writeOff
                        ? `${money(r.outstanding)} is still outstanding for ${r.employee.name}. Writing it off stops any further recovery — the school absorbs the difference.`
                        : 'Nothing has been recovered yet, so this will be marked as never disbursed.',
                      writeOff ? 'Write off' : 'Cancel advance');
                    if (go) act(() => payrollApi.closeAdvance(r._id, { writeOff }));
                  }} />
              ) : (
                <PersonRow key={r._id} name={r.employee.name} tone="green"
                  sub={`${r.category} · ${money(r.amount)}\n${r.description || '—'}${r.taxable ? ' · taxable' : ''}`}
                  right={r.status === 'pending' ? (
                    <View style={st.rowActions}>
                      <ActionBtn label="Approve" tone="success" small disabled={busy}
                        onPress={() => act(() => payrollApi.decideClaim(r._id, { status: 'approved' }))} />
                      <ActionBtn label="Reject" tone="danger" small disabled={busy}
                        onPress={async () => {
                          if (!(await confirmAsync('Reject this claim?', `${r.employee.name}'s ${money(r.amount)} claim will be rejected.`, 'Reject'))) return;
                          act(() => payrollApi.decideClaim(r._id, { status: 'rejected' }));
                        }} />
                    </View>
                  ) : <Pill label={CLAIM_STATUS[r.status]?.[1] || r.status} tone={CLAIM_STATUS[r.status]?.[0] || 'slate'} />} />
              )))}
            </Panel>
          )}

          <Panel icon="help-circle" tone="blue" title="How these reach a payslip">
            <Text style={st.blurb}>
              <Text style={st.blurbBold}>An advance</Text> is taken back one instalment per run, starting from the month
              you set. If a month cannot bear the whole instalment it takes what it can and the rest waits — nobody is
              ever paid a negative salary.
            </Text>
            <Text style={[st.blurb, { marginTop: Spacing.sm }]}>
              <Text style={st.blurbBold}>A reimbursement</Text> is added to the net once approved. It is not earnings:
              it does not raise gross pay, it is not taxed, and it does not touch CTC.
            </Text>
          </Panel>
        </ScrollView>
        <FAB icon={isAdv ? 'cash' : 'add'} onPress={isAdv ? openAdv : openClaim} />
      </View>

      <FormModal visible={showAdv} title="Record an Advance" onClose={() => setShowAdv(false)}
        onSubmit={() => saveAdv(false)} submitting={saving} submitLabel="Record">
        <Select label="Employee" value={advForm.employeeId} onChange={(v: string) => setAdvForm((f: any) => ({ ...f, employeeId: v }))}
          options={employees.map(e => ({ label: `${e.name}${e.ctc ? ` — ${money(e.ctc / 12)}/mo` : ''}`, value: e._id }))} />
        <Select label="Kind" value={advForm.kind} onChange={(v: string) => setAdvForm((f: any) => ({ ...f, kind: v }))}
          options={[{ label: 'Advance', value: 'advance' }, { label: 'Loan', value: 'loan' }]} />
        <Input label="Amount" value={advForm.amount} keyboardType="numeric"
          onChange={(v: string) => setAdvForm((f: any) => ({ ...f, amount: v }))} />
        <Input label="Instalments" value={advForm.instalments} keyboardType="numeric"
          onChange={(v: string) => setAdvForm((f: any) => ({ ...f, instalments: v }))} />
        <Select label="Recovery starts" value={advForm.startMonth} onChange={(v: string) => setAdvForm((f: any) => ({ ...f, startMonth: v }))}
          options={MONTHS.map((m, i) => ({ label: m, value: String(i + 1) }))} />
        <Input label="Year" value={advForm.startYear} keyboardType="numeric"
          onChange={(v: string) => setAdvForm((f: any) => ({ ...f, startYear: v }))} />
        <Input label="Reason" value={advForm.reason}
          onChange={(v: string) => setAdvForm((f: any) => ({ ...f, reason: v }))} />
      </FormModal>

      <FormModal visible={showClaim} title="New Reimbursement Claim" onClose={() => setShowClaim(false)}
        onSubmit={saveClaim} submitting={saving} submitLabel="Record Claim">
        <Select label="Employee" value={claimForm.employeeId} onChange={(v: string) => setClaimForm((f: any) => ({ ...f, employeeId: v }))}
          options={employees.map(e => ({ label: e.name, value: e._id }))} />
        <Select label="Category" value={claimForm.category} onChange={(v: string) => setClaimForm((f: any) => ({ ...f, category: v }))}
          options={CATEGORIES.map(c => ({ label: c, value: c }))} />
        <Input label="Amount" value={claimForm.amount} keyboardType="numeric"
          onChange={(v: string) => setClaimForm((f: any) => ({ ...f, amount: v }))} />
        <Input label="What was it for" value={claimForm.description}
          onChange={(v: string) => setClaimForm((f: any) => ({ ...f, description: v }))} />
        <Toggle label="Approve now" value={claimForm.approve}
          sub="You are recording this on their behalf, so there is no second desk for it to wait at."
          onChange={(v: boolean) => setClaimForm((f: any) => ({ ...f, approve: v }))} />
        <Toggle label="Treat as taxable" value={claimForm.taxable}
          sub="A reimbursement is normally the return of money already spent, so it is not income."
          onChange={(v: boolean) => setClaimForm((f: any) => ({ ...f, taxable: v }))} />
      </FormModal>
    </>
  );
}

const st = StyleSheet.create({
  rowActions: { flexDirection: 'row', gap: 6 },
  blurb: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18 },
  blurbBold: { fontWeight: '800', color: Colors.text },
});
