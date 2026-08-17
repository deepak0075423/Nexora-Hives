import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as fb from '@/api/feedback.api';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { unwrap, LoaderView, Card, Badge, confirmAsync, fmtDate } from '@/components/ui/kit';

// The 2-step student form on mobile — the same question-bank-driven flow as the
// web, with rating targets sized for a thumb.
const RATING_TYPES = ['rating_5', 'emoji_5'];
const STEP2_TYPES  = ['checkbox', 'multiple_choice', 'text'];
const LABELS: Record<number, string> = { 1: 'Poor', 2: 'Needs Work', 3: 'Average', 4: 'Good', 5: 'Excellent' };
const EMOJI: Record<number, string>  = { 1: '😞', 2: '🙁', 3: '😐', 4: '🙂', 5: '😄' };
const toneFor = (v: number) => (v >= 4 ? Colors.success : v >= 3 ? Colors.warning : Colors.danger);

export default function FeedbackFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(undefined);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    fb.getForm(String(id))
      .then((r) => setData(unwrap(r)))
      .catch((e: any) => { setError(e?.message || 'Could not open this feedback'); setData(null); });
  }, [id]);

  const questions = data?.questions || [];
  const step1 = useMemo(() => questions.filter((q: any) => RATING_TYPES.includes(q.questionType) || q.questionType === 'yes_no'), [questions]);
  const step2 = useMemo(() => questions.filter((q: any) => STEP2_TYPES.includes(q.questionType)), [questions]);
  const hasStep2 = step2.length > 0;
  const totalSteps = hasStep2 ? 2 : 1;

  const set = (qid: string, patch: any) => {
    setAnswers((a) => ({ ...a, [qid]: { ...(a[qid] || {}), ...patch } }));
    setErrors((e) => { const { [qid]: _drop, ...rest } = e; return rest; });
  };

  const toggleOption = (qid: string, optId: string, single: boolean) => {
    setAnswers((a) => {
      const cur: string[] = a[qid]?.optionIds || [];
      const next = single
        ? (cur[0] === optId ? [] : [optId])
        : (cur.includes(optId) ? cur.filter((x) => x !== optId) : [...cur, optId]);
      return { ...a, [qid]: { ...(a[qid] || {}), optionIds: next } };
    });
    setErrors((e) => { const { [qid]: _drop, ...rest } = e; return rest; });
  };

  // Same rules the server enforces, checked here so the student is told what is
  // missing without a round trip.
  const validate = (list: any[]) => {
    const next: Record<string, string> = {};
    for (const q of list) {
      if (!q.isRequired) continue;
      const a = answers[q._id] || {};
      if (RATING_TYPES.includes(q.questionType) && a.ratingValue == null) next[q._id] = 'Please choose a rating';
      else if (q.questionType === 'yes_no' && !a.textResponse) next[q._id] = 'Please answer';
      else if (q.questionType === 'text' && !String(a.textResponse || '').trim()) next[q._id] = 'Please answer';
      else if (['checkbox', 'multiple_choice'].includes(q.questionType) && !(a.optionIds || []).length) next[q._id] = 'Please choose at least one';
    }
    setErrors(next);
    if (Object.keys(next).length) Alert.alert('Almost there', 'Please answer the highlighted questions.');
    return !Object.keys(next).length;
  };

  const submit = async () => {
    const okToGo = await confirmAsync(
      'Submit feedback?',
      'You will not be able to edit it after submission.',
      'Submit',
    );
    if (!okToGo) return;

    setSaving(true);
    try {
      await fb.submitFeedback(String(id), {
        answers: questions.map((q: any) => {
          const a = answers[q._id] || {};
          return {
            campaignQuestion: q._id,
            ratingValue: a.ratingValue ?? null,
            textResponse: a.textResponse ?? '',
            optionIds: a.optionIds || [],
            otherText: a.otherText || '',
          };
        }),
      });
      Alert.alert('Thank you', 'Your feedback has been submitted.');
      router.back();
    } catch (e: any) {
      Alert.alert('Could not submit', e?.message || 'Please try again.');
    } finally { setSaving(false); }
  };

  if (data === undefined) return <><Stack.Screen options={{ title: 'Feedback' }} /><LoaderView /></>;
  if (!data) {
    return (
      <>
        <Stack.Screen options={{ title: 'Feedback' }} />
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={44} color={Colors.textLight} />
          <Text style={s.errText}>{error || 'This feedback is no longer available.'}</Text>
          <TouchableOpacity style={s.btnGhost} onPress={() => router.back()}>
            <Text style={s.btnGhostText}>Back</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  const a = data.assignment;
  const list = step === 1 ? step1 : step2;

  return (
    <>
      <Stack.Screen options={{ title: `Step ${step} of ${totalSteps}` }} />
      <ScrollView style={s.root} contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}>

        <View style={s.steps}>
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((n) => (
            <View key={n} style={[s.stepBar, { backgroundColor: n <= step ? Colors.accent : Colors.border }]} />
          ))}
        </View>
        <Text style={s.stepLabel}>{step === 1 ? 'Teacher Rating' : 'Additional Feedback'}</Text>

        <Card>
          <Text style={s.teacher}>{a.teacher?.name}</Text>
          <Text style={s.meta}>
            {[a.subject, a.className && `Class ${a.className}`, a.sectionName && `Section ${a.sectionName}`].filter(Boolean).join(' · ')}
          </Text>
          <View style={s.badges}>
            {data.campaign?.isAnonymous && <Badge label="Anonymous" tone="info" />}
            <Badge label={`Closes ${fmtDate(data.campaign?.endDate)}`} tone="neutral" />
          </View>
          {!!data.campaign?.instructions && <Text style={s.instructions}>{data.campaign.instructions}</Text>}
        </Card>

        {step === 1 && (
          <Text style={s.scaleHint}>1 = {LABELS[1]}   ·   5 = {LABELS[5]}</Text>
        )}

        {list.map((q: any) => (
          <Card key={q._id}>
            <Text style={s.question}>
              {q.questionText}
              {q.isRequired ? <Text style={{ color: Colors.danger }}> *</Text> : null}
            </Text>
            {!!q.categoryName && step === 1 && <Text style={s.category}>{q.categoryName}</Text>}
            {!!q.helpText && <Text style={s.help}>{q.helpText}</Text>}

            {RATING_TYPES.includes(q.questionType) && (
              <View style={s.ratingRow}>
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = answers[q._id]?.ratingValue === n;
                  return (
                    <TouchableOpacity
                      key={n}
                      style={[s.ratingBtn, active && { borderColor: toneFor(n), backgroundColor: `${toneFor(n)}18` }]}
                      onPress={() => set(q._id, { ratingValue: active ? null : n })}
                    >
                      <Text style={s.ratingEmoji}>{EMOJI[n]}</Text>
                      <Text style={[s.ratingNum, active && { color: toneFor(n) }]}>{n}</Text>
                      <Text style={[s.ratingLabel, active && { color: toneFor(n) }]} numberOfLines={2}>{LABELS[n]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {q.questionType === 'yes_no' && (
              <View style={s.chipRow}>
                {['yes', 'no'].map((v) => {
                  const active = answers[q._id]?.textResponse === v;
                  return (
                    <TouchableOpacity key={v} style={[s.chip, active && s.chipActive]}
                      onPress={() => set(q._id, { textResponse: active ? '' : v })}>
                      <Text style={[s.chipText, active && s.chipTextActive]}>{v === 'yes' ? 'Yes' : 'No'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {['checkbox', 'multiple_choice'].includes(q.questionType) && (
              <>
                <View style={s.chipRow}>
                  {(q.options || []).map((o: any) => {
                    const active = (answers[q._id]?.optionIds || []).includes(o._id);
                    return (
                      <TouchableOpacity key={o._id} style={[s.chip, active && s.chipActive]}
                        onPress={() => toggleOption(q._id, o._id, q.questionType === 'multiple_choice')}>
                        <Text style={[s.chipText, active && s.chipTextActive]}>
                          {active ? '✓ ' : ''}{o.optionText}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {(q.options || []).some((o: any) => o.allowsFreeText && (answers[q._id]?.optionIds || []).includes(o._id)) && (
                  <TextInput
                    style={s.input}
                    placeholder="Tell us more (optional)"
                    placeholderTextColor={Colors.textLight}
                    maxLength={200}
                    value={answers[q._id]?.otherText || ''}
                    onChangeText={(t) => set(q._id, { otherText: t })}
                  />
                )}
              </>
            )}

            {q.questionType === 'text' && (
              <>
                <TextInput
                  style={[s.input, { height: 100, textAlignVertical: 'top' }]}
                  multiline
                  maxLength={q.maxLength || 1000}
                  placeholder="Optional — anything else you'd like your teacher to know"
                  placeholderTextColor={Colors.textLight}
                  value={answers[q._id]?.textResponse || ''}
                  onChangeText={(t) => set(q._id, { textResponse: t })}
                />
                <Text style={s.counter}>
                  {(answers[q._id]?.textResponse || '').length} / {q.maxLength || 1000}
                </Text>
              </>
            )}

            {!!errors[q._id] && <Text style={s.fieldError}>{errors[q._id]}</Text>}
          </Card>
        ))}

        <View style={s.actions}>
          {step === 2 && (
            <TouchableOpacity style={s.btnGhost} onPress={() => setStep(1)}>
              <Text style={s.btnGhostText}>← Back &amp; edit</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.btn, saving && { opacity: 0.6 }]}
            disabled={saving}
            onPress={() => {
              if (step === 1 && hasStep2) { if (validate(step1)) setStep(2); }
              else if (validate(step === 1 ? step1 : step2)) submit();
            }}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnText}>{step === 1 && hasStep2 ? 'Continue →' : 'Submit Feedback'}</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: Spacing.lg, backgroundColor: Colors.background },
  errText: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },

  steps: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  stepBar: { flex: 1, height: 4, borderRadius: 2 },
  stepLabel: { ...Typography.h4, color: Colors.text, marginBottom: Spacing.md },

  teacher: { ...Typography.h4, color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  instructions: { fontSize: 12, color: Colors.textSecondary, marginTop: 10, lineHeight: 17 },
  scaleHint: { fontSize: 11, color: Colors.textSecondary, marginBottom: 8, marginTop: 4 },

  question: { fontSize: 14, fontWeight: '600', color: Colors.text },
  category: { fontSize: 10, color: Colors.textLight, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  help: { fontSize: 11, color: Colors.textSecondary, marginTop: 4 },

  ratingRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  ratingBtn: {
    flex: 1, minHeight: 64, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, gap: 1,
  },
  ratingEmoji: { fontSize: 17 },
  ratingNum: { fontSize: 14, fontWeight: '700', color: Colors.text },
  ratingLabel: { fontSize: 8, color: Colors.textSecondary, textAlign: 'center', lineHeight: 10 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.full,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
  },
  chipActive: { borderColor: Colors.accent, backgroundColor: Colors.accentLight },
  chipText: { fontSize: 12, color: Colors.text },
  chipTextActive: { color: Colors.primary, fontWeight: '600' },

  input: {
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.text, marginTop: 12,
  },
  counter: { fontSize: 10, color: Colors.textLight, textAlign: 'right', marginTop: 4 },
  fieldError: { fontSize: 11, color: Colors.danger, marginTop: 8 },

  actions: { flexDirection: 'row', gap: 10, marginTop: Spacing.md },
  btn: { flex: 1, backgroundColor: Colors.accent, borderRadius: Radius.md, paddingVertical: 15, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnGhost: {
    paddingHorizontal: 18, paddingVertical: 15, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },
  btnGhostText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
});
