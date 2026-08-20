import React, { useEffect, useState } from 'react';
import { ScrollView, Text, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as feesApi from '@/api/fees.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { unwrap, LoaderView, Input, Select, ActionBtn, SectionTitle, Card, KV, MODULE_BLOCKED_CODES } from '@/components/ui/kit';

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
            <Card>
              <KV label="Status" value={online.enabled ? `Live via ${online.provider === 'razorpay' ? 'Razorpay' : 'Stripe'}` : 'Off'} />
              <Text style={{ fontSize: 12, color: Colors.textSecondary, marginTop: 6, lineHeight: 18 }}>
                {online.enabled
                  ? 'Students and parents can pay fees online. The gateway is configured for the whole school in Settings → Payment Gateway.'
                  : 'The payment gateway is configured for the whole school in Settings → Payment Gateway. Switch it on there and tick Fees among the modules that may use it.'}
              </Text>
            </Card>

            <ActionBtn label={saving ? 'Saving…' : 'Save Settings'} tone="success" onPress={save} />
          </>
        )}
      </ScrollView>
    </>
  );
}
