/**
 * Payroll → Reports, on the phone.
 *
 * Generate one, then hand it to the share sheet. The web shows charts beside
 * the list; here the figures are the summary the charts were summarising, and
 * the useful thing on a phone is producing the file and sending it on.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as payrollApi from '@/api/payroll.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, FAB, FormModal, Select, ActionBtn, confirmAsync, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import {
  Figures, Panel, Pill, PersonRow, NoteBox, Blank, saveAndShare,
  money, compactMoney, shortDate, MONTHS,
} from '@/components/payroll/parts';

export default function AdminPayrollReportsScreen() {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [overview, setOverview] = useState<any>(null);
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});

  const load = useCallback(async () => {
    try {
      const [ov, reports]: any[] = await Promise.all([
        payrollApi.getReportsOverview({ month: Number(month), year: Number(year) }),
        payrollApi.getReports({ limit: 50 }),
      ]);
      setOverview(unwrap(ov));
      setList(reports?.data ?? []);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const types: any[] = overview?.types ?? [];

  const openForm = (preset?: string) => {
    setForm({
      type: preset || 'summary', month, year,
      department: '', employeeId: '', format: 'pdf',
    });
    setShowForm(true);
  };

  const generate = async () => {
    setSaving(true);
    try {
      const res: any = await payrollApi.generateReport({
        ...form, month: Number(form.month), year: Number(form.year),
      });
      setShowForm(false);
      await load();
      // Straight to the share sheet: on a phone, generating a report and then
      // hunting for it in a list is two steps where one will do.
      if (res?.data?._id) {
        saveAndShare(() => payrollApi.downloadReport(res.data._id),
          `${String(res.data.name).replace(/[^\w-]+/g, '_')}.${form.format === 'pdf' ? 'pdf' : 'csv'}`,
          form.format === 'pdf' ? 'application/pdf' : 'text/csv');
      }
    } catch (err: any) { Alert.alert('Could not generate', err.message); }
    finally { setSaving(false); }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Payroll Reports' }} /><ModuleDisabled /></>);

  const t = overview?.tiles || {};
  const meta = types.find(x => x.key === form.type);
  const wantsYear = meta?.period === 'year';

  return (
    <>
      <Stack.Screen options={{ title: 'Payroll Reports' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          <View style={st.period}>
            <View style={{ flex: 1 }}>
              <Select label="Month" value={month} onChange={setMonth}
                options={MONTHS.map((m, i) => ({ label: m, value: String(i + 1) }))} />
            </View>
            <View style={{ flex: 1 }}>
              <Select label="Year" value={year} onChange={setYear}
                options={Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - 3 + i)).map(y => ({ label: y, value: y }))} />
            </View>
          </View>

          {loading ? <LoaderView /> : (
            <>
              <Figures items={[
                { icon: 'people', tone: 'indigo', label: 'Employees', value: t.employees?.value ?? '--', caption: `As of ${MONTHS[Number(month) - 1]?.slice(0, 3)} ${year}` },
                { icon: 'cash', tone: 'blue', label: 'Total payroll', value: compactMoney(t.gross?.value), caption: 'Gross salary' },
                { icon: 'document-text', tone: 'pink', label: 'Deductions', value: compactMoney(t.deductions?.value), caption: 'PF, ESI, TDS' },
                { icon: 'wallet', tone: 'violet', label: 'Net payout', value: compactMoney(t.net?.value), caption: 'Amount disbursed' },
              ]} />

              {Array.isArray(overview?.components) && overview.components.length > 0 && (
                <Panel icon="pie-chart" tone="violet" title="Where the salary goes"
                  sub={`Breakdown of ${money(overview.componentTotal)} for ${MONTHS[Number(month) - 1]} ${year}`}>
                  {overview.components.map((c: any) => (
                    <View key={c.name} style={st.compRow}>
                      <Text style={st.compName} numberOfLines={1}>{c.name}</Text>
                      <View style={st.bar}><View style={[st.barFill, { width: `${Math.min(100, c.pct)}%` }]} /></View>
                      <Text style={st.compPct}>{c.pct}%</Text>
                    </View>
                  ))}
                </Panel>
              )}

              <Panel icon="flash" tone="amber" title="Quick reports">
                {types.map(x => (
                  <PersonRow key={x.key} name={x.label} sub={x.hint} tone="amber"
                    onPress={() => openForm(x.key)} />
                ))}
              </Panel>

              <Panel icon="documents" tone="indigo" title={`Generated reports (${list.length})`}>
                {list.length === 0 ? (
                  <Blank icon="document-outline" title="Nothing generated yet"
                    body="Generate a report and it is listed here — and handed straight to your share sheet." />
                ) : list.map(r => (
                  <PersonRow key={r._id} name={r.name} tone="indigo"
                    sub={`${r.typeLabel} · ${r.rowCount} rows · ${shortDate(r.generatedAt)}${r.generatedByName ? ` by ${r.generatedByName}` : ''}`}
                    right={
                      <View style={st.rowActions}>
                        <Pill label={r.format === 'pdf' ? 'PDF' : 'CSV'} tone={r.format === 'pdf' ? 'red' : 'green'} />
                        <ActionBtn label="Open" tone="primary" small
                          onPress={() => saveAndShare(() => payrollApi.downloadReport(r._id),
                            `${String(r.name).replace(/[^\w-]+/g, '_')}.${r.format === 'pdf' ? 'pdf' : 'csv'}`,
                            r.format === 'pdf' ? 'application/pdf' : 'text/csv')} />
                      </View>
                    }
                    onPress={async () => {
                      if (!(await confirmAsync('Remove this report?', 'It is taken off the list. The payroll data behind it is untouched and you can generate it again.', 'Remove'))) return;
                      try { await payrollApi.deleteReport(r._id); load(); }
                      catch (e: any) { Alert.alert('Error', e.message); }
                    }} />
                ))}
              </Panel>

              <NoteBox tone="slate" icon="information-circle">
                Only the recipe is stored — downloading a report rebuilds it from the runs in that period, so a
                recomputed month reports its new figures.
              </NoteBox>
            </>
          )}
        </ScrollView>
        <FAB icon="document-text" onPress={() => openForm()} />
      </View>

      <FormModal visible={showForm} title="Generate Report" onClose={() => setShowForm(false)}
        onSubmit={generate} submitting={saving} submitLabel="Generate">
        <Select label="Report type" value={form.type} onChange={(v: string) => setForm((f: any) => ({ ...f, type: v }))}
          options={types.map(x => ({ label: x.label, value: x.key }))} />
        {!!meta && <Text style={st.hint}>{meta.hint}</Text>}
        {!wantsYear && (
          <Select label="Month" value={form.month} onChange={(v: string) => setForm((f: any) => ({ ...f, month: v }))}
            options={MONTHS.map((m, i) => ({ label: m, value: String(i + 1) }))} />
        )}
        <Select label="Year" value={form.year} onChange={(v: string) => setForm((f: any) => ({ ...f, year: v }))}
          options={Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - 3 + i)).map(y => ({ label: y, value: y }))} />
        {form.type !== 'employee' && (
          <Select label="Department" value={form.department} onChange={(v: string) => setForm((f: any) => ({ ...f, department: v }))}
            options={[{ label: 'All departments', value: '' }, ...(overview?.departments ?? []).map((d: string) => ({ label: d, value: d }))]} />
        )}
        <Select label="Format" value={form.format} onChange={(v: string) => setForm((f: any) => ({ ...f, format: v }))}
          options={[{ label: 'PDF', value: 'pdf' }, { label: 'Excel (CSV)', value: 'excel' }, { label: 'CSV', value: 'csv' }]} />
      </FormModal>
    </>
  );
}

const st = StyleSheet.create({
  period: { flexDirection: 'row', gap: Spacing.sm },
  rowActions: { alignItems: 'flex-end', gap: 6 },
  compRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
  compName: { flex: 1, fontSize: 12.5, color: Colors.text },
  bar: { width: 70, height: 6, borderRadius: 3, backgroundColor: Colors.divider, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 3 },
  compPct: { width: 46, textAlign: 'right', fontSize: 12, fontWeight: '700', color: Colors.text },
  hint: { fontSize: 12, color: Colors.textSecondary, marginTop: -Spacing.xs, marginBottom: Spacing.sm },
});
