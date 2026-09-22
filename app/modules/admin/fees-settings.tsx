import React, { useEffect, useState } from 'react';
import { ScrollView, Text, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as feesApi from '@/api/fees.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { unwrap, LoaderView, Input, Select, ActionBtn, SectionTitle, Card, KV, Toggle, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import DayChips from '@/components/fees/DayChips';

export default function AdminFeesSettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<number>(0);
  // Gateway credentials moved to School Settings — library fines charge through
  // the same merchant account, so a school configures it once. What is left
  // here is how fees are counted and numbered.
  const [online, setOnline] = useState<{ enabled: boolean; provider: string }>({ enabled: false, provider: 'none' });
  const [form, setForm] = useState({
    currencySymbol: '₹', currency: 'INR', receiptPrefix: 'REC', roundingRule: 'none',
  });
  /**
   * Reminders that send themselves. Off until a school turns it on, because
   * it writes to real parents. Read from the full settings payload, which is
   * the only one carrying it.
   */
  const [auto, setAuto] = useState<any>({
    enabled: false, beforeDays: [3], onDueDay: true, afterDays: [3, 7],
    minAmount: 0, emailParents: true, sendHour: 9,
  });

  const load = async () => {
    try {
      const d = unwrap(await feesApi.getFeeSettings());
      setOnline({
        enabled: !!d?.onlinePaymentEnabled,
        provider: d?.paymentGatewayProvider ?? 'none',
      });
      setForm({
        currencySymbol: d?.currencySymbol ?? '₹',
        currency: d?.currency ?? 'INR',
        receiptPrefix: d?.receiptPrefix ?? 'REC',
        roundingRule: d?.roundingRule ?? 'none',
      });
      setLastReceipt(d?.lastReceiptNumber ?? 0);
      try {
        const full = unwrap(await feesApi.getFeeSettingsFull());
        if (full?.settings?.autoReminders) setAuto({ ...auto, ...full.settings.autoReminders });
      } catch { /* the short settings payload is enough to run the screen */ }
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await feesApi.updateFeeSettings({ ...form, autoReminders: auto });
      Alert.alert('Saved', 'Fees settings updated');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Fees Settings' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Fees Settings' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
      >
        {loading ? <LoaderView /> : (
          <>
            <Card>
              <KV label="Last receipt number" value={`${form.receiptPrefix}-${lastReceipt}`} />
            </Card>

            <SectionTitle>Receipts & Currency</SectionTitle>
            <Input label="Receipt Prefix" value={form.receiptPrefix} onChange={v => setForm(f => ({ ...f, receiptPrefix: v }))} />
            <Input label="Currency Symbol" value={form.currencySymbol} onChange={v => setForm(f => ({ ...f, currencySymbol: v }))} />
            <Select label="Rounding" value={form.roundingRule} onChange={v => setForm(f => ({ ...f, roundingRule: v }))}
              options={[
                { label: 'No rounding', value: 'none' },
                { label: 'Round to nearest', value: 'round' },
                { label: 'Round up', value: 'ceil' },
                { label: 'Round down', value: 'floor' },
              ]} />

            <SectionTitle>Online Payments</SectionTitle>
            <Card>
              <KV label="Status" value={online.enabled ? `Live via ${online.provider === 'razorpay' ? 'Razorpay' : 'Stripe'}` : 'Off'} />
              <Text style={{ fontSize: 12, color: Colors.textSecondary, marginTop: 6, lineHeight: 18 }}>
                {online.enabled
                  ? 'Students and parents can pay fees online. The gateway is configured for the whole school in Settings → Payment Gateway.'
                  : 'The payment gateway is configured for the whole school in Settings → Payment Gateway. Switch it on there and tick Fees among the modules that may use it.'}
              </Text>
            </Card>

            <SectionTitle>Automatic Reminders</SectionTitle>
            <Toggle label="Send reminders automatically"
              sub="Off by default. Once on, families are written to without anyone reviewing each message."
              value={auto.enabled === true} onChange={v => setAuto((a: any) => ({ ...a, enabled: v }))} />
            {auto.enabled ? (
              <>
                <DayChips label="Days before a month falls due" value={auto.beforeDays ?? []}
                  hint="Notice ahead of the due date, so a family can plan."
                  onChange={v => setAuto((a: any) => ({ ...a, beforeDays: v }))} />
                <DayChips label="Days after it is still unpaid" value={auto.afterDays ?? []}
                  hint="Nudges once the due date has passed."
                  onChange={v => setAuto((a: any) => ({ ...a, afterDays: v }))} />
                <Toggle label="On the day it falls due" sub="One reminder on the due date itself"
                  value={auto.onDueDay !== false} onChange={v => setAuto((a: any) => ({ ...a, onDueDay: v }))} />
                <Input label={`Smallest amount worth chasing (${form.currencySymbol})`}
                  value={String(auto.minAmount ?? 0)} keyboardType="numeric"
                  onChange={v => setAuto((a: any) => ({ ...a, minAmount: v }))} />
                <Select label="Send at" value={String(auto.sendHour ?? 9)}
                  onChange={v => setAuto((a: any) => ({ ...a, sendHour: Number(v) }))}
                  options={Array.from({ length: 24 }, (_, i) => ({ label: `${String(i).padStart(2, '0')}:00`, value: String(i) }))} />
                <Toggle label="Also send by email" sub="As well as in the app."
                  value={auto.emailParents !== false} onChange={v => setAuto((a: any) => ({ ...a, emailParents: v }))} />
                {!auto.onDueDay && !(auto.beforeDays ?? []).length && !(auto.afterDays ?? []).length ? (
                  <Text style={{ fontSize: 12, color: Colors.danger, marginBottom: 8, lineHeight: 17 }}>
                    Nothing would be sent — choose at least one moment: before the due date, on it, or after it.
                    Saving without one is refused.
                  </Text>
                ) : (
                  <Text style={{ fontSize: 12, color: Colors.textSecondary, marginBottom: 8, lineHeight: 17 }}>
                    A family is never chased twice for the same month at the same moment, however often the job runs.
                  </Text>
                )}
              </>
            ) : (
              <Text style={{ fontSize: 12, color: Colors.textSecondary, marginBottom: 8, lineHeight: 17 }}>
                While this is off, reminders only go out when someone sends them from Student Fees.
              </Text>
            )}

            <ActionBtn label={saving ? 'Saving…' : 'Save Settings'} tone="success" onPress={save} />
          </>
        )}
      </ScrollView>
    </>
  );
}
