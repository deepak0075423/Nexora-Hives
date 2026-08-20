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
    maxReservationsPerUser: '',
    lostBookFineDays: '', damagedBookFineDays: '',
    teacherFinesEnabled: false,
    allowMultipleCopiesPerUser: false,
    blockIssueOnPendingFine: true,
    blockIssueOnOverdue: true,
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
        maxReservationsPerUser: String(p?.maxReservationsPerUser ?? 3),
        lostBookFineDays: String(p?.lostBookFineDays ?? 30),
        damagedBookFineDays: String(p?.damagedBookFineDays ?? 10),
        teacherFinesEnabled: !!p?.teacherFinesEnabled,
        allowMultipleCopiesPerUser: !!p?.allowMultipleCopiesPerUser,
        blockIssueOnPendingFine: p?.blockIssueOnPendingFine !== false,
        blockIssueOnOverdue: p?.blockIssueOnOverdue !== false,
      });
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else if (err?.status === 403) setDenied(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  // Bounds mirror the server so a typo is caught before the round trip.
  const NUMERIC: [keyof typeof form, string, number, number][] = [
    ['maxBooksPerUser', 'Max books per member', 1, 100],
    ['issueDurationDays', 'Issue duration', 1, 365],
    ['finePerDay', 'Fine per day', 0, 10000],
    ['gracePeriodDays', 'Grace period', 0, 365],
    ['maxRenewals', 'Max renewals', 0, 20],
    ['reservationExpiryDays', 'Reservation expiry', 1, 90],
    ['maxReservationsPerUser', 'Max reservations', 1, 100],
    ['lostBookFineDays', 'Lost book charge', 0, 3650],
    ['damagedBookFineDays', 'Damaged book charge', 0, 3650],
  ];

  const save = async () => {
    const numbers: Record<string, number> = {};
    for (const [key, label, min, max] of NUMERIC) {
      const n = Number(form[key]);
      if (!Number.isInteger(n) || n < min || n > max)
        return Alert.alert('Check the value', `${label} must be a whole number between ${min} and ${max}`);
      numbers[key as string] = n;
    }
    setSaving(true);
    try {
      await libApi.updatePolicy({
        ...numbers,
        teacherFinesEnabled: form.teacherFinesEnabled,
        allowMultipleCopiesPerUser: form.allowMultipleCopiesPerUser,
        blockIssueOnPendingFine: form.blockIssueOnPendingFine,
        blockIssueOnOverdue: form.blockIssueOnOverdue,
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
            <Input label="Max reservations per member" value={form.maxReservationsPerUser} onChange={v => setForm(f => ({ ...f, maxReservationsPerUser: v }))} keyboardType="numeric" />
            <Input label="Lost book charge (days of fine)" value={form.lostBookFineDays} onChange={v => setForm(f => ({ ...f, lostBookFineDays: v }))} keyboardType="numeric" />
            <Input label="Damaged book charge (days of fine)" value={form.damagedBookFineDays} onChange={v => setForm(f => ({ ...f, damagedBookFineDays: v }))} keyboardType="numeric" />
            <Toggle label="Late fines apply to teachers" sub="When off, teachers are exempt from late fines. Lost and damaged books are still charged"
              value={form.teacherFinesEnabled} onChange={v => setForm(f => ({ ...f, teacherFinesEnabled: v }))} />
            <Toggle label="Allow two copies of one title per member"
              sub="Off means a member must return their copy before taking another of the same book"
              value={form.allowMultipleCopiesPerUser} onChange={v => setForm(f => ({ ...f, allowMultipleCopiesPerUser: v }))} />
            <Toggle label="Block borrowing while a fine is unpaid"
              sub="Applies to reservations too, until the fine is paid or waived"
              value={form.blockIssueOnPendingFine} onChange={v => setForm(f => ({ ...f, blockIssueOnPendingFine: v }))} />
            <Toggle label="Block borrowing while a book is overdue"
              sub="A member holding an overdue book cannot take out another"
              value={form.blockIssueOnOverdue} onChange={v => setForm(f => ({ ...f, blockIssueOnOverdue: v }))} />
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
