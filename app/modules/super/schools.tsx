import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as superApi from '@/api/superadmin.api';
import {
  unwrap, LoaderView, Empty, RowItem, SearchBar, FAB, Badge, confirmAsync,
} from '@/components/ui/kit';

export default function SuperSchoolsScreen() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (p = 1, q = search) => {
    try {
      const d = unwrap(await superApi.getSchools({ page: p, limit: 20, search: q }));
      const rows = d?.data ?? [];
      if (p === 1) setList(rows); else setList(prev => [...prev, ...rows]);
      setTotal(d?.total ?? rows.length);
      setPage(p);
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(1, ''); }, []);
  useEffect(() => {
    const t = setTimeout(() => { setLoading(true); load(1, search); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // Ask the server first. A school that still has accounts is never deleted —
  // every student record, payroll run and document hangs off those users — so
  // the dialog reports who is blocking it instead of offering a delete button.
  const handleDelete = async (sc: any) => {
    let check: any;
    try {
      check = unwrap(await superApi.checkSchoolDeletable(sc._id));
    } catch (err: any) { return Alert.alert('Error', err.message || 'Could not check this school'); }

    if (!check?.canDelete) {
      const byRole = (check?.byRole ?? [])
        .map((r: any) => `${r.label}: ${r.count}`)
        .join('\n');
      return Alert.alert(
        'Cannot delete this school',
        `${sc.name} still has ${check?.userCount ?? 0} account${check?.userCount === 1 ? '' : 's'}.\n\n`
        + `${byRole}\n\nRemove or move these accounts first, then delete the school.`,
      );
    }

    if (!(await confirmAsync('Delete School',
      `Delete ${sc.name}? It has no accounts in it. This cannot be undone.`, 'Delete'))) return;
    try { await superApi.deleteSchool(sc._id); load(1); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  return (
    <>
      <Stack.Screen options={{ title: `Schools (${total})` }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1); }} tintColor={Colors.primary} />}
        >
          <SearchBar value={search} onChange={setSearch} placeholder="Search schools…" />
          {loading ? <LoaderView /> : list.length === 0 ? (
            <Empty icon="business-outline" text="No schools yet" />
          ) : (
            <>
              {list.map((sc: any) => (
                <RowItem
                  key={sc._id}
                  icon="business" iconColor={Colors.primary} iconBg={Colors.surfaceAlt}
                  title={sc.name}
                  sub={`${sc.code ?? ''}${sc.board ? ` · ${sc.board}` : ''}${sc.city ? ` · ${sc.city}` : ''}${sc.email ? `\n${sc.email}` : ''}`}
                  right={<Badge label={sc.isActive === false ? 'inactive' : 'active'} />}
                  onPress={() => {
                    Alert.alert(sc.name, undefined, [
                      { text: 'Close', style: 'cancel' },
                      { text: 'Edit', onPress: () => router.push({ pathname: '/modules/super/school-form', params: { id: sc._id } } as any) },
                      { text: 'Permissions', onPress: () => router.push('/modules/super/permissions' as any) },
                      { text: 'Delete', style: 'destructive', onPress: () => handleDelete(sc) },
                    ]);
                  }}
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
        <FAB onPress={() => router.push('/modules/super/school-form' as any)} />
      </View>
    </>
  );
}
