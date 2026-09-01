import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Stack, router } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import TeacherFormModal from './teacher-form';
import BulkImportModal from '@/components/BulkImportModal';
import TeacherDependencyModal from '@/components/TeacherDependencyModal';
import {
  unwrap, LoaderView, Empty, Badge, RowItem, SearchBar, FAB, FormModal,
  KV, ActionBtn,
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
  const [showBulk, setShowBulk] = useState(false);
  const [editing, setEditing] = useState<{ _id: string; name?: string } | null>(null);
  // Delete and Deactivate both go through the dependency sheet — it is what
  // shows the classes, subjects, books and periods still attached, and it is the
  // only thing that fires either action.
  const [depTarget, setDepTarget] = useState<{ teacher: any; action: 'delete' | 'deactivate' } | null>(null);

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

  /**
   * Activating is immediate; deactivating is not.
   *
   * Switching an account back on resolves dependencies rather than creating
   * them, so there is nothing to check — but switching it off strands whatever
   * still points at it, which is what the sheet is for.
   */
  const handleToggle = async (user: any) => {
    if (user.isActive !== false) {
      setDepTarget({ teacher: { _id: user._id, name: user.name }, action: 'deactivate' });
      setDetail(null);
      return;
    }
    try { await adminApi.toggleUser(user._id); setDetail(null); load(1); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const handleDelete = (user: any) => {
    setDepTarget({ teacher: { _id: user._id, name: user.name }, action: 'delete' });
    setDetail(null);
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
          <RowItem
            icon="pricetags" iconColor={Colors.primary} iconBg={Colors.surfaceAlt}
            title="Designations & Module Access"
            sub="What each designation may reach, and with which privileges"
            onPress={() => router.push('/modules/admin/designations' as any)}
          />
          <RowItem
            icon="cloud-upload" iconColor={Colors.accent} iconBg={Colors.accentLight}
            title="Bulk Import Teachers"
            sub="Add a whole staff list from one Excel sheet"
            onPress={() => setShowBulk(true)}
          />
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
        <View style={{ marginTop: 12 }}>
          {/* The whole record, edited with the wizard that created it. */}
          <ActionBtn label="Edit full record" tone="info" onPress={() => { setEditing({ _id: u._id, name: u.name }); setDetail(null); }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <View style={{ flex: 1 }}>
            <ActionBtn label={u?.isActive === false ? 'Activate' : 'Deactivate'} tone="warning" onPress={() => handleToggle(u)} />
          </View>
          <View style={{ flex: 1 }}>
            <ActionBtn label="Delete" tone="danger" onPress={() => handleDelete(u)} />
          </View>
        </View>
      </FormModal>

      <TeacherFormModal visible={showForm} onClose={() => setShowForm(false)}
        onCreated={() => load(1)} designations={designations} />

      <TeacherFormModal visible={!!editing} teacher={editing} onClose={() => setEditing(null)}
        onCreated={() => load(1)} designations={designations} />

      <BulkImportModal kind="teachers" visible={showBulk}
        onClose={() => setShowBulk(false)} onImported={() => load(1)} />

      {/* Delete / Deactivate — dependencies first, the action only once clear */}
      <TeacherDependencyModal
        visible={!!depTarget}
        teacher={depTarget?.teacher ?? null}
        action={depTarget?.action ?? 'deactivate'}
        onClose={() => setDepTarget(null)}
        onDone={() => load(1)}
      />
    </>
  );
}
