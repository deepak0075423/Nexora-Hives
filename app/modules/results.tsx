import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as studentApi from '@/api/student.api';
import * as parentApi from '@/api/parent.api';
import * as teacherApi from '@/api/teacher.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Badge, Empty, fmtDate, MODULE_BLOCKED_CODES } from '@/components/ui/kit';

const GRADE_COLOR: Record<string, string> = {
  'A+': '#059669', A: '#16A34A', 'B+': '#4ADE80', B: '#86EFAC',
  'C+': '#D97706', C: '#F59E0B', D: '#EF4444', F: '#DC2626',
};

export default function ResultsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  // Teacher sees marks-entry tasks + class tests; students/parents see published results
  const [teacherTasks, setTeacherTasks] = useState<any[]>([]);
  const [classTests, setClassTests] = useState<any[]>([]);

  const load = async () => {
    try {
      if (user?.role === 'teacher') {
        const [tasks, tests]: any[] = await Promise.all([
          teacherApi.getMarksEntry().catch(() => null),
          teacherApi.getClassTests().catch(() => null),
        ]);
        setTeacherTasks((tasks as any)?.data ?? []);
        setClassTests((tests as any)?.data ?? []);
      } else {
        const res: any = user?.role === 'parent'
          ? await parentApi.getResults()
          : await studentApi.getResults();
        setResults((res as any)?.data ?? res ?? []);
      }
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    }
    finally { setLoading(false); setRefreshing(false); }
  };

  // Wait for the user record — firing before role is known would hit the wrong role's API
  useEffect(() => { if (user?.role) load(); }, [user?.role]);
  const onRefresh = () => { setRefreshing(true); load(); };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Results' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Results' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : user?.role === 'teacher' ? (
          <>
            <Text style={s.groupLabel}>Marks Entry Tasks</Text>
            <Text style={s.note}>Enter and submit marks from the web portal. This list shows what is pending on you.</Text>
            {teacherTasks.length === 0 ? (
              <Empty icon="checkmark-done-outline" text="No marks-entry tasks assigned" />
            ) : teacherTasks.map((t: any) => (
              <View key={t._id} style={s.card}>
                <View style={s.cardHeader}>
                  <View style={s.examIcon}>
                    <Ionicons name="create" size={18} color={Colors.primary} />
                  </View>
                  <View style={s.examInfo}>
                    <Text style={s.examName}>{t.name ?? t.examName ?? 'Exam'}</Text>
                    <Text style={s.examDate}>
                      {t.section?.sectionName ? `Section ${t.section.sectionName} · ` : ''}
                      {(t.mySubjects ?? []).map((sub: any) => sub?.subjectName ?? sub?.name).filter(Boolean).join(', ')}
                    </Text>
                  </View>
                  <Badge label={String(t.status ?? '').replace('_', ' ').toLowerCase()} />
                </View>
              </View>
            ))}
            <Text style={[s.groupLabel, { marginTop: Spacing.md }]}>My Class Tests</Text>
            {classTests.length === 0 ? (
              <Empty icon="clipboard-outline" text="No class tests yet" />
            ) : classTests.map((t: any) => (
              <View key={t._id} style={s.card}>
                <View style={s.cardHeader}>
                  <View style={s.examIcon}>
                    <Ionicons name="clipboard" size={18} color={Colors.primary} />
                  </View>
                  <View style={s.examInfo}>
                    <Text style={s.examName}>{t.title ?? t.name ?? 'Class Test'}</Text>
                    <Text style={s.examDate}>
                      {t.subject?.subjectName ? `${t.subject.subjectName} · ` : ''}{fmtDate(t.testDate ?? t.date ?? t.createdAt)}
                    </Text>
                  </View>
                  {t.maxMarks != null && <Text style={s.examDate}>/{t.maxMarks}</Text>}
                </View>
              </View>
            ))}
          </>
        ) : results.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="bar-chart-outline" size={48} color={Colors.textLight} />
            <Text style={s.emptyText}>No results available</Text>
          </View>
        ) : (
          results.map((r: any, i: number) => {
            const grade = r.overallGrade ?? r.grade;
            return (
              <TouchableOpacity
                key={i} style={s.card} activeOpacity={0.7}
                onPress={() => r._id && router.push({ pathname: '/modules/result-detail', params: { id: r._id } } as any)}
              >
                <View style={s.cardHeader}>
                  <View style={s.examIcon}>
                    <Ionicons name="document-text" size={18} color={Colors.primary} />
                  </View>
                  <View style={s.examInfo}>
                    <Text style={s.examName}>{r.examName ?? r.name ?? 'Exam'}</Text>
                    <Text style={s.examDate}>
                      {r.date ? new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                    </Text>
                  </View>
                  {grade && (
                    <Text style={[s.grade, { color: GRADE_COLOR[grade] ?? Colors.primary }]}>{grade}</Text>
                  )}
                </View>
                {(r.subjects ?? r.marks) && (
                  <View style={s.subjects}>
                    {(r.subjects ?? r.marks ?? []).slice(0, 4).map((sub: any, j: number) => (
                      <View key={j} style={s.subRow}>
                        <Text style={s.subName}>{sub.subject?.name ?? sub.subjectName ?? sub.name ?? `Subject ${j+1}`}</Text>
                        <Text style={s.subScore}>
                          {sub.obtainedMarks ?? sub.marks ?? 'â€”'}/{sub.totalMarks ?? sub.maxMarks ?? 'â€”'}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                {r.percentage != null && (
                  <View style={s.pctRow}>
                    <View style={[s.pctBar, { width: `${Math.min(r.percentage, 100)}%` as any }]} />
                    <Text style={s.pctLabel}>{r.percentage}%</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', paddingTop: 80 },
  groupLabel: { ...Typography.h4, color: Colors.text, marginBottom: 6 },
  note: { fontSize: 11, color: Colors.textSecondary, marginBottom: 10 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { ...Typography.body, color: Colors.textSecondary },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  examIcon: {
    width: 38, height: 38, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  examInfo: { flex: 1 },
  examName: { ...Typography.h4, color: Colors.text },
  examDate: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  grade: { fontSize: 24, fontWeight: '700' },
  subjects: { borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: 10 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  subName: { ...Typography.body, color: Colors.text },
  subScore: { ...Typography.body, color: Colors.textSecondary },
  pctRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pctBar: { height: 4, borderRadius: 2, backgroundColor: Colors.primary },
  pctLabel: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
});
