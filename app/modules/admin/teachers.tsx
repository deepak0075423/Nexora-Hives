import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import TeacherFormModal from './teacher-form';
import {
  unwrap, LoaderView, Empty, Badge, RowItem, SearchBar, FAB, FormModal,
  Input, Select, KV, ActionBtn, confirmAsync,
} from '@/components/ui/kit';

export default function AdminTeachersScreen() {
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [designations, setDesignations] = useState<string[]>([]);

  const [detail, setDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);

  const load = async (p = 1, q = search) => {
    try {
      const res: any = await adminApi.getTeachers({ page: p, limit: 20, search: q });
      const d = unwrap(res);
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

  useEffect(() => {
    adminApi.getDesignations()
      .then((res: any) => setDesignations(unwrap(res) ?? []))
      .catch(() => {});
  }, []);

  const openDetail = async (id: string) => {
    try { setDetail(unwrap(await adminApi.getTeacher(id))); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const handleToggle = async (id: string) => {
    try { await adminApi.toggleUser(id); setDetail(null); load(1); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirmAsync('Delete Teacher', `Delete ${name}? This cannot be undone.`, 'Delete'))) return;
    try { await adminApi.deleteTeacher(id); setDetail(null); load(1); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const u = detail?.user;
  const p = detail?.profile;

  return (
    <>
      <Stack.Screen options={{ title: `Teachers (${total})` }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1); }} tintColor={Colors.primary} />}
        >
          <SearchBar value={search} onChange={setSearch} placeholder="Search teachers…" />
          {loading ? <LoaderView /> : list.length === 0 ? (
            <Empty icon="people-outline" text="No teachers found" />
          ) : (
            <>
              {list.map((t: any) => (
                <RowItem
                  key={t._id}
                  icon="person" iconColor={Colors.info} iconBg={Colors.infoLight}
                  title={t.name}
                  sub={t.email}
                  right={<Badge label={t.isActive === false ? 'inactive' : 'active'} />}
                  onPress={() => openDetail(t._id)}
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
        <FAB onPress={() => setShowForm(true)} />
      </View>

      <FormModal visible={!!detail} title={u?.name ?? 'Teacher'} onClose={() => setDetail(null)}>
        <KV label="Email" value={u?.email} />
        <KV label="Phone" value={u?.phone || '--'} />
        <KV label="Employee ID" value={p?.employeeId || '--'} />
        <KV label="Designation" value={p?.designation || '--'} />
        <KV label="Date of Joining" value={p?.joiningDate ? String(p.joiningDate).slice(0, 10) : '--'} />
        <KV label="Qualification" value={p?.qualification || '--'} />
        <KV label="Teaching Degree" value={p?.teachingDegree || '--'} />
        <KV label="Experience" value={p?.employmentType === 'experienced' ? (p?.totalExperience || 'Experienced') : (p?.employmentType ? 'Fresher' : '--')} />
        <KV label="Emergency Contact" value={p?.emergencyContactName ? `${p.emergencyContactName} · ${p.emergencyContactPhone || ''}`.trim() : '--'} />
        <KV label="Status" value={<Badge label={u?.isActive === false ? 'inactive' : 'active'} />} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <ActionBtn label={u?.isActive === false ? 'Activate' : 'Deactivate'} tone="warning" onPress={() => handleToggle(u._id)} />
          </View>
          <View style={{ flex: 1 }}>
            <ActionBtn label="Delete" tone="danger" onPress={() => handleDelete(u._id, u?.name)} />
          </View>
        </View>
      </FormModal>

      <TeacherFormModal visible={showForm} onClose={() => setShowForm(false)}
        onCreated={() => load(1)} designations={designations} />
    </>
  );
}
