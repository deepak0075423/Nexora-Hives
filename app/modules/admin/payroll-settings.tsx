/**
 * Payroll → Settings and the audit log, on the phone.
 *
 * The two answer the same question from opposite ends: how this module is set
 * up to behave, and what it has actually done. For a module that moves money
 * the second half is not optional.
 *
 * The tax SLAB TABLE is deliberately not editable here — a row of rates is a
 * spreadsheet, and getting one wrong on a phone keyboard would mis-withhold
 * from every salary in the school. The regime can be switched off from here,
 * which is the one thing worth being able to do in a hurry.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as payrollApi from '@/api/payroll.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, SegTabs, Toggle, Input, Select, ActionBtn, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import {
  Panel, Facts, Pill, PersonRow, NoteBox, Blank, money, shortDate, MONTHS,
} from '@/components/payroll/parts';

/** How each audited action is written. Mirrors the web, word for word. */
const ACTION: Record<string, [string, string]> = {
  RUN_CREATED: ['blue', 'Run created'], RUN_RECOMPUTED: ['blue', 'Run recomputed'],
  RUN_REVIEWED: ['amber', 'Run reviewed'], RUN_APPROVED: ['indigo', 'Run approved'],
  RUN_PUBLISHED: ['green', 'Run published'], RUN_UNPUBLISHED: ['red', 'Publish reversed'],
  RUN_CANCELLED: ['slate', 'Run cancelled'], RUN_DELETED: ['red', 'Run deleted'],
  RUN_FAILED: ['red', 'Run failed'],
  ENTRY_UPDATED: ['blue', 'Entry edited'], ENTRY_HELD: ['amber', 'Entry held'], ENTRY_RELEASED: ['green', 'Entry released'],
  STRUCTURE_CREATED: ['green', 'Structure created'], STRUCTURE_UPDATED: ['blue', 'Structure updated'],
  STRUCTURE_DELETED: ['red', 'Structure deleted'], STRUCTURE_TOGGLED: ['amber', 'Structure switched'],
  STRUCTURE_DUPLICATED: ['slate', 'Structure copied'],
  ASSIGNMENT_CREATED: ['green', 'Assigned'], ASSIGNMENT_UPDATED: ['blue', 'Assignment updated'],
  ASSIGNMENT_DEACTIVATED: ['amber', 'Assignment ended'], ASSIGNMENT_REACTIVATED: ['green', 'Assignment resumed'],
  ASSIGNMENT_DELETED: ['red', 'Assignment deleted'],
  CTC_UPDATED: ['indigo', 'CTC revised'],
  ADVANCE_CREATED: ['blue', 'Advance recorded'], ADVANCE_WRITTEN_OFF: ['red', 'Advance written off'],
  ADVANCE_CANCELLED: ['slate', 'Advance cancelled'],
  CLAIM_CREATED: ['blue', 'Claim recorded'], CLAIM_APPROVED: ['green', 'Claim approved'],
  CLAIM_REJECTED: ['red', 'Claim rejected'], CLAIM_DELETED: ['slate', 'Claim removed'],
  SETTLEMENT_APPLIED: ['violet', 'Settlement applied'],
  REPORT_GENERATED: ['slate', 'Report generated'], REPORT_DELETED: ['slate', 'Report removed'],
  SETTINGS_UPDATED: ['amber', 'Settings changed'],
};

export default function AdminPayrollSettingsScreen() {
  const [tab, setTab] = useState('settings');
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const [audit, setAudit] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadSettings = useCallback(async () => {
    try { setForm(unwrap(await payrollApi.getSettings())); }
    catch (err: any) { if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true); }
    finally { setRefreshing(false); }
  }, []);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try { const r: any = await payrollApi.getAuditLog({ limit: 60 }); setAudit(r?.data ?? []); }
    catch { setAudit([]); }
    finally { setAuditLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { if (tab === 'audit' && audit.length === 0) loadAudit(); }, [tab, audit.length, loadAudit]);

  const set = (k: string) => (v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try { setForm(unwrap(await payrollApi.updateSettings(form))); Alert.alert('Saved', 'Payroll settings updated.'); }
    catch (err: any) { Alert.alert('Could not save', err.message); }
    finally { setSaving(false); }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Payroll Settings' }} /><ModuleDisabled /></>);

  return (
    <>
      <Stack.Screen options={{ title: 'Payroll Settings' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); if (tab === 'audit') loadAudit(); else loadSettings(); }}
          tintColor={Colors.primary} />}
      >
        <View style={{ marginBottom: Spacing.sm }}>
          <SegTabs tabs={[{ key: 'settings', label: 'Settings' }, { key: 'audit', label: 'Audit Log' }]}
            active={tab} onChange={setTab} />
        </View>

        {tab === 'settings' ? (!form ? <LoaderView /> : (
          <>
            <Panel icon="calendar" tone="indigo" title="The month" sub="What a day of pay is worth, and when it is paid">
              <Select label="Working days basis" value={form.workingDaysBasis} onChange={set('workingDaysBasis')}
                options={[
                  { label: 'A fixed number of days', value: 'fixed' },
                  { label: 'The days in the month', value: 'calendar' },
                  { label: 'School calendar, minus offs and holidays', value: 'school' },
                ]} />
              {form.workingDaysBasis === 'fixed' && (
                <Input label="Fixed working days" value={String(form.fixedWorkingDays)} keyboardType="numeric"
                  onChange={(v: string) => set('fixedWorkingDays')(Number(v) || 0)} />
              )}
              <Input label="Pay day (of the following month)" value={String(form.payDay)} keyboardType="numeric"
                onChange={(v: string) => set('payDay')(Number(v) || 1)} />
              <Select label="Financial year starts" value={String(form.financialYearStartMonth)}
                onChange={(v: string) => set('financialYearStartMonth')(Number(v))}
                options={MONTHS.map((m, i) => ({ label: m, value: String(i + 1) }))} />
              <Select label="Round to" value={String(form.roundTo)} onChange={(v: string) => set('roundTo')(Number(v))}
                options={[{ label: 'Paise', value: '0.01' }, { label: 'Rupee', value: '1' }, { label: '₹5', value: '5' }, { label: '₹10', value: '10' }]} />
              {!!form.workingDaysThisMonth && (
                <NoteBox tone="slate" icon="information-circle">
                  This month works out at {form.workingDaysThisMonth} working days.
                </NoteBox>
              )}
            </Panel>

            <Panel icon="time" tone="amber" title="Loss of pay" sub="Which absences reduce a salary">
              <Toggle label="Approved unpaid leave" value={form.useLeaveForLop} onChange={set('useLeaveForLop')}
                sub="Days the Leave module has approved as unpaid become loss-of-pay days automatically." />
              <Toggle label="Unexplained absences" value={form.useAttendanceForLop} onChange={set('useAttendanceForLop')}
                sub="Days the staff register marks Absent with no leave behind them. A half day costs half a day." />
            </Panel>

            <Panel icon="cash" tone="green" title="Income tax" sub="Nothing is withheld until you choose a regime">
              <Select label="Regime" value={form.tax?.regime || 'none'}
                onChange={(v: string) => setForm((f: any) => ({ ...f, tax: { ...(f.tax || {}), regime: v } }))}
                options={[
                  { label: 'Deduct no tax', value: 'none' },
                  { label: 'New regime', value: 'new' },
                  { label: 'Old regime', value: 'old' },
                ]} />
              {form.tax?.regime !== 'none' ? (
                <>
                  <Facts items={[
                    ['Standard deduction', money(form.tax?.standardDeduction)],
                    ['Cess', `${form.tax?.cessPercent ?? 0}%`],
                    ['Rebate up to', money(form.tax?.rebateUpTo)],
                    ['Slabs', `${form.tax?.slabs?.length ?? 0} bands`],
                  ] as [string, React.ReactNode][]} />
                  <NoteBox tone="amber">
                    The slab table is edited on the web — a row of rates is a spreadsheet, and one wrong figure here
                    would mis-withhold from every salary in the school. Rates change with every budget.
                  </NoteBox>
                </>
              ) : (
                <NoteBox tone="slate" icon="information-circle">
                  No tax is deducted. Set the slabs up on the web before switching a regime on.
                </NoteBox>
              )}
            </Panel>

            <Panel icon="checkmark-circle" tone="blue" title="Approval and announcements" sub="Who signs a run off, and who is told">
              <Toggle label="Require the approve step" value={form.requireApproval} onChange={set('requireApproval')}
                sub="Off means a reviewed run can be published directly." />
              <Toggle label="Someone else must approve" value={form.separateApprover} onChange={set('separateApprover')}
                sub="Whoever processed a run cannot sign it off as well. A school where only one account can reach payroll is let through regardless." />
              <Toggle label="Tell employees when a run is published" value={form.notifyOnPublish} onChange={set('notifyOnPublish')}
                sub="An in-app notice and an email, with the payslip itself attached." />
              <Toggle label="Open the month automatically" value={form.autoOpenRun} onChange={set('autoOpenRun')}
                sub="Creates the run as a draft once the month has ended. Nothing automatic ever approves or publishes." />
              {form.autoOpenRun && (
                <Input label="Open on day" value={String(form.autoOpenDay)} keyboardType="numeric"
                  onChange={(v: string) => set('autoOpenDay')(Number(v) || 25)} />
              )}
              <Toggle label="Remind me before pay day" value={form.remindBeforePayDay} onChange={set('remindBeforePayDay')}
                sub="One notice when pay day is close and the month is still unpublished." />
              {form.remindBeforePayDay && (
                <Input label="Days before" value={String(form.remindDaysBefore)} keyboardType="numeric"
                  onChange={(v: string) => set('remindDaysBefore')(Number(v) || 3)} />
              )}
            </Panel>

            <Panel icon="business" tone="slate" title="Payslips and the bank">
              <Input label="Payslip prefix" value={form.payslipPrefix} onChange={set('payslipPrefix')} />
              <Input label="School bank account" value={form.bankAccountNumber} onChange={set('bankAccountNumber')} />
              <Input label="Payslip footer note" value={form.payslipNote} onChange={set('payslipNote')} multiline />
            </Panel>

            <NoteBox tone="slate" icon="information-circle">
              Settings apply to runs made from now on. A run freezes its own working days and rounding when it is
              created, so changing them here never re-prices a month already computed.
            </NoteBox>

            <View style={st.actions}>
              <ActionBtn label={saving ? 'Saving…' : 'Save Settings'} tone="primary" disabled={saving} onPress={save} />
            </View>
          </>
        )) : (
          auditLoading ? <LoaderView /> : audit.length === 0 ? (
            <Blank icon="clipboard-outline" title="Nothing recorded yet"
              body="Every payroll action — a run created, a CTC revised, a structure changed — is written here as it happens." />
          ) : (
            <Panel icon="clipboard" tone="indigo" title={`${audit.length} recent actions`}>
              {audit.map(a => {
                const [tone, label] = ACTION[a.actionType] || ['slate', a.actionType];
                return (
                  <PersonRow key={a._id} name={a.note || label} tone={tone as any}
                    sub={`${a.userName}${a.role ? ` · ${a.role}` : ''} · ${shortDate(a.timestamp)}`}
                    right={<Pill label={label} tone={tone as any} />} />
                );
              })}
            </Panel>
          )
        )}
      </ScrollView>
    </>
  );
}

const st = StyleSheet.create({
  actions: { marginTop: Spacing.md, marginBottom: Spacing.lg },
});
