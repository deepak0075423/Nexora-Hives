import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as studentApi from '@/api/student.api';

const GRADE_COLOR: Record<string, string> = {
  'A+': '#059669', A: '#16A34A', 'B+': '#16A34A', B: '#4ADE80',
  'C+': '#D97706', C: '#F59E0B', D: '#EF4444', F: '#DC2626',
};

export default function ExamResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res: any = await studentApi.getExamResult(id);
        setData((res as any)?.data ?? res);
      } catch { /* empty */ }
      finally { setLoading(false); }
    })();
  }, [id]);

  const answers: any[] = data?.answers ?? data?.questions ?? [];
  const grade = data?.grade ?? data?.overallGrade;
  const correct   = answers.filter((a: any) => a.isCorrect === true).length;
  const incorrect = answers.filter((a: any) => a.isCorrect === false).length;
  const unattempted = answers.filter((a: any) => a.isCorrect === undefined || a.isCorrect === null).length;

  return (
    <>
      <Stack.Screen options={{ title: 'Exam Result', headerBackVisible: false }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : !data ? (
          <View style={s.center}><Text style={s.emptyText}>Result not available</Text></View>
        ) : (
          <>
            {/* Score card */}
            <View style={s.scoreCard}>
              <Text style={s.examTitle}>{data.exam?.title ?? data.title ?? 'Exam Result'}</Text>
              {grade && (
                <Text style={[s.grade, { color: GRADE_COLOR[grade] ?? '#fff' }]}>{grade}</Text>
              )}
              <Text style={s.scoreLine}>
                {data.obtainedMarks ?? data.score ?? '--'} / {data.totalMarks ?? data.exam?.totalMarks ?? '--'}
              </Text>
              {data.percentage != null && (
                <Text style={s.pct}>{data.percentage}%</Text>
              )}

              {/* Stats row */}
              <View style={s.statsRow}>
                <StatBox label="Correct" value={correct} color={Colors.success} />
                <StatBox label="Wrong" value={incorrect} color={Colors.danger} />
                <StatBox label="Skipped" value={unattempted} color={Colors.textLight} />
              </View>
            </View>

            {/* Done button */}
            <TouchableOpacity style={s.doneBtn} onPress={() => router.replace('/(tabs)' as any)}>
              <Text style={s.doneBtnText}>Back to Home</Text>
            </TouchableOpacity>

            {/* Answer review */}
            {answers.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Answer Review</Text>
                {answers.map((a: any, i: number) => {
                  const isCorrect = a.isCorrect === true;
                  const isWrong   = a.isCorrect === false;
                  return (
                    <View key={i} style={[s.ansCard, isCorrect && s.ansCorrect, isWrong && s.ansWrong]}>
                      <View style={s.ansTop}>
                        <Text style={s.ansNum}>Q{i + 1}</Text>
                        <View style={[s.ansBadge, { backgroundColor: isCorrect ? Colors.successLight : isWrong ? Colors.dangerLight : Colors.surfaceAlt }]}>
                          <Ionicons
                            name={isCorrect ? 'checkmark-circle' : isWrong ? 'close-circle' : 'remove-circle-outline'}
                            size={14}
                            color={isCorrect ? Colors.success : isWrong ? Colors.danger : Colors.textLight}
                          />
                          <Text style={[s.ansBadgeText, { color: isCorrect ? Colors.success : isWrong ? Colors.danger : Colors.textLight }]}>
                            {isCorrect ? 'Correct' : isWrong ? 'Incorrect' : 'Skipped'}
                          </Text>
                        </View>
                      </View>

                      <Text style={s.ansQuestion}>{a.question?.text ?? a.questionText ?? a.question ?? ''}</Text>

                      {a.selectedOption && (
                        <View style={s.ansRow}>
                          <Text style={s.ansLabel}>Your answer: </Text>
                          <Text style={[s.ansValue, { color: isCorrect ? Colors.success : Colors.danger }]}>{a.selectedOption}</Text>
                        </View>
                      )}
                      {a.correctOption && !isCorrect && (
                        <View style={s.ansRow}>
                          <Text style={s.ansLabel}>Correct answer: </Text>
                          <Text style={[s.ansValue, { color: Colors.success }]}>{a.correctOption}</Text>
                        </View>
                      )}
                      {a.explanation && (
                        <Text style={s.explanation}>{a.explanation}</Text>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={s.statBox}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', paddingTop: 80 },
  emptyText: { ...Typography.body, color: Colors.textSecondary },
  scoreCard: {
    backgroundColor: Colors.primary, borderRadius: Radius.xl,
    padding: Spacing.lg, marginBottom: Spacing.md, alignItems: 'center',
  },
  examTitle: { fontSize: 16, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 8 },
  grade: { fontSize: 48, fontWeight: '800', marginVertical: 4 },
  scoreLine: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 2 },
  pct: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: Spacing.md },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  statBox: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.md, paddingHorizontal: 20, paddingVertical: 10 },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  doneBtn: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    paddingVertical: 12, alignItems: 'center', marginBottom: Spacing.lg,
    borderWidth: 1.5, borderColor: Colors.primary,
  },
  doneBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  sectionLabel: { ...Typography.h4, color: Colors.text, marginBottom: 10 },
  ansCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: 10,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  ansCorrect: { borderColor: Colors.success },
  ansWrong: { borderColor: Colors.danger },
  ansTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  ansNum: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase' },
  ansBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  ansBadgeText: { fontSize: 11, fontWeight: '600' },
  ansQuestion: { fontSize: 14, fontWeight: '600', color: Colors.text, lineHeight: 20, marginBottom: 8 },
  ansRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  ansLabel: { fontSize: 12, color: Colors.textSecondary },
  ansValue: { fontSize: 12, fontWeight: '600' },
  explanation: { marginTop: 6, fontSize: 12, color: Colors.textSecondary, lineHeight: 18, fontStyle: 'italic' },
});
