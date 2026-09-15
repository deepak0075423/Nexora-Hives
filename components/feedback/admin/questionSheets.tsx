/**
 * The three forms behind Teacher Feedback → Questions.
 *
 * Each shows the admin what they are building while they build it: a question
 * renders as a student will see it, a category shows where it sits in every
 * results screen, and a template lists its questions in the order students
 * answer them.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import {
  BRAND, Btn, Chip, EMOJI, Field, FormError, FormSection, NoteBar, Pick, SearchBox, Seg, Sheet, Stepper, Switch, Tag, TextBox,
  categoryIcon, isScorable, minutesFor, typeShort, QUESTION_TYPES,
} from '../parts';

const NEEDS_OPTIONS = ['multiple_choice', 'checkbox'];

export const blankQuestion = () => ({
  _id: null as string | null, questionText: '', category: '', questionType: 'rating_5',
  isRequired: true, includeInScore: true, helpText: '', maxLength: 1000,
  displayOrder: 0, status: 'active', options: [] as { optionText: string; allowsFreeText?: boolean }[], answered: false,
});
export type QuestionFormState = ReturnType<typeof blankQuestion>;

export const toQuestionForm = (r: any): QuestionFormState => ({
  _id: r._id, questionText: r.questionText || '', category: r.category || '', questionType: r.questionType,
  isRequired: !!r.isRequired, includeInScore: !!r.includeInScore, helpText: r.helpText || '', maxLength: r.maxLength || 1000,
  displayOrder: r.displayOrder || 0, status: r.status,
  options: (r.options || []).map((o: any) => ({ optionText: o.optionText, allowsFreeText: !!o.allowsFreeText })),
  // Set by the server: once anybody has answered, type, options and scoring are frozen.
  answered: !!r.answered,
});

// ── Question ──────────────────────────────────────────────────────────────────

export function QuestionSheet({ form, setForm, categories, saving, error, onClose, onSave }: {
  form: QuestionFormState | null; setForm: React.Dispatch<React.SetStateAction<QuestionFormState | null>>;
  categories: any[]; saving: boolean; error: string; onClose: () => void; onSave: (f: any) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tryValue, setTryValue] = useState<any>({});
  if (!form) return null;

  const set = (k: keyof QuestionFormState, v: any) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const frozen = !!form.answered;
  const needsOptions = NEEDS_OPTIONS.includes(form.questionType);
  const scorable = isScorable(form.questionType);
  const category = categories.find((c) => String(c._id) === String(form.category));

  const setType = (t: string) => {
    if (frozen) return;
    setForm((f) => (f ? {
      ...f, questionType: t, includeInScore: isScorable(t),
      options: NEEDS_OPTIONS.includes(t) && !f.options.length ? [{ optionText: '' }, { optionText: '' }] : f.options,
    } : f));
    setTryValue({});
  };
  const setOption = (i: number, patch: any) => setForm((f) => (f ? { ...f, options: f.options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) } : f));
  const moveOption = (i: number, dir: number) => setForm((f) => {
    if (!f) return f;
    const next = [...f.options]; const j = i + dir;
    if (j < 0 || j >= next.length) return f;
    [next[i], next[j]] = [next[j], next[i]];
    return { ...f, options: next };
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.questionText.trim()) e.questionText = 'Write the question the student will read.';
    const texts = form.options.map((o) => o.optionText.trim().toLowerCase()).filter(Boolean);
    if (needsOptions && texts.length < 2) e.options = 'A choice question needs at least two options.';
    else if (needsOptions && new Set(texts).size !== texts.length) e.options = 'Two options have the same words.';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSave({ ...form, options: form.options.filter((o) => o.optionText.trim()) });
  };

  const previewOpts = form.options.filter((o) => o.optionText.trim());

  return (
    <Sheet visible icon="checkbox-outline" busy={saving} onClose={onClose}
      title={form._id ? 'Edit question' : 'New question'}
      subtitle="Write it once, reuse it in every campaign. The preview is exactly what a student sees."
      footer={(
        <>
          <Text style={st.footNote} numberOfLines={2}>
            {frozen ? 'Answered before — wording, category and status can change; the answer type cannot.' : 'Editing never changes a campaign that already copied it.'}
          </Text>
          <Btn label="Cancel" onPress={onClose} disabled={saving} />
          <Btn kind="primary" label={saving ? 'Saving…' : form._id ? 'Save' : 'Add question'} icon="checkmark-circle" onPress={submit} busy={saving} />
        </>
      )}>
      {error ? <FormError>{error}</FormError> : null}

      <FormSection title="The question">
        <Field label="Question" required error={errors.questionText} count={`${form.questionText.length} / 500`}>
          <TextBox multiline rows={2} maxLength={500} value={form.questionText} placeholder="e.g. Explains concepts clearly"
            onChange={(v) => { set('questionText', v); setErrors((x) => ({ ...x, questionText: '' })); }} />
        </Field>
        <Field label="Category" hint="Results are reported per category.">
          <Pick label="Category" all="No category" value={String(form.category || '')} onChange={(v) => set('category', v)}
            options={categories.filter((c) => c.status !== 'archived' || String(c._id) === String(form.category)).map((c) => ({ value: String(c._id), label: c.name }))} />
        </Field>
        <Field label="Help text" hint="An optional line under the question.">
          <TextBox maxLength={300} value={form.helpText} placeholder="e.g. Think about the last few weeks" onChange={(v) => set('helpText', v)} />
        </Field>
      </FormSection>

      <FormSection title="How students answer" locked={frozen} hint={frozen ? 'Frozen: students have already answered this question in this form.' : null}>
        <View style={st.types}>
          {QUESTION_TYPES.map((t) => {
            const on = form.questionType === t.value;
            return (
              <TouchableOpacity key={t.value} style={[st.type, on && st.typeOn, frozen && !on && { opacity: 0.4 }]} disabled={frozen && !on}
                onPress={() => setType(t.value)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={t.short}>
                <Ionicons name={t.icon as any} size={18} color={on ? BRAND : Colors.textSecondary} />
                <Text style={[st.typeName, on && { color: BRAND }]}>{t.short}</Text>
                <Text style={st.typeText} numberOfLines={2}>{t.text}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {needsOptions ? (
          <Field label="Options" required error={errors.options} hint="The order here is the order students see.">
            <View style={{ gap: 8 }}>
              {form.options.map((o, i) => (
                // Options have no id until saved and can be reordered, so position is the handle.
                <View key={i} style={st.optRow}>
                  <Text style={st.optN}>{i + 1}</Text>
                  <TextInput style={[st.optIn, frozen && { color: Colors.textSecondary }]} value={o.optionText} maxLength={200} editable={!frozen}
                    placeholder={`Option ${i + 1}`} placeholderTextColor={Colors.textLight} onChangeText={(v) => setOption(i, { optionText: v })} />
                  <TouchableOpacity onPress={() => moveOption(i, -1)} disabled={frozen || i === 0} accessibilityLabel="Move up" style={st.optBtn}>
                    <Ionicons name="arrow-up" size={14} color={frozen || i === 0 ? Colors.textLight : Colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => moveOption(i, 1)} disabled={frozen || i === form.options.length - 1} accessibilityLabel="Move down" style={st.optBtn}>
                    <Ionicons name="arrow-down" size={14} color={frozen || i === form.options.length - 1 ? Colors.textLight : Colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => set('options', form.options.filter((_, idx) => idx !== i))} disabled={frozen || form.options.length <= 2}
                    accessibilityLabel="Remove option" style={st.optBtn}>
                    <Ionicons name="trash-outline" size={14} color={frozen || form.options.length <= 2 ? Colors.textLight : '#DC2626'} />
                  </TouchableOpacity>
                  <View style={st.freeRow}>
                    <Chip label="Free text" on={!!o.allowsFreeText} disabled={frozen} onPress={() => setOption(i, { allowsFreeText: !o.allowsFreeText })} />
                  </View>
                </View>
              ))}
              {!frozen ? <Btn small kind="soft" label="Add option" icon="add" onPress={() => set('options', [...form.options, { optionText: '' }])} /> : null}
            </View>
          </Field>
        ) : null}

        {form.questionType === 'text' ? (
          <Field label="Longest answer allowed" hint="Most comments fit well under 500 characters.">
            <Stepper value={form.maxLength} min={50} max={2000} disabled={frozen} suffix="characters" onChange={(v) => set('maxLength', v)} />
          </Field>
        ) : null}
      </FormSection>

      <FormSection title="Rules">
        <Switch label="Required" hint="The student cannot submit without answering." value={form.isRequired} onChange={(v) => set('isRequired', v)} />
        <Switch label="Counts towards the rating" disabled={!scorable || frozen} value={form.includeInScore && scorable} onChange={(v) => set('includeInScore', v)}
          hint={scorable ? 'Included in the teacher’s average out of 5.' : 'A written or pick-list answer has nothing to average.'} />
        {form._id ? (
          <Field label="Status" hint="An inactive question stays in the bank but is not offered to new templates.">
            <Seg value={form.status} onChange={(v) => set('status', v)}
              options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'archived', label: 'Archived' }]} />
          </Field>
        ) : null}
      </FormSection>

      <FormSection title="Student preview">
        <View style={st.prev}>
          {category ? <Tag label={category.name} tone="purple" icon={categoryIcon(category.name)} /> : null}
          <Text style={st.prevQ}>
            {form.questionText.trim() || <Text style={st.prevPh}>Your question appears here</Text>}
            {form.isRequired ? <Text style={{ color: '#DC2626' }}> *</Text> : null}
          </Text>
          {form.helpText.trim() ? <Text style={st.prevHelp}>{form.helpText}</Text> : null}
          {['rating_5', 'emoji_5'].includes(form.questionType) ? (
            <View style={st.rates}>
              {[1, 2, 3, 4, 5].map((v) => (
                <TouchableOpacity key={v} style={[st.rate, tryValue.rating === v && st.rateOn]} onPress={() => setTryValue({ rating: tryValue.rating === v ? null : v })}>
                  <Text style={{ fontSize: 15 }}>{EMOJI[v]}</Text>
                  <Text style={st.rateN}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          {form.questionType === 'yes_no' ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['Yes', 'No'].map((v) => <Chip key={v} label={v} on={tryValue.yn === v} onPress={() => setTryValue({ yn: tryValue.yn === v ? '' : v })} />)}
            </View>
          ) : null}
          {needsOptions ? (previewOpts.length ? (
            <View style={st.chips}>
              {previewOpts.map((o, i) => {
                const idk = `p${i}`;
                const on = (tryValue.opts || []).includes(idk);
                return <Chip key={idk} label={o.optionText} on={on}
                  onPress={() => setTryValue((t: any) => {
                    const cur: string[] = t.opts || [];
                    if (form.questionType === 'multiple_choice') return { opts: on ? [] : [idk] };
                    return { opts: on ? cur.filter((x) => x !== idk) : [...cur, idk] };
                  })} />;
              })}
            </View>
          ) : <Text style={st.prevPh}>Add options to see them here</Text>) : null}
          {form.questionType === 'text' ? (
            <TextInput style={[st.optIn, { minHeight: 70, textAlignVertical: 'top' }]} multiline maxLength={Number(form.maxLength) || 1000}
              placeholder="Optional — share anything else you would like your teacher to know" placeholderTextColor={Colors.textLight}
              value={tryValue.text || ''} onChangeText={(v) => setTryValue({ text: v })} />
          ) : null}
        </View>
        <View style={{ gap: 5, marginTop: 10 }}>
          <Fact yes={form.includeInScore && scorable} text={form.includeInScore && scorable ? 'Counts towards the teacher’s rating' : 'Collected, never averaged'} />
          <Fact yes={form.isRequired} text={form.isRequired ? 'Students must answer' : 'Students may skip it'} />
          <Fact yes text="Anonymous in every result" />
        </View>
      </FormSection>
    </Sheet>
  );
}

const Fact = ({ yes, text }: { yes: boolean; text: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    <Ionicons name={yes ? 'checkmark-circle' : 'close-circle'} size={14} color={yes ? '#16A34A' : Colors.textLight} />
    <Text style={{ fontSize: 12, color: yes ? '#15803D' : Colors.textSecondary }}>{text}</Text>
  </View>
);

// ── Category ──────────────────────────────────────────────────────────────────

export function CategorySheet({ form, setForm, categories, saving, error, onClose, onSave }: {
  form: any | null; setForm: React.Dispatch<React.SetStateAction<any | null>>; categories: any[];
  saving: boolean; error: string; onClose: () => void; onSave: (f: any) => void;
}) {
  const [err, setErr] = useState('');
  const ordered = useMemo(() => {
    if (!form) return [];
    const others = categories.filter((c) => String(c._id) !== String(form._id) && c.status !== 'archived');
    const mine = { _id: '__me', name: form.name.trim() || 'New category', displayOrder: Number(form.displayOrder) || 0, me: true };
    return [...others, mine].sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0) || (a.me ? 1 : b.me ? -1 : 0));
  }, [categories, form]);
  if (!form) return null;

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const taken = !!form.name.trim() && categories.some((c) => String(c._id) !== String(form._id) && c.name.trim().toLowerCase() === form.name.trim().toLowerCase());
  const submit = () => {
    if (!form.name.trim()) { setErr('A category needs a name.'); return; }
    if (taken) { setErr('Another category already has this name.'); return; }
    setErr(''); onSave(form);
  };

  return (
    <Sheet visible icon="layers-outline" busy={saving} onClose={onClose} title={form._id ? 'Edit category' : 'New category'}
      subtitle="A category groups questions so results read by theme — “Communication 4.2” rather than fourteen numbers."
      footer={(
        <>
          <Text style={st.footNote} numberOfLines={2}>Renaming a category relabels its past results too.</Text>
          <Btn label="Cancel" onPress={onClose} disabled={saving} />
          <Btn kind="primary" label={saving ? 'Saving…' : form._id ? 'Save' : 'Add category'} icon="checkmark-circle" onPress={submit} busy={saving} />
        </>
      )}>
      {error || err ? <FormError>{err || error}</FormError> : null}
      <FormSection title="Details">
        <Field label="Name" required error={taken ? 'Another category already has this name.' : null} count={`${form.name.length} / 120`}>
          <TextBox maxLength={120} value={form.name} placeholder="e.g. Classroom Management" onChange={(v) => { set('name', v); setErr(''); }} />
        </Field>
        <Field label="What it is about" hint="Shown to admins beside the category. Students never see it." count={`${(form.description || '').length} / 500`}>
          <TextBox multiline rows={3} maxLength={500} value={form.description || ''} placeholder="e.g. Discipline, fairness and class atmosphere" onChange={(v) => set('description', v)} />
        </Field>
      </FormSection>
      <FormSection title="Placement">
        <Field label="Display order" hint="Lower numbers come first in every report.">
          <Stepper value={form.displayOrder ?? 0} min={0} max={999} onChange={(v) => set('displayOrder', v)} />
        </Field>
        {form._id ? (
          <Field label="Status" hint="Inactive categories keep their past results.">
            <Seg value={form.status === 'inactive' ? 'inactive' : 'active'} onChange={(v) => set('status', v)}
              options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          </Field>
        ) : null}
      </FormSection>
      <FormSection title="Where it appears in results" hint="Every results screen lists categories in this order, each with its average out of 5.">
        {ordered.map((c: any, i: number) => (
          <View key={c._id} style={[st.catRow, c.me && st.catMe]}>
            <Ionicons name={categoryIcon(c.name)} size={15} color={c.me ? BRAND : Colors.textSecondary} />
            <Text style={[st.catName, c.me && { color: BRAND, fontWeight: '800' }]} numberOfLines={1}>{c.name}</Text>
            <Text style={st.catPos}>{c.me ? 'this one' : `#${i + 1}`}</Text>
          </View>
        ))}
      </FormSection>
    </Sheet>
  );
}

// ── Template ──────────────────────────────────────────────────────────────────

/**
 * An ordered question list. A campaign COPIES the questions in this order, so
 * editing a template never disturbs a running campaign — and the order chosen
 * here is the order students answer.
 */
export function TemplateSheet({ form, setForm, questions, categories, saving, error, onClose, onSave }: {
  form: any | null; setForm: React.Dispatch<React.SetStateAction<any | null>>; questions: any[]; categories: any[];
  saving: boolean; error: string; onClose: () => void; onSave: (f: any) => void;
}) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [err, setErr] = useState('');
  const [pane, setPane] = useState<'picked' | 'bank'>('picked');

  const byId = useMemo(() => new Map(questions.map((q) => [String(q._id), q])), [questions]);
  const catName = useMemo(() => new Map(categories.map((c) => [String(c._id), c.name])), [categories]);
  const picked: string[] = useMemo(() => (form?.questions || []).map(String), [form]);
  const available = useMemo(() => {
    const term = search.trim().toLowerCase();
    return questions.filter((q) => !picked.includes(String(q._id)) && (!cat || String(q.category || '') === cat)
      && (!term || q.questionText.toLowerCase().includes(term)));
  }, [questions, picked, search, cat]);
  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const q of available) {
      const k = catName.get(String(q.category)) || 'Uncategorised';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(q);
    }
    return [...m.entries()];
  }, [available, catName]);
  if (!form) return null;

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const add = (ids: string[]) => set('questions', [...picked, ...ids.map(String).filter((id) => !picked.includes(id))]);
  const remove = (id: string) => set('questions', picked.filter((x) => x !== id));
  const move = (i: number, dir: number) => {
    const next = [...picked]; const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set('questions', next);
  };
  const rows = picked.map((id) => byId.get(id)).filter(Boolean);
  const missing = picked.length - rows.length;
  const scored = rows.filter((q: any) => q.includeInScore).length;
  const covered = [...new Set(rows.map((q: any) => catName.get(String(q.category))).filter(Boolean))];
  const allCats = [...new Set(questions.map((q) => catName.get(String(q.category))).filter(Boolean))];

  const submit = () => {
    if (!form.name.trim()) { setErr('A template needs a name.'); return; }
    if (!rows.length) { setErr('Pick at least one question.'); return; }
    setErr(''); onSave({ ...form, questions: rows.map((q: any) => String(q._id)) });
  };

  return (
    <Sheet visible icon="clipboard-outline" busy={saving} onClose={onClose} title={form._id ? 'Edit template' : 'New template'}
      subtitle="Pick questions from the bank and put them in the order students should answer."
      footer={(
        <>
          <Text style={st.footNote} numberOfLines={2}>Campaigns already created from it keep their own copy.</Text>
          <Btn label="Cancel" onPress={onClose} disabled={saving} />
          <Btn kind="primary" label={saving ? 'Saving…' : form._id ? 'Save' : 'Create'} icon="checkmark-circle" onPress={submit} busy={saving} />
        </>
      )}>
      {error || err ? <FormError>{err || error}</FormError> : null}

      <FormSection title="Details">
        <Field label="Name" required count={`${form.name.length} / 150`}>
          <TextBox maxLength={150} value={form.name} placeholder="e.g. Standard Teacher Evaluation" onChange={(v) => { set('name', v); setErr(''); }} />
        </Field>
        <Field label="Description" hint="For admins choosing a template.">
          <TextBox maxLength={500} value={form.description} placeholder="e.g. The two-minute end-of-term evaluation" onChange={(v) => set('description', v)} />
        </Field>
        <Field label="Instructions shown to students" hint="Copied onto a campaign unless the campaign sets its own.">
          <TextBox multiline rows={2} maxLength={1000} value={form.instructions}
            placeholder="Your answers are anonymous and help your teachers improve. Please be honest and fair." onChange={(v) => set('instructions', v)} />
        </Field>
      </FormSection>

      <View style={st.sum}>
        <View style={st.sumCell}><Text style={st.sumV}>{rows.length}</Text><Text style={st.sumL}>questions</Text></View>
        <View style={st.sumCell}><Text style={st.sumV}>{scored}</Text><Text style={st.sumL}>scored</Text></View>
        <View style={st.sumCell}><Text style={st.sumV}>~{minutesFor(rows.length)}</Text><Text style={st.sumL}>minutes</Text></View>
      </View>
      {allCats.length ? (
        <View style={[st.chips, { marginBottom: 10 }]}>
          {allCats.map((c) => <Tag key={c} label={c!} tone={covered.includes(c) ? 'green' : 'slate'} icon={covered.includes(c) ? 'checkmark-circle' : 'close-circle'} />)}
        </View>
      ) : null}
      {rows.length > 0 && scored === 0 ? <View style={{ marginBottom: 10 }}><NoteBar tone="amber" icon="alert-circle">No scored question — campaigns from this template collect opinions but produce no rating.</NoteBar></View> : null}
      {rows.length > 25 ? <View style={{ marginBottom: 10 }}><NoteBar tone="amber" icon="alert-circle">Long forms get rushed answers. Most schools stay under 20.</NoteBar></View> : null}
      {missing > 0 ? <View style={{ marginBottom: 10 }}><NoteBar tone="amber" icon="alert-circle">{`${missing} question(s) are inactive or archived and will be left out on save.`}</NoteBar></View> : null}

      <Seg value={pane} onChange={(v) => setPane(v as any)} options={[
        { value: 'picked', label: `In this template (${rows.length})` },
        { value: 'bank', label: `Add from bank (${available.length})` },
      ]} />

      {pane === 'picked' ? (
        <View style={st.box}>
          {rows.length ? rows.map((q: any, i: number) => (
            <View key={q._id} style={[st.pickRow, i > 0 && st.sep]}>
              <Text style={st.optN}>{i + 1}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.pickQ}>{q.questionText}</Text>
                <Text style={st.pickMeta}>{[catName.get(String(q.category)), typeShort(q.questionType)].filter(Boolean).join(' · ')}</Text>
              </View>
              <TouchableOpacity onPress={() => move(i, -1)} disabled={i === 0} style={st.optBtn} accessibilityLabel="Move up">
                <Ionicons name="arrow-up" size={14} color={i === 0 ? Colors.textLight : Colors.text} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => move(i, 1)} disabled={i === rows.length - 1} style={st.optBtn} accessibilityLabel="Move down">
                <Ionicons name="arrow-down" size={14} color={i === rows.length - 1 ? Colors.textLight : Colors.text} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(String(q._id))} style={st.optBtn} accessibilityLabel="Remove">
                <Ionicons name="close" size={15} color="#DC2626" />
              </TouchableOpacity>
            </View>
          )) : (
            <Text style={[st.prevPh, { padding: 14, textAlign: 'center' }]}>Nothing yet. Open “Add from bank” and tap a question — it lands at the end.</Text>
          )}
          {rows.length ? <View style={{ padding: 10 }}><Btn small label="Clear all" icon="trash-outline" onPress={() => set('questions', [])} /></View> : null}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <SearchBox value={search} onChange={setSearch} placeholder="Search questions…" />
          <Pick label="Category" all="All categories" value={cat} onChange={setCat} options={categories.map((c) => ({ value: String(c._id), label: c.name }))} />
          {groups.map(([name, qs]) => (
            <View key={name} style={st.box}>
              <View style={st.groupHead}>
                <Ionicons name={categoryIcon(name)} size={14} color="#7C3AED" />
                <Text style={st.groupName}>{name}</Text>
                <Btn small kind="soft" label={`Add all ${qs.length}`} onPress={() => add(qs.map((q) => q._id))} />
              </View>
              {qs.map((q, i) => (
                <TouchableOpacity key={q._id} style={[st.pickRow, st.sep]} onPress={() => add([q._id])} accessibilityLabel={`Add ${q.questionText}`}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.pickQ}>{q.questionText}</Text>
                    <Text style={st.pickMeta}>{typeShort(q.questionType)}{q.includeInScore ? ' · scored' : ''}</Text>
                  </View>
                  <Ionicons name="add-circle" size={22} color={BRAND} />
                </TouchableOpacity>
              ))}
            </View>
          ))}
          {!groups.length ? (
            <Text style={[st.prevPh, { textAlign: 'center', padding: 12 }]}>
              {questions.length ? (search || cat ? 'Nothing matches this search.' : 'Every active question is already in the template.') : 'There are no active questions yet. Add some in the Question Bank first.'}
            </Text>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}


const st = StyleSheet.create({
  footNote: { flex: 1, fontSize: 11, color: Colors.textSecondary },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  type: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 10, gap: 3, backgroundColor: Colors.surface },
  typeOn: { borderColor: BRAND, backgroundColor: '#F5F7FF' },
  typeName: { fontSize: 13, fontWeight: '800', color: Colors.text },
  typeText: { fontSize: 11, color: Colors.textSecondary, lineHeight: 15 },
  optRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  optN: { width: 22, height: 22, borderRadius: 11, textAlign: 'center', lineHeight: 22, fontSize: 11, fontWeight: '800', color: Colors.textSecondary, backgroundColor: '#F1F5F9', overflow: 'hidden' },
  optIn: { flex: 1, minWidth: 120, borderWidth: 1, borderColor: Colors.border, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13.5, color: Colors.text, backgroundColor: Colors.surface },
  optBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  freeRow: { width: '100%', paddingLeft: 28 },
  prev: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 12, gap: 8, backgroundColor: '#FCFCFF' },
  prevQ: { fontSize: 14, fontWeight: '600', color: Colors.text },
  prevPh: { fontSize: 12.5, color: Colors.textLight, fontStyle: 'italic', fontWeight: '400' },
  prevHelp: { fontSize: 11.5, color: Colors.textSecondary },
  rates: { flexDirection: 'row', gap: 5 },
  rate: { flex: 1, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 9, alignItems: 'center', paddingVertical: 6 },
  rateOn: { borderColor: BRAND, backgroundColor: '#EEF2FF' },
  rateN: { fontSize: 13, fontWeight: '800', color: Colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 8 },
  catMe: { backgroundColor: '#EEF2FF' },
  catName: { flex: 1, fontSize: 13, color: Colors.text },
  catPos: { fontSize: 11.5, fontWeight: '700', color: Colors.textSecondary },
  sum: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  sumCell: { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', paddingVertical: 10 },
  sumV: { fontSize: 18, fontWeight: '800', color: Colors.text },
  sumL: { fontSize: 11, color: Colors.textSecondary },
  box: { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 10 },
  sep: { borderTopWidth: 1, borderTopColor: Colors.divider },
  pickQ: { fontSize: 13, fontWeight: '600', color: Colors.text, lineHeight: 18 },
  pickMeta: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: '#FCFCFF' },
  groupName: { flex: 1, fontSize: 12.5, fontWeight: '800', color: Colors.text },
});
