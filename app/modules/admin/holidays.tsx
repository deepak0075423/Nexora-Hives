import React, { useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, RowItem, FAB, FormModal, Input, Select,
  confirmAsync, Badge, fmtDate,
} from '@/components/ui/kit';

const TYPE_OPTIONS = [
  { label: 'Public Holiday', value: 'public' },
  { label: 'School Specific', value: 'school_specific' },
  { label: 'Optional', value: 'optional' },
  { label: 'Exam Break', value: 'exam_break' },
];

export default function AdminHolidaysScreen() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', type: 'public', description: '' });

  const load = async () => {
    try {
      const d = unwrap(await adminApi.getHolidays());
      setList(Array.isArray(d) ? d : d?.holidays ?? d?.data ?? []);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', startDate: '', endDate: '', type: 'public', description: '' });
    setShowForm(true);
  };

  const openEdit = (h: any) => {
    setEditing(h);
    setForm({
      name: h.name ?? '',
      startDate: h.startDate ? new Date(h.startDate).toISOString().slice(0, 10) : '',
      endDate: h.endDate ? new Date(h.endDate).toISOString().slice(0, 10) : '',
      type: h.type ?? 'public',
      description: h.description ?? '',
    });
    setShowForm(true);
  };

  const handleDelete = async (h: any) => {
    if (!(await confirmAsync('Delete Holiday', `Delete ${h.name}?`, 'Delete'))) return;
    try { await adminApi.deleteHoliday(h._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const submit = async () => {
    if (!form.name.trim() || !form.startDate || !form.endDate)
      return Alert.alert('Required', 'Name, start and end dates are required (YYYY-MM-DD)');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(form.endDate))
      return Alert.alert('Invalid date', 'Use YYYY-MM-DD format');
    setSaving(true);
    try {
      if (editing) await adminApi.updateHoliday(editing._id, form);
      else await adminApi.createHoliday(form);
      setShowForm(false);
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Holidays' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Holidays' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {loading ? <LoaderView /> : list.length === 0 ? (
            <Empty icon="sunny-outline" text="No holidays declared" />
          ) : (
            list.map((h: any) => (
              <RowItem
                key={h._id}
                icon="sunny" iconColor="#CA8A04" iconBg="#FEF9C3"
                title={h.name}
                sub={`${fmtDate(h.startDate)}${String(h.startDate) !== String(h.endDate) ? ` – ${fmtDate(h.endDate)}` : ''}${h.description ? `\n${h.description}` : ''}`}
                right={<Badge label={(h.type ?? '').replace('_', ' ')} tone="info" />}
                onPress={() => {
                  Alert.alert(h.name, undefined, [
                    { text: 'Close', style: 'cancel' },
                    { text: 'Edit', onPress: () => openEdit(h) },
                    { text: 'Delete', style: 'destructive', onPress: () => handleDelete(h) },
                  ]);
                }}
              />
            ))
          )}
        </ScrollView>
        <FAB onPress={openCreate} />
      </View>

      <FormModal visible={showForm} title={editing ? 'Edit Holiday' : 'Add Holiday'} onClose={() => setShowForm(false)} onSubmit={submit} submitting={saving}>
        <Input label="Holiday Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Diwali" />
        <Input label="Start Date * (YYYY-MM-DD)" value={form.startDate} onChange={v => setForm(f => ({ ...f, startDate: v }))} placeholder="2026-10-20" />
        <Input label="End Date * (YYYY-MM-DD)" value={form.endDate} onChange={v => setForm(f => ({ ...f, endDate: v }))} placeholder="2026-10-22" />
        <Select label="Type" value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))} options={TYPE_OPTIONS} />
        <Input label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="Optional" multiline />
      </FormModal>
    </>
  );
}
