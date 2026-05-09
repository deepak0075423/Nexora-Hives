import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as studentApi from '@/api/student.api';
import * as parentApi from '@/api/parent.api';

const GRADE_COLOR: Record<string, string> = {
  'A+': '#059669', A: '#16A34A', 'B+': '#16A34A', B: '#4ADE80',
  'C+': '#D97706', C: '#F59E0B', D: '#EF4444', F: '#DC2626',
};

export default function ResultDetailScreen() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res: any = user?.role === 'parent'
          ? await parentApi.getResultDetail(id)
          : await studentApi.getResultDetail(id);
        setData((res as any)?.data ?? res);
      } catch { /* empty */ }
      finally { setLoading(false); }
    })();
  }, [id]);

  const subjects: any[] = data?.subjects ?? data?.marks ?? [];
  const grade = data?.overallGrade ?? data?.grade;

  return (
    <>
      <Stack.Screen options={{ title: 'Result Detail' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : !data ? (
          <View style={s.center}><Text style={s.emptyText}>Result not found</Text></View>
        ) : (
          <>
            {/* Header */}
            <View style={s.header}>
              <Text style={s.examName}>{data.examName ?? data.name ?? 'Exam Result'}</Text>
              {data.date && (
                <Text style={s.examDate}>
                  {new Date(data.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              )}
              {grade && (
                <Text style={[s.grade, { color: GRADE_COLOR[grade] ?? Colors.primary }]}>{grade}</Text>
              )}
              {data.percentage != null && (
                <Text style={s.pct}>{data.percentage}% overall</Text>
              )}
            </View>

            {/* Subject breakdown */}
            {subjects.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Subject Marks</Text>
                {subjects.map((sub: any, i: number) => {
                  const obtained = sub.obtainedMarks ?? sub.marks ?? 0;
                  const total = sub.totalMarks ?? sub.maxMarks ?? 100;
                  const pct = total > 0 ? Math.round((obtained / total) * 100) : 0;
                  const subGrade = sub.grade ?? sub.letterGrade;
                  return (
                    <View key={i} style={s.card}>
                      <View style={s.cardLeft}>
                        <Text style={s.subName}>{sub.subject?.name ?? sub.subjectName ?? sub.name ?? `Subject ${i + 1}`}</Text>
                        {sub.teacherName && <Text style={s.subTeacher}>{sub.teacherName}</Text>}
                      </View>
                      <View style={s.cardRight}>
                        <Text style={s.score}>{obtained}/{total}</Text>
                        <Text style={s.pctSmall}>{pct}%</Text>
                        {subGrade && (
                          <Text style={[s.subGrade, { color: GRADE_COLOR[subGrade] ?? Colors.primary }]}>{subGrade}</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            {/* Remarks */}
            {data.remarks && (
              <View style={s.remarks}>
                <Text style={s.remarksLabel}>Remarks</Text>
                <Text style={s.remarksText}>{data.remarks}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', paddingTop: 80 },
  emptyText: { ...Typography.body, color: Colors.textSecondary },
  header: {
    backgroundColor: Colors.primary, borderRadius: Radius.xl,
    padding: Spacing.lg, marginBottom: Spacing.lg, alignItems: 'center',
  },
  examName: { fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 4 },
  examDate: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 8 },
  grade: { fontSize: 40, fontWeight: '700', marginVertical: 4 },
  pct: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  sectionLabel: { ...Typography.h4, color: Colors.text, marginBottom: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: Spacing.md, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardLeft: { flex: 1 },
  cardRight: { alignItems: 'flex-end' },
  subName: { ...Typography.label, color: Colors.text },
  subTeacher: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  score: { fontSize: 16, fontWeight: '700', color: Colors.text },
  pctSmall: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  subGrade: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  remarks: {
    marginTop: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  remarksLabel: { ...Typography.label, color: Colors.textSecondary, marginBottom: 6 },
  remarksText: { ...Typography.body, color: Colors.text, lineHeight: 22 },
});
