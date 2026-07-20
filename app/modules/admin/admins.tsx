import React, { useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as adminApi from '@/api/admin.api';
import { isEmail, isPhone } from '@/utils/validators';
import {
  unwrap, LoaderView, Empty, Badge, RowItem, FAB, FormModal, Input,
  confirmAsync,
} from '@/components/ui/kit';

export default function AdminAdminsScreen() {
  const { user } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });

  const load = async () => {
    try {
      const d = unwrap(await adminApi.getAdmins({ page: 1, limit: 100 }));
      setList(d?.data ?? []);
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (a: any) => {
    if (a._id === user?._id) return Alert.alert('Not allowed', 'You cannot delete your own account.');
    if (!(await confirmAsync('Delete Admin', `Delete ${a.name}?`, 'Delete'))) return;
    try { await adminApi.deleteAdmin(a._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim()) return Alert.alert('Required', 'Name and email are required');
    if (form.name.trim().length < 2) return Alert.alert('Invalid', 'Name must be at least 2 characters');
    if (!isEmail(form.email)) return Alert.alert('Invalid', 'Please enter a valid email address');
    if (form.phone && !isPhone(form.phone)) return Alert.alert('Invalid', 'Please enter a valid phone number');
    setSaving(true);
    try {
      await adminApi.createAdmin({ ...form, name: form.name.trim(), email: form.email.trim() });
      setShowForm(false);
      setForm({ name: '', email: '', phone: '' });
      load();
      Alert.alert('Success', 'Admin created. Login OTP has been emailed.');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Admins' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {loading ? <LoaderView /> : list.length === 0 ? (
            <Empty icon="shield-outline" text="No admins found" />
          ) : (
            list.map((a: any) => (
              <RowItem
                key={a._id}
                icon="shield-checkmark" iconColor={Colors.accent} iconBg={Colors.accentLight}
                title={a.name + (a._id === user?._id ? ' (you)' : '')}
                sub={a.email}
                right={<Badge label={a.isActive === false ? 'inactive' : 'active'} />}
                onPress={() => {
                  if (a._id === user?._id) return;
                  Alert.alert(a.name, a.email, [
                    { text: 'Close', style: 'cancel' },
                    { text: 'Delete Admin', style: 'destructive', onPress: () => handleDelete(a) },
                  ]);
                }}
              />
            ))
          )}
        </ScrollView>
        <FAB onPress={() => setShowForm(true)} />
      </View>

      <FormModal visible={showForm} title="Add Admin" onClose={() => setShowForm(false)} onSubmit={submit} submitting={saving} submitLabel="Create Admin">
        <Input label="Full Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Admin name" />
        <Input label="Email *" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="admin@email.com" keyboardType="email-address" />
        <Input label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="Optional" keyboardType="phone-pad" />
      </FormModal>
    </>
  );
}
