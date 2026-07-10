import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as superApi from '@/api/superadmin.api';
import {
  unwrap, LoaderView, Empty, RowItem, SearchBar, fmtDateTime,
} from '@/components/ui/kit';

export default function SuperLogsScreen() {
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (p = 1, a = action) => {
    try {
      const d = unwrap(await superApi.getLogs({ page: p, limit: 50, ...(a ? { action: a } : {}) }));
      const rows = d?.data ?? [];
      if (p === 1) setList(rows); else setList(prev => [...prev, ...rows]);
      setTotal(d?.total ?? rows.length);
      setPage(p);
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(1, ''); }, []);
  useEffect(() => {
    const t = setTimeout(() => { setLoading(true); load(1, action); }, 400);
    return () => clearTimeout(t);
  }, [action]);

  return (
    <>
      <Stack.Screen options={{ title: `Activity Logs (${total})` }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1); }} tintColor={Colors.primary} />}
      >
        <SearchBar value={action} onChange={setAction} placeholder="Filter by action (e.g. login)…" />
        {loading ? <LoaderView /> : list.length === 0 ? (
          <Empty icon="list-outline" text="No activity logs" />
        ) : (
          <>
            {list.map((log: any) => (
              <RowItem
                key={log._id}
                icon="footsteps" iconColor={Colors.textSecondary} iconBg={Colors.surfaceAlt}
                title={log.action ?? '--'}
                sub={`${log.user?.name ?? 'System'}${log.user?.email ? ` (${log.user.email})` : ''}\n${fmtDateTime(log.createdAt)}${log.details ? ` · ${typeof log.details === 'string' ? log.details : ''}` : ''}`}
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
