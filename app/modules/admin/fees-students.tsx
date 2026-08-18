import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as feesApi from '@/api/fees.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Badge, RowItem, SearchBar, FormModal, KV,
  fmtMoney, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

export default function AdminFeesStudentsScreen() {
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  const load = async (p = 1, q = search) => {
    try {
      const res: any = await feesApi.getStudentFees({ page: p, limit: 20, q });
      const rows = (res as any)?.data ?? [];
      if (p === 1) setList(rows); else setList(prev => [...prev, ...rows]);
      setTotal((res as any)?.total ?? rows.length);
      setPage(p);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(1, ''); }, []);
  useEffect(() => {
    const t = setTimeout(() => { setLoading(true); load(1, search); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const openDetail = async (id: string) => {
    try { setDetail(unwrap(await feesApi.getStudentFeeDetail(id))); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Student Fees' }} />
      <ModuleDisabled />
    </>
  );

  const assignment = detail?.assignment;
  const payments: any[] = detail?.payments ?? [];

  return (
    <>
      <Stack.Screen options={{ title: `Student Fees (${total})` }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1); }} tintColor={Colors.primary} />}
      >
        <SearchBar value={search} onChange={setSearch} placeholder="Search students…" />
        {loading ? <LoaderView /> : list.length === 0 ? (
          <Empty icon="card-outline" text="No student fee records" />
        ) : (
          <>
            {list.map((row: any) => (
              <RowItem
                key={row._id}
                icon="person" iconColor="#DB2777" iconBg="#FCE7F3"
                title={row.student?.name ?? '--'}
                sub={`${row.student?.class?.name ?? ''} ${row.student?.section?.name ?? ''} · Total ${fmtMoney(row.totalAmount)} · Due ${fmtMoney(row.dueAmount)}`}
                right={<Badge label={row.status} />}
                onPress={() => openDetail(row._id)}
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

      <FormModal visible={!!detail} title={detail?.student?.name ?? 'Fee Detail'} onClose={() => setDetail(null)}>
        <KV label="Total" value={fmtMoney(detail?.totalAmount ?? assignment?.totalAmount)} />
        <KV label="Paid" value={fmtMoney(detail?.paidAmount)} />
        <KV label="Due" value={fmtMoney(detail?.dueAmount)} />
        {(detail?.items ?? assignment?.items ?? []).map((it: any, i: number) => (
          <KV key={i} label={it.feeHead?.name ?? it.name ?? `Item ${i + 1}`} value={fmtMoney(it.amount)} />
        ))}
        {payments.length > 0 && (
          <>
            <KV label="Payments" value={`${payments.length} transaction(s)`} />
            {payments.map((p: any) => (
              <KV key={p._id} label={`${p.receiptNumber ?? ''} · ${fmtDate(p.paymentDate)}`} value={fmtMoney(p.amount)} />
            ))}
          </>
        )}
      </FormModal>
    </>
  );
}
