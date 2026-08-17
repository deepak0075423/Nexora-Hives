import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as fb from '@/api/feedback.api';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { unwrap, LoaderView, Card, Badge, Empty, fmtDate } from '@/components/ui/kit';

const LABELS: Record<number, string> = { 1: 'Poor', 2: 'Needs Improvement', 3: 'Average', 4: 'Good', 5: 'Excellent' };
const Stars = ({ v }: { v: number }) => (
  <Text style={{ color: '#F59E0B', letterSpacing: 1 }}>
    {[1, 2, 3, 4, 5].map((n) => (n <= v ? '★' : '☆')).join('')}
  </Text>
);

// Read-only replay of a submitted feedback. Locked, but always readable by the
// student who wrote it.
export default function FeedbackViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<any>(undefined);

  useEffect(() => {
    if (!id) return;
    fb.getMySubmission(String(id)).then((r) => setData(unwrap(r))).catch(() => setData(null));
  }, [id]);

  if (data === undefined) return <><Stack.Screen options={{ title: 'My Feedback' }} /><LoaderView /></>;
  if (!data) {
    return (
      <>
        <Stack.Screen options={{ title: 'My Feedback' }} />
        <View style={s.root}><Empty icon="alert-circle-outline" text="This feedback is not available." /></View>
      </>
    );
  }

  const a = data.assignment;
  const answered = (data.answers || []).filter(
    (q: any) => q.ratingValue != null || q.textResponse || q.selectedOptions?.length,
  );

  return (
    <>
      <Stack.Screen options={{ title: 'My Feedback' }} />
      <ScrollView style={s.root} contentContainerStyle={{ padding: Spacing.md, paddingBottom: 60 }}>
        <Card>
          <Text style={s.teacher}>{a.teacher?.name}</Text>
          <Text style={s.meta}>{[a.subject, a.className, a.sectionName].filter(Boolean).join(' · ')}</Text>
          <View style={s.badges}>
            <Badge label="Completed" tone="success" />
            {data.campaign?.isAnonymous && <Badge label="Anonymous" tone="info" />}
          </View>
          <Text style={s.meta}>Submitted {fmtDate(a.submittedAt)}</Text>
          {a.overallRating != null && (
            <View style={s.overall}>
              <Text style={s.overallValue}>{Number(a.overallRating).toFixed(1)}</Text>
              <Text style={s.overallUnit}>/ 5.0</Text>
              <View style={{ marginLeft: 8 }}><Stars v={Math.round(a.overallRating)} /></View>
            </View>
          )}
        </Card>

        {answered.map((q: any) => (
          <Card key={q._id}>
            <Text style={s.question}>{q.questionText}</Text>
            {q.ratingValue != null && (
              <View style={s.answerRow}>
                <Stars v={q.ratingValue} />
                <Text style={s.answerText}>{q.ratingValue} — {LABELS[q.ratingValue]}</Text>
              </View>
            )}
            {!!q.selectedOptions?.length && (
              <View style={s.chips}>
                {q.selectedOptions.map((o: string) => <Badge key={o} label={o} tone="info" />)}
              </View>
            )}
            {!!q.textResponse && q.ratingValue == null && <Text style={s.comment}>{q.textResponse}</Text>}
          </Card>
        ))}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  teacher: { ...Typography.h4, color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  overall: { flexDirection: 'row', alignItems: 'baseline', marginTop: 12 },
  overallValue: { fontSize: 30, fontWeight: '700', color: Colors.success },
  overallUnit: { fontSize: 13, color: Colors.textSecondary, marginLeft: 4 },
  question: { fontSize: 13, fontWeight: '600', color: Colors.text },
  answerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  answerText: { fontSize: 12, color: Colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  comment: { fontSize: 13, color: Colors.text, marginTop: 8, lineHeight: 19 },
});
