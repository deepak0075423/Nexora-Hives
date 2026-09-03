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
  const [form, setForm] = useState({ className: '' });
  const [editCls, setEditCls] = useState<any>(null);   // class being renamed
  const [busyClass, setBusyClass] = useState('');      // id being shuffled / locked
  const [sectionForm, setSectionForm] = useState<{ classId: string; name: string; capacity: string } | null>(null);

  // Bulk create — a whole grade range and its sections in one go, rather than
  // twelve class forms followed by forty-eight section forms.
  // Several sections onto ONE class — `count` here is how many MORE to add,
  // unlike the range dialog above which asks for the total each class should end
  // with. The sheet names the letters before writing, so which is which is never
  // left to be inferred.
  const [multiFor, setMultiFor] = useState<{ classId: string; className: string } | null>(null);
  const [multi, setMulti] = useState({ count: '4', capacity: '40' });
  const [multiPlan, setMultiPlan] = useState<any>(null);
  const [multiErr, setMultiErr] = useState('');

  const [showBulk, setShowBulk] = useState(false);
  const [bulk, setBulk] = useState({ fromClass: '1', toClass: '12', sectionsPerClass: '4', capacity: '40' });
  const [bulkPlan, setBulkPlan] = useState<any>(null);
  const [bulkErr, setBulkErr] = useState('');

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

  const openCreate = () => { setEditCls(null); setForm({ className: '' }); setShowForm(true); };

  const bulkPayload = (b = bulk) => ({
    fromClass: Number(b.fromClass),
    toClass: Number(b.toClass),
    sectionsPerClass: Number(b.sectionsPerClass),
    capacity: Number(b.capacity),
    ...(yearId ? { academicYear: yearId } : {}),
  });

  /** The summary is the server's own dry run, so it cannot promise what the
   *  write would not do. Re-asked on every edit — the payload is four numbers. */
  const previewBulk = async (b: typeof bulk) => {
    try {
      const res: any = await adminApi.bulkCreateClasses({ ...bulkPayload(b), preview: true });
      setBulkPlan(unwrap(res)); setBulkErr('');
    } catch (err: any) { setBulkPlan(null); setBulkErr(err.message ?? 'That range cannot be built'); }
  };

  const openBulk = () => {
    const fresh = { fromClass: '1', toClass: '12', sectionsPerClass: '4', capacity: '40' };
    setBulk(fresh); setBulkPlan(null); setBulkErr('');
    setShowBulk(true);
    previewBulk(fresh);
  };

  const setBulkField = (key: keyof typeof bulk, v: string) => {
    const next = { ...bulk, [key]: v };
    setBulk(next);
    previewBulk(next);
  };

  const previewMulti = async (classId: string, m: typeof multi) => {
    try {
      const res: any = await adminApi.bulkCreateSections(classId, {
        count: Number(m.count), capacity: Number(m.capacity), preview: true,
      });
      setMultiPlan(unwrap(res)); setMultiErr('');
    } catch (err: any) { setMultiPlan(null); setMultiErr(err.message ?? 'That cannot be added'); }
  };

  const openMulti = (cls: any) => {
    const fresh = { count: '4', capacity: '40' };
    setMulti(fresh); setMultiPlan(null); setMultiErr('');
    setMultiFor({ classId: cls._id, className: cls.className });
    previewMulti(cls._id, fresh);
  };

  const setMultiField = (key: keyof typeof multi, v: string) => {
    const next = { ...multi, [key]: v };
    setMulti(next);
    if (multiFor) previewMulti(multiFor.classId, next);
  };

  const submitMulti = async () => {
    if (!multiFor) return;
    setSaving(true);
    try {
      const res: any = await adminApi.bulkCreateSections(multiFor.classId, {
        count: Number(multi.count), capacity: Number(multi.capacity),
      });
      const d = unwrap(res);
      setMultiFor(null);
      // The expanded card holds its own copy of the section list — refresh it
      // too, or the new letters only appear after a collapse and reopen.
      const detail = unwrap(await adminApi.getClassDetail(multiFor.classId));
      setSections(prev => ({ ...prev, [multiFor.classId]: detail?.sections ?? [] }));
      load();
      Alert.alert('Sections added', `Created ${d.toCreate.join(', ')}.`);
    } catch (err: any) { setMultiErr(err.message ?? 'Could not add these sections'); }
    finally { setSaving(false); }
  };

  const submitBulk = async () => {
    setSaving(true);
    try {
      const res: any = await adminApi.bulkCreateClasses(bulkPayload());
      const d = unwrap(res);
      setShowBulk(false);
      load();
      Alert.alert(
        'Classes created',
        d.createdClasses || d.createdSections
          ? `${d.createdClasses} class(es) and ${d.createdSections} section(s) created.`
          : 'Everything in that range already existed.',
      );
    } catch (err: any) { setBulkErr(err.message ?? 'Could not create these classes'); }
    finally { setSaving(false); }
  };
  const openEdit = (cls: any) => { setEditCls(cls); setForm({ className: cls.className }); setShowForm(true); };

  const submitClass = async () => {
    if (!form.className.trim()) return Alert.alert('Required', 'Class name is required');
    setSaving(true);
    try {
      if (editCls) {
        await adminApi.updateClass(editCls._id, { className: form.className.trim() });
      } else {
        // Grade is derived server-side from the class name
        await adminApi.createClass({
          className: form.className.trim(),
          ...(yearId ? { academicYear: yearId } : {}),
        });
      }
      setShowForm(false);
      setEditCls(null);
      setForm({ className: '' });
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  // ── Section shuffle: one redistribution per class/year, then lockable ─────
  const handleShuffle = async (cls: any) => {
    const secs = sections[cls._id] ?? [];
    const ok = await confirmAsync(
      'Shuffle Sections',
      `Every student of ${cls.className} — including any admitted but not placed yet — will be redistributed at random across its sections, within each section's capacity. Existing roll numbers are cleared so you can reassign them. Repeatable until you lock.`,
      'Shuffle',
    );
    if (!ok) return;
    setBusyClass(cls._id);
    try {
      const res: any = await adminApi.shuffleSections(cls._id);
      const d = (res as any)?.data ?? res;
      const spread = (d?.sections ?? []).map((x: any) => `${x.sectionName}: ${x.count}`).join(' · ');
      const detail = unwrap(await adminApi.getClassDetail(cls._id));
      setSections(prev => ({ ...prev, [cls._id]: detail?.sections ?? [] }));
      load();
      Alert.alert('Shuffled', `${d?.students ?? 0} students — ${spread}`);
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setBusyClass(''); }
  };

  const handleLock = async (cls: any) => {
    const ok = await confirmAsync(
      'Lock Sections',
      `Lock the section allocation for ${cls.className} for this academic year. Shuffling will no longer be possible — individual students can still be moved by hand. This cannot be undone.`,
      'Lock',
    );
    if (!ok) return;
    setBusyClass(cls._id);
    try {
      await adminApi.lockSectionShuffle(cls._id);
      load();
      Alert.alert('Locked', 'Sections locked for this academic year');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setBusyClass(''); }
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

          <RowItem
            icon="albums" iconColor={Colors.accent} iconBg={Colors.accentLight}
            title="Bulk Create Classes & Sections"
            sub="A whole range at once — Class 1 to 12 with A, B, C, D each"
            onPress={openBulk}
          />

          {loading ? <LoaderView /> : classes.length === 0 ? (
            <Empty icon="business-outline" text="No classes yet. Bulk create a range above, or add one with the + button." />
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
                  <TouchableOpacity onPress={() => openEdit(cls)} hitSlop={8} style={{ padding: 4 }}>
                    <Ionicons name="create-outline" size={17} color={Colors.accent} />
                  </TouchableOpacity>
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
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity style={[cs.addSection, { flex: 1 }]} onPress={() => setSectionForm({ classId: cls._id, name: '', capacity: '' })}>
                        <Ionicons name="add" size={15} color={Colors.accent} />
                        <Text style={cs.addSectionText}>Add Section</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[cs.addSection, { flex: 1 }]} onPress={() => openMulti(cls)}>
                        <Ionicons name="albums-outline" size={15} color={Colors.accent} />
                        <Text style={cs.addSectionText}>Add Several</Text>
                      </TouchableOpacity>
                    </View>

                    {cls.sectionShuffle?.lockedAt ? (
                      <Text style={cs.lockNote}>
                        🔒 Sections locked on {String(cls.sectionShuffle.lockedAt).slice(0, 10)} — no reshuffling this
                        academic year. Students can still be moved individually.
                      </Text>
                    ) : (
                      <View style={cs.shuffleRow}>
                        {(sections[cls._id] ?? []).length >= 2 && (
                          <TouchableOpacity style={cs.shuffleBtn} disabled={busyClass === cls._id}
                            onPress={() => handleShuffle(cls)}>
                            <Ionicons name="shuffle" size={14} color="#fff" />
                            <Text style={cs.shuffleText}>{busyClass === cls._id ? 'Working…' : 'Shuffle Sections'}</Text>
                          </TouchableOpacity>
                        )}
                        {cls.sectionShuffle?.shuffledAt && (
                          <TouchableOpacity style={cs.lockBtn} disabled={busyClass === cls._id}
                            onPress={() => handleLock(cls)}>
                            <Ionicons name="lock-closed-outline" size={14} color={Colors.warning} />
                            <Text style={cs.lockText}>Lock</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
        <FAB onPress={openCreate} />
      </View>

      <FormModal visible={showForm} title={editCls ? 'Edit Class' : 'Add Class'}
        onClose={() => { setShowForm(false); setEditCls(null); }}
        onSubmit={submitClass} submitting={saving} submitLabel={editCls ? 'Save Changes' : 'Create Class'}>
        <Input label="Class Name *" value={form.className} onChange={v => setForm(f => ({ ...f, className: v }))} placeholder="e.g. Class 10" />
      </FormModal>

      <FormModal
        visible={showBulk}
        title="Bulk Create Classes & Sections"
        onClose={() => setShowBulk(false)}
        onSubmit={submitBulk}
        submitting={saving}
        submitLabel={bulkPlan && !bulkErr
          ? `Create ${bulkPlan.classesToCreate} classes · ${bulkPlan.sectionsToCreate} sections`
          : 'Create'}
      >
        <Input label="From class" value={bulk.fromClass} onChange={v => setBulkField('fromClass', v)} keyboardType="numeric" />
        <Input label="To class" value={bulk.toClass} onChange={v => setBulkField('toClass', v)} keyboardType="numeric" />
        <Input label="Sections per class" value={bulk.sectionsPerClass} onChange={v => setBulkField('sectionsPerClass', v)} keyboardType="numeric" />
        <Input label="Seats per section" value={bulk.capacity} onChange={v => setBulkField('capacity', v)} keyboardType="numeric" />

        <Text style={cs.bulkNote}>
          Sections are named A, B, C… in order. Classes already in this academic year keep their name,
          grade and students — only their missing sections are added, so running the same range twice
          changes nothing the second time.
        </Text>

        {bulkErr ? (
          <Text style={cs.bulkErr}>{bulkErr}</Text>
        ) : bulkPlan ? (
          <>
            <Text style={cs.bulkSummary}>
              {bulkPlan.classesToCreate} new class(es) and {bulkPlan.sectionsToCreate} new section(s).
              {bulkPlan.classesExisting > 0
                ? ` ${bulkPlan.classesExisting} class(es) and ${bulkPlan.sectionsExisting} section(s) already exist and are left alone.`
                : ''}
            </Text>
            {(bulkPlan.plan ?? []).map((row: any) => (
              <View key={row.classNumber} style={cs.bulkRow}>
                <Text style={cs.bulkRowName}>
                  {row.className}{row.classExists ? ' · exists' : ''}
                </Text>
                <Text style={[cs.bulkRowAdd, row.skipped ? { color: Colors.danger } : null]}>
                  {row.skipped
                    ? row.skipped
                    : row.sectionsToAdd.length ? `+ ${row.sectionsToAdd.join(', ')}` : 'nothing to add'}
                </Text>
              </View>
            ))}
          </>
        ) : null}
      </FormModal>

      <FormModal
        visible={!!multiFor}
        title={`Add Sections — ${multiFor?.className ?? ''}`}
        onClose={() => setMultiFor(null)}
        onSubmit={submitMulti}
        submitting={saving}
        submitLabel={multiPlan && !multiErr ? `Add ${multiPlan.toCreate.join(', ')}` : 'Add'}
      >
        <Input label="How many to add" value={multi.count} onChange={v => setMultiField('count', v)} keyboardType="numeric" />
        <Input label="Seats per section" value={multi.capacity} onChange={v => setMultiField('capacity', v)} keyboardType="numeric" />

        {multiErr ? (
          <Text style={cs.bulkErr}>{multiErr}</Text>
        ) : multiPlan ? (
          <>
            {multiPlan.existing.length > 0 && (
              <Text style={cs.bulkNote}>Already here: {multiPlan.existing.join(', ')}</Text>
            )}
            <Text style={cs.bulkSummary}>
              Will create {multiPlan.toCreate.join(', ')} at {multiPlan.capacity} seats each.
            </Text>
          </>
        ) : null}
      </FormModal>

      <FormModal visible={!!sectionForm} title="Add Section" onClose={() => setSectionForm(null)} onSubmit={submitSection} submitting={saving} submitLabel="Create Section">
        <Input label="Section Name *" value={sectionForm?.name ?? ''} onChange={v => setSectionForm(f => f ? { ...f, name: v } : f)} placeholder="e.g. A" />
        <Input label="Capacity" value={sectionForm?.capacity ?? ''} onChange={v => setSectionForm(f => f ? { ...f, capacity: v } : f)} placeholder="40" keyboardType="numeric" />
      </FormModal>
    </>
  );
}

const cs = StyleSheet.create({
  bulkNote:    { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginBottom: Spacing.sm },
  bulkErr:     { fontSize: 12, color: Colors.danger, lineHeight: 18, marginBottom: Spacing.sm },
  bulkSummary: { fontSize: 12, color: Colors.text, lineHeight: 18, marginBottom: Spacing.sm, fontWeight: '600' },
  bulkRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm,
    paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  bulkRowName: { fontSize: 12, color: Colors.text },
  bulkRowAdd:  { fontSize: 12, color: Colors.textSecondary, flexShrink: 1, textAlign: 'right' },

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
  shuffleRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  shuffleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, flex: 1,
    backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 9,
  },
  shuffleText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  lockBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderWidth: 1, borderColor: Colors.warning, borderRadius: Radius.md,
    paddingVertical: 9, paddingHorizontal: 16,
  },
  lockText: { fontSize: 12, fontWeight: '600', color: Colors.warning },
  lockNote: { fontSize: 11, color: Colors.success, marginTop: 8, lineHeight: 16 },
});
