import React, { useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as feesApi from '@/api/fees.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, RowItem, StatTile, StatRow, Badge, SectionTitle,
  fmtMoney, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

export default function AdminFeesDashboardScreen() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async () => {
    try { setData(unwrap(await feesApi.getAdminDashboard())); }
    catch (err: any) { if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Fees' }} />
      <ModuleDisabled />
    </>
  );

  const LINKS = [
    { label: 'Student Fees', sub: 'Assignments, dues and per-student detail', icon: 'school', route: '/modules/admin/fees-students' },
    { label: 'Payments', sub: 'Record, approve and review payments', icon: 'card', route: '/modules/admin/fees-payments' },
    { label: 'Setup', sub: 'Structures, categories, heads, fines, concessions', icon: 'construct', route: '/modules/admin/fees-setup' },
    { label: 'School Ledger', sub: 'Every charge, payment and concession', icon: 'book', route: '/modules/admin/fees-ledger' },
    { label: 'Reports', sub: 'Collection and dues reports', icon: 'stats-chart', route: '/modules/admin/fees-reports' },
    { label: 'Settings', sub: 'Receipts, currency, online payments', icon: 'settings', route: '/modules/admin/fees-settings' },
  ];

  return (
    <>
      <Stack.Screen options={{ title: 'Fees Dashboard' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : (
          <>
            <StatRow>
              <StatTile label="Collected" value={fmtMoney(data?.totalCollected)} icon="trending-up" tone="success" />
              <StatTile label="Pending Dues" value={fmtMoney(data?.pendingDues)} icon="alert-circle" tone="danger" />
            </StatRow>
            <StatRow>
              <StatTile label="Transactions" value={data?.totalTransactions ?? '--'} icon="swap-horizontal" tone="info" />
              <StatTile label="Students" value={data?.totalStudents ?? '--'} icon="people" tone="neutral" />
            </StatRow>

            {LINKS.map(l => (
              <RowItem key={l.label} icon={l.icon} iconColor="#DB2777" iconBg="#FCE7F3"
                title={l.label} sub={l.sub} onPress={() => router.push(l.route as any)} />
            ))}

            {Array.isArray(data?.recentPayments) && data.recentPayments.length > 0 && (
              <>
                <SectionTitle>Recent payments</SectionTitle>
                {data.recentPayments.map((p: any) => (
                  <RowItem key={p._id}
                    icon="receipt" iconColor={Colors.success} iconBg={Colors.successLight}
                    title={`${fmtMoney(p.amount)} · ${p.student?.name ?? '--'}`}
                    sub={`${p.receiptNumber ?? ''} · ${fmtDate(p.paymentDate)} · ${p.paymentMode ?? ''}`}
                    right={<Badge label={p.paymentStatus} />}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}
