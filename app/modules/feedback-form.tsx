/**
 * Student → give feedback to one teacher.
 *
 * The same question-bank-driven form as the web: ratings and yes/no first, then
 * the pick-lists and the written answer. Answers are kept on the device as the
 * student goes, restored if they come back, and cleared once sent. Sending asks
 * once, with a summary; afterwards the student is offered the next teacher
 * waiting in the same campaign.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Platform } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as fb from '@/api/feedback.api';
import { Colors } from '@/constants/theme';
import {
  Avatar, Blank, Btn, Countdown, Dialog, Loading, NoteBar, Tag, BRAND, EMOJI, RATING_LABELS,
  categoryIcon, errText, useLoad,
} from '@/components/feedback/parts';
import { clearDraft, readDraft, writeDraft } from '@/components/feedback/drafts';

const RATING_TYPES = ['rating_5', 'emoji_5'];
const STEP1_TYPES = [...RATING_TYPES, 'yes_no'];

const isAnswered = (q: any, a: any = {}) => {
  if (RATING_TYPES.includes(q.questionType)) return a.ratingValue != null;
  if (q.questionType === 'yes_no') return !!a.textResponse;
  if (q.questionType === 'text') return !!String(a.textResponse || '').trim();
  return (a.optionIds || []).length > 0;
};

// Category headings come from the question snapshot, so a school that renames a
// category sees the new name here without an app update.
const byCategory = (qs: any[]) => {
  const m = new Map<string, any[]>();
  for (const q of qs) {
    const k = q.categoryName || 'General';
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(q);
  }
  return [...m.entries()];
};

export default function FeedbackFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const q = useLoad<any>(() => fb.getForm(String(id)), [id], { skip: !id });

  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [restored, setRestored] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const [sent, setSent] = useState<{ next: any } | null>(null);
  const ready = useRef(false);

  const questions: any[] = useMemo(() => q.data?.questions ?? [], [q.data]);
  const step1 = useMemo(() => questions.filter((x) => STEP1_TYPES.includes(x.questionType)), [questions]);
  const step2 = useMemo(() => questions.filter((x) => !STEP1_TYPES.includes(x.questionType)), [questions]);
  const steps = [step1.length ? 'ratings' : null, step2.length ? 'more' : null].filter(Boolean) as string[];
  const current = steps[step - 1] === 'more' ? step2 : step1;
  const last = step >= steps.length;

  // Bring back anything started earlier, once the questions are known — a draft
  // answer to a question the campaign no longer has is simply dropped.
  useEffect(() => {
    if (!q.data?.questions || !id) return;
    let alive = true;
    ready.current = false;
    readDraft(String(id)).then((draft) => {
      if (!alive) return;
      const ids = new Set(q.data.questions.map((x: any) => x._id));
      const kept = Object.fromEntries(Object.entries(draft ?? {}).filter(([k]) => ids.has(k)));
      // The read is async: anything tapped before it finished wins over the draft.
      setAnswers((now) => ({ ...kept, ...now }));
      setRestored(Object.keys(kept).length > 0);
      ready.current = true;
    });
    return () => { alive = false; };
  }, [q.data, id]);

  useEffect(() => {
    if (!ready.current || sent || !id) return;
    if (Object.keys(answers).length) writeDraft(String(id), answers);
  }, [answers, sent, id]);

  const set = (qid: string, patch: any) => {
    setAnswers((a) => ({ ...a, [qid]: { ...(a[qid] || {}), ...patch } }));
    setErrors((e) => (e[qid] ? { ...e, [qid]: '' } : e));
  };
  const toggleOption = (qid: string, optId: string, single: boolean) => {
    setAnswers((a) => {
      const cur: string[] = a[qid]?.optionIds || [];
      const next = single ? (cur[0] === optId ? [] : [optId]) : (cur.includes(optId) ? cur.filter((x) => x !== optId) : [...cur, optId]);
      return { ...a, [qid]: { ...(a[qid] || {}), optionIds: next } };
    });
    setErrors((e) => (e[qid] ? { ...e, [qid]: '' } : e));
  };

  // The server's own rules, checked here so the student hears what is missing first.
  const validate = (list: any[]) => {
    const next: Record<string, string> = {};
    for (const x of list) {
      if (x.isRequired && !isAnswered(x, answers[x._id])) {
        next[x._id] = RATING_TYPES.includes(x.questionType) ? 'Please choose a rating'
          : ['checkbox', 'multiple_choice'].includes(x.questionType) ? 'Please choose at least one' : 'Please answer';
      }
    }
    setErrors(next);
    return !Object.keys(next).length;
  };

  const forward = () => {
    if (!validate(current)) { scroll.current?.scrollTo({ y: 0, animated: true }); return; }
    if (last) { setSendErr(''); setConfirm(true); return; }
    setStep((n) => n + 1);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  const send = async () => {
    setSaving(true); setSendErr('');
    try {
      await fb.submitFeedback(String(id), {
        answers: questions.map((x) => {
          const a = answers[x._id] || {};
          return {
            campaignQuestion: x._id, ratingValue: a.ratingValue ?? null, textResponse: a.textResponse ?? '',
            optionIds: a.optionIds || [], otherText: a.otherText || '',
          };
        }),
      });
      clearDraft(String(id));
      let next = null;
      try {
        const list: any[] = ((await fb.getPending()) as any)?.data ?? [];
        next = list.find((r) => r._id !== id && r.campaign?._id === q.data.campaign?._id) || list.find((r) => r._id !== id) || null;
      } catch { /* the thank-you screen works without it */ }
      setConfirm(false);
      setSent({ next });
      scroll.current?.scrollTo({ y: 0, animated: false });
    } catch (e) {
      setSendErr(errText(e));
    } finally { setSaving(false); }
  };

  if (q.loading) return <><Stack.Screen options={{ title: 'Give feedback' }} /><Loading /></>;
  if (q.error || !q.data) {
    return (
      <>
        <Stack.Screen options={{ title: 'Give feedback' }} />
        <View style={st.root}>
          <View style={st.card}>
            <Blank icon="lock-closed-outline" title="This feedback cannot be opened" body={q.error || 'It may have closed or already been sent.'}
              action={<Btn kind="primary" label="Back to my feedback" onPress={() => router.back()} />} />
          </View>
        </View>
      </>
    );
  }

  const a = q.data.assignment;
  const c = q.data.campaign;
  const answeredAll = questions.filter((x) => isAnswered(x, answers[x._id])).length;
  const pct = questions.length ? Math.round((answeredAll / questions.length) * 100) : 0;
  const place = [a.className, a.sectionName].filter(Boolean).join(' ');

  if (sent) {
    return (
      <>
        <Stack.Screen options={{ title: 'Sent' }} />
        <ScrollView ref={scroll} style={st.root} contentContainerStyle={{ padding: 14, gap: 12 }}>
          <View style={st.thanks}>
            <View style={st.thanksIcon}><Ionicons name="checkmark-circle" size={44} color="#16A34A" /></View>
            <Text style={st.thanksTitle}>Thank you!</Text>
            <Text style={st.thanksText}>
              Your feedback for <Text style={{ fontWeight: '800', color: Colors.text }}>{a.teacher?.name}</Text>{a.subject ? ` (${a.subject})` : ''} has
              been sent. It is locked now and cannot be changed — and it stays anonymous.
            </Text>
            {sent.next ? (
              <View style={st.next}>
                <Text style={st.nextLabel}>UP NEXT</Text>
                <View style={st.nextWho}>
                  <Avatar name={sent.next.teacher?.name} src={sent.next.teacher?.photo} size={42} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.nextName} numberOfLines={1}>{sent.next.teacher?.name}</Text>
                    <Text style={st.nextSub} numberOfLines={1}>{sent.next.subject || 'General'}</Text>
                  </View>
                </View>
                <Btn kind="primary" label="Give feedback" icon="arrow-forward"
                  onPress={() => router.replace({ pathname: '/modules/feedback-form', params: { id: sent.next._id } } as any)} />
              </View>
            ) : (
              <Text style={st.allDone}>✨ That was the last one — you are all caught up.</Text>
            )}
            <Btn label="Back to my feedback" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: a.teacher?.name || 'Give feedback' }} />
      <View style={st.root}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
          <View style={st.head}>
            <Avatar name={a.teacher?.name} src={a.teacher?.photo} size={56} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.headLabel}>GIVING FEEDBACK TO</Text>
              <Text style={st.headName}>{a.teacher?.name}</Text>
              <Text style={st.headSub}>{[a.subject, place].filter(Boolean).join(' · ')}</Text>
            </View>
          </View>
          <View style={st.tags}>
            <Tag label={c.name} tone="slate" icon="megaphone-outline" />
            <Countdown endDate={c.endDate} />
            {c.isAnonymous ? <Tag label="Anonymous" tone="purple" icon="key-outline" /> : null}
          </View>

          {c.instructions ? <NoteBar tone="blue">{c.instructions}</NoteBar> : null}
          {restored ? (
            <NoteBar tone="green" icon="refresh"
              action={<Btn small label="Start over" onPress={() => { setAnswers({}); clearDraft(String(id)); setRestored(false); }} />}>
              We kept the answers you started earlier — carry on where you left off.
            </NoteBar>
          ) : null}
          {Object.values(errors).some(Boolean) ? (
            <NoteBar tone="red" icon="alert-circle">Please answer the highlighted questions.</NoteBar>
          ) : null}

          <View style={st.progress}>
            <View style={st.progressTop}>
              <Text style={st.progressText}>{answeredAll} of {questions.length} answered</Text>
              {steps.length > 1 ? (
                <View style={{ flexDirection: 'row', gap: 5 }}>
                  {steps.map((sk, i) => (
                    <View key={sk} style={[st.stepPill, i + 1 === step && st.stepPillOn, i + 1 < step && st.stepPillDone]}>
                      <Text style={[st.stepPillText, i + 1 === step && { color: BRAND }, i + 1 < step && { color: '#15803D' }]}>
                        {i + 1 < step ? '✓ ' : `${i + 1} `}{sk === 'ratings' ? 'Ratings' : 'A little more'}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <View style={st.track}><View style={[st.fill, { width: `${pct}%` }]} /></View>
            {steps[step - 1] === 'ratings' ? (
              <Text style={st.scale}>1 = {RATING_LABELS[1]} · 3 = {RATING_LABELS[3]} · 5 = {RATING_LABELS[5]}</Text>
            ) : null}
          </View>

          {steps[step - 1] === 'ratings'
            ? byCategory(step1).map(([cat, qs]) => (
              <View key={cat} style={st.qcard}>
                <View style={st.qcardHead}>
                  <View style={st.qcardIcon}><Ionicons name={categoryIcon(cat)} size={15} color="#7C3AED" /></View>
                  <Text style={st.qcardTitle}>{cat}</Text>
                  <Text style={st.qcardCount}>{qs.filter((x) => isAnswered(x, answers[x._id])).length} / {qs.length}</Text>
                </View>
                {qs.map((x) => (
                  <Question key={x._id} q={x} n={questions.indexOf(x) + 1} value={answers[x._id]} error={errors[x._id]}
                    set={set} toggleOption={toggleOption} />
                ))}
              </View>
            ))
            : (
              <View style={st.qcard}>
                <View style={st.qcardHead}>
                  <View style={[st.qcardIcon, { backgroundColor: '#DBEAFE' }]}><Ionicons name="chatbubble-ellipses-outline" size={15} color="#2563EB" /></View>
                  <Text style={st.qcardTitle}>A little more</Text>
                  <Text style={st.qcardCount}>Optional ones can be skipped</Text>
                </View>
                {step2.map((x) => (
                  <Question key={x._id} q={x} n={questions.indexOf(x) + 1} value={answers[x._id]} error={errors[x._id]}
                    set={set} toggleOption={toggleOption} />
                ))}
              </View>
            )}
        </ScrollView>

        <View style={[st.bar, { paddingBottom: 10 + insets.bottom }]}>
          <Text style={st.barNote} numberOfLines={2}>Answers are kept as you go</Text>
          {step > 1
            ? <Btn label="Back" icon="chevron-back" onPress={() => { setStep((n) => n - 1); scroll.current?.scrollTo({ y: 0, animated: true }); }} />
            : <Btn label="Later" onPress={() => router.back()} />}
          <Btn kind="primary" label={last ? 'Review & send' : 'Continue'} icon={last ? 'eye-outline' : 'arrow-forward'} onPress={forward} />
        </View>
      </View>

      <Dialog visible={confirm} icon="checkmark-circle-outline" tone="green" title="Send your feedback?"
        message={`To ${a.teacher?.name}${a.subject ? ` for ${a.subject}` : ''}. Once sent it cannot be changed.`}
        confirmLabel={saving ? 'Sending…' : 'Yes, send it'} busy={saving}
        onClose={() => setConfirm(false)} onConfirm={send}>
        <Review questions={questions} answers={answers} />
        {sendErr ? <NoteBar tone="red" icon="alert-circle">{sendErr}</NoteBar> : null}
        <NoteBar tone="purple" icon="key-outline">
          {c.isAnonymous
            ? 'Your name is never shown with your answers. Your teacher only sees results combined across many students.'
            : 'Your teacher sees results combined across many students, once enough have answered.'}
        </NoteBar>
      </Dialog>
    </>
  );
}

function Question({ q, n, value = {}, error, set, toggleOption }: {
  q: any; n: number; value?: any; error?: string; set: (id: string, p: any) => void; toggleOption: (id: string, o: string, single: boolean) => void;
}) {
  const done = isAnswered(q, value);
  const single = q.questionType === 'multiple_choice';
  return (
    <View style={[st.q, !!error && st.qErr]}>
      <View style={st.qHead}>
        <Text style={[st.qN, done && st.qNDone]}>{n}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.qText}>
            {q.questionText}
            {q.isRequired ? <Text style={{ color: '#DC2626' }}> *</Text> : <Text style={st.qOpt}> (optional)</Text>}
          </Text>
          {q.helpText ? <Text style={st.qHelp}>{q.helpText}</Text> : null}
        </View>
      </View>

      {RATING_TYPES.includes(q.questionType) ? (
        <View style={st.rates} accessibilityRole="radiogroup" accessibilityLabel={q.questionText}>
          {[1, 2, 3, 4, 5].map((v) => {
            const on = value.ratingValue === v;
            const col = v >= 4 ? '#16A34A' : v === 3 ? '#D97706' : '#DC2626';
            return (
              <TouchableOpacity key={v} style={[st.rate, on && { borderColor: col, backgroundColor: `${col}14` }]}
                onPress={() => set(q._id, { ratingValue: on ? null : v })}
                accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${v} ${RATING_LABELS[v]}`}>
                <Text style={st.rateEmoji}>{EMOJI[v]}</Text>
                <Text style={[st.rateN, on && { color: col }]}>{v}</Text>
                <Text style={[st.rateL, on && { color: col }]} numberOfLines={2}>{v === 2 ? 'Needs work' : RATING_LABELS[v]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {q.questionType === 'yes_no' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {['yes', 'no'].map((v) => {
            const on = value.textResponse === v;
            return (
              <TouchableOpacity key={v} style={[st.yn, on && st.ynOn]} onPress={() => set(q._id, { textResponse: on ? '' : v })}
                accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={v === 'yes' ? 'Yes' : 'No'}>
                <Text style={[st.ynText, on && { color: BRAND, fontWeight: '800' }]}>{v === 'yes' ? 'Yes' : 'No'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {['checkbox', 'multiple_choice'].includes(q.questionType) ? (
        <>
          <Text style={st.qHint}>{single ? 'Choose one' : 'Choose any that apply'}</Text>
          <View style={st.opts}>
            {(q.options || []).map((o: any) => {
              const on = (value.optionIds || []).includes(o._id);
              return (
                <TouchableOpacity key={o._id} style={[st.opt, on && st.optOn]} onPress={() => toggleOption(q._id, o._id, single)}
                  accessibilityRole={single ? 'radio' : 'checkbox'} accessibilityState={{ checked: on }} accessibilityLabel={o.optionText}>
                  <Text style={[st.optText, on && { color: BRAND, fontWeight: '700' }]}>{on ? '✓ ' : ''}{o.optionText}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {(q.options || []).some((o: any) => o.allowsFreeText && (value.optionIds || []).includes(o._id)) ? (
            <TextInput style={st.input} placeholder="Tell us more (optional)" placeholderTextColor={Colors.textLight} maxLength={200}
              value={value.otherText || ''} onChangeText={(t) => set(q._id, { otherText: t })} />
          ) : null}
        </>
      ) : null}

      {q.questionType === 'text' ? (
        <>
          <TextInput style={[st.input, { minHeight: 96, textAlignVertical: 'top' }]} multiline maxLength={q.maxLength || 1000}
            placeholder="Share anything you would like your teacher to know — kind and honest helps most."
            placeholderTextColor={Colors.textLight} value={value.textResponse || ''} onChangeText={(t) => set(q._id, { textResponse: t })} />
          <Text style={st.count}>{(value.textResponse || '').length} / {q.maxLength || 1000}</Text>
        </>
      ) : null}

      {error ? <Text style={st.err}>{error}</Text> : null}
    </View>
  );
}

/** What is about to be sent, in one glance. */
function Review({ questions, answers }: { questions: any[]; answers: Record<string, any> }) {
  const missing = questions.filter((x) => x.isRequired && !isAnswered(x, answers[x._id])).length;
  const ratings = questions.filter((x) => RATING_TYPES.includes(x.questionType) && answers[x._id]?.ratingValue != null)
    .map((x) => answers[x._id].ratingValue as number);
  const avg = ratings.length ? ratings.reduce((n, v) => n + v, 0) / ratings.length : null;
  const answered = questions.filter((x) => isAnswered(x, answers[x._id])).length;
  const wrote = questions.some((x) => x.questionType === 'text' && String(answers[x._id]?.textResponse || '').trim());
  return (
    <View style={{ gap: 8 }}>
      <View style={st.review}>
        <View style={st.reviewCell}><Text style={st.reviewV}>{answered}</Text><Text style={st.reviewL}>of {questions.length} answered</Text></View>
        <View style={st.reviewCell}><Text style={st.reviewV}>{avg == null ? '—' : `★ ${avg.toFixed(1)}`}</Text><Text style={st.reviewL}>your average</Text></View>
        <View style={st.reviewCell}><Text style={st.reviewV}>{wrote ? 'Yes' : 'No'}</Text><Text style={st.reviewL}>comment</Text></View>
      </View>
      {missing ? <NoteBar tone="amber" icon="alert-circle">{missing} required question{missing === 1 ? ' is' : 's are'} still empty.</NoteBar> : null}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F5FB' },
  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, margin: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F5F3FF', borderRadius: 18, borderWidth: 1, borderColor: '#E0E7FF', padding: 14 },
  headLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, color: BRAND },
  headName: { fontSize: 20, fontWeight: '800', color: Colors.text, letterSpacing: -0.4 },
  headSub: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -4 },
  progress: { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 12, gap: 8 },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  progressText: { fontSize: 13.5, fontWeight: '800', color: Colors.text },
  stepPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#F1F5F9' },
  stepPillOn: { backgroundColor: '#EEF2FF' },
  stepPillDone: { backgroundColor: '#F0FDF4' },
  stepPillText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  track: { height: 7, borderRadius: 99, backgroundColor: '#EEF2F7', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 99, backgroundColor: BRAND },
  scale: { fontSize: 11, color: Colors.textSecondary },
  qcard: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  qcardHead: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#FCFCFF', borderBottomWidth: 1, borderBottomColor: Colors.border },
  qcardIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  qcardTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: Colors.text },
  qcardCount: { fontSize: 11, color: Colors.textSecondary },
  q: { padding: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  qErr: { backgroundColor: '#FFFAFA', borderLeftWidth: 3, borderLeftColor: '#F87171' },
  qHead: { flexDirection: 'row', gap: 9 },
  qN: { width: 22, height: 22, borderRadius: 11, textAlign: 'center', lineHeight: 22, fontSize: 11, fontWeight: '800', color: Colors.textSecondary, backgroundColor: '#F1F5F9', overflow: 'hidden' },
  qNDone: { backgroundColor: '#DCFCE7', color: '#15803D' },
  qText: { fontSize: 14, fontWeight: '600', color: Colors.text, lineHeight: 20 },
  qOpt: { fontSize: 12, fontWeight: '400', color: Colors.textSecondary },
  qHelp: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2 },
  qHint: { fontSize: 11.5, color: Colors.textSecondary, marginBottom: -4 },
  rates: { flexDirection: 'row', gap: 5 },
  rate: { flex: 1, minHeight: 64, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', paddingVertical: 5, paddingHorizontal: 2 },
  rateEmoji: { fontSize: 17 },
  rateN: { fontSize: 14, fontWeight: '800', color: Colors.text },
  rateL: { fontSize: 9, color: Colors.textSecondary, textAlign: 'center' },
  yn: { width: 110, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  ynOn: { borderColor: BRAND, backgroundColor: '#EEF2FF' },
  ynText: { fontSize: 14, color: Colors.text },
  opts: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  opt: { minHeight: 40, paddingHorizontal: 13, justifyContent: 'center', borderRadius: 999, borderWidth: 1.5, borderColor: Colors.border },
  optOn: { borderColor: BRAND, backgroundColor: '#EEF2FF' },
  optText: { fontSize: 13, color: Colors.text },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, fontSize: 14, color: Colors.text, backgroundColor: Colors.surface },
  count: { fontSize: 10.5, color: Colors.textSecondary, textAlign: 'right', marginTop: -6 },
  err: { fontSize: 12, fontWeight: '700', color: '#B91C1C' },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 10,
    backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border,
    ...(Platform.OS === 'web' ? {} : { elevation: 8 }),
  },
  barNote: { flex: 1, fontSize: 11, color: Colors.textSecondary },
  review: { flexDirection: 'row', gap: 6 },
  reviewCell: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 9, alignItems: 'center' },
  reviewV: { fontSize: 16, fontWeight: '800', color: Colors.text },
  reviewL: { fontSize: 10.5, color: Colors.textSecondary, textAlign: 'center' },
  thanks: { backgroundColor: Colors.surface, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, padding: 22, alignItems: 'center', gap: 10 },
  thanksIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  thanksTitle: { fontSize: 22, fontWeight: '800', color: Colors.text },
  thanksText: { fontSize: 13.5, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  next: { alignSelf: 'stretch', borderWidth: 1, borderColor: '#E0E7FF', backgroundColor: '#F8F9FF', borderRadius: 14, padding: 12, gap: 10, marginVertical: 4 },
  nextLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, color: BRAND },
  nextWho: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nextName: { fontSize: 14.5, fontWeight: '800', color: Colors.text },
  nextSub: { fontSize: 12, color: Colors.textSecondary },
  allDone: { fontSize: 13, fontWeight: '700', color: '#15803D' },
});
