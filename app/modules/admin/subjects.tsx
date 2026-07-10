import React, { useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import {
  unwrap, LoaderView, Empty, RowItem, FAB, FormModal, Input, Select,
  confirmAsync, Badge,
} from '@/components/ui/kit';

const TYPE_OPTIONS = [
  { label: 'Theory', value: 'theory' },
  { label: 'Practical', value: 'practical' },
  { label: 'Co-curricular', value: 'co-curricular' },
];

export default function AdminSubjectsScreen() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ subjectName: '', subjectCode: '', type: 'theory' });

  const load = async () => {
    try { setList(unwrap(await adminApi.getSubjects()) ?? []); }
    catch (err: any) { Alert.alert('Error', err.message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ subjectName: '', subjectCode: '', type: 'theory' }); setShowForm(true); };
  const openEdit = (s: any) => {
    setEditing(s);
    setForm({ subjectName: s.subjectName ?? '', subjectCode: s.subjectCode ?? '', type: s.type ?? 'theory' });
    setShowForm(true);
  };

  const handleDelete = async (s: any) => {
    if (!(await confirmAsync('Delete Subject', `Delete ${s.subjectName}?`, 'Delete'))) return;
    try { await adminApi.deleteSubject(s._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const submit = async () => {
    if (!form.subjectName.trim()) return Alert.alert('Required', 'Subject name is required');
    setSaving(true);
    try {
      if (editing) await adminApi.updateSubject(editing._id, form);
      else await adminApi.createSubject(form);
      setShowForm(false);
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Subjects' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {loading ? <LoaderView /> : list.length === 0 ? (
            <Empty icon="book-outline" text="No subjects yet" />
          ) : (
            list.map((s: any) => (
              <RowItem
                key={s._id}
                icon="book" iconColor={Colors.warning} iconBg={Colors.warningLight}
                title={s.subjectName}
                sub={`${s.subjectCode ? `Code ${s.subjectCode} · ` : ''}${(s.teachers ?? []).length} teacher(s)`}
                right={<Badge label={s.type ?? 'theory'} tone="info" />}
                onPress={() => {
                  Alert.alert(s.subjectName, undefined, [
                    { text: 'Close', style: 'cancel' },
                    { text: 'Edit', onPress: () => openEdit(s) },
                    { text: 'Delete', style: 'destructive', onPress: () => handleDelete(s) },
                  ]);
                }}
              />
            ))
          )}
        </ScrollView>
        <FAB onPress={openCreate} />
      </View>

      <FormModal visible={showForm} title={editing ? 'Edit Subject' : 'Add Subject'} onClose={() => setShowForm(false)} onSubmit={submit} submitting={saving}>
        <Input label="Subject Name *" value={form.subjectName} onChange={v => setForm(f => ({ ...f, subjectName: v }))} placeholder="e.g. Mathematics" />
        <Input label="Subject Code" value={form.subjectCode} onChange={v => setForm(f => ({ ...f, subjectCode: v }))} placeholder="e.g. MATH10" />
        <Select label="Type" value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))} options={TYPE_OPTIONS} />
      </FormModal>
    </>
  );
}
