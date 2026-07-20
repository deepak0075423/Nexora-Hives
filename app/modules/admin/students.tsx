import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import { isEmail, isPhone } from '@/utils/validators';
import {
  unwrap, LoaderView, Empty, Badge, RowItem, SearchBar, FAB, FormModal,
  Input, Select, KV, ActionBtn, confirmAsync, SectionTitle,
} from '@/components/ui/kit';

export default function AdminStudentsScreen() {
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sections, setSections] = useState<any[]>([]);

  // Detail
  const [detail, setDetail] = useState<any>(null);
  // Create form
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', rollNumber: '', gender: '', sectionId: '' });
  const [parentQ, setParentQ] = useState('');
  const [parentResults, setParentResults] = useState<any[]>([]);
  const [parentId, setParentId] = useState('');
  const [parentName, setParentName] = useState('');

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

  useEffect(() => {
    adminApi.getClassesWithSections().then((res: any) => {
      const d = unwrap(res) ?? [];
      setSections(d);
    }).catch(() => {});
  }, []);

  const sectionOptions = useMemo(() => {
    const opts: { label: string; value: string }[] = [];
    (sections ?? []).forEach((c: any) => (c.sections ?? []).forEach((sec: any) =>
      opts.push({ label: `${c.className ?? c.name} · ${sec.sectionName ?? sec.name}`, value: sec._id })));
    return opts;
  }, [sections]);

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

  const searchParent = async () => {
    if (!parentQ.trim()) return;
    try {
      const res: any = await adminApi.parentLookup(parentQ.trim());
      setParentResults(unwrap(res) ?? []);
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim()) return Alert.alert('Required', 'Name and email are required');
    if (form.name.trim().length < 2) return Alert.alert('Invalid', 'Name must be at least 2 characters');
    if (!isEmail(form.email)) return Alert.alert('Invalid', 'Please enter a valid email address');
    if (form.phone && !isPhone(form.phone)) return Alert.alert('Invalid', 'Please enter a valid phone number');
    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(),
        profile: {
          ...(form.rollNumber ? { rollNumber: form.rollNumber } : {}),
          ...(form.gender ? { gender: form.gender } : {}),
          ...(form.sectionId ? { currentSection: form.sectionId } : {}),
        },
      };
      if (parentId) payload.parentId = parentId;
      await adminApi.createStudent(payload);
      setShowForm(false);
      setForm({ name: '', email: '', phone: '', rollNumber: '', gender: '', sectionId: '' });
      setParentId(''); setParentName(''); setParentQ(''); setParentResults([]);
      load(1);
      Alert.alert('Success', 'Student created. Login OTP has been emailed.');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
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
        <FAB onPress={() => setShowForm(true)} />
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
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <ActionBtn label={u?.isActive === false ? 'Activate' : 'Deactivate'} tone="warning" onPress={() => handleToggle(u._id)} />
          </View>
          <View style={{ flex: 1 }}>
            <ActionBtn label="Delete" tone="danger" onPress={() => handleDelete(u._id, u?.name)} />
          </View>
        </View>
      </FormModal>

      {/* Create modal */}
      <FormModal visible={showForm} title="Add Student" onClose={() => setShowForm(false)} onSubmit={submit} submitting={saving} submitLabel="Create Student">
        <Input label="Full Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Student name" />
        <Input label="Email *" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="student@email.com" keyboardType="email-address" />
        <Input label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="Optional" keyboardType="phone-pad" />
        <Input label="Roll Number" value={form.rollNumber} onChange={v => setForm(f => ({ ...f, rollNumber: v }))} placeholder="Optional" />
        <Select label="Gender" value={form.gender} onChange={v => setForm(f => ({ ...f, gender: v }))}
          options={[{ label: 'Male', value: 'Male' }, { label: 'Female', value: 'Female' }, { label: 'Other', value: 'Other' }]} />
        <Select label="Section" value={form.sectionId} onChange={v => setForm(f => ({ ...f, sectionId: v }))} options={sectionOptions} placeholder="Assign later" />

        <SectionTitle>Link Parent (optional)</SectionTitle>
        {parentId ? (
          <View style={{ marginBottom: 12 }}>
            <KV label="Selected parent" value={parentName} />
            <ActionBtn label="Remove" tone="neutral" small onPress={() => { setParentId(''); setParentName(''); }} />
          </View>
        ) : (
          <>
            <Input label="Search parent by name/email" value={parentQ} onChange={setParentQ} placeholder="e.g. rahul@…" />
            <ActionBtn label="Search Parent" tone="info" onPress={searchParent} />
            {parentResults.map((pr: any) => (
              <RowItem key={pr._id} title={pr.name} sub={pr.email}
                onPress={() => { setParentId(pr._id); setParentName(`${pr.name} (${pr.email})`); setParentResults([]); }} />
            ))}
          </>
        )}
      </FormModal>
    </>
  );
}
