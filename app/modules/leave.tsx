import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl,
  TouchableOpacity, Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as teacherApi from '@/api/teacher.api';
import ModuleDisabled from '@/components/ModuleDisabled';

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending:  { bg: Colors.warningLight, color: Colors.warning },
  approved: { bg: Colors.successLight, color: Colors.success },
  rejected: { bg: Colors.dangerLight,  color: Colors.danger  },
};

export default function LeaveScreen() {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async () => {
    try {
      const [lv, bal]: [any, any] = await Promise.all([
        teacherApi.getLeaves(),
        teacherApi.getLeaveBalance(),
      ]);
      setLeaves((lv as any)?.data ?? lv ?? []);
      setBalance((bal as any)?.data ?? bal);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  const handleCancel = (id: string) => {
    Alert.alert('Cancel Leave', 'Are you sure you want to cancel this leave?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancel Leave', style: 'destructive',
        onPress: async () => {
          try {
            await teacherApi.cancelLeave(id);
            load();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Leave' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Leave' }} />
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
            {/* Balance */}
            {balance && (
              <View style={s.balanceCard}>
                <Text style={s.balanceTitle}>Leave Balance</Text>
                <View style={s.balanceRow}>
                  {Object.entries(balance).map(([type, count]: [string, any]) => (
                    <View key={type} style={s.balanceItem}>
                      <Text style={s.balanceCount}>{count}</Text>
                      <Text style={s.balanceType}>{type}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Leaves */}
            <Text style={s.groupLabel}>My Leaves</Text>
            {leaves.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="airplane-outline" size={48} color={Colors.textLight} />
                <Text style={s.emptyText}>No leave applications</Text>
              </View>
            ) : (
              leaves.map((lv: any, i: number) => {
                const st = STATUS_STYLE[lv.status?.toLowerCase()] ?? STATUS_STYLE.pending;
                return (
                  <View key={i} style={s.card}>
                    <View style={s.cardTop}>
                      <View>
                        <Text style={s.leaveType}>{lv.leaveType ?? lv.type ?? 'Leave'}</Text>
                        <Text style={s.dates}>
                          {lv.startDate ? new Date(lv.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''} â€“{' '}
                          {lv.endDate ? new Date(lv.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                        </Text>
                      </View>
                      <View style={[s.badge, { backgroundColor: st.bg }]}>
                        <Text style={[s.badgeText, { color: st.color }]}>
                          {lv.status?.charAt(0).toUpperCase() + lv.status?.slice(1) ?? 'Pending'}
                        </Text>
                      </View>
                    </View>
                    {lv.reason && <Text style={s.reason}>{lv.reason}</Text>}
                    {lv.status === 'pending' && (
                      <TouchableOpacity style={s.cancelBtn} onPress={() => handleCancel(lv._id)}>
                        <Text style={s.cancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', paddingTop: 80 },
  balanceCard: {
    backgroundColor: Colors.primary, borderRadius: Radius.xl, padding: Spacing.md, marginBottom: Spacing.md,
  },
  balanceTitle: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 10, fontWeight: '600' },
  balanceRow: { flexDirection: 'row', gap: 20 },
  balanceItem: { alignItems: 'center' },
  balanceCount: { fontSize: 24, fontWeight: '700', color: '#fff' },
  balanceType: { fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'capitalize', marginTop: 2 },
  groupLabel: { ...Typography.h4, color: Colors.text, marginBottom: 8 },
  empty: { alignItems: 'center', paddingTop: 40, gap: 12 },
  emptyText: { ...Typography.body, color: Colors.textSecondary },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: 10, borderWidth: 1, borderColor: Colors.border,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  leaveType: { ...Typography.label, color: Colors.text },
  dates: { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  badgeText: { fontSize: 11, fontWeight: '600' },
  reason: { ...Typography.bodySmall, color: Colors.textSecondary, marginBottom: 8, lineHeight: 18 },
  cancelBtn: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingVertical: 8, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
});
