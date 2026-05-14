import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as studentApi from '@/api/student.api';
import * as teacherApi from '@/api/teacher.api';
import * as parentApi from '@/api/parent.api';

const GRADE_COLOR: Record<string, string> = {
  'A+': Colors.success, A: Colors.success,
  'B+': '#16A34A', B: '#4ADE80',
  'C+': Colors.warning, C: Colors.warning,
  D: Colors.danger, F: Colors.danger,
};

export default function StatsScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [results, setResults] = useState<any[]>([]);
  const [classTests, setClassTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [tab, setTab] = useState<'formal' | 'tests'>('formal');

  const load = async () => {
    try {
      let res: any, ct: any;
      if (user?.role === 'teacher') {
        res = await teacherApi.getMarksEntry();
        ct = await teacherApi.getClassTests();
      } else if (user?.role === 'parent') {
        res = await parentApi.getResults();
        ct = await parentApi.getClassTests();
      } else {
        res = await studentApi.getResults();
        ct = await studentApi.getClassTests();
      }
      setResults((res as any)?.data ?? res ?? []);
      setClassTests((ct as any)?.data ?? ct ?? []);
    } catch { /* empty state */ }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  const title = user?.role === 'teacher' ? 'Results & Marks' : 'My Results';
  const items = tab === 'formal' ? results : classTests;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>{title}</Text>
      </View>

      <View style={s.tabs}>
        {(['formal', 'tests'] as const).map((t) => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t === 'formal' ? 'Exams' : 'Class Tests'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : items.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="bar-chart-outline" size={48} color={Colors.textLight} />
            <Text style={s.emptyText}>No results yet</Text>
          </View>
        ) : (
          <View style={{ padding: Spacing.md, paddingTop: 0 }}>
            {items.map((item: any, i: number) => {
              const grade = item.grade ?? item.overallGrade;
              const gradeColor = GRADE_COLOR[grade] ?? Colors.textSecondary;
              return (
                <View key={i} style={s.card}>
                  <View style={s.cardLeft}>
                    <Text style={s.examName}>{item.examName ?? item.name ?? item.testName ?? 'Result'}</Text>
                    <Text style={s.examMeta}>
                      {item.className ?? ''}{item.section ? ` · ${item.section}` : ''}
                      {item.subject?.name ? ` · ${item.subject.name}` : ''}
                    </Text>
                    {item.date && <Text style={s.examDate}>{new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>}
                  </View>
                  <View style={s.cardRight}>
                    {grade && <Text style={[s.grade, { color: gradeColor }]}>{grade}</Text>}
                    {item.totalMarks && (
                      <Text style={s.marks}>{item.obtainedMarks ?? '—'}/{item.totalMarks}</Text>
                    )}
                    {item.percentage != null && <Text style={s.pct}>{item.percentage}%</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.md, paddingBottom: 0 },
  title: { ...Typography.h2, color: Colors.text },
  tabs: { flexDirection: 'row', margin: Spacing.md, marginTop: Spacing.sm, gap: 8 },
  tabBtn: {
    flex: 1, paddingVertical: 9, borderRadius: Radius.md,
    backgroundColor: Colors.surface, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText: { ...Typography.label, color: Colors.textSecondary },
  tabTextActive: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { ...Typography.body, color: Colors.textSecondary },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: Spacing.md, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardLeft: { flex: 1 },
  cardRight: { alignItems: 'flex-end' },
  examName: { ...Typography.h4, color: Colors.text },
  examMeta: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },
  examDate: { fontSize: 11, color: Colors.textLight, marginTop: 4 },
  grade: { fontSize: 22, fontWeight: '700' },
  marks: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  pct: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
});
