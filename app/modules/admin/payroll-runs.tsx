import React, { useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as payrollApi from '@/api/payroll.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  LoaderView, Empty, RowItem, Badge, FAB, FormModal, Select, Input, fmtMoney,
} from '@/components/ui/kit';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function AdminPayrollRunsScreen() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const now = new Date();
  const [form, setForm] = useState({ month: String(now.getMonth() + 1), year: String(now.getFullYear()) });

  const load = async () => {
    try {
      const res: any = await payrollApi.getPayrollRuns();
      setList((res as any)?.data ?? []);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    setSaving(true);
    try {
      await payrollApi.createRun({ month: Number(form.month), year: Number(form.year) });
      setShowForm(false);
      load();
      Alert.alert('Created', 'Draft payroll run created with entries for all active assignments.');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Payroll Runs' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Payroll Runs' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {loading ? <LoaderView /> : list.length === 0 ? (
            <Empty icon="play-circle-outline" text="No payroll runs yet" />
          ) : (
            list.map((r: any) => (
              <RowItem
                key={r._id}
                icon="calendar" iconColor="#15803D" iconBg="#F0FDF4"
                title={`${MONTHS[(r.month ?? 1) - 1]} ${r.year}`}
                sub={`Gross ${fmtMoney(r.totalGross)} · Deductions ${fmtMoney(r.totalDeductions)} · Net ${fmtMoney(r.totalNet)}`}
                right={<Badge label={r.status} />}
                onPress={() => router.push({ pathname: '/modules/admin/payroll-run-detail', params: { id: r._id } } as any)}
              />
            ))
          )}
        </ScrollView>
        <FAB onPress={() => setShowForm(true)} />
      </View>

      <FormModal visible={showForm} title="New Payroll Run" onClose={() => setShowForm(false)} onSubmit={submit} submitting={saving} submitLabel="Create Run">
        <Select label="Month" value={form.month} onChange={v => setForm(f => ({ ...f, month: v }))}
          options={MONTHS.map((m, i) => ({ label: m, value: String(i + 1) }))} />
        <Input label="Year" value={form.year} onChange={v => setForm(f => ({ ...f, year: v }))} keyboardType="numeric" />
      </FormModal>
    </>
  );
}
