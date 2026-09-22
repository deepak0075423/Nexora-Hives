/**
 * Payroll → Assignments, on the phone.
 *
 * An assignment is what someone is paid for: a structure, a CTC, and a window
 * of dates. One live assignment per person — a second is what used to take a
 * whole payroll run down — so this screen never offers to create one for
 * somebody who already has it.
 *
 * Tapping a row opens everything the web rail holds: the pay it produces, the
 * salary timeline, and the two actions that matter (revise the CTC, settle a
 * leaver).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as payrollApi from '@/api/payroll.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, FAB, FormModal, Select, Input, SegTabs, SearchBar, ActionBtn,
  confirmAsync, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import {
  Figures, Panel, Facts, Pill, StatusPill, PersonRow, NoteBox, Blank, Ledger, NetBar,
  MiniRow, MiniStat, money, compactMoney, shortDate, MONTHS,
  ASSIGN_STATUS, STRUCTURE_TYPE, PAYMENT_MODE,
} from '@/components/payroll/parts';

const STATUS_TABS = [
  { key: 'active', label: 'Active' },
  { key: 'pending', label: 'Pending' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'all', label: 'All' },
];

export default function AdminPayrollAssignmentsScreen() {
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [status, setStatus] = useState('active');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const [detail, setDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [structures, setStructures] = useState<any[]>([]);
  const [form, setForm] = useState<any>({});

  const [revising, setRevising] = useState<any>(null);
  const [ctcForm, setCtcForm] = useState<any>({});
  const [settling, setSettling] = useState<any>(null);
  const [settlement, setSettlement] = useState<any>(null);
  const [openRuns, setOpenRuns] = useState<any[]>([]);
  const [settleForm, setSettleForm] = useState<any>({});

  const load = useCallback(async () => {
    try {
      const res: any = await payrollApi.getAssignments({ status, search, limit: 100 });
      setRows(res?.data ?? []);
      setSummary(res?.summary ?? {});
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  }, [status, search]);

  useEffect(() => { load(); }, [load]);

  const openNew = async () => {
    const now = new Date();
    setForm({
      employeeId: '', structureId: '', annualCtc: '',
      effectiveDate: now.toISOString().slice(0, 10), paymentMode: 'bank_transfer',
    });
    setShowForm(true);
    try {
      const [emps, structs]: any[] = await Promise.all([
        payrollApi.getEmployees({ unassigned: 1, limit: 200 }),
        payrollApi.getStructures({ tab: 'active', limit: 100 }),
      ]);
      setEmployees(emps?.data ?? []);
      setStructures(structs?.data ?? []);
      const def = (structs?.data ?? []).find((x: any) => x.isDefault);
      if (def) setForm((f: any) => ({ ...f, structureId: def._id }));
    } catch { /* the pickers simply stay empty */ }
  };

  const submit = async () => {
    setSaving(true);
    try {
      await payrollApi.assignEmployee({ ...form, annualCtc: Number(form.annualCtc) || 0 });
      setShowForm(false); load();
    } catch (err: any) { Alert.alert('Could not assign', err.message); }
    finally { setSaving(false); }
  };

  const openDetail = async (row: any) => {
    setDetail({ ...row, loading: true });
    try { setDetail(unwrap(await payrollApi.getAssignment(row._id))); }
    catch (err: any) { Alert.alert('Error', err.message); setDetail(null); }
  };

  const openRevise = (a: any) => {
    const now = new Date();
    const m = now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2;
    const y = now.getMonth() + 2 > 12 ? now.getFullYear() + 1 : now.getFullYear();
    setCtcForm({ incrementType: 'increment_pct', incrementValue: '', annualCtc: String(a.ctc || ''), effectiveMonth: String(m), effectiveYear: String(y), note: '' });
    setRevising(a);
  };

  const saveCtc = async () => {
    setSaving(true);
    try {
      const res: any = await payrollApi.updateCtc(revising._id, {
        incrementType: ctcForm.incrementType,
        incrementValue: Number(ctcForm.incrementValue) || 0,
        annualCtc: Number(ctcForm.annualCtc) || 0,
        effectiveMonth: Number(ctcForm.effectiveMonth), effectiveYear: Number(ctcForm.effectiveYear),
        note: ctcForm.note,
      });
      setRevising(null); setDetail(null); load();
      if (res?.notice) Alert.alert('Back-dated', res.notice);
    } catch (err: any) { Alert.alert('Could not revise', err.message); }
    finally { setSaving(false); }
  };

  const openSettle = async (a: any) => {
    const today = new Date().toISOString().slice(0, 10);
    setSettleForm({ lastDay: today, runId: '', note: '' });
    setSettling(a); setSettlement(null);
    try {
      const [prev, runs]: any[] = await Promise.all([
        payrollApi.getSettlement(a._id, { lastDay: today }),
        payrollApi.getPayrollRuns({ status: 'in_progress', limit: 20 }),
      ]);
      setSettlement(unwrap(prev));
      setOpenRuns(runs?.data ?? []);
      if (runs?.data?.[0]) setSettleForm((f: any) => ({ ...f, runId: runs.data[0]._id }));
    } catch (err: any) { Alert.alert('Error', err.message); setSettling(null); }
  };

  const applySettle = async () => {
    setSaving(true);
    try {
      await payrollApi.applySettlement(settling._id, {
        runId: settleForm.runId,
        addition: settlement.leaveEncashment.amount + settlement.gratuity.amount + settlement.claims.amount,
        recovery: settlement.advances.outstanding,
        lastDay: settleForm.lastDay,
        note: settleForm.note,
      });
      setSettling(null); setDetail(null); load();
      Alert.alert('Settled', 'The settlement was applied and the assignment closed.');
    } catch (err: any) { Alert.alert('Could not settle', err.message); }
    finally { setSaving(false); }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Assignments' }} /><ModuleDisabled /></>);

  const d = detail;

  return (
    <>
      <Stack.Screen options={{ title: 'Assignments' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          <Figures items={[
            { icon: 'people', tone: 'indigo', label: 'Total employees', value: summary.totalEmployees ?? '--', caption: 'All staff members' },
            { icon: 'checkmark-circle', tone: 'green', label: 'Active', value: summary.active ?? '--', caption: 'Being paid' },
            { icon: 'time', tone: 'amber', label: 'Pending', value: summary.pending ?? '--', caption: 'Not yet active' },
            { icon: 'ban', tone: 'red', label: 'Inactive', value: summary.inactive ?? '--', caption: 'Ended or removed' },
          ]} />

          {summary.totalEmployees > summary.active && status === 'active' && (
            <NoteBox tone="amber">
              {summary.totalEmployees - summary.active} of {summary.totalEmployees} employees have no active
              assignment. They are skipped by every payroll run until one is set up.
            </NoteBox>
          )}

          <SearchBar value={search} onChange={setSearch} placeholder="Search by name, code or department…" />
          <View style={{ marginBottom: Spacing.sm }}>
            <SegTabs tabs={STATUS_TABS} active={status} onChange={setStatus} />
          </View>

          {loading ? <LoaderView /> : rows.length === 0 ? (
            <Blank icon="document-text-outline" title="No assignments"
              body="Assign an employee to a salary structure to start paying them." />
          ) : (
            <Panel icon="document-text" tone="green" title={`${rows.length} assignment${rows.length === 1 ? '' : 's'}`}>
              {rows.map(r => (
                <PersonRow key={r._id} name={r.employee.name} tone="green"
                  sub={`${r.structure?.name || '—'} · ${money(r.ctc)} a year\n${shortDate(r.effectiveDate)} → ${r.endDate ? shortDate(r.endDate) : 'open'}`}
                  right={<StatusPill status={r.state} map={ASSIGN_STATUS} />}
                  onPress={() => openDetail(r)} />
              ))}
            </Panel>
          )}
        </ScrollView>
        <FAB onPress={openNew} />
      </View>

      {/* ── One assignment ─────────────────────────────────────────────── */}
      <FormModal visible={!!detail} title={d?.employee?.name || ''} onClose={() => setDetail(null)}
        onSubmit={undefined as any} submitLabel="">
        {d?.loading ? <LoaderView /> : !!d && (
          <>
            <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', marginBottom: Spacing.sm }}>
              <StatusPill status={d.state} map={ASSIGN_STATUS} />
              <Pill label={STRUCTURE_TYPE[d.structure?.type]?.[1] || 'General'} tone={STRUCTURE_TYPE[d.structure?.type]?.[0] || 'slate'} />
            </View>

            <Facts items={[
              ['Department', d.employee.department || '—'],
              ['Designation', d.employee.designation || '—'],
              ['Structure', d.structure?.name || '—'],
              ['Annual CTC', money(d.activeCtc ?? d.ctc)],
              ['Monthly CTC', money(d.activeMonthlyCtc ?? d.monthlyCtc)],
              ['Start date', shortDate(d.effectiveDate)],
              ['End date', d.endDate ? shortDate(d.endDate) : 'Open-ended'],
              ['Paid by', PAYMENT_MODE[d.paymentMode] || d.paymentMode],
            ] as [string, React.ReactNode][]} />

            {!!d.pendingRevision && (
              <View style={{ marginTop: Spacing.sm }}>
                <NoteBox tone="blue" icon="trending-up">
                  Revised to {money(d.pendingRevision.annualCtc)} from {d.pendingRevision.effectiveLabel}. The figures
                  above are what {d.activeMonthLabel} pays.
                </NoteBox>
              </View>
            )}

            {d.paymentMode === 'bank_transfer' && !d.employee.hasBank && (
              <NoteBox tone="amber">No bank account on file — this employee is left out of the bank transfer file.</NoteBox>
            )}

            {!!d.breakdown && (
              <View style={{ marginTop: Spacing.sm }}>
                <Text style={st.sectionLabel}>{d.activeMonthLabel || 'This month'}</Text>
                <Ledger title="Earnings" rows={d.breakdown.earnings} total={d.breakdown.grossSalary} />
                {d.breakdown.deductions.length > 0 && (
                  <Ledger title="Deductions" tone="red" rows={d.breakdown.deductions} total={d.breakdown.totalDeductions} />
                )}
                <NetBar value={d.breakdown.netSalary} />
              </View>
            )}

            {Array.isArray(d.ctcRevisions) && d.ctcRevisions.length > 1 && (
              <View style={{ marginTop: Spacing.sm }}>
                <Text style={st.sectionLabel}>Salary history</Text>
                {d.ctcRevisions.slice(0, 5).map((r: any, i: number) => (
                  <PersonRow key={i} name={money(r.annualCtc)} tone={r.incrementType === 'initial' ? 'slate' : 'green'}
                    sub={r.note || (r.incrementType === 'initial' ? 'Initial CTC' : 'Revision')}
                    right={<Text style={st.when}>{r.effectiveLabel}</Text>} />
                ))}
              </View>
            )}

            <View style={st.actions}>
              <ActionBtn label="Revise CTC" tone="primary" small onPress={() => openRevise(d)} />
              {d.isActive && <ActionBtn label="Settle & release" tone="danger" small onPress={() => openSettle(d)} />}
              {d.isActive ? (
                <ActionBtn label="End" tone="neutral" small disabled={busy} onPress={async () => {
                  if (!(await confirmAsync('End this assignment?', `${d.employee.name} stops being included in payroll runs from today. Past payslips are untouched.`, 'End'))) return;
                  setBusy(true);
                  try { await payrollApi.deactivateAssignment(d._id); setDetail(null); load(); }
                  catch (e: any) { Alert.alert('Error', e.message); } finally { setBusy(false); }
                }} />
              ) : (
                <ActionBtn label="Reactivate" tone="neutral" small disabled={busy} onPress={async () => {
                  setBusy(true);
                  try { await payrollApi.activateAssignment(d._id); setDetail(null); load(); }
                  catch (e: any) { Alert.alert('Error', e.message); } finally { setBusy(false); }
                }} />
              )}
            </View>
          </>
        )}
      </FormModal>

      {/* ── New assignment ─────────────────────────────────────────────── */}
      <FormModal visible={showForm} title="Assign Employee" onClose={() => setShowForm(false)}
        onSubmit={submit} submitting={saving} submitLabel="Assign">
        <Select label="Employee" value={form.employeeId} onChange={(v: string) => setForm((f: any) => ({ ...f, employeeId: v }))}
          options={employees.map(e => ({ label: `${e.name}${e.employeeId ? ` (${e.employeeId})` : ''}`, value: e._id }))}
          placeholder={employees.length ? 'Choose an employee…' : 'Everyone already has one'} />
        <Select label="Salary structure" value={form.structureId} onChange={(v: string) => setForm((f: any) => ({ ...f, structureId: v }))}
          options={structures.map(s2 => ({ label: `${s2.name}${s2.isDefault ? ' (Default)' : ''}`, value: s2._id }))} />
        <Input label="Annual CTC" value={form.annualCtc} keyboardType="numeric"
          onChange={(v: string) => setForm((f: any) => ({ ...f, annualCtc: v }))} />
        <Input label="Start date (YYYY-MM-DD)" value={form.effectiveDate}
          onChange={(v: string) => setForm((f: any) => ({ ...f, effectiveDate: v }))} />
        <Select label="Payment mode" value={form.paymentMode} onChange={(v: string) => setForm((f: any) => ({ ...f, paymentMode: v }))}
          options={Object.entries(PAYMENT_MODE).map(([value, label]) => ({ label, value }))} />
        <NoteBox tone="slate" icon="information-circle">
          One live assignment per person. To change what someone is paid, revise their CTC — that keeps the months they
          have already been paid on intact.
        </NoteBox>
      </FormModal>

      {/* ── Revise CTC ─────────────────────────────────────────────────── */}
      <FormModal visible={!!revising} title="Revise CTC" onClose={() => setRevising(null)}
        onSubmit={saveCtc} submitting={saving} submitLabel="Save Revision">
        <Select label="How" value={ctcForm.incrementType} onChange={(v: string) => setCtcForm((f: any) => ({ ...f, incrementType: v }))}
          options={[
            { label: 'Percentage increment', value: 'increment_pct' },
            { label: 'Flat ₹ increment', value: 'increment_value' },
            { label: 'Set a new CTC', value: 'manual' },
          ]} />
        {ctcForm.incrementType === 'manual' ? (
          <Input label="New annual CTC" value={ctcForm.annualCtc} keyboardType="numeric"
            onChange={(v: string) => setCtcForm((f: any) => ({ ...f, annualCtc: v }))} />
        ) : (
          <Input label={ctcForm.incrementType === 'increment_pct' ? 'Increment %' : 'Increment ₹'}
            value={ctcForm.incrementValue} keyboardType="numeric"
            onChange={(v: string) => setCtcForm((f: any) => ({ ...f, incrementValue: v }))} />
        )}
        <Select label="Effective from" value={ctcForm.effectiveMonth} onChange={(v: string) => setCtcForm((f: any) => ({ ...f, effectiveMonth: v }))}
          options={MONTHS.map((m, i) => ({ label: m, value: String(i + 1) }))} />
        <Input label="Year" value={ctcForm.effectiveYear} keyboardType="numeric"
          onChange={(v: string) => setCtcForm((f: any) => ({ ...f, effectiveYear: v }))} />
        <Input label="Note" value={ctcForm.note}
          onChange={(v: string) => setCtcForm((f: any) => ({ ...f, note: v }))} />
        <NoteBox tone="slate" icon="information-circle">
          Back-dating over a month that has already been paid is allowed. Those payslips stand as issued — the
          difference is paid as arrears in the next run.
        </NoteBox>
      </FormModal>

      {/* ── Full and final settlement ──────────────────────────────────── */}
      <FormModal visible={!!settling} title="Full and Final Settlement" onClose={() => setSettling(null)}
        onSubmit={applySettle} submitting={saving} submitLabel="Apply to run">
        {!settlement ? <LoaderView /> : (
          <>
            <Input label="Last working day (YYYY-MM-DD)" value={settleForm.lastDay}
              onChange={async (v: string) => {
                setSettleForm((f: any) => ({ ...f, lastDay: v }));
                if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
                  try { setSettlement(unwrap(await payrollApi.getSettlement(settling._id, { lastDay: v }))); }
                  catch { /* keep the previous preview until a valid date arrives */ }
                }
              }} />
            <Select label="Settle in" value={settleForm.runId} onChange={(v: string) => setSettleForm((f: any) => ({ ...f, runId: v }))}
              options={openRuns.map(r => ({ label: `${r.runName} (${r.stageLabel})`, value: r._id }))}
              placeholder={openRuns.length ? 'Choose an open run…' : 'No open run'} />

            <MiniRow>
              <MiniStat label="Service" value={`${settlement.service.years}y`} />
              <MiniStat label="Final month" value={compactMoney(settlement.finalMonth.net)} />
              <MiniStat label="Settlement" value={compactMoney(settlement.settlement)}
                tone={settlement.settlement >= 0 ? 'green' : 'red'} />
            </MiniRow>

            <View style={{ marginTop: Spacing.sm }}>
              <Ledger title="Payable" total={settlement.payable} rows={[
                { name: `${settlement.finalMonth.label} salary`, amount: settlement.finalMonth.net, note: `${settlement.finalMonth.paidDays} of ${settlement.finalMonth.workingDays} days` },
                { name: 'Leave encashment', amount: settlement.leaveEncashment.amount, note: settlement.leaveEncashment.days ? `${settlement.leaveEncashment.days} days` : 'No unused leave' },
                { name: 'Gratuity', amount: settlement.gratuity.amount, note: settlement.gratuity.basis },
                { name: 'Approved expenses', amount: settlement.claims.amount },
              ]} />
              <Ledger title="Recoverable" tone="red" total={settlement.recoverable}
                rows={settlement.advances.items.map((a: any) => ({
                  name: a.kind === 'loan' ? 'Loan balance' : 'Advance balance', amount: a.outstanding,
                }))} />
              <NetBar label={settlement.settlement >= 0 ? 'Payable on settlement' : 'Recoverable from the employee'}
                value={Math.abs(settlement.settlement)} />
            </View>

            <Input label="Note" value={settleForm.note}
              onChange={(v: string) => setSettleForm((f: any) => ({ ...f, note: v }))} />
            <NoteBox tone="amber">
              Applying this adds {money(settlement.leaveEncashment.amount + settlement.gratuity.amount + settlement.claims.amount)}
              {' '}and recovers {money(settlement.advances.outstanding)} on their entry in the chosen run, and ends the
              assignment. No later run will pay them.
            </NoteBox>
          </>
        )}
      </FormModal>
    </>
  );
}

const st = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs,
  },
  when: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
});
