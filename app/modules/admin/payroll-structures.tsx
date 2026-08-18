import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as payrollApi from '@/api/payroll.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  LoaderView, Empty, RowItem, Badge, FAB, FormModal, Input,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

export default function AdminPayrollStructuresScreen() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });

  const load = async () => {
    try {
      const res: any = await payrollApi.getStructures();
      setList((res as any)?.data ?? []);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.name.trim()) return Alert.alert('Required', 'Structure name is required');
    setSaving(true);
    try {
      await payrollApi.createStructure({ name: form.name.trim(), description: form.description });
      setShowForm(false);
      setForm({ name: '', description: '' });
      load();
      Alert.alert('Created', 'Structure created. Add salary components on the web admin panel.');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Salary Structures' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Salary Structures' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {loading ? <LoaderView /> : list.length === 0 ? (
            <Empty icon="layers-outline" text="No salary structures yet" />
          ) : (
            list.map((s: any) => (
              <RowItem
                key={s._id}
                icon="layers" iconColor="#15803D" iconBg="#F0FDF4"
                title={s.name}
                sub={`${(s.components ?? []).length} component(s)${s.description ? ` · ${s.description}` : ''}`}
                right={<Badge label={s.isActive === false ? 'inactive' : 'active'} />}
              />
            ))
          )}
        </ScrollView>
        <FAB onPress={() => setShowForm(true)} />
      </View>

      <FormModal visible={showForm} title="Add Structure" onClose={() => setShowForm(false)} onSubmit={submit} submitting={saving}>
        <Input label="Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Teaching Staff 2026" />
        <Input label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} multiline />
        <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 8 }}>
          Salary components (basic, HRA, deductions…) are configured on the web admin panel after creating the structure.
        </Text>
      </FormModal>
    </>
  );
}
