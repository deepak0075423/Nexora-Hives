import React, { useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import {
  unwrap, LoaderView, Empty, RowItem, FAB, FormModal, Input,
  confirmAsync, Badge, fmtDate,
} from '@/components/ui/kit';

export default function AdminAcademicYearsScreen() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ yearName: '', startDate: '', endDate: '' });

  const load = async () => {
    try { setList(unwrap(await adminApi.getAcademicYears()) ?? []); }
    catch (err: any) { Alert.alert('Error', err.message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const setActive = async (y: any) => {
    if (!(await confirmAsync('Set Active', `Make ${y.yearName} the active academic year? All other years will be deactivated.`, 'Set Active'))) return;
    try { await adminApi.setActiveYear(y._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const handleDelete = async (y: any) => {
    if (!(await confirmAsync('Delete Year', `Delete ${y.yearName}?`, 'Delete'))) return;
    try { await adminApi.deleteAcademicYear(y._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const submit = async () => {
    if (!form.yearName.trim() || !form.startDate || !form.endDate)
      return Alert.alert('Required', 'Year name, start and end dates are required (YYYY-MM-DD)');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(form.endDate))
      return Alert.alert('Invalid date', 'Use YYYY-MM-DD format, e.g. 2026-04-01');
    if (new Date(form.endDate) <= new Date(form.startDate))
      return Alert.alert('Invalid date', 'End date must be after start date');
    setSaving(true);
    try {
      await adminApi.createAcademicYear(form);
      setShowForm(false);
      setForm({ yearName: '', startDate: '', endDate: '' });
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Academic Years' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {loading ? <LoaderView /> : list.length === 0 ? (
            <Empty icon="calendar-outline" text="No academic years yet. Create one first — classes need it." />
          ) : (
            list.map((y: any) => (
              <RowItem
                key={y._id}
                icon="calendar-number" iconColor={Colors.info} iconBg={Colors.infoLight}
                title={y.yearName}
                sub={`${fmtDate(y.startDate)} – ${fmtDate(y.endDate)}`}
                right={<Badge label={y.status ?? 'inactive'} />}
                onPress={() => {
                  Alert.alert(y.yearName, undefined, [
                    { text: 'Close', style: 'cancel' },
                    ...(y.status !== 'active' ? [{ text: 'Set Active', onPress: () => setActive(y) }] : []),
                    { text: 'Delete', style: 'destructive' as const, onPress: () => handleDelete(y) },
                  ]);
                }}
              />
            ))
          )}
        </ScrollView>
        <FAB onPress={() => setShowForm(true)} />
      </View>

      <FormModal visible={showForm} title="Add Academic Year" onClose={() => setShowForm(false)} onSubmit={submit} submitting={saving}>
        <Input label="Year Name *" value={form.yearName} onChange={v => setForm(f => ({ ...f, yearName: v }))} placeholder="e.g. 2026-27" />
        <Input label="Start Date * (YYYY-MM-DD)" value={form.startDate} onChange={v => setForm(f => ({ ...f, startDate: v }))} placeholder="2026-04-01" />
        <Input label="End Date * (YYYY-MM-DD)" value={form.endDate} onChange={v => setForm(f => ({ ...f, endDate: v }))} placeholder="2027-03-31" />
      </FormModal>
    </>
  );
}
