import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import {
  unwrap, LoaderView, Empty, RowItem, FormModal, Input, Select, KV,
  ActionBtn, confirmAsync, SectionTitle, SegTabs,
} from '@/components/ui/kit';

export default function AdminSectionDetailScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const [section, setSection] = useState<any>(null);
  const [subjectTeachers, setSubjectTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('students');

  const [teachers, setTeachers] = useState<any[]>([]);
  // teacherId -> { total, bySubject: [{ subject, subjectName, sections }] }
  const [teacherLoad, setTeacherLoad] = useState<Record<string, any>>({});
  const [subjects, setSubjects] = useState<any[]>([]);

  // Capacity — editable after the section exists, because a class grows and the
  // seat count set on day one stops being true.
  const [showCapacity, setShowCapacity] = useState(false);
  const [capValue, setCapValue] = useState('');
  const [capErr, setCapErr] = useState('');

  const [showTeacherForm, setShowTeacherForm] = useState(false);
  const [teacherRole, setTeacherRole] = useState<'class' | 'vice'>('class');
  const [teacherId, setTeacherId] = useState('');
  // Student picker — multi-select, and the server leaves out anyone already on
  // this section's roster.
  const [showAssignStudent, setShowAssignStudent] = useState(false);
  const [studentQ, setStudentQ] = useState('');
  const [pool, setPool] = useState<any>(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [showTaken, setShowTaken] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [showAssignSubject, setShowAssignSubject] = useState(false);
  const [subjForm, setSubjForm] = useState({ subjectId: '', teacherId: '' });
  // Sibling sections of this class, and the ids this assignment goes to. Hindi
  // in Class 5 is rarely section A alone, so the sheet offers all of them.
  const [siblings, setSiblings] = useState<any[]>([]);
  const [subjSections, setSubjSections] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // Roll numbers: one bulk assignment per section, then manual corrections
  const [rollEdit, setRollEdit] = useState<{ _id: string; name: string; value: string } | null>(null);
  const [rollBusy, setRollBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      const [sec, sst]: any[] = await Promise.all([
        adminApi.getSectionDetail(id),
        adminApi.getSectionSubjectTeachers(id).catch(() => null),
      ]);
      setSection(unwrap(sec));
      setSubjectTeachers(unwrap(sst) ?? []);
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, [id]);

  const loadPickers = async () => {
    try {
      const [t, s, opts]: any[] = await Promise.all([
        adminApi.getTeachers({ page: 1, limit: 200, status: 'active' }),
        adminApi.getSubjects(),
        // Carries each teacher's current load, so the assign list can show it.
        adminApi.getSectionTeacherOptions(id!).catch(() => null),
      ]);
      setTeachers(unwrap(t)?.data ?? []);
      setTeacherLoad(unwrap(opts)?.load ?? {});
      setSubjects(unwrap(s) ?? []);
    } catch {}
  };
  useEffect(() => { loadPickers(); }, []);

  // The other sections of this class, for the multi-section assign picker.
  // Keyed on the class rather than the section, so it survives a section reload.
  useEffect(() => {
    const cid = section?.class;
    if (!cid) return;
    adminApi.getClassDetail(String(cid))
      .then((res: any) => setSiblings(unwrap(res)?.sections ?? []))
      .catch(() => setSiblings([]));
  }, [section?.class]);

  const teacherOptions = useMemo(
    () => teachers.map((t: any) => ({ label: `${t.name} (${t.email})`, value: t._id })), [teachers]);

  /**
   * "Anita Sharma — Computer 1 · Mathematics 1 · total 2"
   *
   * The subject being assigned comes first, so the number that matters for this
   * decision sits right after the name. Someone with nothing yet says so, rather
   * than looking the same as a teacher already carrying eight classes.
   */
  const subjectTeacherOptions = useMemo(() => teachers.map((t: any) => {
    const load = teacherLoad[t._id];
    if (!load?.bySubject?.length) return { label: `${t.name} — no classes yet`, value: t._id };
    const here  = load.bySubject.filter((x: any) => x.subject === subjForm.subjectId);
    const other = load.bySubject.filter((x: any) => x.subject !== subjForm.subjectId);
    const parts = [...here, ...other].map((x: any) => `${x.subjectName} ${x.sections}`);
    return { label: `${t.name} — ${parts.join(' · ')} · total ${load.total}`, value: t._id };
  }), [teachers, teacherLoad, subjForm.subjectId]);
  const subjectOptions = useMemo(
    () => subjects.map((s: any) => ({ label: s.subjectName, value: s._id })), [subjects]);

  // ── Student picker, derived ────────────────────────────────────────────────
  const candidates       = pool?.students ?? [];
  const freeCandidates   = candidates.filter((c: any) => c.assignable);
  const takenCount       = candidates.length - freeCandidates.length;
  // Students another section holds cannot be picked, so they stay out of the
  // way until asked for.
  const visibleCandidates = showTaken ? candidates : freeCandidates;
  const allFreePicked    = freeCandidates.length > 0 && freeCandidates.every((c: any) => picked.includes(c._id));
  // null when the section has no capacity set, which the server reads as unlimited
  const seatsFree        = pool?.seats?.free ?? null;
  const overCapacity     = seatsFree !== null && picked.length > seatsFree;

  const saveTeacher = async () => {
    setSaving(true);
    try {
      // teacherId → classTeacher; viceTeacherId → substituteTeacher
      await adminApi.updateSectionTeacher(id!, teacherRole === 'class' ? { teacherId } : { viceTeacherId: teacherId });
      setShowTeacherForm(false);
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  const openCapacity = () => {
    setCapValue(String(section?.maxStudents ?? 40));
    setCapErr('');
    setShowCapacity(true);
  };

  const saveCapacity = async () => {
    const n = Number(capValue);
    if (!Number.isFinite(n) || n < 1) { setCapErr('Capacity must be a positive number'); return; }
    // Answered here instantly; the server enforces the same rule on the write.
    if (n < students.length) {
      setCapErr(`${students.length} student${students.length === 1 ? ' is' : 's are'} already enrolled — capacity cannot be below that.`);
      return;
    }
    setSaving(true);
    try {
      await adminApi.updateSectionCapacity(id!, n);
      setShowCapacity(false);
      load();
    } catch (err: any) { setCapErr(err.message ?? 'Could not update the capacity'); }
    finally { setSaving(false); }
  };

  const openTeacherForm = (role: 'class' | 'vice') => {
    setTeacherRole(role);
    setTeacherId(role === 'class' ? section?.classTeacher?._id ?? '' : section?.substituteTeacher?._id ?? '');
    setShowTeacherForm(true);
  };

  const loadPool = async (search = '') => {
    setPoolLoading(true);
    try {
      setPool(unwrap(await adminApi.getAssignableStudents(id!, { search: search.trim(), limit: 200 })));
    } catch (err: any) {
      Alert.alert('Error', err.message);
      setPool({ students: [], total: 0 });
    } finally { setPoolLoading(false); }
  };

  const openStudentPicker = () => {
    setShowAssignStudent(true);
    setStudentQ(''); setPicked([]); setShowTaken(false);
    loadPool('');
  };

  const togglePick = (studentId: string) =>
    setPicked(prev => prev.includes(studentId) ? prev.filter(x => x !== studentId) : [...prev, studentId]);

  const enrollPicked = async () => {
    if (!picked.length) return;
    if (overCapacity) {
      return Alert.alert('Not enough seats',
        `This section has ${seatsFree} seat(s) free but ${picked.length} students are selected.`);
    }
    setEnrolling(true);
    try {
      const d: any = unwrap(await adminApi.assignStudentsToSection(id!, picked));
      // A batch usually lands partly — name what did not go in rather than
      // closing on a silent half-result.
      const failed = d?.failed ?? [];
      if (failed.length) {
        Alert.alert(
          d?.enrolled?.length ? 'Partly enrolled' : 'Could not enroll',
          failed.map((f: any) => `${f.name}: ${f.reason}`).join('\n'),
        );
      }
      if (d?.enrolled?.length) {
        setShowAssignStudent(false); setPicked([]);
        load();
      } else {
        setPicked([]);
        loadPool(studentQ);
      }
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setEnrolling(false); }
  };

  const removeStudent = async (st: any) => {
    if (!(await confirmAsync('Remove Student', `Remove ${st.name} from this section?`, 'Remove'))) return;
    try { await adminApi.removeStudentFromSection(id!, st._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const openAssignSubject = () => {
    setSubjForm({ subjectId: '', teacherId: '' });
    setSubjSections([String(id)]);
    setShowAssignSubject(true);
  };

  const toggleSubjSection = (secId: string) => setSubjSections(cur =>
    cur.includes(secId) ? cur.filter(x => x !== secId) : [...cur, secId]);

  /**
   * One section still goes through the single-section endpoint it always did;
   * several go through the class-scoped one, which checks they are all siblings
   * and skips any that already hold this exact subject-and-teacher pairing.
   */
  const assignSubjectTeacher = async () => {
    if (!subjForm.subjectId || !subjForm.teacherId) return Alert.alert('Required', 'Pick both subject and teacher');
    if (!subjSections.length) return Alert.alert('Required', 'Pick at least one section');
    setSaving(true);
    try {
      if (subjSections.length === 1) {
        await adminApi.assignSectionSubjectTeacher(subjSections[0], { subject: subjForm.subjectId, teacher: subjForm.teacherId });
      } else {
        const res: any = await adminApi.assignSubjectToSections(String(section?.class), {
          subject: subjForm.subjectId, teacher: subjForm.teacherId, sectionIds: subjSections,
        });
        const d = unwrap(res);
        Alert.alert('Assigned', d.created
          ? `${d.subjectName} assigned to section(s) ${d.toCreate.join(', ')}.`
          : 'Those sections already had this teacher for this subject.');
      }
      setShowAssignSubject(false); setSubjForm({ subjectId: '', teacherId: '' });
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  const removeSubjectTeacher = async (sst: any) => {
    if (!(await confirmAsync('Remove', `Unassign ${sst.teacher?.name} from ${sst.subject?.subjectName}?`, 'Remove'))) return;
    try { await adminApi.removeSectionSubjectTeacher(id!, sst.subject?._id, sst.teacher?._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const assignRollNumbers = async () => {
    const ok = await confirmAsync(
      'Assign Roll Numbers',
      `Roll numbers 1–${students.length} will be given to the ${students.length} enrolled student${students.length !== 1 ? 's' : ''} in alphabetical name order. This can only be done once — afterwards you can still edit individual roll numbers.`,
      'Assign',
    );
    if (!ok) return;
    setRollBusy(true);
    try {
      const res: any = await adminApi.assignSectionRollNumbers(id!);
      const d = (res as any)?.data ?? res;
      await load();
      Alert.alert('Done', `Roll numbers assigned to ${d?.assigned ?? 0} students`);
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setRollBusy(false); }
  };

  const saveRollNumber = async () => {
    if (!rollEdit) return;
    setRollBusy(true);
    try {
      await adminApi.updateStudentRollNumber(id!, rollEdit._id, rollEdit.value.trim());
      setRollEdit(null);
      await load();   // the student's own record is updated server-side too
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setRollBusy(false); }
  };

  const students = section?.enrolledStudents ?? [];
  const rollsAssigned = !!section?.rollNumbersAssignedAt;

  return (
    <>
      <Stack.Screen options={{ title: (title as string) || 'Section' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : (
          <>
            <KV label="Class Teacher" value={section?.classTeacher ? `${section.classTeacher.name}` : 'Not assigned'} />
            <KV label="Vice / Substitute Teacher" value={section?.substituteTeacher ? `${section.substituteTeacher.name}` : 'Not assigned'} />
            <KV label="Capacity" value={`${students.length}/${section?.maxStudents ?? '--'}`} />
            <View style={{ marginTop: 6 }}>
              <ActionBtn label="Edit capacity" tone="neutral" onPress={openCapacity} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: Spacing.md, marginTop: 6 }}>
              <View style={{ flex: 1 }}>
                <ActionBtn label={section?.classTeacher ? 'Change Class Teacher' : 'Assign Class Teacher'} tone="info"
                  onPress={() => openTeacherForm('class')} />
              </View>
              <View style={{ flex: 1 }}>
                <ActionBtn label={section?.substituteTeacher ? 'Change Vice Teacher' : 'Assign Vice Teacher'} tone="neutral"
                  onPress={() => openTeacherForm('vice')} />
              </View>
            </View>

            <SegTabs
              tabs={[{ key: 'students', label: `Students (${students.length})` }, { key: 'subjects', label: `Subjects (${subjectTeachers.length})` }]}
              active={tab} onChange={setTab}
            />

            {tab === 'students' ? (
              <>
                <View style={{ marginBottom: Spacing.sm }}>
                  <ActionBtn label="+ Enroll Students" tone="success" onPress={openStudentPicker} />
                </View>
                {rollsAssigned ? (
                  <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: Spacing.sm }}>
                    ✓ Roll numbers assigned on {String(section.rollNumbersAssignedAt).slice(0, 10)} — tap a student to edit theirs.
                  </Text>
                ) : students.length > 0 && (
                  <View style={{ marginBottom: Spacing.sm }}>
                    <ActionBtn label={rollBusy ? 'Working…' : 'Assign Roll Numbers'} tone="info" onPress={assignRollNumbers} />
                  </View>
                )}
                {students.length === 0 ? <Empty icon="school-outline" text="No students enrolled" /> :
                  students.map((st: any) => (
                    <RowItem key={st._id}
                      icon="person" iconColor={Colors.success} iconBg={Colors.successLight}
                      // Roll number leads, as on the web section page
                      title={`${st.rollNumber ? `${st.rollNumber}. ` : ''}${st.name}`}
                      sub={st.email}
                      onPress={() => setRollEdit({ _id: st._id, name: st.name, value: st.rollNumber || '' })}
                      right={<ActionBtn label="Remove" tone="danger" small onPress={() => removeStudent(st)} />}
                    />
                  ))}
              </>
            ) : (
              <>
                <View style={{ marginBottom: Spacing.sm }}>
                  <ActionBtn label="+ Assign Subject Teacher" tone="success" onPress={openAssignSubject} />
                </View>
                {subjectTeachers.length === 0 ? <Empty icon="book-outline" text="No subject teachers assigned" /> :
                  subjectTeachers.map((sst: any) => (
                    <RowItem key={sst._id}
                      icon="book" iconColor={Colors.warning} iconBg={Colors.warningLight}
                      title={sst.subject?.subjectName ?? 'Subject'}
                      sub={sst.teacher?.name ?? '--'}
                      right={<ActionBtn label="Remove" tone="danger" small onPress={() => removeSubjectTeacher(sst)} />}
                    />
                  ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      <FormModal
        visible={showTeacherForm}
        title={teacherRole === 'class' ? 'Class Teacher' : 'Vice / Substitute Teacher'}
        onClose={() => setShowTeacherForm(false)} onSubmit={saveTeacher} submitting={saving}
      >
        <Select label="Teacher" value={teacherId} onChange={setTeacherId} options={teacherOptions} />
      </FormModal>

      <FormModal visible={!!rollEdit} title="Update Roll Number" onClose={() => setRollEdit(null)}
        onSubmit={saveRollNumber} submitting={rollBusy} submitLabel="Save">
        <Input label={`Roll number for ${rollEdit?.name ?? ''}`} value={rollEdit?.value ?? ''}
          onChange={v => setRollEdit(r => (r ? { ...r, value: v } : r))} placeholder="e.g. 12" />
        <Text style={{ fontSize: 11, color: Colors.textSecondary, marginTop: 4 }}>
          Must be unique within this section. Leave blank to clear it — the student&rsquo;s record is updated too.
        </Text>
      </FormModal>

      <FormModal
        visible={showAssignStudent}
        title="Enroll Students"
        onClose={() => setShowAssignStudent(false)}
        onSubmit={enrollPicked}
        submitting={enrolling}
        submitLabel={picked.length > 1 ? `Enroll ${picked.length} students` : 'Enroll'}
      >
        <Input label="Search students" value={studentQ} onChange={(v: string) => { setStudentQ(v); loadPool(v); }}
          placeholder="Name or email — or pick from the list" />

        {seatsFree !== null && (
          <Text style={{ fontSize: 11, marginTop: 4, color: overCapacity ? Colors.danger : Colors.textSecondary }}>
            {overCapacity
              ? `Only ${seatsFree} seat${seatsFree === 1 ? '' : 's'} left — ${picked.length} selected.`
              : `${seatsFree} of ${pool?.seats?.capacity} seats free.`}
          </Text>
        )}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '600' }}
            onPress={() => setPicked(allFreePicked ? [] : freeCandidates.map((c: any) => c._id))}>
            {allFreePicked ? 'Clear selection' : `Select all ${freeCandidates.length}`}
          </Text>
          <Text style={{ fontSize: 11, color: Colors.textSecondary }}>
            {picked.length} selected
          </Text>
        </View>

        <View style={{ height: 6 }} />
        {poolLoading ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : visibleCandidates.length === 0 ? (
          <Empty text={studentQ
            ? 'No students match who are not already in this section'
            : 'Every student is already enrolled in a section'} />
        ) : visibleCandidates.map((st: any) => (
          <RowItem
            key={st._id}
            title={st.name}
            sub={`${st.email}${st.admissionNumber ? ` · Adm. ${st.admissionNumber}` : ''}${st.enrolledIn ? ` · in ${st.enrolledIn}` : ''}`}
            icon={picked.includes(st._id) ? 'checkbox' : st.assignable ? 'square-outline' : 'lock-closed-outline'}
            iconColor={st.assignable ? Colors.primary : Colors.textLight}
            onPress={st.assignable ? () => togglePick(st._id) : undefined}
          />
        ))}

        {takenCount > 0 && (
          <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '600', paddingTop: 10 }}
            onPress={() => setShowTaken(v => !v)}>
            {showTaken
              ? 'Hide students enrolled elsewhere'
              : `Show ${takenCount} student${takenCount === 1 ? '' : 's'} enrolled in another section`}
          </Text>
        )}
        {pool?.truncated && (
          <Text style={{ fontSize: 11, color: Colors.textSecondary, paddingTop: 8 }}>
            Showing the first {pool.students.length} of {pool.total} — narrow it down with the search box.
          </Text>
        )}
      </FormModal>

      <FormModal
        visible={showCapacity}
        title={`Capacity — Section ${section?.sectionName ?? ''}`}
        onClose={() => setShowCapacity(false)}
        onSubmit={saveCapacity}
        submitting={saving}
        submitLabel="Save"
      >
        <Input label="Seats" value={capValue} onChange={v => { setCapErr(''); setCapValue(v); }}
          placeholder="40" keyboardType="numeric" />
        {capErr ? <Text style={{ color: Colors.danger, fontSize: 12, marginBottom: 8 }}>{capErr}</Text> : null}
        <Text style={{ fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
          {students.length} student{students.length === 1 ? ' is' : 's are'} enrolled, so the capacity cannot
          go below that — move students out of the section first if you need a smaller number. This is the
          figure the admission wizard and the bulk importer check before seating another student here.
        </Text>
      </FormModal>

      <FormModal visible={showAssignSubject} title="Assign Subject Teacher" onClose={() => setShowAssignSubject(false)} onSubmit={assignSubjectTeacher} submitting={saving}
        submitLabel={subjSections.length > 1 ? `Assign to ${subjSections.length} sections` : 'Assign'}>
        <Select label="Subject" value={subjForm.subjectId} onChange={v => setSubjForm(f => ({ ...f, subjectId: v }))} options={subjectOptions} />
        <Select label="Teacher" value={subjForm.teacherId} onChange={v => setSubjForm(f => ({ ...f, teacherId: v }))} options={subjectTeacherOptions} />

        {/* Ticking several writes the subject to all of them in one action —
            the whole point on a setup day, where Hindi goes to A, B, C and D. */}
        <Text style={ss.subjSecLabel}>Sections</Text>
        <View style={ss.subjSecWrap}>
          {siblings.map((sec: any) => {
            const sid = String(sec._id);
            const on = subjSections.includes(sid);
            return (
              <TouchableOpacity key={sid} onPress={() => toggleSubjSection(sid)}
                style={[ss.subjSecChip, on && ss.subjSecChipOn]}>
                <Text style={[ss.subjSecChipText, on && ss.subjSecChipTextOn]}>
                  {sec.sectionName}{sid === String(id) ? ' · this one' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={ss.subjSecHint}>
          {subjSections.length > 1
            ? `This teacher takes this subject in ${subjSections.length} sections. Any section that already has this exact pairing is left alone.`
            : 'Tap more sections to assign the same subject and teacher to all of them at once.'}
        </Text>
      </FormModal>
    </>
  );
}

const ss = StyleSheet.create({
  subjSecLabel: { fontSize: 13, fontWeight: '500', color: Colors.text, marginBottom: 6 },
  subjSecWrap:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subjSecChip: {
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
    borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14,
  },
  subjSecChipOn:      { borderColor: Colors.accent, backgroundColor: Colors.accent },
  subjSecChipText:    { fontSize: 13, fontWeight: '600', color: Colors.text },
  subjSecChipTextOn:  { color: Colors.textInverse },
  subjSecHint: { fontSize: 11, color: Colors.textSecondary, marginTop: 8, lineHeight: 16 },
});
