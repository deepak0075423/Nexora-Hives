/**
 * My Salary and my payslips, on the phone.
 *
 * Reached by teachers AND school admins: admins are paid by this module too,
 * and the endpoint behind it (`/payroll/me/*`) scopes to whoever is asking.
 *
 * Two things this screen is careful about, both of which the old one got wrong:
 * the headline CTC is the one in force THIS month rather than whatever is
 * stored — a revision dated next April is called out separately instead of
 * silently contradicting the breakdown below it — and the payslip list is
 * framed by the FINANCIAL year, which is the frame a payslip is used in.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as payrollApi from '@/api/payroll.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, SegTabs, Select, ActionBtn, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import {
  Figures, Panel, Facts, Pill, PersonRow, NoteBox, Blank, Ledger, NetBar,
  MiniRow, MiniStat, saveAndShare, money, compactMoney, shortDate, PAYMENT_MODE, STRUCTURE_TYPE,
} from '@/components/payroll/parts';

export default function MyPayrollScreen() {
  const [tab, setTab] = useState('salary');
  const [ctc, setCtc] = useState<any>(null);
  const [slips, setSlips] = useState<any[]>([]);
  const [slipMeta, setSlipMeta] = useState<any>({});
  const [fy, setFy] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, p]: any[] = await Promise.all([
        payrollApi.getMyCtc(),
        payrollApi.getMyPayslips(fy ? { year: fy } : undefined),
      ]);
      setCtc(unwrap(c));
      setSlips(p?.data ?? []);
      setSlipMeta(p ?? {});
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  }, [fy]);

  useEffect(() => { load(); }, [load]);

  const openSlip = async (p: any) => {
    setDetail({ ...p, loading: true });
    try { setDetail(unwrap(await payrollApi.getPayslipDetail(p._id))); }
    catch { setDetail(p); }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Payroll' }} /><ModuleDisabled /></>);

  const d = ctc;
  const b = d?.breakdown;
  const who = d?.employee || {};
  const sum = slipMeta.summary || {};
  const years: string[] = slipMeta.years || [];
  const lastPaid = (d?.recent || [])[0];

  return (
    <>
      <Stack.Screen options={{ title: 'My Payroll' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <View style={{ marginBottom: Spacing.sm }}>
          <SegTabs
            tabs={[{ key: 'salary', label: 'My Salary' }, { key: 'slips', label: `Payslips (${slips.length})` }]}
            active={tab} onChange={setTab} />
        </View>

        {loading ? <LoaderView /> : tab === 'salary' ? (
          // `hasSalary` is the flag, not the truthiness of the payload: the
          // endpoint answers with the employee's own details either way.
          !d || d.hasSalary === false ? (
            <Blank icon="cash-outline" title="No salary assigned yet"
              body={`${who.name ? `${who.name}, your` : 'Your'} salary structure has not been set up. Your school's office assigns one before the first payroll run.`} />
          ) : (
            <>
              <Figures items={[
                { icon: 'wallet', tone: 'indigo', label: 'Annual CTC', value: compactMoney(d.annualCtc), caption: `In force for ${d.monthLabel}` },
                { icon: 'cash', tone: 'blue', label: 'Monthly CTC', value: compactMoney(d.monthlyCtc), caption: 'Cost to the school' },
                { icon: 'checkmark-circle', tone: 'green', label: 'Take home', value: compactMoney(b?.netSalary), caption: 'After deductions' },
                { icon: 'document-text', tone: 'violet', label: 'Last paid', value: lastPaid ? compactMoney(lastPaid.net) : '--', caption: lastPaid ? lastPaid.label : 'No payslip yet' },
              ]} />

              {!!d.pendingRevision && (
                <NoteBox tone="blue" icon="trending-up">
                  Your CTC is revised to {money(d.pendingRevision.annualCtc)} from {d.pendingRevision.effectiveLabel}
                  {d.pendingRevision.note ? ` — ${d.pendingRevision.note}` : ''}. The figures below are what {d.monthLabel} pays.
                </NoteBox>
              )}

              <Panel icon="cash" tone="green" title="Monthly breakdown"
                sub={d.structure?.payBasis === 'rate'
                  ? `${money(d.structure.rate)} per ${d.structure.rateUnit}`
                  : `On the “${d.structure?.name}” structure`}
                right={<Pill label={STRUCTURE_TYPE[d.structure?.type]?.[1] || 'General'}
                  tone={STRUCTURE_TYPE[d.structure?.type]?.[0] || 'slate'} />}>
                <Ledger title="Earnings" rows={b.earnings} total={b.grossSalary} />
                <Ledger title="Deductions" tone="red" rows={b.deductions} total={b.totalDeductions} />
                <NetBar label="Take home each month" value={b.netSalary} />

                {Array.isArray(b.employerContributions) && b.employerContributions.length > 0 && (
                  <>
                    <Ledger title="Paid by the school on your behalf"
                      rows={b.employerContributions} total={b.employerCost} />
                    <Text style={st.small}>
                      These are employer contributions. They are part of your CTC and are not deducted from your pay —
                      gross {money(b.grossSalary)} plus {money(b.employerCost)} is the {money(b.monthlyCost)} a month
                      your CTC represents.
                    </Text>
                  </>
                )}
                <Text style={st.small}>
                  Computed on a {b.workingDays}-day month. A day of unpaid leave reduces the pro-rated lines by one
                  day’s worth; the exact figure for any month is on that month’s payslip.
                </Text>
              </Panel>

              <Panel icon="person" tone="indigo" title="My details" sub={[who.employeeId, who.designation].filter(Boolean).join(' · ')}>
                <Facts items={[
                  ['Department', who.department || '—'],
                  ['Joined', who.joiningDate ? shortDate(who.joiningDate) : '—'],
                  ['Structure', d.structure?.name || '—'],
                  ['Effective from', shortDate(d.effectiveDate)],
                  ['Paid by', PAYMENT_MODE[d.paymentMode] || d.paymentMode],
                  ['Bank account', who.bankAccount || 'Not on file'],
                  ...(who.uanNumber ? [['UAN', who.uanNumber]] : []),
                  ...(who.panNumber ? [['PAN', who.panNumber]] : []),
                ] as [string, React.ReactNode][]} />
                {d.paymentMode === 'bank_transfer' && !who.bankAccount && (
                  <NoteBox tone="amber">
                    There is no bank account on your record, so your salary cannot be transferred. Ask the office to add it.
                  </NoteBox>
                )}
              </Panel>

              {Array.isArray(d.revisions) && d.revisions.length > 0 && (
                <Panel icon="trending-up" tone="green" title="Salary history"
                  sub={`${d.revisions.length} ${d.revisions.length === 1 ? 'entry' : 'entries'}`}>
                  {d.revisions.slice(0, 6).map((r: any, i: number) => (
                    <PersonRow key={i} name={money(r.annualCtc)}
                      tone={r.incrementType === 'initial' ? 'slate' : 'green'}
                      sub={r.note || (r.incrementType === 'initial' ? 'Initial CTC' : 'Revision')}
                      right={<Text style={st.when}>{r.effectiveLabel}</Text>} />
                  ))}
                </Panel>
              )}
            </>
          )
        ) : (
          <>
            {years.length > 0 && (
              <Select label="Financial year" value={fy || slipMeta.financialYear?.label || ''} onChange={setFy}
                options={years.map(y => ({ label: y, value: y }))} />
            )}

            <Figures items={[
              { icon: 'document-text', tone: 'indigo', label: 'Payslips', value: sum.count ?? 0, caption: slipMeta.financialYear?.label ? `Issued in ${slipMeta.financialYear.label}` : '' },
              { icon: 'cash', tone: 'blue', label: 'Gross earnings', value: compactMoney(sum.gross), caption: 'Before deductions' },
              { icon: 'bar-chart', tone: 'pink', label: 'Deductions', value: compactMoney(sum.deductions), caption: 'PF, tax and others' },
              { icon: 'checkmark-circle', tone: 'green', label: 'Take home', value: compactMoney(sum.net), caption: 'Paid to you' },
            ]} />

            {sum.lopDays > 0 && (
              <NoteBox tone="amber">
                {sum.lopDays} unpaid {sum.lopDays === 1 ? 'day was' : 'days were'} deducted across
                {' '}{slipMeta.financialYear?.label}. Each month’s payslip shows its own figure.
              </NoteBox>
            )}

            <View style={st.actions}>
              <ActionBtn label="Salary statement for the year" tone="primary"
                onPress={() => saveAndShare(
                  () => payrollApi.downloadMyStatement(fy ? { year: fy } : undefined),
                  `salary_statement_${fy || slipMeta.financialYear?.label || 'year'}.pdf`)} />
            </View>

            {slips.length === 0 ? (
              <Blank icon="document-outline" title="No payslips yet"
                body="A payslip is issued when the school publishes that month’s payroll." />
            ) : (
              <Panel icon="documents" tone="indigo" title={`Payslips${slipMeta.financialYear?.label ? ` — ${slipMeta.financialYear.label}` : ''}`}>
                {slips.map(p => (
                  <PersonRow key={p._id} name={p.periodLong} tone="indigo"
                    sub={`${p.slipNo || '—'} · ${p.paidDays}/${p.workingDays} days · net ${money(p.netSalary)}`}
                    right={<ActionBtn label="Open" tone="neutral" small onPress={() => openSlip(p)} />}
                    onPress={() => openSlip(p)} />
                ))}
              </Panel>
            )}

            {!!detail && (
              <Panel icon="document-text" tone="green" title={detail.periodLong}
                sub={detail.slipNo ? `Slip ${detail.slipNo}` : 'Monthly salary'}
                right={<Pill label="Issued" tone="green" />}>
                {detail.loading ? <LoaderView /> : (
                  <>
                    <MiniRow>
                      <MiniStat label="Paid days" value={`${detail.paidDays}/${detail.workingDays}`} />
                      {detail.lopDays > 0 && <MiniStat label="Unpaid" value={String(detail.lopDays)} tone="red" />}
                      <MiniStat label="Net" value={compactMoney(detail.netSalary)} tone="green" />
                    </MiniRow>

                    <View style={{ marginTop: Spacing.sm }}>
                      <Ledger title="Earnings" total={detail.grossSalary}
                        rows={(detail.earnings || []).map((x: any) => ({
                          name: x.name, amount: x.amount,
                          note: x.fullAmount > x.amount ? `${money(x.fullAmount)} for a full month` : undefined,
                        }))} />
                      {detail.lopAmount > 0 && (
                        <Text style={[st.small, { color: '#B45309' }]}>
                          {detail.lopDays} unpaid {detail.lopDays === 1 ? 'day' : 'days'} reduced your earnings by {money(detail.lopAmount)} this month.
                        </Text>
                      )}
                      {(detail.arrears > 0 || detail.bonus > 0 || detail.reimbursement > 0) && (
                        <Ledger title="Additions"
                          total={detail.arrears + detail.bonus + detail.reimbursement}
                          rows={[
                            ...(detail.arrears > 0 ? [{ name: 'Arrears', amount: detail.arrears }] : []),
                            ...(detail.bonus > 0 ? [{ name: 'Bonus', amount: detail.bonus }] : []),
                            ...(detail.reimbursement > 0 ? [{ name: 'Expenses reimbursed', amount: detail.reimbursement }] : []),
                          ]} />
                      )}
                      <Ledger title="Deductions" tone="red"
                        total={detail.totalDeductions + (detail.otherDeductions || 0)}
                        rows={[
                          ...(detail.deductions || []),
                          ...(detail.otherDeductions > 0 ? [{ name: 'Other deductions', amount: detail.otherDeductions }] : []),
                          ...(detail.advanceRecovery > 0 ? [{ name: 'Advance instalment', amount: detail.advanceRecovery }] : []),
                        ]} />
                      <NetBar value={detail.netSalary} />
                      {Array.isArray(detail.employerContributions) && detail.employerContributions.length > 0 && (
                        <Ledger title="Paid by the school (not deducted)"
                          rows={detail.employerContributions} total={detail.employerCost} />
                      )}
                    </View>

                    {!!detail.remarks && <NoteBox tone="slate" icon="information-circle">{detail.remarks}</NoteBox>}

                    <View style={st.actions}>
                      <ActionBtn label="Download payslip" tone="primary"
                        onPress={() => saveAndShare(() => payrollApi.downloadMyPayslip(detail._id),
                          `payslip_${String(detail.periodLong).replace(/\s+/g, '_')}.pdf`)} />
                      <ActionBtn label="Close" tone="neutral" small onPress={() => setDetail(null)} />
                    </View>

                    {!!detail.note && <Text style={st.footnote}>{detail.note}</Text>}
                  </>
                )}
              </Panel>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const st = StyleSheet.create({
  small: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 17, marginTop: Spacing.sm },
  footnote: { fontSize: 10.5, color: Colors.textLight, lineHeight: 15, marginTop: Spacing.sm },
  when: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm, marginBottom: Spacing.sm },
});
