import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import {
  unwrap, LoaderView, Empty, RowItem, FAB, FormModal, Input, Select,
  confirmAsync, Badge,
} from '@/components/ui/kit';

export default function AdminClassesScreen() {
  const router = useRouter();
  const [years, setYears] = useState<any[]>([]);
  const [yearId, setYearId] = useState('');
  const [classes, setClasses] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sections, setSections] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ className: '', classNumber: '' });
  const [sectionForm, setSectionForm] = useState<{ classId: string; name: string; capacity: string } | null>(null);

  const loadYears = async () => {
    try {
      const ys = unwrap(await adminApi.getAcademicYears()) ?? [];
      setYears(ys);
    } catch {}
  };

  const load = async (yr = yearId) => {
    try {
      const params: any = yr ? { academicYear: yr } : {};
      setClasses(unwrap(await adminApi.getClasses(params)) ?? []);
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { loadYears(); load(); }, []);

  const changeYear = (id: string) => { setYearId(id); setLoading(true); setExpanded(null); load(id); };

  const toggleExpand = async (classId: string) => {
    if (expanded === classId) { setExpanded(null); return; }
    setExpanded(classId);
    if (!sections[classId]) {
      try {
        const d = unwrap(await adminApi.getClassDetail(classId));
        setSections(prev => ({ ...prev, [classId]: d?.sections ?? [] }));
      } catch (err: any) { Alert.alert('Error', err.message); }
    }
  };

  const handleDeleteClass = async (cls: any) => {
    if (!(await confirmAsync('Delete Class', `Delete ${cls.className} and its sections?`, 'Delete'))) return;
    try { await adminApi.deleteClass(cls._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const submitClass = async () => {
    if (!form.className.trim()) return Alert.alert('Required', 'Class name is required');
    setSaving(true);
    try {
      await adminApi.createClass({
        className: form.className.trim(),
        classNumber: Number(form.classNumber) || 0,
        ...(yearId ? { academicYear: yearId } : {}),
      });
      setShowForm(false);
      setForm({ className: '', classNumber: '' });
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  const submitSection = async () => {
    if (!sectionForm?.name.trim()) return Alert.alert('Required', 'Section name is required');
    setSaving(true);
    try {
      await adminApi.createSection(sectionForm.classId, {
        sectionName: sectionForm.name.trim(),
        maxStudents: Number(sectionForm.capacity) || 40,
      });
      const d = unwrap(await adminApi.getClassDetail(sectionForm.classId));
      setSections(prev => ({ ...prev, [sectionForm.classId]: d?.sections ?? [] }));
      setSectionForm(null);
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Classes & Sections' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          {years.length > 0 && (
            <Select label="Academic Year" value={yearId} onChange={changeYear}
              options={[{ label: 'Active year (default)', value: '' },
                ...years.map((y: any) => ({ label: `${y.yearName}${y.status === 'active' ? ' · active' : ''}`, value: y._id }))]} />
          )}

          {loading ? <LoaderView /> : classes.length === 0 ? (
            <Empty icon="business-outline" text="No classes yet. Create one to get started." />
          ) : (
            classes.map((cls: any) => (
              <View key={cls._id} style={cs.classCard}>
                <TouchableOpacity style={cs.classHead} onPress={() => toggleExpand(cls._id)} activeOpacity={0.7}>
                  <View style={cs.classIcon}>
                    <Ionicons name="business" size={18} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={cs.className}>{cls.className}</Text>
                    <Text style={cs.classMeta}>
                      {cls.sectionCount ?? 0} sections · {cls.studentCount ?? 0} students · {cls.academicYear?.yearName ?? ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteClass(cls)} hitSlop={8} style={{ padding: 4 }}>
                    <Ionicons name="trash-outline" size={17} color={Colors.danger} />
                  </TouchableOpacity>
                  <Ionicons name={expanded === cls._id ? 'chevron-up' : 'chevron-down'} size={17} color={Colors.textLight} />
                </TouchableOpacity>

                {expanded === cls._id && (
                  <View style={cs.sectionsWrap}>
                    {(sections[cls._id] ?? []).map((sec: any) => (
                      <RowItem
                        key={sec._id}
                        icon="grid" iconColor={Colors.info} iconBg={Colors.infoLight}
                        title={`Section ${sec.sectionName}`}
                        sub={`${(sec.enrolledStudents ?? []).length}/${sec.maxStudents ?? '--'} students`}
                        right={<Badge label={sec.status ?? 'active'} />}
                        onPress={() => router.push({ pathname: '/modules/admin/section-detail', params: { id: sec._id, title: `${cls.className} · ${sec.sectionName}` } } as any)}
                      />
                    ))}
                    {!sections[cls._id] && <LoaderView />}
                    <TouchableOpacity style={cs.addSection} onPress={() => setSectionForm({ classId: cls._id, name: '', capacity: '' })}>
                      <Ionicons name="add" size={15} color={Colors.accent} />
                      <Text style={cs.addSectionText}>Add Section</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
        <FAB onPress={() => setShowForm(true)} />
      </View>

      <FormModal visible={showForm} title="Add Class" onClose={() => setShowForm(false)} onSubmit={submitClass} submitting={saving} submitLabel="Create Class">
        <Input label="Class Name *" value={form.className} onChange={v => setForm(f => ({ ...f, className: v }))} placeholder="e.g. Class 10" />
        <Input label="Class Number" value={form.classNumber} onChange={v => setForm(f => ({ ...f, classNumber: v }))} placeholder="e.g. 10 (used for ordering)" keyboardType="numeric" />
      </FormModal>

      <FormModal visible={!!sectionForm} title="Add Section" onClose={() => setSectionForm(null)} onSubmit={submitSection} submitting={saving} submitLabel="Create Section">
        <Input label="Section Name *" value={sectionForm?.name ?? ''} onChange={v => setSectionForm(f => f ? { ...f, name: v } : f)} placeholder="e.g. A" />
        <Input label="Capacity" value={sectionForm?.capacity ?? ''} onChange={v => setSectionForm(f => f ? { ...f, capacity: v } : f)} placeholder="40" keyboardType="numeric" />
      </FormModal>
    </>
  );
}

const cs = StyleSheet.create({
  classCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  classHead: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: 10 },
  classIcon: {
    width: 38, height: 38, borderRadius: Radius.md, backgroundColor: Colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  className: { fontSize: 14, fontWeight: '600', color: Colors.text },
  classMeta: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  sectionsWrap: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  addSection: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    borderRadius: Radius.md, paddingVertical: 10,
  },
  addSectionText: { fontSize: 12, fontWeight: '600', color: Colors.accent },
});
