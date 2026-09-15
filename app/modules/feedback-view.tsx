/**
 * Student → re-read what I sent.
 *
 * Read-only and forever: locked feedback stays visible to its own author, it
 * just cannot be changed. This is the only screen anywhere that pairs a student
 * with their answers, and it is theirs alone — the server scopes it to them.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as fb from '@/api/feedback.api';
import { Colors } from '@/constants/theme';
import {
  Avatar, Blank, Btn, Loading, NoteBar, Page, Stars, Tag, EMOJI, RATING_LABELS, categoryIcon, fmtDay, useLoad,
} from '@/components/feedback/parts';

export default function FeedbackViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = useLoad<any>(() => fb.getMySubmission(String(id)), [id], { skip: !id });

  if (q.loading) return <><Stack.Screen options={{ title: 'My feedback' }} /><Loading /></>;
  if (q.error || !q.data) {
    return (
      <>
        <Stack.Screen options={{ title: 'My feedback' }} />
        <Page>
          <View style={st.card}>
            <Blank icon="lock-closed-outline" title="This feedback cannot be shown" body={q.error || 'It is not available.'}
              action={<Btn kind="primary" label="Back to my feedback" onPress={() => router.back()} />} />
          </View>
        </Page>
      </>
    );
  }

  const a = q.data.assignment;
  const answered = (q.data.answers || []).filter((x: any) => x.ratingValue != null || x.textResponse || x.selectedOptions?.length);
  const groups = new Map<string, any[]>();
  for (const x of answered) {
    const k = x.categoryName || (['text', 'multiple_choice', 'checkbox'].includes(x.questionType) ? 'A little more' : 'General');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(x);
  }
  const place = [a.className, a.sectionName].filter(Boolean).join(' ');

  return (
    <>
      <Stack.Screen options={{ title: a.teacher?.name || 'My feedback' }} />
      <Page>
        <View style={st.head}>
          <Avatar name={a.teacher?.name} src={a.teacher?.photo} size={54} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.headLabel}>YOUR FEEDBACK TO</Text>
            <Text style={st.headName}>{a.teacher?.name}</Text>
            <Text style={st.headSub}>{[a.subject, place].filter(Boolean).join(' · ')}</Text>
          </View>
          {a.overallRating != null ? (
            <View style={st.score}>
              <Text style={st.scoreV}>{Number(a.overallRating).toFixed(1)}</Text>
              <Stars value={Math.round(a.overallRating)} size={11} />
              <Text style={st.scoreL}>your average</Text>
            </View>
          ) : null}
        </View>
        <View style={st.tags}>
          <Tag label={`Sent ${fmtDay(a.submittedAt)}`} tone="green" icon="checkmark-circle-outline" />
          {q.data.campaign?.name ? <Tag label={q.data.campaign.name} tone="slate" icon="megaphone-outline" /> : null}
          {q.data.campaign?.isAnonymous ? <Tag label="Anonymous" tone="purple" icon="key-outline" /> : null}
        </View>

        {[...groups.entries()].map(([name, qs]) => (
          <View key={name} style={st.qcard}>
            <View style={st.qcardHead}>
              <View style={st.qcardIcon}><Ionicons name={categoryIcon(name)} size={15} color="#7C3AED" /></View>
              <Text style={st.qcardTitle}>{name}</Text>
              <Text style={st.qcardCount}>{qs.length} answer{qs.length === 1 ? '' : 's'}</Text>
            </View>
            {qs.map((x, i) => (
              <View key={x._id} style={[st.ans, i > 0 && st.ansSep]}>
                <Text style={st.ansQ}>{x.questionText}</Text>
                {x.ratingValue != null && x.questionType !== 'yes_no' ? (
                  <View style={st.rateRow}>
                    <View style={st.dots} accessibilityLabel={`${x.ratingValue} out of 5`}>
                      {[1, 2, 3, 4, 5].map((n) => <View key={n} style={[st.dotI, n <= x.ratingValue && st.dotOn]} />)}
                    </View>
                    <Text style={st.rateText}>{EMOJI[x.ratingValue]} {x.ratingValue} · {RATING_LABELS[x.ratingValue]}</Text>
                  </View>
                ) : null}
                {x.questionType === 'yes_no' ? <Tag label={x.textResponse === 'yes' ? 'Yes' : 'No'} tone={x.textResponse === 'yes' ? 'green' : 'slate'} /> : null}
                {x.selectedOptions?.length ? (
                  <View style={st.tags}>{x.selectedOptions.map((o: string) => <Tag key={o} label={o} tone="indigo" />)}</View>
                ) : null}
                {x.textResponse && x.questionType !== 'yes_no' ? (
                  <View style={st.quote}>
                    <Text style={st.quoteText}>
                      {x.questionType !== 'text' ? <Text style={{ color: Colors.textSecondary, fontWeight: '700' }}>Other: </Text> : null}
                      {x.textResponse}
                    </Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ))}

        <NoteBar tone="purple" icon="key-outline" title="Only you can see this page.">
          Your feedback is locked and cannot be edited. Your teacher sees your answers only as part of results combined across many students, never on their own.
        </NoteBar>
      </Page>
    </>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#F5F3FF', borderRadius: 18, borderWidth: 1, borderColor: '#E0E7FF', padding: 14 },
  headLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, color: '#4F46E5' },
  headName: { fontSize: 19, fontWeight: '800', color: Colors.text, letterSpacing: -0.4 },
  headSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  score: { alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: '#E0E7FF', paddingHorizontal: 10, paddingVertical: 7 },
  scoreV: { fontSize: 22, fontWeight: '800', color: Colors.text },
  scoreL: { fontSize: 9.5, color: Colors.textSecondary },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  qcard: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  qcardHead: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#FCFCFF', borderBottomWidth: 1, borderBottomColor: Colors.border },
  qcardIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  qcardTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: Colors.text },
  qcardCount: { fontSize: 11, color: Colors.textSecondary },
  ans: { padding: 14, gap: 8 },
  ansSep: { borderTopWidth: 1, borderTopColor: Colors.divider },
  ansQ: { fontSize: 13.5, fontWeight: '600', color: Colors.text, lineHeight: 19 },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  dots: { flexDirection: 'row', gap: 4 },
  dotI: { width: 22, height: 7, borderRadius: 99, backgroundColor: '#EEF2F7' },
  dotOn: { backgroundColor: '#8B5CF6' },
  rateText: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary },
  quote: { borderLeftWidth: 3, borderLeftColor: '#C4B5FD', backgroundColor: '#FAF9FF', borderTopRightRadius: 10, borderBottomRightRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  quoteText: { fontSize: 13.5, color: Colors.text, lineHeight: 20 },
});
