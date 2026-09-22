/**
 * Payroll → Runs, on the phone.
 *
 * The list, its four figures, and a way in. Creating a run asks the same three
 * questions the web asks and warns about the same things — an admin holding a
 * phone is still the person who signs the month off.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as payrollApi from '@/api/payroll.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  LoaderView, FAB, FormModal, Select, Input, SegTabs, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import {
  Figures, Panel, PersonRow, StatusPill, NoteBox, Blank, money, MONTHS,
} from '@/components/payroll/parts';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
];

export default function AdminPayrollRunsScreen() {
  const router = useRouter();
  const now = new Date();
  const [list, setList] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ month: String(now.getMonth() + 1), year: String(now.getFullYear()), runName: '' });

  const load = useCallback(async () => {
    try {
      const res: any = await payrollApi.getPayrollRuns({ status, limit: 50 });
      setList(res?.data ?? []);
      setSummary(res?.summary ?? {});
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    setSaving(true);
    try {
      const res: any = await payrollApi.createRun({
        month: Number(form.month), year: Number(form.year), runName: form.runName.trim() || undefined,
      });
      setShowForm(false);
      load();
      const skipped = res?.data?.skipped?.length ?? 0;
      Alert.alert(
        'Run created',
        `${res?.data?.runName}: ${res?.data?.totalEmployees ?? 0} employees.` +
        (skipped ? `\n\n${skipped} left out — open the run to see why.` : ''),
      );
    } catch (err: any) { Alert.alert('Could not create the run', err.message); }
    finally { setSaving(false); }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Payroll Runs' }} /><ModuleDisabled /></>);

  const pct = (n: number) => (summary.total ? Math.round((n / summary.total) * 100) : 0);

  return (
    <>
      <Stack.Screen options={{ title: 'Payroll Runs' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          <Figures items={[
            { icon: 'documents', tone: 'indigo', label: 'Total runs', value: summary.total ?? '--', caption: 'This academic year' },
            { icon: 'checkmark-circle', tone: 'green', label: 'Completed', value: summary.completed ?? '--', caption: `${pct(summary.completed || 0)}%` },
            { icon: 'time', tone: 'blue', label: 'In progress', value: summary.inProgress ?? '--', caption: `${pct(summary.inProgress || 0)}%` },
            { icon: 'close-circle', tone: 'red', label: 'Failed', value: summary.failed ?? '--', caption: `${pct(summary.failed || 0)}%` },
          ]} />

          <View style={{ marginBottom: Spacing.sm }}>
            <SegTabs tabs={FILTERS} active={status} onChange={setStatus} />
          </View>

          {loading ? <LoaderView /> : list.length === 0 ? (
            <Blank icon="play-circle-outline" title="No payroll runs"
              body={status ? 'No run matches this filter.' : 'Create the first run to compute salaries for every active assignment.'} />
          ) : (
            <Panel icon="play-circle" tone="indigo" title={`${list.length} run${list.length === 1 ? '' : 's'}`}>
              {list.map(r => (
                <PersonRow key={r._id} name={r.runName} tone="indigo"
                  sub={`${r.periodRange} · ${r.totalEmployees} employees\nGross ${money(r.totalGross)} · Net ${money(r.totalNet)}`}
                  right={<StatusPill status={r.status} />}
                  onPress={() => router.push({ pathname: '/modules/admin/payroll-run-detail', params: { id: r._id } } as any)} />
              ))}
            </Panel>
          )}
        </ScrollView>
        <FAB onPress={() => setShowForm(true)} />
      </View>

      <FormModal visible={showForm} title="New Payroll Run" onClose={() => setShowForm(false)}
        onSubmit={submit} submitting={saving} submitLabel="Create Run">
        <Select label="Month" value={form.month} onChange={v => setForm(f => ({ ...f, month: v }))}
          options={MONTHS.map((m, i) => ({ label: m, value: String(i + 1) }))} />
        <Input label="Year" value={form.year} onChange={v => setForm(f => ({ ...f, year: v }))} keyboardType="numeric" />
        <Input label="Run name (optional)" value={form.runName} onChange={v => setForm(f => ({ ...f, runName: v }))}
          placeholder={`${MONTHS[Number(form.month) - 1] || ''} ${form.year} Payroll`} />
        <View style={st.hint}>
          <NoteBox tone="slate" icon="information-circle">
            Unpaid leave is taken from approved leave automatically. Nothing is paid until the run is published — you
            can review and edit every entry first.
          </NoteBox>
        </View>
      </FormModal>
    </>
  );
}

const st = StyleSheet.create({ hint: { marginTop: Spacing.sm } });
