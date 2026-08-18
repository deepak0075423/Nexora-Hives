import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as feesApi from '@/api/fees.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { LoaderView, Empty, RowItem, Badge, fmtMoney, fmtDate, MODULE_BLOCKED_CODES } from '@/components/ui/kit';

/** Immutable school-wide fee ledger — every charge, payment, concession and fine */
export default function AdminFeesLedgerScreen() {
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async (p = 1) => {
    try {
      const res: any = await feesApi.getSchoolLedger();
      const rows = (res as any)?.data ?? [];
      if (p === 1) setList(rows); else setList(prev => [...prev, ...rows]);
      setTotal((res as any)?.total ?? rows.length);
      setPage(p);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(1); }, []);

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Ledger' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: `School Ledger (${total})` }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : list.length === 0 ? (
          <Empty icon="book-outline" text="No ledger entries yet" />
        ) : (
          <>
            {list.map((e: any) => (
              <RowItem
                key={e._id}
                icon={e.entryType === 'credit' ? 'arrow-down-circle' : 'arrow-up-circle'}
                iconColor={e.entryType === 'credit' ? Colors.success : Colors.danger}
                iconBg={e.entryType === 'credit' ? Colors.successLight : Colors.dangerLight}
                title={`${fmtMoney(e.amount)} · ${e.student?.name ?? 'School'}`}
                sub={`${e.description ?? e.category ?? ''}\n${fmtDate(e.createdAt)} · balance ${fmtMoney(e.runningBalance)}`}
                right={<Badge label={(e.category ?? e.entryType ?? '').replace('_', ' ')} tone={e.entryType === 'credit' ? 'success' : 'warning'} />}
              />
            ))}
            {list.length < total && (
              <TouchableOpacity onPress={() => load(page + 1)} style={{ padding: 14, alignItems: 'center' }}>
                <Text style={{ color: Colors.accent, fontWeight: '600', fontSize: 13 }}>Load more ({list.length}/{total})</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}
