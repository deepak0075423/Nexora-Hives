import React, { useEffect, useState } from 'react';
import { ScrollView, RefreshControl, Text } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as feesApi from '@/api/fees.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  LoaderView, Empty, RowItem, SegTabs, StatRow, StatTile, fmtMoney, fmtDate,
} from '@/components/ui/kit';

export default function AdminFeesReportsScreen() {
  const [tab, setTab] = useState('collection');
  const [collection, setCollection] = useState<any>(null);
  const [dues, setDues] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async () => {
    try {
      const [col, du]: any[] = await Promise.all([
        feesApi.getCollectionReport().catch(() => null),
        feesApi.getDuesReport().catch(() => null),
      ]);
      setCollection((col as any)?.data ?? col);
      setDues(du);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Fees Reports' }} />
      <ModuleDisabled />
    </>
  );

  const payments: any[] = collection?.payments ?? [];
  const duesRows: any[] = (dues as any)?.data ?? [];

  return (
    <>
      <Stack.Screen options={{ title: 'Fees Reports' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <SegTabs tabs={[{ key: 'collection', label: 'Collection' }, { key: 'dues', label: 'Dues' }]} active={tab} onChange={setTab} />
        {loading ? <LoaderView /> : tab === 'collection' ? (
          <>
            <StatRow>
              <StatTile label="Total Collected" value={fmtMoney(collection?.total)} icon="trending-up" tone="success" />
              <StatTile label="Transactions" value={collection?.count ?? '--'} icon="swap-horizontal" tone="info" />
            </StatRow>
            {payments.length === 0 ? <Empty icon="receipt-outline" text="No completed payments" /> :
              payments.slice(0, 50).map((p: any) => (
                <RowItem key={p._id}
                  icon="receipt" iconColor={Colors.success} iconBg={Colors.successLight}
                  title={`${fmtMoney(p.amount)} · ${p.student?.name ?? '--'}`}
                  sub={`${p.receiptNumber ?? ''} · ${fmtDate(p.paymentDate)} · ${p.paymentMode ?? ''}`}
                />
              ))}
          </>
        ) : (
          <>
            <StatRow>
              <StatTile label="Outstanding Dues" value={fmtMoney((dues as any)?.totalDues)} icon="alert-circle" tone="danger" />
              <StatTile label="Students with dues" value={duesRows.length} icon="people" tone="warning" />
            </StatRow>
            {duesRows.length === 0 ? <Empty icon="checkmark-done-outline" text="No outstanding dues 🎉" /> :
              duesRows.map((s: any) => (
                <RowItem key={s._id}
                  icon="person" iconColor={Colors.danger} iconBg={Colors.dangerLight}
                  title={s.name}
                  sub={`Total ${fmtMoney(s.total)} · Paid ${fmtMoney(s.paid)}`}
                  right={<Text style={{ fontSize: 13, fontWeight: '700', color: Colors.danger }}>{fmtMoney(s.due)}</Text>}
                />
              ))}
          </>
        )}
      </ScrollView>
    </>
  );
}
