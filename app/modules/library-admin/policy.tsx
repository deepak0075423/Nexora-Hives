import React, { useEffect, useState } from 'react';
import { ScrollView, RefreshControl, Alert, Text } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as libApi from '@/api/library.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { unwrap, LoaderView, Input, ActionBtn, Toggle, MODULE_BLOCKED_CODES } from '@/components/ui/kit';

export default function LibraryPolicyScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [denied, setDenied] = useState(false);
  const [form, setForm] = useState({
    maxBooksPerUser: '', issueDurationDays: '', finePerDay: '',
    gracePeriodDays: '', maxRenewals: '', reservationExpiryDays: '',
    teacherFinesEnabled: false,
  });

  const load = async () => {
    try {
      const p = unwrap(await libApi.getPolicy());
      setForm({
        maxBooksPerUser: String(p?.maxBooksPerUser ?? 3),
        issueDurationDays: String(p?.issueDurationDays ?? 14),
        finePerDay: String(p?.finePerDay ?? 1),
        gracePeriodDays: String(p?.gracePeriodDays ?? 0),
        maxRenewals: String(p?.maxRenewals ?? 1),
        reservationExpiryDays: String(p?.reservationExpiryDays ?? 2),
        teacherFinesEnabled: !!p?.teacherFinesEnabled,
      });
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else if (err?.status === 403) setDenied(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await libApi.updatePolicy({
        maxBooksPerUser: Number(form.maxBooksPerUser),
        issueDurationDays: Number(form.issueDurationDays),
        finePerDay: Number(form.finePerDay),
        gracePeriodDays: Number(form.gracePeriodDays),
        maxRenewals: Number(form.maxRenewals),
        reservationExpiryDays: Number(form.reservationExpiryDays),
        teacherFinesEnabled: form.teacherFinesEnabled,
      });
      Alert.alert('Saved', 'Library policy updated');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  if (disabled || denied) return (
    <>
      <Stack.Screen options={{ title: 'Library Policy' }} />
      <ModuleDisabled message={denied ? 'Only school admins can view or change the library policy.' : undefined} />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Library Policy' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : (
          <>
            <Input label="Max books per member" value={form.maxBooksPerUser} onChange={v => setForm(f => ({ ...f, maxBooksPerUser: v }))} keyboardType="numeric" />
            <Input label="Issue duration (days)" value={form.issueDurationDays} onChange={v => setForm(f => ({ ...f, issueDurationDays: v }))} keyboardType="numeric" />
            <Input label="Fine per day (₹)" value={form.finePerDay} onChange={v => setForm(f => ({ ...f, finePerDay: v }))} keyboardType="numeric" />
            <Input label="Grace period (days)" value={form.gracePeriodDays} onChange={v => setForm(f => ({ ...f, gracePeriodDays: v }))} keyboardType="numeric" />
            <Input label="Max renewals" value={form.maxRenewals} onChange={v => setForm(f => ({ ...f, maxRenewals: v }))} keyboardType="numeric" />
            <Input label="Reservation expiry (days)" value={form.reservationExpiryDays} onChange={v => setForm(f => ({ ...f, reservationExpiryDays: v }))} keyboardType="numeric" />
            <Toggle label="Fines apply to teachers" sub="When off, teachers are exempt from late fines"
              value={form.teacherFinesEnabled} onChange={v => setForm(f => ({ ...f, teacherFinesEnabled: v }))} />
            <ActionBtn label={saving ? 'Saving…' : 'Save Policy'} tone="success" onPress={save} />
            <Text style={{ fontSize: 11, color: Colors.textSecondary, marginTop: 10 }}>
              Policy changes apply to future issuances and fines only.
            </Text>
          </>
        )}
      </ScrollView>
    </>
  );
}
