import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import {
  unwrap, LoaderView, Empty, Badge, RowItem, SearchBar, FAB, FormModal,
  KV, ActionBtn, confirmAsync,
} from '@/components/ui/kit';
import StudentFormModal from './student-form';

export default function AdminStudentsScreen() {
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Detail
  const [detail, setDetail] = useState<any>(null);
  // Create / edit wizard — `editing` null means "add"
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const load = async (p = 1, q = search) => {
    try {
      const res: any = await adminApi.getStudents({ page: p, limit: 20, search: q });
      const d = unwrap(res);
      const rows = d?.data ?? [];
      if (p === 1) setList(rows);
      else setList(prev => [...prev, ...rows]);
      setTotal(d?.total ?? rows.length);
      setPage(p);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally { setLoading(false); setRefreshing(false); }
  };

  const loadMore = async () => {
    const p = page + 1;
    try {
      const res: any = await adminApi.getStudents({ page: p, limit: 20, search });
      const d = unwrap(res);
      setList(prev => [...prev, ...(d?.data ?? [])]);
      setPage(p);
    } catch {}
  };

  useEffect(() => { load(1, ''); }, []);
  useEffect(() => {
    const t = setTimeout(() => { setLoading(true); load(1, search); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const openDetail = async (id: string) => {
    try {
      const res: any = await adminApi.getStudent(id);
      setDetail(unwrap(res));
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  const handleToggle = async (id: string) => {
    try { await adminApi.toggleUser(id); setDetail(null); load(1); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirmAsync('Delete Student', `Delete ${name}? This cannot be undone.`, 'Delete'))) return;
    try { await adminApi.deleteStudent(id); setDetail(null); load(1); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const u = detail?.user;
  const p = detail?.profile;

  return (
    <>
      <Stack.Screen options={{ title: `Students (${total})` }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1); }} tintColor={Colors.primary} />}
        >
          <SearchBar value={search} onChange={setSearch} placeholder="Search students…" />
          {loading ? <LoaderView /> : list.length === 0 ? (
            <Empty icon="school-outline" text="No students found" />
          ) : (
            <>
              {list.map((st: any) => (
                <RowItem
                  key={st._id}
                  icon="person" iconColor={Colors.success} iconBg={Colors.successLight}
                  title={st.name}
                  sub={`${st.email}${st.className ? `\n${st.className} · ${st.sectionName ?? ''}${st.rollNumber ? ` · Roll ${st.rollNumber}` : ''}` : ''}`}
                  right={<Badge label={st.isActive === false ? 'inactive' : 'active'} />}
                  onPress={() => openDetail(st._id)}
                />
              ))}
              {list.length < total && (
                <TouchableOpacity onPress={loadMore} style={{ padding: 14, alignItems: 'center' }}>
                  <Text style={{ color: Colors.accent, fontWeight: '600', fontSize: 13 }}>Load more ({list.length}/{total})</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
        <FAB onPress={() => { setEditing(null); setShowForm(true); }} />
      </View>

      {/* Detail modal */}
      <FormModal visible={!!detail} title={u?.name ?? 'Student'} onClose={() => setDetail(null)}>
        <KV label="Email" value={u?.email} />
        <KV label="Phone" value={u?.phone || '--'} />
        <KV label="Status" value={<Badge label={u?.isActive === false ? 'inactive' : 'active'} />} />
        <KV label="Roll Number" value={p?.rollNumber ?? '--'} />
        <KV label="Gender" value={p?.gender ?? '--'} />
        <KV label="Class" value={p?.currentSection ? `${p.currentSection.class?.className ?? ''} · ${p.currentSection.sectionName ?? ''}` : '--'} />
        <KV label="Parent" value={p?.parent ? `${p.parent.name} (${p.parent.email})` : '--'} />
        <KV label="Emergency contact" value={p?.emergencyContactName
          ? `${p.emergencyContactName} (${p.emergencyContactRelation || 'contact'}) · ${p.emergencyContactPhone || '--'}`
          : '--'} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <ActionBtn label="Edit" tone="info" onPress={() => { setEditing(u); setDetail(null); setShowForm(true); }} />
          </View>
          <View style={{ flex: 1 }}>
            <ActionBtn label={u?.isActive === false ? 'Activate' : 'Deactivate'} tone="warning" onPress={() => handleToggle(u._id)} />
          </View>
          <View style={{ flex: 1 }}>
            <ActionBtn label="Delete" tone="danger" onPress={() => handleDelete(u._id, u?.name)} />
          </View>
        </View>
      </FormModal>

      <StudentFormModal
        visible={showForm}
        student={editing}
        onClose={() => { setShowForm(false); setEditing(null); }}
        onSaved={() => load(1)}
      />
    </>
  );
}
