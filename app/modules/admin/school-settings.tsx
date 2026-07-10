import React, { useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import {
  unwrap, LoaderView, Input, ActionBtn, SectionTitle, Card, KV,
} from '@/components/ui/kit';

export default function AdminSchoolSettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [school, setSchool] = useState<any>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', website: '' });

  const load = async () => {
    try {
      const d = unwrap(await adminApi.getSchoolSettings());
      setSchool(d);
      setForm({ name: d?.name ?? '', email: d?.email ?? '', phone: d?.phone ?? '', website: d?.website ?? '' });
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name.trim()) return Alert.alert('Required', 'School name is required');
    setSaving(true);
    try {
      await adminApi.updateSchoolSettings(form);
      Alert.alert('Saved', 'School settings updated');
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'School Settings' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : (
          <>
            <Card>
              <KV label="School Code" value={school?.code ?? '--'} />
            </Card>
            <SectionTitle>Profile</SectionTitle>
            <Input label="School Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
            <Input label="Email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} keyboardType="email-address" />
            <Input label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} keyboardType="phone-pad" />
            <Input label="Website" value={form.website} onChange={v => setForm(f => ({ ...f, website: v }))} placeholder="https://…" />
            <ActionBtn label={saving ? 'Saving…' : 'Save Settings'} tone="success" onPress={save} />
            <View style={{ height: 8 }} />
          </>
        )}
      </ScrollView>
    </>
  );
}
