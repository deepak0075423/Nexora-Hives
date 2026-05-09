import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as studentApi from '@/api/student.api';
import * as parentApi from '@/api/parent.api';
import ModuleDisabled from '@/components/ModuleDisabled';

export default function FeesScreen() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = useCallback(async () => {
    try {
      let res: any;
      if (user?.role === 'parent') res = await parentApi.getParentFees();
      else res = await studentApi.getMyFees();
      setData((res as any)?.data ?? res);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.role]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Fees' }} />
      <ModuleDisabled />
    </>
  );

  const dues: any[] = data?.dues ?? data?.pendingFees ?? data?.pending ?? [];
  const paid: any[] = data?.paid ?? data?.paidFees ?? [];
  const summary = data?.summary;

  const totalDue = summary?.totalDue ?? dues.reduce((a: number, d: any) => a + (d.amount ?? d.netAmount ?? 0), 0);

  return (
    <>
      <Stack.Screen options={{ title: 'Fees' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : (
          <>
            {/* Summary banner */}
            <View style={s.banner}>
              <View>
                <Text style={s.bannerLabel}>Total Due</Text>
                <Text style={s.bannerAmount}>
                  â‚¹{(totalDue ?? 0).toLocaleString('en-IN')}
                </Text>
                {summary?.totalPaid != null && (
                  <Text style={s.bannerSub}>Paid: â‚¹{summary.totalPaid.toLocaleString('en-IN')}</Text>
                )}
              </View>
              <View style={s.bannerIcon}>
                <Ionicons name="card" size={28} color={Colors.textInverse} />
              </View>
            </View>

            {/* Due fees */}
            {dues.length > 0 && (
              <>
                <Text style={s.groupLabel}>Pending</Text>
                {dues.map((fee: any, i: number) => <FeeCard key={i} fee={fee} pending />)}
              </>
            )}

            {/* Paid fees */}
            {paid.length > 0 && (
              <>
                <Text style={[s.groupLabel, { marginTop: Spacing.md }]}>Paid</Text>
                {paid.map((fee: any, i: number) => <FeeCard key={i} fee={fee} />)}
              </>
            )}

            {dues.length === 0 && paid.length === 0 && (
              <View style={s.empty}>
                <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
                <Text style={s.emptyTitle}>All clear!</Text>
                <Text style={s.emptyText}>No pending fees at this time.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

function FeeCard({ fee, pending }: { fee: any; pending?: boolean }) {
  const amount = fee.amount ?? fee.netAmount ?? fee.totalAmount ?? 0;
  const date = fee.dueDate ?? fee.paidDate ?? fee.date;
  const label = fee.feeType ?? fee.feeName ?? fee.type ?? 'Fee';

  return (
    <View style={[fc.card, pending && fc.cardPending]}>
      <View style={fc.left}>
        <Text style={fc.feeType}>{label}</Text>
        {date && (
          <Text style={[fc.dueDate, pending ? { color: Colors.danger } : { color: Colors.success }]}>
            {pending ? 'Due: ' : 'Paid: '}
            {new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        )}
      </View>
      <View style={fc.right}>
        <Text style={[fc.amount, pending ? { color: Colors.danger } : { color: Colors.success }]}>
          â‚¹{amount.toLocaleString('en-IN')}
        </Text>
        {pending && (
          <View style={fc.payBtnPlaceholder}>
            <Text style={fc.payBtnText}>Pay Now</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const fc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: 10, borderWidth: 1, borderColor: Colors.border,
  },
  cardPending: { borderColor: Colors.danger + '40' },
  left: { flex: 1 },
  feeType: { ...Typography.label, color: Colors.text },
  dueDate: { fontSize: 11, color: Colors.textSecondary, marginTop: 3 },
  right: { alignItems: 'flex-end', gap: 6 },
  amount: { fontSize: 18, fontWeight: '700' },
  payBtnPlaceholder: {
    backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: Radius.md,
  },
  payBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },
});

const s = StyleSheet.create({
  center: { alignItems: 'center', paddingTop: 80 },
  banner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.primary, borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.lg,
  },
  bannerLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  bannerAmount: { fontSize: 28, fontWeight: '700', color: '#fff' },
  bannerSub: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  bannerIcon: { opacity: 0.5 },
  groupLabel: { ...Typography.h4, color: Colors.text, marginBottom: 8 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { ...Typography.h3, color: Colors.success },
  emptyText: { ...Typography.body, color: Colors.textSecondary },
});
