import React, { useEffect, useState } from 'react';
import { ScrollView, Text, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as feesApi from '@/api/fees.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { unwrap, LoaderView, Input, Select, Toggle, ActionBtn, SectionTitle, Card, KV, MODULE_BLOCKED_CODES } from '@/components/ui/kit';

export default function AdminFeesSettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<number>(0);
  const [form, setForm] = useState({
    onlinePaymentEnabled: false, paymentGateway: 'none',
    currencySymbol: '₹', currency: 'INR', receiptPrefix: 'REC', roundingRule: 'none',
  });

  const load = async () => {
    try {
      const d = unwrap(await feesApi.getFeeSettings());
      setForm({
        onlinePaymentEnabled: !!d?.onlinePaymentEnabled,
        paymentGateway: d?.paymentGateway ?? 'none',
        currencySymbol: d?.currencySymbol ?? '₹',
        currency: d?.currency ?? 'INR',
        receiptPrefix: d?.receiptPrefix ?? 'REC',
        roundingRule: d?.roundingRule ?? 'none',
      });
      setLastReceipt(d?.lastReceiptNumber ?? 0);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await feesApi.updateFeeSettings(form);
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
            <Toggle label="Enable online payments" sub="Students/parents can pay through a gateway"
              value={form.onlinePaymentEnabled} onChange={v => setForm(f => ({ ...f, onlinePaymentEnabled: v }))} />
            {form.onlinePaymentEnabled && (
              <Select label="Gateway" value={form.paymentGateway} onChange={v => setForm(f => ({ ...f, paymentGateway: v }))}
                options={[
                  { label: 'None', value: 'none' },
                  { label: 'Razorpay', value: 'razorpay' },
                  { label: 'Stripe', value: 'stripe' },
                ]} />
            )}
            <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 12 }}>
              Gateway API keys are configured on the web admin panel.
            </Text>

            <ActionBtn label={saving ? 'Saving…' : 'Save Settings'} tone="success" onPress={save} />
          </>
        )}
      </ScrollView>
    </>
  );
}
