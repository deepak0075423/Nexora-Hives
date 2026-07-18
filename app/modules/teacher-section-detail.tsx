import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TextInput, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as teacherApi from '@/api/teacher.api';
import { unwrap, LoaderView, Empty, RowItem, SegTabs, Card, KV, fmtDate } from '@/components/ui/kit';

export default function TeacherSectionDetailScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('students');
  const [q, setQ] = useState('');

  const load = async () => {
    if (!id) return;
    try { setData(unwrap(await teacherApi.getSectionDetail(id))); setError(''); }
    catch (err: any) { setError(err.message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, [id]);

  const section = data?.section;
  const students: any[] = (section?.enrolledStudents ?? [])
    .filter((s: any) => s && typeof s === 'object')
    .filter((s: any) => !q || s.name?.toLowerCase().includes(q.toLowerCase()));
  const subjectTeachers: any[] = data?.subjectTeachers ?? [];
  const announcements: any[] = data?.announcements ?? [];

  return (
    <>
      <Stack.Screen options={{ title: (title as string) || 'Section' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : error ? (
          <Empty icon="alert-circle-outline" text={error} />
        ) : (
          <>
            <Card>
              <KV label="Class" value={`${section?.class?.className ?? ''} · Section ${section?.sectionName ?? ''}`} />
              <KV label="Class Teacher" value={section?.classTeacher?.name ?? 'Not assigned'} />
              <KV label="Substitute / Vice Teacher" value={section?.substituteTeacher?.name ?? 'Not assigned'} />
              <KV label="Students" value={`${students.length}${section?.maxStudents ? ` / ${section.maxStudents}` : ''}`} />
              {(section?.startTime || section?.totalPeriods) ? (
                <KV label="Timing" value={`${section?.startTime ?? ''}${section?.endTime ? ` – ${section.endTime}` : ''}${section?.totalPeriods ? ` · ${section.totalPeriods} periods` : ''}`} />
              ) : null}
            </Card>

            <SegTabs
              tabs={[
                { key: 'students', label: `Students (${students.length})` },
                { key: 'subjects', label: `Subjects (${subjectTeachers.length})` },
                { key: 'announcements', label: 'Announcements' },
              ]}
              active={tab} onChange={setTab}
            />

            {tab === 'students' && (
              <>
                <View style={ts.searchBox}>
                  <Ionicons name="search-outline" size={16} color={Colors.textLight} />
                  <TextInput style={ts.searchInput} placeholder="Search students…"
                    placeholderTextColor={Colors.textLight} value={q} onChangeText={setQ} />
                </View>
                {students.length === 0 ? <Empty icon="school-outline" text="No students enrolled" /> :
                  students.map((st: any, i: number) => (
                    <RowItem key={i}
                      icon="person" iconColor={Colors.success} iconBg={Colors.successLight}
                      title={st.name}
                      sub={`${st.email ?? ''}${st.rollNumber ? ` · Roll ${st.rollNumber}` : ''}${st.gender ? ` · ${st.gender}` : ''}`}
                    />
                  ))}
              </>
            )}

            {tab === 'subjects' && (
              subjectTeachers.length === 0 ? <Empty icon="book-outline" text="No subject teachers assigned" /> :
              subjectTeachers.map((sst: any, i: number) => (
                <RowItem key={i}
                  icon="book" iconColor={Colors.warning} iconBg={Colors.warningLight}
                  title={sst.subject?.subjectName ?? 'Subject'}
                  sub={sst.teacher?.name ?? '--'}
                />
              ))
            )}

            {tab === 'announcements' && (
              announcements.length === 0 ? <Empty icon="megaphone-outline" text="No announcements" /> :
              announcements.map((a: any, i: number) => (
                <Card key={i}>
                  <Text style={ts.annText}>{a.message ?? a.content ?? ''}</Text>
                  {a.createdAt && <Text style={ts.annDate}>{fmtDate(a.createdAt)}</Text>}
                </Card>
              ))
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const ts = StyleSheet.create({
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, height: 42, marginBottom: Spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 13, color: Colors.text, paddingVertical: 0 },
  annText: { ...Typography.body, color: Colors.text, lineHeight: 20 },
  annDate: { fontSize: 10, color: Colors.textLight, marginTop: 6 },
});
