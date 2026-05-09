import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Alert, BackHandler,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as studentApi from '@/api/student.api';

export default function ExamAttemptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [exam, setExam]         = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [current, setCurrent]   = useState(0);
  const [answers, setAnswers]   = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res: any = await studentApi.getAttempt(id);
        const d = (res as any)?.data ?? res;
        setExam(d);
        const qs: any[] = d?.questions ?? d?.exam?.questions ?? [];
        setQuestions(qs);

        // Pre-fill any saved answers
        if (d?.savedAnswers) {
          const pre: Record<string, string> = {};
          d.savedAnswers.forEach((a: any) => { if (a.questionId && a.selectedOption) pre[a.questionId] = a.selectedOption; });
          setAnswers(pre);
        }

        // Timer from duration (minutes)
        const durationMins = d?.exam?.duration ?? d?.duration;
        if (durationMins) setTimeLeft(durationMins * 60);
      } catch (err: any) {
        Alert.alert('Error', err?.message ?? 'Failed to load exam');
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft <= 0) { handleSubmit(true); return; }
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t !== null && t <= 1) { clearInterval(timerRef.current!); handleSubmit(true); return 0; }
        return t !== null ? t - 1 : null;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timeLeft !== null]);

  // Block hardware back
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert('Exit Exam?', 'Your progress is saved, but you cannot re-enter once you exit.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Exit', style: 'destructive', onPress: () => router.back() },
      ]);
      return true;
    });
    return () => sub.remove();
  }, []);

  const selectOption = async (questionId: string, option: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: option }));
    try {
      await studentApi.saveAnswer(id!, { questionId, selectedOption: option });
    } catch { /* auto-save; silent fail */ }
  };

  const handleSubmit = async (autoSubmit = false) => {
    if (!autoSubmit) {
      Alert.alert(
        'Submit Exam?',
        `You've answered ${Object.keys(answers).length} of ${questions.length} questions.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Submit', style: 'destructive', onPress: () => doSubmit() },
        ],
      );
    } else {
      doSubmit();
    }
  };

  const doSubmit = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSubmitting(true);
    try {
      await studentApi.submitExam(id!);
      router.replace({ pathname: '/modules/exam-result', params: { id } } as any);
    } catch (err: any) {
      Alert.alert('Submit Failed', err?.message ?? 'Could not submit. Try again.');
      setSubmitting(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const q = questions[current];
  const answered = Object.keys(answers).length;

  return (
    <>
      <Stack.Screen options={{ title: exam?.exam?.title ?? exam?.title ?? 'Exam', headerBackVisible: false }} />

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : questions.length === 0 ? (
        <View style={s.center}><Text style={s.emptyText}>No questions available</Text></View>
      ) : (
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          {/* Top bar */}
          <View style={s.topBar}>
            <View style={s.progress}>
              <Text style={s.progressText}>{current + 1} / {questions.length}</Text>
              <Text style={s.answeredText}>{answered} answered</Text>
            </View>
            {timeLeft !== null && (
              <View style={[s.timer, timeLeft < 60 && s.timerDanger]}>
                <Ionicons name="time-outline" size={14} color={timeLeft < 60 ? Colors.danger : Colors.text} />
                <Text style={[s.timerText, timeLeft < 60 && { color: Colors.danger }]}>{formatTime(timeLeft)}</Text>
              </View>
            )}
          </View>

          {/* Progress bar */}
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${((current + 1) / questions.length) * 100}%` as any }]} />
          </View>

          <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}>
            {/* Question */}
            <View style={s.questionCard}>
              <Text style={s.qNum}>Question {current + 1}</Text>
              <Text style={s.qText}>{q?.question ?? q?.text ?? ''}</Text>
            </View>

            {/* Options */}
            {(q?.options ?? []).map((opt: any, i: number) => {
              const val = typeof opt === 'string' ? opt : opt.text ?? opt.value ?? String(opt);
              const selected = answers[q._id ?? q.id] === val;
              return (
                <TouchableOpacity
                  key={i}
                  style={[s.option, selected && s.optionSelected]}
                  onPress={() => selectOption(q._id ?? q.id, val)}
                  activeOpacity={0.75}
                >
                  <View style={[s.optionDot, selected && s.optionDotSelected]}>
                    {selected && <View style={s.optionDotInner} />}
                  </View>
                  <Text style={[s.optionText, selected && s.optionTextSelected]}>{val}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Bottom nav */}
          <View style={s.bottomNav}>
            <TouchableOpacity
              style={[s.navBtn, current === 0 && s.navBtnDisabled]}
              onPress={() => setCurrent(c => c - 1)}
              disabled={current === 0}
            >
              <Ionicons name="arrow-back" size={18} color={current === 0 ? Colors.textLight : Colors.primary} />
              <Text style={[s.navBtnText, current === 0 && { color: Colors.textLight }]}>Prev</Text>
            </TouchableOpacity>

            {current < questions.length - 1 ? (
              <TouchableOpacity style={s.navBtnPrimary} onPress={() => setCurrent(c => c + 1)}>
                <Text style={s.navBtnPrimaryText}>Next</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.submitBtn} onPress={() => handleSubmit()} disabled={submitting}>
                {submitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.submitBtnText}>Submit Exam</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  emptyText: { ...Typography.body, color: Colors.textSecondary },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 10, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderColor: Colors.border,
  },
  progress: { gap: 2 },
  progressText: { fontSize: 13, fontWeight: '600', color: Colors.text },
  answeredText: { fontSize: 10, color: Colors.textSecondary },
  timer: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surfaceAlt, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
  },
  timerDanger: { backgroundColor: Colors.dangerLight, borderColor: Colors.danger },
  timerText: { fontSize: 13, fontWeight: '700', color: Colors.text },
  progressBar: { height: 3, backgroundColor: Colors.border },
  progressFill: { height: 3, backgroundColor: Colors.primary },
  questionCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  qNum: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  qText: { fontSize: 16, fontWeight: '600', color: Colors.text, lineHeight: 24 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 14, marginBottom: 10,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  optionSelected: { borderColor: Colors.primary, backgroundColor: '#EEF2FF' },
  optionDot: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  optionDotSelected: { borderColor: Colors.primary },
  optionDotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  optionText: { flex: 1, fontSize: 14, color: Colors.text },
  optionTextSelected: { fontWeight: '600', color: Colors.primary },
  bottomNav: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: 10, padding: Spacing.md,
    backgroundColor: Colors.surface, borderTopWidth: 1, borderColor: Colors.border,
  },
  navBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  navBtnDisabled: { borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  navBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  navBtnPrimary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.primary,
  },
  navBtnPrimaryText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  submitBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.success,
  },
  submitBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
