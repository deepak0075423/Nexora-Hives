/**
 * Payroll → Claims & Tax on the phone — the web screen of the same name
 * (school-frontend/src/pages/payroll/teacher/MyClaims.jsx), read top to bottom.
 *
 * An employee could not raise an expense claim, see an advance they were
 * repaying, or see how their income tax was worked out. All three are here;
 * everything is their own, and nothing on it changes what they are paid.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { Colors, Spacing } from '@/constants/theme';
import * as payrollApi from '@/api/payroll.api';
import { unwrap, LoaderView, ActionBtn, FormModal, Input, Select, confirmAsync } from '@/components/ui/kit';
import { Figures, Panel, PersonRow, NoteBox, Blank, Pill, saveAndShare, money, compactMoney, shortDate } from '@/components/payroll/parts';

const CLAIM_STATUS: Record<string, ['amber' | 'blue' | 'green' | 'red' | 'slate', string]> = {
  pending: ['amber', 'Waiting'], approved: ['blue', 'Next payroll'], paid: ['green', 'Paid'], rejected: ['red', 'Not approved'],
};
const REGIME: Record<string, string> = { new: 'New regime', old: 'Old regime', none: 'No tax deducted' };
const today = () => new Date().toISOString().slice(0, 10);

export default function MyClaimsTab({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<any>(null);
  const [tax, setTax] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ category: 'Other', amount: '', claimedOn: today(), description: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, t]: any[] = await Promise.all([payrollApi.getMyClaims(), payrollApi.getMyTax()]);
      setData(unwrap(c)); setTax(unwrap(t));
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) return <LoaderView />;
  const claims: any[] = data?.claims || [];
  const advances: any[] = data?.advances || [];
  const waiting = claims.filter(c => c.status === 'pending' || c.status === 'approved');
  const owing = advances.filter(a => a.status === 'active');

  const submit = async () => {
    const amount = Number(form.amount);
    if (!(amount > 0)) { Alert.alert('Amount', 'Enter the amount you spent.'); return; }
    if (String(form.description).trim().length < 3) { Alert.alert('Details', 'Say what the expense was for.'); return; }
    setSaving(true);
    try {
      await payrollApi.createMyClaim({ ...form, amount, description: String(form.description).trim() });
      setAdding(false); load();
      Alert.alert('Claim submitted', 'The office will review it. An approved claim is paid back with your next salary.');
    } catch (err: any) { Alert.alert('Could not submit', err.message); }
    finally { setSaving(false); }
  };
  const withdraw = async (c: any) => {
    if (!(await confirmAsync('Withdraw this claim?', `${c.category} — ${money(c.amount)}`, 'Withdraw'))) return;
    try { await payrollApi.deleteMyClaim(c._id); load(); }
    catch (err: any) { Alert.alert('Could not withdraw', err.message); }
  };

  return (
    <>
      <Figures items={[
        { icon: 'receipt', tone: 'indigo', label: 'Claims waiting', value: compactMoney(waiting.reduce((s, c) => s + c.amount, 0)), caption: `${waiting.length} not yet paid` },
        { icon: 'wallet', tone: 'amber', label: 'Still to repay', value: compactMoney(owing.reduce((s, a) => s + a.outstanding, 0)), caption: owing.length ? `${owing.length} advance${owing.length === 1 ? '' : 's'}` : 'Nothing outstanding' },
      ]} />

      <View style={st.actions}>
        <ActionBtn label="New expense claim" tone="primary" onPress={() => {
          setForm({ category: data?.categories?.[0] || 'Other', amount: '', claimedOn: today(), description: '' });
          setAdding(true);
        }} />
      </View>

      <Panel icon="receipt" tone="indigo" title={`My claims (${claims.length})`}>
        {claims.length === 0 ? (
          <Blank icon="receipt-outline" title="No claims yet"
            body="Spent your own money on something for the school? Raise a claim and it is paid back with your salary once the office approves it." />
        ) : claims.map(c => {
          const [tone, label] = CLAIM_STATUS[c.status] || ['slate', c.status];
          return (
            <PersonRow key={c._id} name={`${c.category} · ${money(c.amount)}`} tone="indigo"
              sub={[shortDate(c.claimedOn), c.description, c.status === 'rejected' ? c.decisionNote : ''].filter(Boolean).join(' · ')}
              right={<Pill label={label} tone={tone} />}
              onPress={c.status === 'pending' ? () => withdraw(c) : undefined} />
          );
        })}
        {claims.some(c => c.status === 'pending') && (
          <Text style={st.small}>Tap a waiting claim to withdraw it.</Text>
        )}
      </Panel>

      <Panel icon="wallet" tone="amber" title="Advances and loans">
        {advances.length === 0 ? (
          <Text style={st.small}>You have no advance or loan on record.</Text>
        ) : advances.map(a => (
          <PersonRow key={a._id} tone="amber"
            name={`${a.kind === 'loan' ? 'Loan' : 'Advance'} of ${money(a.amount)}`}
            sub={`${money(a.recovered)} recovered · ${a.instalments} instalment${a.instalments === 1 ? '' : 's'} from ${a.startLabel}${a.reason ? ` · ${a.reason}` : ''}`}
            right={<Pill label={a.status === 'active' ? `${compactMoney(a.outstanding)} left` : 'Cleared'} tone={a.status === 'active' ? 'amber' : 'green'} />} />
        ))}
      </Panel>

      <Panel icon="calculator" tone="violet" title="My income tax"
        sub={tax?.financialYear ? `Financial year ${tax.financialYear}${tax.regime ? ` · ${REGIME[tax.regime] || tax.regime}` : ''}` : undefined}>
        {!tax?.hasData ? (
          <Text style={st.small}>The working appears once a payslip has been issued this financial year.</Text>
        ) : (
          <>
            {(tax.rows || []).map((r: any, i: number) => (
              <View key={i} style={[st.taxRow, i > 0 && st.taxRowLine]}>
                <Text style={[st.taxLabel, /^(Taxable income|Total tax|Tax deducted|Balance|Deducted in excess)/.test(r.particulars) && st.bold]}>
                  {r.particulars}{r.note ? `\n` : ''}{r.note ? <Text style={st.note}>{r.note}</Text> : null}
                </Text>
                <Text style={st.taxValue}>{money(r.amount)}</Text>
              </View>
            ))}
            <View style={st.actions}>
              <ActionBtn label="Tax statement (PDF)" tone="neutral" small
                onPress={() => saveAndShare(() => payrollApi.downloadMyTaxStatement(), `tax_statement_${tax.financialYear}.pdf`)} />
            </View>
            {tax.regime === 'none' && (
              <NoteBox tone="slate" icon="information-circle">Your school does not deduct income tax through payroll.</NoteBox>
            )}
          </>
        )}
      </Panel>

      <FormModal visible={adding} title="New expense claim" onClose={() => setAdding(false)}
        onSubmit={submit} submitting={saving} submitLabel="Submit claim">
        <Select label="What was it for" value={form.category}
          onChange={(v: string) => setForm((f: any) => ({ ...f, category: v }))}
          options={(data?.categories || ['Other']).map((c: string) => ({ label: c, value: c }))} />
        <Input text="decimal" label="Amount spent" value={form.amount} keyboardType="decimal-pad"
          onChange={(v: string) => setForm((f: any) => ({ ...f, amount: v }))} />
        <Input text="date" label="Date of the expense (YYYY-MM-DD)" value={form.claimedOn}
          onChange={(v: string) => setForm((f: any) => ({ ...f, claimedOn: v }))} />
        <Input text="sentence" label="Details" value={form.description} multiline placeholder="Bus fare to the science fair"
          onChange={(v: string) => setForm((f: any) => ({ ...f, description: v }))} />
        <NoteBox tone="blue" icon="information-circle">
          Hand the bill itself to the accounts office. An approved claim is your own money being returned, so it is not
          part of your gross pay.
        </NoteBox>
      </FormModal>
    </>
  );
}

const st = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  small: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginTop: Spacing.xs },
  taxRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm, paddingVertical: 7 },
  taxRowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  taxLabel: { flex: 1, fontSize: 12.5, color: Colors.text, lineHeight: 17 },
  taxValue: { fontSize: 12.5, color: Colors.text, fontWeight: '600' },
  bold: { fontWeight: '700' },
  note: { fontSize: 10.5, color: Colors.textSecondary, fontWeight: '400' },
});
