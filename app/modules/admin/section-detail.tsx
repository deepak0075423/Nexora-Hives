import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
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
  const [subjects, setSubjects] = useState<any[]>([]);

  const [showTeacherForm, setShowTeacherForm] = useState(false);
  const [teacherRole, setTeacherRole] = useState<'class' | 'vice'>('class');
  const [teacherId, setTeacherId] = useState('');
  const [showAssignStudent, setShowAssignStudent] = useState(false);
  const [studentQ, setStudentQ] = useState('');
  const [studentResults, setStudentResults] = useState<any[]>([]);
  const [showAssignSubject, setShowAssignSubject] = useState(false);
  const [subjForm, setSubjForm] = useState({ subjectId: '', teacherId: '' });
  const [saving, setSaving] = useState(false);

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
      const [t, s]: any[] = await Promise.all([
        adminApi.getTeachers({ page: 1, limit: 200 }),
        adminApi.getSubjects(),
      ]);
      setTeachers(unwrap(t)?.data ?? []);
      setSubjects(unwrap(s) ?? []);
    } catch {}
  };
  useEffect(() => { loadPickers(); }, []);

  const teacherOptions = useMemo(
    () => teachers.map((t: any) => ({ label: `${t.name} (${t.email})`, value: t._id })), [teachers]);
  const subjectOptions = useMemo(
    () => subjects.map((s: any) => ({ label: s.subjectName, value: s._id })), [subjects]);

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

  const openTeacherForm = (role: 'class' | 'vice') => {
    setTeacherRole(role);
    setTeacherId(role === 'class' ? section?.classTeacher?._id ?? '' : section?.substituteTeacher?._id ?? '');
    setShowTeacherForm(true);
  };

  const searchStudents = async () => {
    try {
      const d = unwrap(await adminApi.getStudents({ page: 1, limit: 15, search: studentQ }));
      setStudentResults(d?.data ?? []);
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  const assignStudent = async (studentId: string) => {
    try {
      await adminApi.assignStudentToSection(id!, studentId);
      setShowAssignStudent(false); setStudentQ(''); setStudentResults([]);
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  const removeStudent = async (st: any) => {
    if (!(await confirmAsync('Remove Student', `Remove ${st.name} from this section?`, 'Remove'))) return;
    try { await adminApi.removeStudentFromSection(id!, st._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const assignSubjectTeacher = async () => {
    if (!subjForm.subjectId || !subjForm.teacherId) return Alert.alert('Required', 'Pick both subject and teacher');
    setSaving(true);
    try {
      await adminApi.assignSectionSubjectTeacher(id!, { subject: subjForm.subjectId, teacher: subjForm.teacherId });
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

  const students = section?.enrolledStudents ?? [];

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
                  <ActionBtn label="+ Enroll Student" tone="success" onPress={() => setShowAssignStudent(true)} />
                </View>
                {students.length === 0 ? <Empty icon="school-outline" text="No students enrolled" /> :
                  students.map((st: any) => (
                    <RowItem key={st._id}
                      icon="person" iconColor={Colors.success} iconBg={Colors.successLight}
                      title={st.name}
                      sub={`${st.email}${st.rollNumber ? ` · Roll ${st.rollNumber}` : ''}`}
                      right={<ActionBtn label="Remove" tone="danger" small onPress={() => removeStudent(st)} />}
                    />
                  ))}
              </>
            ) : (
              <>
                <View style={{ marginBottom: Spacing.sm }}>
                  <ActionBtn label="+ Assign Subject Teacher" tone="success" onPress={() => setShowAssignSubject(true)} />
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

      <FormModal visible={showAssignStudent} title="Enroll Student" onClose={() => setShowAssignStudent(false)}>
        <Input label="Search students" value={studentQ} onChange={setStudentQ} placeholder="Name or email" />
        <ActionBtn label="Search" tone="info" onPress={searchStudents} />
        <View style={{ height: 10 }} />
        {studentResults.map((st: any) => (
          <RowItem key={st._id} title={st.name} sub={`${st.email}${st.className ? ` · ${st.className}` : ''}`}
            onPress={() => assignStudent(st._id)} />
        ))}
      </FormModal>

      <FormModal visible={showAssignSubject} title="Assign Subject Teacher" onClose={() => setShowAssignSubject(false)} onSubmit={assignSubjectTeacher} submitting={saving}>
        <Select label="Subject" value={subjForm.subjectId} onChange={v => setSubjForm(f => ({ ...f, subjectId: v }))} options={subjectOptions} />
        <Select label="Teacher" value={subjForm.teacherId} onChange={v => setSubjForm(f => ({ ...f, teacherId: v }))} options={teacherOptions} />
      </FormModal>
    </>
  );
}
