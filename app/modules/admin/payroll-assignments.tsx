import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as payrollApi from '@/api/payroll.api';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, RowItem, Badge, FAB, FormModal, Input, Select,
  fmtMoney, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

export default function AdminPayrollAssignmentsScreen() {
  const [list, setList] = useState<any[]>([]);
  const [structures, setStructures] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ employeeId: '', structureId: '', effectiveDate: '', annualCtc: '' });

  const load = async () => {
    try {
      const res: any = await payrollApi.getAssignments();
      setList((res as any)?.data ?? []);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    load();
    payrollApi.getStructures().then((r: any) => setStructures((r as any)?.data ?? [])).catch(() => {});
    adminApi.getTeachers({ page: 1, limit: 200, status: 'active' }).then((r: any) => setTeachers(unwrap(r)?.data ?? [])).catch(() => {});
  }, []);

  const teacherOptions = useMemo(
    () => teachers.map((t: any) => ({ label: `${t.name} (${t.email})`, value: t._id })), [teachers]);
  const structureOptions = useMemo(
    () => structures.map((s: any) => ({ label: s.name, value: s._id })), [structures]);

  const submit = async () => {
    if (!form.employeeId || !form.structureId || !form.effectiveDate || !form.annualCtc)
      return Alert.alert('Required', 'All fields are required');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.effectiveDate))
      return Alert.alert('Invalid date', 'Use YYYY-MM-DD format');
    setSaving(true);
    try {
      await payrollApi.assignEmployee({
        employeeId: form.employeeId, structureId: form.structureId,
        effectiveDate: form.effectiveDate, annualCtc: Number(form.annualCtc),
      });
      setShowForm(false);
      setForm({ employeeId: '', structureId: '', effectiveDate: '', annualCtc: '' });
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Assignments' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Salary Assignments' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {loading ? <LoaderView /> : list.length === 0 ? (
            <Empty icon="person-add-outline" text="No salary assignments yet" />
          ) : (
            list.map((a: any) => (
              <RowItem
                key={a._id}
                icon="person" iconColor="#15803D" iconBg="#F0FDF4"
                title={a.employee?.name ?? '--'}
                sub={`${a.structure?.name ?? '--'} · CTC ${fmtMoney(a.ctc)}/yr · from ${fmtDate(a.effectiveDate)}`}
                right={<Badge label={a.isActive === false ? 'inactive' : 'active'} />}
              />
            ))
          )}
        </ScrollView>
        <FAB onPress={() => setShowForm(true)} />
      </View>

      <FormModal visible={showForm} title="Assign Salary" onClose={() => setShowForm(false)} onSubmit={submit} submitting={saving} submitLabel="Assign">
        <Select label="Employee *" value={form.employeeId} onChange={v => setForm(f => ({ ...f, employeeId: v }))} options={teacherOptions} />
        <Select label="Structure *" value={form.structureId} onChange={v => setForm(f => ({ ...f, structureId: v }))} options={structureOptions} />
        <Input label="Effective Date * (YYYY-MM-DD)" value={form.effectiveDate} onChange={v => setForm(f => ({ ...f, effectiveDate: v }))} placeholder="2026-07-01" />
        <Input label="Annual CTC (₹) *" value={form.annualCtc} onChange={v => setForm(f => ({ ...f, annualCtc: v }))} keyboardType="numeric" placeholder="600000" />
      </FormModal>
    </>
  );
}
