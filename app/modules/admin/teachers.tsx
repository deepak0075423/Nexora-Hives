import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import { isEmail, isPhone } from '@/utils/validators';
import {
  unwrap, LoaderView, Empty, Badge, RowItem, SearchBar, FAB, FormModal,
  Input, Select, KV, ActionBtn, confirmAsync,
} from '@/components/ui/kit';

export default function AdminTeachersScreen() {
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [designations, setDesignations] = useState<string[]>([]);

  const [detail, setDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', designation: '' });

  const load = async (p = 1, q = search) => {
    try {
      const res: any = await adminApi.getTeachers({ page: p, limit: 20, search: q });
      const d = unwrap(res);
      const rows = d?.data ?? [];
      if (p === 1) setList(rows); else setList(prev => [...prev, ...rows]);
      setTotal(d?.total ?? rows.length);
      setPage(p);
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(1, ''); }, []);
  useEffect(() => {
    const t = setTimeout(() => { setLoading(true); load(1, search); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    adminApi.getDesignations()
      .then((res: any) => setDesignations(unwrap(res) ?? []))
      .catch(() => {});
  }, []);

  const openDetail = async (id: string) => {
    try { setDetail(unwrap(await adminApi.getTeacher(id))); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const handleToggle = async (id: string) => {
    try { await adminApi.toggleUser(id); setDetail(null); load(1); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirmAsync('Delete Teacher', `Delete ${name}? This cannot be undone.`, 'Delete'))) return;
    try { await adminApi.deleteTeacher(id); setDetail(null); load(1); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim()) return Alert.alert('Required', 'Name and email are required');
    if (form.name.trim().length < 2) return Alert.alert('Invalid', 'Name must be at least 2 characters');
    if (!isEmail(form.email)) return Alert.alert('Invalid', 'Please enter a valid email address');
    if (form.phone && !isPhone(form.phone)) return Alert.alert('Invalid', 'Please enter a valid phone number');
    setSaving(true);
    try {
      await adminApi.createTeacher({ ...form, name: form.name.trim(), email: form.email.trim() });
      setShowForm(false);
      setForm({ name: '', email: '', phone: '', designation: '' });
      load(1);
      Alert.alert('Success', 'Teacher created. Login OTP has been emailed.');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  const u = detail?.user;
  const p = detail?.profile;

  return (
    <>
      <Stack.Screen options={{ title: `Teachers (${total})` }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1); }} tintColor={Colors.primary} />}
        >
          <SearchBar value={search} onChange={setSearch} placeholder="Search teachers…" />
          {loading ? <LoaderView /> : list.length === 0 ? (
            <Empty icon="people-outline" text="No teachers found" />
          ) : (
            <>
              {list.map((t: any) => (
                <RowItem
                  key={t._id}
                  icon="person" iconColor={Colors.info} iconBg={Colors.infoLight}
                  title={t.name}
                  sub={t.email}
                  right={<Badge label={t.isActive === false ? 'inactive' : 'active'} />}
                  onPress={() => openDetail(t._id)}
                />
              ))}
              {list.length < total && (
                <TouchableOpacity onPress={() => load(page + 1)} style={{ padding: 14, alignItems: 'center' }}>
                  <Text style={{ color: Colors.accent, fontWeight: '600', fontSize: 13 }}>Load more ({list.length}/{total})</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
        <FAB onPress={() => setShowForm(true)} />
      </View>

      <FormModal visible={!!detail} title={u?.name ?? 'Teacher'} onClose={() => setDetail(null)}>
        <KV label="Email" value={u?.email} />
        <KV label="Phone" value={u?.phone || '--'} />
        <KV label="Designation" value={p?.designation || '--'} />
        <KV label="Status" value={<Badge label={u?.isActive === false ? 'inactive' : 'active'} />} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <ActionBtn label={u?.isActive === false ? 'Activate' : 'Deactivate'} tone="warning" onPress={() => handleToggle(u._id)} />
          </View>
          <View style={{ flex: 1 }}>
            <ActionBtn label="Delete" tone="danger" onPress={() => handleDelete(u._id, u?.name)} />
          </View>
        </View>
      </FormModal>

      <FormModal visible={showForm} title="Add Teacher" onClose={() => setShowForm(false)} onSubmit={submit} submitting={saving} submitLabel="Create Teacher">
        <Input label="Full Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Teacher name" />
        <Input label="Email *" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="teacher@email.com" keyboardType="email-address" />
        <Input label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="Optional" keyboardType="phone-pad" />
        <Select label="Designation" value={form.designation} onChange={v => setForm(f => ({ ...f, designation: v }))}
          options={designations.map(d => ({ label: d, value: d }))} placeholder="Select designation" />
      </FormModal>
    </>
  );
}
