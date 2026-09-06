import React, { useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import ImportYearStructureSheet from '@/components/ImportYearStructureSheet';
import {
  unwrap, LoaderView, Empty, RowItem, FAB, FormModal, Input, Select,
  confirmAsync, Badge,
} from '@/components/ui/kit';

const TYPE_OPTIONS = [
  { label: 'Theory', value: 'theory' },
  { label: 'Practical', value: 'practical' },
  { label: 'Co-curricular', value: 'co-curricular' },
];

export default function AdminSubjectsScreen() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ subjectName: '', subjectCode: '', type: 'theory' });

  // A subject belongs to the SCHOOL, not to a year — every year shares one
  // "Hindi". What changes year to year is where a subject is USED, so this
  // picker does not filter the catalogue: it decides what counts as in use.
  const [years, setYears] = useState<any[]>([]);
  const [yearId, setYearId] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  const load = async (yr = yearId) => {
    try { setList(unwrap(await adminApi.getSubjects(yr ? { academicYear: yr } : undefined)) ?? []); }
    catch (err: any) { Alert.alert('Error', err.message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    adminApi.getAcademicYears()
      .then((res: any) => {
        const ys = unwrap(res) ?? [];
        setYears(ys);
        const active = ys.find((y: any) => y.status === 'active') ?? ys[0];
        setYearId(active?._id ?? '');
        load(active?._id ?? '');
      })
      .catch(() => load(''));
  }, []);

  const openCreate = () => { setEditing(null); setForm({ subjectName: '', subjectCode: '', type: 'theory' }); setShowForm(true); };
  const openEdit = (s: any) => {
    setEditing(s);
    setForm({ subjectName: s.subjectName ?? '', subjectCode: s.subjectCode ?? '', type: s.type ?? 'theory' });
    setShowForm(true);
  };

  const handleDelete = async (s: any) => {
    if (!(await confirmAsync('Delete Subject', `Delete ${s.subjectName}?`, 'Delete'))) return;
    try { await adminApi.deleteSubject(s._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const submit = async () => {
    if (!form.subjectName.trim()) return Alert.alert('Required', 'Subject name is required');
    setSaving(true);
    try {
      if (editing) await adminApi.updateSubject(editing._id, form);
      // Created INTO the year the screen is showing — subjects are per-year.
      else await adminApi.createSubject({ ...form, academicYear: yearId || undefined });
      setShowForm(false);
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Subjects' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {years.length > 0 && (
            <Select label="Academic Year" value={yearId}
              options={years.map((y: any) => ({ label: `${y.yearName}${y.status === 'active' ? ' · active' : ''}`, value: y._id }))}
              onChange={v => { setYearId(v); setLoading(true); load(v); }} />
          )}

          {years.length > 1 && (
            <RowItem
              icon="download" iconColor={Colors.accent} iconBg={Colors.accentLight}
              title="Import from another year"
              sub="Copy a previous year's subject list into this one"
              onPress={() => setImportOpen(true)}
            />
          )}

          {loading ? <LoaderView /> : list.length === 0 ? (
            <Empty icon="book-outline"
              text={years.length > 1
                ? "No subjects in this year yet — import them from another year, or add one with +."
                : 'No subjects yet'} />
          ) : (
            list.map((s: any) => (
              <RowItem
                key={s._id}
                icon="book" iconColor={Colors.warning} iconBg={Colors.warningLight}
                title={s.subjectName}
                sub={[
                  s.subjectCode ? `Code ${s.subjectCode}` : null,
                  `${(s.teachers ?? []).length} teacher(s)`,
                  s.usage
                    ? (s.usage.inUse
                      ? `${s.usage.classCount} class(es) · ${s.usage.sectionCount} section(s) this year`
                      : 'Not used this year')
                    : null,
                ].filter(Boolean).join(' · ')}
                right={<Badge label={s.usage && !s.usage.inUse ? 'unused' : (s.type ?? 'theory')}
                  tone={s.usage && !s.usage.inUse ? 'warning' : 'info'} />}
                onPress={() => {
                  Alert.alert(s.subjectName, undefined, [
                    { text: 'Close', style: 'cancel' },
                    { text: 'Edit', onPress: () => openEdit(s) },
                    { text: 'Delete', style: 'destructive', onPress: () => handleDelete(s) },
                  ]);
                }}
              />
            ))
          )}
        </ScrollView>
        <FAB onPress={openCreate} />
      </View>

      {/* Opened from Subjects, so it starts on the subject list alone. The
          curriculum is left off on purpose: importing a subject list must not
          also decide which class teaches what. The other parts are still there
          to tick if the year needs building out. */}
      <ImportYearStructureSheet
        visible={importOpen}
        targetYear={years.find((y: any) => String(y._id) === String(yearId)) ?? null}
        years={years}
        defaultParts={{ classes: false, sections: false, subjects: true, curriculum: false, assignments: false }}
        onClose={() => setImportOpen(false)}
        onImported={() => load()}
      />

      <FormModal visible={showForm} title={editing ? 'Edit Subject' : 'Add Subject'} onClose={() => setShowForm(false)} onSubmit={submit} submitting={saving}>
        <Input label="Subject Name *" value={form.subjectName} onChange={v => setForm(f => ({ ...f, subjectName: v }))} placeholder="e.g. Mathematics" />
        <Input label="Subject Code" value={form.subjectCode} onChange={v => setForm(f => ({ ...f, subjectCode: v }))} placeholder="e.g. MATH10" />
        <Select label="Type" value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))} options={TYPE_OPTIONS} />
      </FormModal>
    </>
  );
}
