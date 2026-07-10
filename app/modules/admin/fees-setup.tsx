import React, { useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as feesApi from '@/api/fees.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Badge, RowItem, SegTabs, FAB, FormModal,
  Input, Select, fmtMoney,
} from '@/components/ui/kit';

const TABS = [
  { key: 'structures', label: 'Structures' },
  { key: 'categories', label: 'Categories' },
  { key: 'heads', label: 'Heads' },
  { key: 'fines', label: 'Fine Rules' },
  { key: 'concessions', label: 'Concessions' },
];

export default function AdminFeesSetupScreen() {
  const [tab, setTab] = useState('structures');
  const [data, setData] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const [structures, categories, heads, fines, concessions]: any[] = await Promise.all([
        feesApi.getFeeStructures().catch(() => null),
        feesApi.getFeeCategories().catch(() => null),
        feesApi.getFeeHeads().catch(() => null),
        feesApi.getFineRules().catch(() => null),
        feesApi.getConcessions().catch(() => null),
      ]);
      setData({
        structures: (structures as any)?.data ?? [],
        categories: (categories as any)?.data ?? [],
        heads: (heads as any)?.data ?? [],
        fines: (fines as any)?.data ?? [],
        concessions: (concessions as any)?.data ?? [],
      });
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    setSaving(true);
    try {
      if (tab === 'categories') {
        if (!form.name?.trim()) throw { message: 'Name is required' };
        await feesApi.createFeeCategory({ name: form.name });
      } else if (tab === 'heads') {
        if (!form.name?.trim()) throw { message: 'Name is required' };
        await feesApi.createFeeHead({
          name: form.name, type: form.type || 'recurring',
          categoryId: form.categoryId || null, defaultAmount: Number(form.defaultAmount) || 0,
        });
      } else if (tab === 'fines') {
        if (!form.name?.trim()) throw { message: 'Name is required' };
        await feesApi.createFineRule({
          name: form.name, fineType: form.fineType || 'flat',
          flatAmount: Number(form.flatAmount) || 0, perDayAmount: Number(form.perDayAmount) || 0,
          gracePeriodDays: Number(form.gracePeriodDays) || 0, maxCap: Number(form.maxCap) || 0,
        });
      } else if (tab === 'concessions') {
        if (!form.name?.trim() || !form.value) throw { message: 'Name and value are required' };
        await feesApi.createConcession({
          name: form.name, concessionType: form.concessionType || 'percentage',
          value: Number(form.value) || 0, description: form.description || '',
        });
      }
      setShowForm(false);
      setForm({});
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Fees Setup' }} />
      <ModuleDisabled />
    </>
  );

  const rows = data[tab] ?? [];
  const canCreate = tab !== 'structures';

  return (
    <>
      <Stack.Screen options={{ title: 'Fees Setup' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          <SegTabs tabs={TABS} active={tab} onChange={setTab} />
          {loading ? <LoaderView /> : rows.length === 0 ? (
            <Empty icon="construct-outline"
              text={tab === 'structures'
                ? 'No fee structures for the active year. Build structures on the web admin panel.'
                : 'Nothing here yet'} />
          ) : (
            rows.map((r: any) => (
              <RowItem
                key={r._id}
                icon="pricetag" iconColor="#DB2777" iconBg="#FCE7F3"
                title={r.name}
                sub={
                  tab === 'structures' ? `${r.class?.className ?? r.level ?? ''} · Total ${fmtMoney(r.totalAmount)} · ${r.academicYear?.yearName ?? ''}` :
                  tab === 'heads' ? `${r.category?.name ?? 'No category'} · ${r.type ?? ''} · Default ${fmtMoney(r.defaultAmount)}` :
                  tab === 'fines' ? `${r.fineType} · Flat ${fmtMoney(r.flatAmount)} · Per-day ${fmtMoney(r.perDayAmount)} · Grace ${r.gracePeriodDays ?? 0}d` :
                  tab === 'concessions' ? `${r.concessionType} · ${r.concessionType === 'percentage' ? `${r.value}%` : fmtMoney(r.value)}` :
                  undefined
                }
                right={<Badge label={r.isActive === false ? 'inactive' : 'active'} />}
              />
            ))
          )}
        </ScrollView>
        {canCreate && <FAB onPress={() => { setForm({}); setShowForm(true); }} />}
      </View>

      <FormModal visible={showForm} title={`Add ${TABS.find(t => t.key === tab)?.label ?? ''}`} onClose={() => setShowForm(false)} onSubmit={submit} submitting={saving}>
        <Input label="Name *" value={form.name ?? ''} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Name" />
        {tab === 'heads' && (
          <>
            <Select label="Category" value={form.categoryId ?? ''} onChange={v => setForm(f => ({ ...f, categoryId: v }))}
              options={(data.categories ?? []).map((c: any) => ({ label: c.name, value: c._id }))} placeholder="Optional" />
            <Select label="Type" value={form.type ?? 'recurring'} onChange={v => setForm(f => ({ ...f, type: v }))}
              options={[{ label: 'Recurring', value: 'recurring' }, { label: 'One-time', value: 'one_time' }]} />
            <Input label="Default Amount (₹)" value={form.defaultAmount ?? ''} onChange={v => setForm(f => ({ ...f, defaultAmount: v }))} keyboardType="numeric" />
          </>
        )}
        {tab === 'fines' && (
          <>
            <Select label="Fine Type" value={form.fineType ?? 'flat'} onChange={v => setForm(f => ({ ...f, fineType: v }))}
              options={[{ label: 'Flat', value: 'flat' }, { label: 'Per Day', value: 'per_day' }, { label: 'Flat + Per Day', value: 'flat_plus_per_day' }]} />
            <Input label="Flat Amount (₹)" value={form.flatAmount ?? ''} onChange={v => setForm(f => ({ ...f, flatAmount: v }))} keyboardType="numeric" />
            <Input label="Per-day Amount (₹)" value={form.perDayAmount ?? ''} onChange={v => setForm(f => ({ ...f, perDayAmount: v }))} keyboardType="numeric" />
            <Input label="Grace Period (days)" value={form.gracePeriodDays ?? ''} onChange={v => setForm(f => ({ ...f, gracePeriodDays: v }))} keyboardType="numeric" />
            <Input label="Max Cap (₹, 0 = none)" value={form.maxCap ?? ''} onChange={v => setForm(f => ({ ...f, maxCap: v }))} keyboardType="numeric" />
          </>
        )}
        {tab === 'concessions' && (
          <>
            <Select label="Type" value={form.concessionType ?? 'percentage'} onChange={v => setForm(f => ({ ...f, concessionType: v }))}
              options={[{ label: 'Percentage', value: 'percentage' }, { label: 'Fixed Amount', value: 'fixed' }]} />
            <Input label="Value *" value={form.value ?? ''} onChange={v => setForm(f => ({ ...f, value: v }))} keyboardType="numeric"
              placeholder={form.concessionType === 'fixed' ? 'Amount in ₹' : 'Percent, e.g. 25'} />
            <Input label="Description" value={form.description ?? ''} onChange={v => setForm(f => ({ ...f, description: v }))} multiline />
          </>
        )}
      </FormModal>
    </>
  );
}
