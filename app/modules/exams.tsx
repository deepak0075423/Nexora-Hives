import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as studentApi from '@/api/student.api';
import * as parentApi from '@/api/parent.api';
import * as teacherApi from '@/api/teacher.api';
import ModuleDisabled from '@/components/ModuleDisabled';

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  upcoming:    { bg: Colors.infoLight,    color: Colors.info,    label: 'Upcoming' },
  live:        { bg: Colors.dangerLight,  color: Colors.danger,  label: 'Live' },
  completed:   { bg: Colors.successLight, color: Colors.success, label: 'Done' },
  not_started: { bg: Colors.warningLight, color: Colors.warning, label: 'Not Started' },
};

export default function ExamsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async () => {
    try {
      let res: any;
      if (user?.role === 'teacher') res = await teacherApi.getExams();
      else if (user?.role === 'parent') res = await parentApi.getExamResults();
      else res = await studentApi.getExams();
      setExams((res as any)?.data ?? res ?? []);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  const handleStart = (exam: any) => {
    if (exam.status === 'live' || exam.status === 'not_started') {
      router.push({ pathname: '/modules/exam-attempt', params: { id: exam._id } } as any);
    } else {
      Alert.alert('Exam not available', 'This exam is not currently live.');
    }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Aptitude Exams' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: user?.role === 'teacher' ? 'Manage Exams' : 'Aptitude Exams' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : exams.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="document-text-outline" size={48} color={Colors.textLight} />
            <Text style={s.emptyText}>No exams available</Text>
          </View>
        ) : (
          exams.map((exam: any, i: number) => {
            const st = STATUS_STYLE[exam.status] ?? STATUS_STYLE.upcoming;
            return (
              <View key={i} style={s.card}>
                <View style={s.cardTop}>
                  <View style={s.iconBox}>
                    <Ionicons name="document-text" size={20} color={Colors.modules.exams.icon} />
                  </View>
                  <View style={s.examInfo}>
                    <Text style={s.examTitle}>{exam.title ?? exam.name ?? 'Exam'}</Text>
                    <Text style={s.examMeta}>
                      {exam.subject?.name ?? exam.subjectName ?? ''}
                      {exam.duration ? `  Â·  ${exam.duration} mins` : ''}
                    </Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: st.bg }]}>
                    <Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>

                {exam.scheduledAt && (
                  <Text style={s.date}>
                    {new Date(exam.scheduledAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}

                {exam.totalQuestions && (
                  <Text style={s.meta}>{exam.totalQuestions} questions Â· {exam.totalMarks ?? '--'} marks</Text>
                )}

                {user?.role === 'student' && (exam.status === 'live' || exam.status === 'not_started') && (
                  <TouchableOpacity style={s.startBtn} onPress={() => handleStart(exam)} activeOpacity={0.85}>
                    <Text style={s.startBtnText}>Start Exam</Text>
                    <Ionicons name="arrow-forward" size={14} color="#fff" />
                  </TouchableOpacity>
                )}

                {user?.role === 'student' && exam.status === 'completed' && (
                  <TouchableOpacity
                    style={s.resultBtn}
                    onPress={() => router.push({ pathname: '/modules/exam-result', params: { id: exam._id } } as any)}
                  >
                    <Text style={s.resultBtnText}>View Result</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', paddingTop: 80 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { ...Typography.body, color: Colors.textSecondary },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  iconBox: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: Colors.modules.exams.bg,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  examInfo: { flex: 1 },
  examTitle: { ...Typography.h4, color: Colors.text },
  examMeta: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  badgeText: { fontSize: 11, fontWeight: '600' },
  date: { fontSize: 11, color: Colors.textSecondary, marginBottom: 4 },
  meta: { fontSize: 11, color: Colors.textLight, marginBottom: 10 },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 10, marginTop: 4,
  },
  startBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  resultBtn: {
    alignItems: 'center', paddingVertical: 10, marginTop: 4,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
  },
  resultBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
});
