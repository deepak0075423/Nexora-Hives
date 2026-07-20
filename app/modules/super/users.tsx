import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as superApi from '@/api/superadmin.api';
import { isEmail } from '@/utils/validators';
import {
  unwrap, LoaderView, Empty, RowItem, SearchBar, FAB, FormModal, Input,
  Select, Badge, SegTabs, confirmAsync,
} from '@/components/ui/kit';

const ROLE_TABS = [
  { key: '', label: 'All' },
  { key: 'school_admin', label: 'Admins' },
  { key: 'teacher', label: 'Teachers' },
  { key: 'student', label: 'Students' },
  { key: 'parent', label: 'Parents' },
];

const ROLE_OPTIONS = [
  { label: 'School Admin', value: 'school_admin' },
  { label: 'Teacher', value: 'teacher' },
  { label: 'Student', value: 'student' },
  { label: 'Parent', value: 'parent' },
  { label: 'Super Admin', value: 'super_admin' },
];

export default function SuperUsersScreen() {
  const { user: me } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [schools, setSchools] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'school_admin', school: '' });

  const load = async (p = 1, q = search, r = role) => {
    try {
      const d = unwrap(await superApi.getUsers({ page: p, limit: 20, search: q, role: r }));
      const rows = d?.data ?? [];
      if (p === 1) setList(rows); else setList(prev => [...prev, ...rows]);
      setTotal(d?.total ?? rows.length);
      setPage(p);
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(1, '', ''); }, []);
  useEffect(() => {
    const t = setTimeout(() => { setLoading(true); load(1, search, role); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    superApi.getSchools({ page: 1, limit: 200 })
      .then((res: any) => setSchools(unwrap(res)?.data ?? []))
      .catch(() => {});
  }, []);

  const schoolOptions = useMemo(
    () => schools.map((s: any) => ({ label: s.name, value: s._id })), [schools]);

  const changeRole = (r: string) => { setRole(r); setLoading(true); load(1, search, r); };

  const toggle = async (u: any) => {
    try { await superApi.toggleUser(u._id); load(1, search, role); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const remove = async (u: any) => {
    if (u._id === me?._id) return Alert.alert('Not allowed', 'You cannot delete your own account.');
    if (!(await confirmAsync('Delete User', `Delete ${u.name}? This cannot be undone.`, 'Delete'))) return;
    try { await superApi.deleteUser(u._id); load(1, search, role); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const loginLink = async (u: any) => {
    try {
      const res: any = await superApi.generateLoginLink(u._id);
      const link = (res as any)?.link ?? unwrap(res)?.link;
      if (!link) throw { message: 'No link returned' };
      await Clipboard.setStringAsync(link);
      Alert.alert('Login link copied', `A 24h magic login link for ${u.name} was copied to the clipboard.`);
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim()) return Alert.alert('Required', 'Name and email are required');
    if (form.name.trim().length < 2) return Alert.alert('Invalid', 'Name must be at least 2 characters');
    if (!isEmail(form.email)) return Alert.alert('Invalid', 'Please enter a valid email address');
    if (form.role !== 'super_admin' && !form.school) return Alert.alert('Required', 'Pick a school for this role');
    setSaving(true);
    try {
      await superApi.createUser({ ...form, name: form.name.trim(), email: form.email.trim() });
      setShowForm(false);
      setForm({ name: '', email: '', role: 'school_admin', school: '' });
      load(1, search, role);
      Alert.alert('Created', 'User created. Login OTP has been emailed.');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Stack.Screen options={{ title: `Users (${total})` }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1, search, role); }} tintColor={Colors.primary} />}
        >
          <SearchBar value={search} onChange={setSearch} placeholder="Search users…" />
          <SegTabs tabs={ROLE_TABS} active={role} onChange={changeRole} />
          {loading ? <LoaderView /> : list.length === 0 ? (
            <Empty icon="people-outline" text="No users found" />
          ) : (
            <>
              {list.map((u: any) => (
                <RowItem
                  key={u._id}
                  icon="person" iconColor={Colors.info} iconBg={Colors.infoLight}
                  title={u.name + (u._id === me?._id ? ' (you)' : '')}
                  sub={`${u.email}\n${(u.role ?? '').replace('_', ' ')}${u.school?.name ? ` · ${u.school.name}` : ''}`}
                  right={<Badge label={u.isActive === false ? 'inactive' : 'active'} />}
                  onPress={() => {
                    Alert.alert(u.name, u.email, [
                      { text: 'Close', style: 'cancel' },
                      { text: 'Copy Login Link', onPress: () => loginLink(u) },
                      { text: u.isActive === false ? 'Activate' : 'Deactivate', onPress: () => toggle(u) },
                      { text: 'Delete', style: 'destructive', onPress: () => remove(u) },
                    ]);
                  }}
                />
              ))}
              {list.length < total && (
                <TouchableOpacity onPress={() => load(page + 1, search, role)} style={{ padding: 14, alignItems: 'center' }}>
                  <Text style={{ color: Colors.accent, fontWeight: '600', fontSize: 13 }}>Load more ({list.length}/{total})</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
        <FAB onPress={() => setShowForm(true)} />
      </View>

      <FormModal visible={showForm} title="Add User" onClose={() => setShowForm(false)} onSubmit={submit} submitting={saving} submitLabel="Create User">
        <Input label="Full Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
        <Input label="Email *" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} keyboardType="email-address" />
        <Select label="Role *" value={form.role} onChange={v => setForm(f => ({ ...f, role: v }))} options={ROLE_OPTIONS} />
        {form.role !== 'super_admin' && (
          <Select label="School *" value={form.school} onChange={v => setForm(f => ({ ...f, school: v }))} options={schoolOptions} />
        )}
      </FormModal>
    </>
  );
}
