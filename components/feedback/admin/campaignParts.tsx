/**
 * The campaign form and its lifecycle guards — the web's campaignParts at phone size.
 *
 * A campaign always belongs to the CURRENT academic year. There is nothing to
 * choose: assignments are generated from that year's sections, and the server
 * sets the year itself and drops any target that is not of it. The form shows
 * the year as a fact, loads its classes, sections, subjects and teachers from
 * /feedback/campaign-options (current year only), and never sends a year.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as fb from '@/api/feedback.api';
import { Colors } from '@/constants/theme';
import {
  Avatar, BRAND, Btn, Chip, Dialog, Field, FormError, FormSection, NoteBar, SearchBox, Sheet, Stepper, Switch, Tag, TextBox,
  addDays, categoryIcon, daysBetween, errText, fmtDay, isoOf, minutesFor, plural, toneAt, todayIso, useFlash,
} from '../parts';

// ── Form model ────────────────────────────────────────────────────────────────

export const blankCampaign = (settings?: any) => ({
  _id: null as string | null,
  name: '', term: '', feedbackType: 'student_teacher', description: '', instructions: '',
  startDate: todayIso(), endDate: addDays(todayIso(), (settings?.defaultCampaignDays || 14) - 1),
  isAnonymous: settings?.defaultAnonymous !== false,
  minimumResponses: settings?.defaultMinimumResponses ?? 5,
  targetClasses: [] as string[], targetSections: [] as string[], targetSubjects: [] as string[], targetTeachers: [] as string[],
  template: '', reminderEnabled: true, reminderIntervalDays: settings?.reminderIntervalDays ?? 3,
  allowResubmission: false, questionCount: null as number | null, status: undefined as string | undefined, yearName: '',
});
export type CampaignFormState = ReturnType<typeof blankCampaign>;

export const toCampaignForm = (r: any): CampaignFormState => ({
  _id: r._id, name: r.name || '', term: r.term || '', feedbackType: r.feedbackType || 'student_teacher',
  description: r.description || '', instructions: r.instructions || '',
  startDate: r.startDate ? isoOf(r.startDate) : todayIso(), endDate: r.endDate ? isoOf(r.endDate) : addDays(todayIso(), 13),
  isAnonymous: !!r.isAnonymous, minimumResponses: r.minimumResponses ?? 5,
  targetClasses: (r.targetClasses || []).map(String), targetSections: (r.targetSections || []).map(String),
  targetSubjects: (r.targetSubjects || []).map(String), targetTeachers: (r.targetTeachers || []).map(String),
  // Blank on an edit: the campaign already holds its own copy of the questions.
  template: '', questionCount: r.questions?.length ?? r.questionCount ?? null,
  reminderEnabled: r.reminderEnabled !== false, reminderIntervalDays: r.reminderIntervalDays ?? 3,
  allowResubmission: !!r.allowResubmission, status: r.status, yearName: r.academicYear?.yearName || '',
});

// ── Reach ─────────────────────────────────────────────────────────────────────

/**
 * The sections a targeting choice actually covers. The server reads
 * `targetSections` in preference to `targetClasses`, so a picked section only
 * narrows its OWN class here, and the expanded list is what gets sent.
 */
export function sectionsInScope(opt: any, classes: string[], sections: string[]) {
  const all: any[] = opt?.sections || [];
  const byClass = classes.length ? all.filter((x) => classes.includes(x.class)) : all;
  if (!sections.length) return byClass;
  const picked = new Set(sections);
  const withPicks = new Set(all.filter((x) => picked.has(x._id)).map((x) => x.class));
  return byClass.filter((x) => picked.has(x._id) || (classes.length > 0 && !withPicks.has(x.class)));
}

/** Exactly what fb.generateAssignments would build, counted instead of written. */
export function computeReach(opt: any, form: Pick<CampaignFormState, 'targetClasses' | 'targetSections' | 'targetSubjects' | 'targetTeachers'>) {
  if (!opt?.academicYear) return { sections: 0, students: 0, teachers: 0, evaluations: 0, scope: [] as any[] };
  const scope = sectionsInScope(opt, form.targetClasses, form.targetSections);
  const inScope = new Map(scope.map((x) => [x._id, x]));
  const subj = new Set(form.targetSubjects);
  const teach = new Set(form.targetTeachers);
  const links = (opt.links || []).filter((l: any) => inScope.has(l.section)
    && (!subj.size || subj.has(l.subject)) && (!teach.size || teach.has(l.teacher)));
  const reached = new Set<string>(links.map((l: any) => l.section));
  return {
    scope,
    sections: reached.size,
    students: [...reached].reduce((n, id) => n + (inScope.get(id)?.students || 0), 0),
    teachers: new Set(links.map((l: any) => l.teacher)).size,
    evaluations: links.reduce((n: number, l: any) => n + (inScope.get(l.section)?.students || 0), 0),
  };
}

const STEPS = [
  { key: 'details', label: 'Details' },
  { key: 'questions', label: 'Questions' },
  { key: 'audience', label: 'Audience' },
  { key: 'schedule', label: 'Schedule & privacy' },
];
const TERMS = ['Term 1', 'Term 2', 'Term 3', 'Mid-term', 'Annual'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// ── The sheet ─────────────────────────────────────────────────────────────────

export function CampaignSheet({ form, setForm, saving, error, onClose, onSave }: {
  form: CampaignFormState | null; setForm: React.Dispatch<React.SetStateAction<CampaignFormState | null>>;
  saving: boolean; error: string; onClose: () => void; onSave: (f: any) => void;
}) {
  const open = !!form;
  const [opt, setOpt] = useState<any>(null);
  const [optErr, setOptErr] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState('details');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [dropped, setDropped] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStep('details'); setErrors({}); setTouched({}); setDropped(0); setAttempt(0);
  }, [open, form?._id]);

  // Loaded every time the sheet opens, so a class added since is pickable; Retry
  // reloads without losing anything typed.
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setOpt(null); setOptErr('');
    fb.getCampaignOptions()
      .then((r: any) => { if (alive) setOpt(r?.data ?? r); })
      .catch((e) => { if (alive) setOptErr(errText(e)); });
    return () => { alive = false; };
  }, [open, form?._id, attempt]);

  // Once options arrive: default the template, and drop targets not of this year, saying how many.
  useEffect(() => {
    if (!opt || !form) return;
    const keepIn = (list: string[], rows: any[]) => { const ids = new Set(rows.map((x) => x._id)); return list.filter((id) => ids.has(id)); };
    const next = {
      ...form,
      targetClasses: keepIn(form.targetClasses, opt.classes), targetSections: keepIn(form.targetSections, opt.sections),
      targetSubjects: keepIn(form.targetSubjects, opt.subjects), targetTeachers: keepIn(form.targetTeachers, opt.teachers),
    };
    if (!form._id && !form.template && opt.templates?.length) next.template = (opt.templates.find((t: any) => t.isDefault) || opt.templates[0])._id;
    setDropped((['targetClasses', 'targetSections', 'targetSubjects', 'targetTeachers'] as const)
      .reduce((n, k) => n + form[k].length - next[k].length, 0));
    setForm(next);
  }, [opt]); // eslint-disable-line react-hooks/exhaustive-deps

  const reach = useMemo(() => computeReach(opt, form || { targetClasses: [], targetSections: [], targetSubjects: [], targetTeachers: [] }), [opt, form]);

  if (!form) return null;

  const live = ['active', 'scheduled'].includes(form.status ?? '');
  const editing = !!form._id;
  const set = (k: keyof CampaignFormState, v: any) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const year = opt?.academicYear;
  const template = (opt?.templates || []).find((t: any) => t._id === form.template);
  const days = ISO.test(form.startDate) && ISO.test(form.endDate) ? daysBetween(form.startDate, form.endDate) : null;

  const check = (key: string) => {
    const e: Record<string, string> = {};
    if (key === 'details') {
      if (!form.name.trim()) e.name = 'Give the campaign a name students will recognise.';
      if (opt && !year && !editing) e.year = 'No active academic year.';
    }
    if (key === 'questions' && !editing && !form.template) e.template = 'Choose the questions this campaign will ask.';
    if (key === 'schedule') {
      if (!ISO.test(form.startDate)) e.startDate = 'Use the form YYYY-MM-DD.';
      if (!ISO.test(form.endDate)) e.endDate = 'Use the form YYYY-MM-DD.';
      if (ISO.test(form.startDate) && ISO.test(form.endDate) && form.endDate < form.startDate) e.endDate = 'The window cannot close before it opens.';
    }
    return e;
  };
  const stepErrors = Object.fromEntries(STEPS.map((x) => [x.key, check(x.key)]));
  const hasErr = (k: string) => Object.keys(stepErrors[k]).length > 0;
  const idx = STEPS.findIndex((x) => x.key === step);

  const go = (k: string) => { setTouched((t) => ({ ...t, [step]: true })); setErrors(stepErrors[step]); setStep(k); };
  const next = () => {
    setTouched((t) => ({ ...t, [step]: true }));
    setErrors(stepErrors[step]);
    if (hasErr(step)) return;
    setStep(STEPS[idx + 1].key);
  };
  const submit = () => {
    const bad = STEPS.find((x) => hasErr(x.key));
    setTouched({ details: true, questions: true, audience: true, schedule: true });
    if (bad) { setErrors(stepErrors[bad.key]); setStep(bad.key); return; }
    const scopeIds = sectionsInScope(opt, form.targetClasses, form.targetSections).map((x) => x._id);
    onSave({
      ...form,
      targetSections: form.targetSections.length ? scopeIds : [],
      minimumResponses: Number(form.minimumResponses) || 1,
      reminderIntervalDays: Number(form.reminderIntervalDays) || 1,
    });
  };
  const stepState = (x: { key: string }) => {
    if (!opt) return 'todo' as const;
    if (live && (x.key === 'questions' || x.key === 'audience')) return 'locked' as const;
    if (touched[x.key] && hasErr(x.key)) return 'error' as const;
    if (touched[x.key] && x.key !== step) return 'done' as const;
    return 'todo' as const;
  };

  // Audience toggles prune anything the new scope no longer contains.
  const retarget = (patch: Partial<CampaignFormState>) => setForm((f) => {
    if (!f) return f;
    const nf = { ...f, ...patch };
    if (nf.targetClasses.length) {
      const cls = new Set(nf.targetClasses);
      nf.targetSections = nf.targetSections.filter((id) => cls.has(opt.sections.find((x: any) => x._id === id)?.class));
    }
    const scope = new Set(sectionsInScope(opt, nf.targetClasses, nf.targetSections).map((x) => x._id));
    const links = opt.links.filter((l: any) => scope.has(l.section));
    const subjects = new Set(links.map((l: any) => l.subject));
    nf.targetSubjects = nf.targetSubjects.filter((id) => subjects.has(id));
    const subj = new Set(nf.targetSubjects);
    const teachers = new Set(links.filter((l: any) => !subj.size || subj.has(l.subject)).map((l: any) => l.teacher));
    nf.targetTeachers = nf.targetTeachers.filter((id) => teachers.has(id));
    return nf;
  });
  const flip = (key: 'targetClasses' | 'targetSections' | 'targetSubjects' | 'targetTeachers', id: string) =>
    retarget({ [key]: form[key].includes(id) ? form[key].filter((x) => x !== id) : [...form[key], id] } as any);

  const nobody = opt && year && reach.evaluations === 0;

  return (
    <Sheet visible icon="megaphone-outline" busy={saving} onClose={onClose}
      title={editing ? `Edit “${form.name || 'campaign'}”` : 'New feedback campaign'}
      subtitle={year ? `Runs in ${year.yearName}, the current academic year. Created as a draft — nothing is sent until you start it.` : 'A campaign runs in the current academic year and is created as a draft.'}
      steps={STEPS.map((x) => ({ ...x, state: stepState(x) }))} step={step} onStep={opt ? go : undefined}
      footer={(
        <>
          <Text style={st.footNote}>Step {idx + 1} of {STEPS.length}</Text>
          {idx > 0 ? <Btn label="Back" icon="chevron-back" onPress={() => setStep(STEPS[idx - 1].key)} disabled={saving} /> : <Btn label="Cancel" onPress={onClose} disabled={saving} />}
          {editing
            ? <Btn kind="primary" label={saving ? 'Saving…' : 'Save'} icon="checkmark-circle" onPress={submit} busy={saving} disabled={!opt} />
            : idx < STEPS.length - 1
              ? <Btn kind="primary" label="Next" icon="arrow-forward" onPress={next} disabled={!opt} />
              : <Btn kind="primary" label={saving ? 'Creating…' : 'Create draft'} icon="checkmark-circle" onPress={submit} busy={saving} disabled={!opt || !year} />}
        </>
      )}>
      {error ? <FormError>{error}</FormError> : null}
      {optErr ? (
        <View style={{ marginBottom: 12 }}>
          <NoteBar tone="red" icon="alert-circle" title="This year’s classes, subjects and templates could not be loaded"
            action={<Btn small kind="primary" label="Retry" icon="refresh" onPress={() => setAttempt((n) => n + 1)} />}>
            {`A campaign can only target the current academic year, so the form waits for them. Nothing you typed is lost.\nServer said: ${optErr}`}
          </NoteBar>
        </View>
      ) : null}
      {!opt && !optErr ? <Text style={st.loadingText}>Loading this year’s classes, subjects and teachers…</Text> : null}

      {opt ? (
        <View style={[st.reach, nobody && st.reachEmpty]}>
          <View>
            <Text style={st.reachBig}>{reach.students.toLocaleString('en-IN')}</Text>
            <Text style={st.reachLabel}>students asked</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={st.reachLine}><Text style={st.b}>{reach.sections}</Text> sections · <Text style={st.b}>{reach.teachers}</Text> teachers</Text>
            <Text style={st.reachLine}><Text style={st.b}>{reach.evaluations.toLocaleString('en-IN')}</Text> evaluations</Text>
            {nobody ? <Text style={st.reachWarn}>Nobody would be asked — this audience has no section–subject–teacher allocations.</Text> : null}
          </View>
        </View>
      ) : null}

      {opt && step === 'details' ? (
        <>
          {year ? (
            <View style={st.year}>
              <View style={st.yearIcon}><Ionicons name="calendar-number-outline" size={20} color={BRAND} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.yearLabel}>ACADEMIC YEAR</Text>
                <Text style={st.yearName}>{year.yearName} <Text style={st.current}> Current </Text></Text>
                <Text style={st.yearText}>
                  {year.startDate ? `${fmtDay(year.startDate)} – ${fmtDay(year.endDate)} · ` : ''}Classes, sections, subjects and teachers are all from this year.
                  {editing && form.yearName && form.yearName !== year.yearName ? ` This draft was made in ${form.yearName} and moves to ${year.yearName} when saved.` : ''}
                </Text>
                <View style={{ marginTop: 6 }}><Tag label="Set automatically" tone="slate" icon="lock-closed" /></View>
              </View>
            </View>
          ) : (
            <FormError>There is no active academic year, so a campaign cannot be created. Mark the current year active in Academic Years first — a campaign always runs in it.</FormError>
          )}

          {live ? (
            <NoteBar tone="slate" icon="lock-closed">
              {`This campaign is already ${form.status}. Its questions, audience and privacy setting are frozen — students have answered against them. Name, description, closing date, response floor and reminders can still change.`}
            </NoteBar>
          ) : null}

          <FormSection title="About this campaign">
            <Field label="Campaign name" required error={errors.name} count={`${form.name.length} / 150`}>
              <TextBox value={form.name} maxLength={150} placeholder="e.g. Term 1 Teacher Feedback"
                onChange={(v) => { set('name', v); setErrors((x) => ({ ...x, name: '' })); }} />
            </Field>
            <Field label="Term" hint="Labels this campaign on every trend chart.">
              <TextBox value={form.term} maxLength={60} placeholder="e.g. Term 1" onChange={(v) => set('term', v)} />
              <View style={st.quick}>
                {TERMS.map((t) => <Chip key={t} label={t} on={form.term === t} onPress={() => set('term', form.term === t ? '' : t)} />)}
              </View>
            </Field>
            <Field label="Who gives the feedback">
              <View style={{ gap: 8 }}>
                <ChoiceRow icon="school-outline" title="Students → Teachers" text="Each student rates the teachers who teach them." on onPress={() => set('feedbackType', 'student_teacher')} disabled={live} />
                <ChoiceRow icon="people-outline" title="Parents → Teachers" text="Not available yet." badge="Coming soon" disabled onPress={() => {}} />
              </View>
            </Field>
            <Field label="Description" hint="For your own records — students do not see this.">
              <TextBox multiline rows={2} maxLength={1000} value={form.description} placeholder="e.g. End-of-term evaluation for the senior classes" onChange={(v) => set('description', v)} />
            </Field>
            <Field label="Instructions shown to students" hint={template?.name ? `Leave empty to use the “${template.name}” template’s own instructions.` : null}>
              <TextBox multiline rows={2} maxLength={2000} value={form.instructions}
                placeholder="Your answers are anonymous and help your teachers improve. Please be honest and fair." onChange={(v) => set('instructions', v)} />
            </Field>
          </FormSection>
        </>
      ) : null}

      {opt && step === 'questions' ? (
        <FormSection title="What it asks" locked={editing}
          hint={editing
            ? 'The questionnaire was copied onto this campaign when it was created, and stays fixed for its whole life.'
            : 'The template’s questions are copied onto the campaign now, so later edits to the template never disturb it.'}>
          {editing ? (
            <NoteBar tone="slate" icon="clipboard-outline">
              {`${form.questionCount != null ? `${form.questionCount} questions are` : 'The questions are'} fixed on this campaign. Open the campaign’s Questions tab to read them.`}
            </NoteBar>
          ) : (opt.templates || []).length ? (
            <View style={{ gap: 9 }}>
              {errors.template ? <FormError>{errors.template}</FormError> : null}
              {opt.templates.map((t: any) => {
                const on = form.template === t._id;
                return (
                  <TouchableOpacity key={t._id} style={[st.tpl, on && st.tplOn]} onPress={() => { set('template', t._id); setErrors((x) => ({ ...x, template: '' })); }}
                    accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={t.name}>
                    <View style={st.tplTop}>
                      <View style={st.tplIcon}><Ionicons name="clipboard-outline" size={17} color="#7C3AED" /></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={st.tplName}>{t.name}{t.isDefault ? <Text style={st.tplDef}>  default</Text> : null}</Text>
                        <Text style={st.tplMeta}>{t.questionCount} questions · {t.scoredCount} scored · ~{minutesFor(t.questionCount)} min</Text>
                      </View>
                      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? BRAND : Colors.textLight} />
                    </View>
                    {t.description ? <Text style={st.tplDesc}>{t.description}</Text> : null}
                    {t.categories?.length ? (
                      <View style={st.quick}>
                        {t.categories.slice(0, 5).map((c: string) => <Tag key={c} label={c} tone="purple" icon={categoryIcon(c)} />)}
                        {t.categories.length > 5 ? <Tag label={`+${t.categories.length - 5}`} tone="slate" /> : null}
                      </View>
                    ) : null}
                    {t.sample?.length ? (
                      <View style={{ gap: 2, marginTop: 4 }}>
                        {t.sample.map((sq: string, i: number) => <Text key={sq} style={st.tplSample} numberOfLines={1}>{i + 1}. {sq}</Text>)}
                        {t.questionCount > t.sample.length ? <Text style={st.tplMore}>…and {t.questionCount - t.sample.length} more</Text> : null}
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <FormError>There are no active templates. Build one under Questions → Templates first — a campaign is created from a template.</FormError>
          )}
        </FormSection>
      ) : null}

      {opt && step === 'audience' ? <Audience opt={opt} form={form} reach={reach} live={live} dropped={dropped} flip={flip} retarget={retarget} /> : null}

      {opt && step === 'schedule' ? (
        <>
          <FormSection title="When it runs" hint="Students can submit on every day of the window, both ends included.">
            <Field label="Opens" required error={errors.startDate}
              hint={live ? 'Fixed — the campaign has started.' : form.startDate > todayIso() ? 'Starting it early schedules it for this date.' : 'YYYY-MM-DD'}>
              <TextBox value={form.startDate} editable={!live} placeholder="YYYY-MM-DD" maxLength={10} onChange={(v) => set('startDate', v.trim())} />
            </Field>
            <Field label="Closes" required error={errors.endDate} hint="YYYY-MM-DD">
              <TextBox value={form.endDate} placeholder="YYYY-MM-DD" maxLength={10} onChange={(v) => set('endDate', v.trim())} />
            </Field>
            <View style={st.quick}>
              <Text style={st.quickLabel}>Length:</Text>
              {[7, 10, 14, 21, 30].map((n) => (
                <Chip key={n} label={`${n} days`} on={days === n}
                  onPress={() => set('endDate', addDays(ISO.test(form.startDate) ? form.startDate : todayIso(), n - 1))} />
              ))}
            </View>
            {days != null && days > 0 ? (
              <View style={{ marginTop: 10 }}>
                <NoteBar tone="blue" icon="calendar-outline">
                  {`${fmtDay(form.startDate)} to ${fmtDay(form.endDate)} — a ${days}-day window.${days < 5 ? ' That is short; response rates climb sharply over the first week.' : ''}`}
                </NoteBar>
              </View>
            ) : null}
            {year && ((year.endDate && form.endDate > isoOf(year.endDate)) || (year.startDate && form.startDate < isoOf(year.startDate))) ? (
              <View style={{ marginTop: 8 }}>
                <NoteBar tone="amber" icon="alert-circle">
                  {`This window runs outside ${year.yearName} (${fmtDay(year.startDate)} – ${fmtDay(year.endDate)}). The campaign still belongs to ${year.yearName}, but students may have moved on by then.`}
                </NoteBar>
              </View>
            ) : null}
          </FormSection>

          <FormSection title="Reminders">
            <Switch label="Remind students who have not answered" hint="A notification while the window is open."
              value={form.reminderEnabled} onChange={(v) => set('reminderEnabled', v)} />
            <Field label="Remind every" hint="Only students with something outstanding.">
              <Stepper value={form.reminderIntervalDays} min={1} max={30} suffix="days" disabled={!form.reminderEnabled} onChange={(v) => set('reminderIntervalDays', v)} />
            </Field>
          </FormSection>

          <FormSection title="Privacy" locked={live}>
            <Switch label="Anonymous" disabled={live} value={form.isAnonymous} onChange={(v) => set('isAnonymous', v)}
              hint="No teacher and no admin screen ever pairs a student with what they wrote. Submission is still recorded so nobody answers twice." />
            <Field label="Response floor" hint="A teacher’s figures stay hidden until this many students have answered about them.">
              <Stepper value={form.minimumResponses} min={1} max={50} suffix="responses" onChange={(v) => set('minimumResponses', v)} />
            </Field>
            <Switch label="Let an admin reopen a submitted response" hint="For a student who answered by mistake."
              value={form.allowResubmission} onChange={(v) => set('allowResubmission', v)} />
            {Number(form.minimumResponses) < 3 ? (
              <NoteBar tone="amber" icon="alert-circle">A floor under 3 can let a single student’s answers be worked out.</NoteBar>
            ) : null}
          </FormSection>

          <FormSection title="Summary">
            {[
              ['Questions', template ? `${template.name} · ${template.questionCount}` : form.questionCount != null ? `${form.questionCount} (fixed)` : '—'],
              ['Window', days && days > 0 ? `${fmtDay(form.startDate)} – ${fmtDay(form.endDate)} (${days}d)` : '—'],
              ['Reminders', form.reminderEnabled ? `Every ${plural(Number(form.reminderIntervalDays), 'day')}` : 'Off'],
              ['Response floor', plural(Number(form.minimumResponses), 'response')],
              ['Privacy', form.isAnonymous ? 'Anonymous' : 'Named'],
            ].map(([k, v]) => (
              <View key={k} style={st.sumRow}><Text style={st.sumK}>{k}</Text><Text style={st.sumV}>{v}</Text></View>
            ))}
            <Text style={st.sumFoot}>
              {live ? 'Live campaigns keep their audience; these numbers describe it.' : 'Counts are from today’s allocations. Starting the campaign creates the assignments.'}
            </Text>
          </FormSection>
        </>
      ) : null}
    </Sheet>
  );
}

function ChoiceRow({ icon, title, text, on, badge, disabled, onPress }: {
  icon: any; title: string; text: string; on?: boolean; badge?: string; disabled?: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[st.choice, on && st.choiceOn, disabled && !on && { opacity: 0.55 }]} onPress={onPress} disabled={disabled}
      accessibilityRole="radio" accessibilityState={{ checked: !!on, disabled }} accessibilityLabel={title}>
      <View style={[st.tplIcon, on && { backgroundColor: '#E0E7FF' }]}><Ionicons name={icon} size={17} color={on ? BRAND : Colors.textSecondary} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.tplName}>{title}</Text>
        <Text style={st.tplMeta}>{text}</Text>
      </View>
      {badge ? <Tag label={badge} tone="slate" /> : <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? BRAND : Colors.textLight} />}
    </TouchableOpacity>
  );
}

/** One audience list, at module scope so its search box keeps focus. */
function Group({ icon, title, picked, total, noun, onAll, children, search, onSearch }: {
  icon: any; title: string; picked: number; total: number; noun: string; onAll: () => void; children: React.ReactNode;
  search?: string; onSearch?: ((v: string) => void) | null;
}) {
  return (
    <View style={st.group}>
      <View style={st.groupHead}>
        <View style={st.tplIcon}><Ionicons name={icon} size={16} color="#7C3AED" /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.tplName}>{title}</Text>
          <Text style={st.tplMeta}>{picked ? `${picked} of ${total} picked` : `All ${total} ${noun}`}</Text>
        </View>
        {picked ? <Btn small kind="soft" label="Use all" onPress={onAll} /> : null}
      </View>
      {onSearch ? <View style={{ marginBottom: 8 }}><SearchBox value={search || ''} onChange={onSearch} placeholder={`Find ${noun}…`} /></View> : null}
      {children}
    </View>
  );
}

/** Classes → sections → subjects → teachers, each list narrowed by the one above. */
function Audience({ opt, form, reach, live, dropped, flip, retarget }: {
  opt: any; form: CampaignFormState; reach: ReturnType<typeof computeReach>; live: boolean; dropped: number;
  flip: (k: any, id: string) => void; retarget: (p: Partial<CampaignFormState>) => void;
}) {
  const [q, setQ] = useState({ classes: '', teachers: '' });
  const year = opt.academicYear;

  const classStats = useMemo(() => {
    const m = new Map<string, { sections: number; students: number }>();
    for (const x of opt.sections) {
      const cur = m.get(x.class) || { sections: 0, students: 0 };
      m.set(x.class, { sections: cur.sections + 1, students: cur.students + x.students });
    }
    return m;
  }, [opt]);

  const sectionRows = useMemo(() => {
    const base = form.targetClasses.length ? opt.sections.filter((x: any) => form.targetClasses.includes(x.class)) : opt.sections;
    const m = new Map<string, { className: string; rows: any[] }>();
    for (const x of base) {
      if (!m.has(x.class)) m.set(x.class, { className: x.className, rows: [] });
      m.get(x.class)!.rows.push(x);
    }
    return [...m.entries()];
  }, [opt, form.targetClasses]);

  if (live) {
    return (
      <FormSection title="Who it asks" locked
        hint="Frozen — changing the audience now would invalidate answers already given. Sync assignments on the campaign page picks up students who joined a targeted section later.">
        <NoteBar tone="slate" icon="people-outline">{`${reach.students} students in ${reach.sections} sections, about ${reach.teachers} teachers.`}</NoteBar>
      </FormSection>
    );
  }
  if (!year) return <FormError>No active academic year — there is nobody to target.</FormError>;

  const scopeIds = new Set(reach.scope.map((x: any) => x._id));
  const linksInScope = opt.links.filter((l: any) => scopeIds.has(l.section));
  const subjectTeachers = new Map<string, Set<string>>();
  for (const l of linksInScope) {
    if (!subjectTeachers.has(l.subject)) subjectTeachers.set(l.subject, new Set());
    subjectTeachers.get(l.subject)!.add(l.teacher);
  }
  const subjectsShown = opt.subjects.filter((x: any) => subjectTeachers.has(x._id));
  const unstaffed = opt.subjects.length - subjectsShown.length;
  const subj = new Set(form.targetSubjects);
  const teacherSubjects = new Map<string, Set<string>>();
  for (const l of linksInScope) {
    if (subj.size && !subj.has(l.subject)) continue;
    if (!teacherSubjects.has(l.teacher)) teacherSubjects.set(l.teacher, new Set());
    teacherSubjects.get(l.teacher)!.add(l.subject);
  }
  const subjectName = new Map(opt.subjects.map((x: any) => [x._id, x.subjectName]));
  const teachersShown = opt.teachers.filter((t: any) => teacherSubjects.has(t._id))
    .filter((t: any) => !q.teachers || t.name.toLowerCase().includes(q.teachers.toLowerCase()));
  const classesShown = opt.classes.filter((c: any) => classStats.has(c._id))
    .filter((c: any) => !q.classes || c.className.toLowerCase().includes(q.classes.toLowerCase()));

  return (
    <>
      {dropped > 0 ? (
        <View style={{ marginBottom: 10 }}>
          <NoteBar tone="amber" icon="alert-circle">{`${dropped} target(s) from another academic year were removed — they do not exist in ${year.yearName}.`}</NoteBar>
        </View>
      ) : null}
      <View style={{ marginBottom: 10 }}>
        <NoteBar tone="blue">Leave a list untouched to include everything in it. Each list only offers what the lists above it contain, and students are matched to their own teachers automatically — nobody is paired by hand.</NoteBar>
      </View>

      <Group icon="grid-outline" title="Classes" picked={form.targetClasses.length} total={classStats.size} noun="classes"
        onAll={() => retarget({ targetClasses: [] })} search={q.classes} onSearch={opt.classes.length > 12 ? (v) => setQ((x) => ({ ...x, classes: v })) : null}>
        <View style={st.chips}>
          {classesShown.map((c: any) => {
            const s = classStats.get(c._id)!;
            return <Chip key={c._id} label={c.className} sub={`${s.sections} sec · ${s.students}`} on={form.targetClasses.includes(c._id)} onPress={() => flip('targetClasses', c._id)} />;
          })}
          {!classesShown.length ? <Text style={st.muted}>No class of {year.yearName} has an active section.</Text> : null}
        </View>
      </Group>

      <Group icon="layers-outline" title="Sections" picked={form.targetSections.length}
        total={form.targetClasses.length ? sectionRows.reduce((n, [, g]) => n + g.rows.length, 0) : opt.sections.length}
        noun="sections" onAll={() => retarget({ targetSections: [] })}>
        <View style={{ gap: 9 }}>
          {sectionRows.map(([cid, g]) => (
            <View key={cid}>
              <Text style={st.secClass}>{g.className}</Text>
              <View style={st.chips}>
                {g.rows.map((x: any) => (
                  <Chip key={x._id} label={x.sectionName} sub={String(x.students)} on={form.targetSections.includes(x._id)} onPress={() => flip('targetSections', x._id)} />
                ))}
              </View>
            </View>
          ))}
        </View>
        {form.targetSections.length > 0 && form.targetClasses.length > 0 ? (
          <Text style={st.groupNote}>A picked section narrows its own class; a picked class with no section ticked keeps all of them.</Text>
        ) : null}
      </Group>

      <Group icon="book-outline" title="Subjects" picked={form.targetSubjects.length} total={subjectsShown.length} noun="subjects taught here"
        onAll={() => retarget({ targetSubjects: [] })}>
        <View style={st.chips}>
          {subjectsShown.map((x: any) => {
            const n = subjectTeachers.get(x._id)!.size;
            return <Chip key={x._id} label={x.subjectName} sub={plural(n, 'teacher')} on={form.targetSubjects.includes(x._id)} onPress={() => flip('targetSubjects', x._id)} />;
          })}
          {!subjectsShown.length ? <Text style={st.muted}>No subject has a teacher allocated in these sections.</Text> : null}
        </View>
        {unstaffed > 0 ? <Text style={st.groupNote}>{unstaffed} subject(s) of {year.yearName} have no teacher in these sections, so they are not offered.</Text> : null}
      </Group>

      <Group icon="person-outline" title="Teachers" picked={form.targetTeachers.length} total={teacherSubjects.size} noun="teachers"
        onAll={() => retarget({ targetTeachers: [] })} search={q.teachers} onSearch={teacherSubjects.size > 12 ? (v) => setQ((x) => ({ ...x, teachers: v })) : null}>
        <View style={{ gap: 6 }}>
          {teachersShown.map((t: any, i: number) => {
            const on = form.targetTeachers.includes(t._id);
            const subs = [...(teacherSubjects.get(t._id) || [])].map((id) => subjectName.get(id)).filter(Boolean);
            return (
              <TouchableOpacity key={t._id} style={[st.teach, on && st.choiceOn]} onPress={() => flip('targetTeachers', t._id)}
                accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={t.name}>
                <Avatar name={t.name} size={32} tone={toneAt(i)} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.tplName} numberOfLines={1}>{t.name}</Text>
                  <Text style={st.tplMeta} numberOfLines={1}>{subs.join(', ') || t.department || 'Teacher'}</Text>
                </View>
                <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={on ? BRAND : Colors.textLight} />
              </TouchableOpacity>
            );
          })}
          {!teachersShown.length ? <Text style={st.muted}>No teacher teaches in these sections{subj.size ? ' for the picked subjects' : ''}.</Text> : null}
        </View>
      </Group>
    </>
  );
}

// ── Lifecycle guards ──────────────────────────────────────────────────────────

/** Every one of these changes something students can see, so each says what it does to them. */
export const ACTION_COPY: Record<string, { title: string; confirm: string; message: string; danger?: boolean; icon: string }> = {
  activate: { icon: 'power', title: 'Start this campaign?', confirm: 'Start collecting',
    message: 'Assignments are generated for every matching student of the current academic year and they are notified straight away. The questions and the audience are frozen from this point — responses will be answered against them.' },
  close: { icon: 'checkmark-done-outline', title: 'Close this campaign?', confirm: 'Close it',
    message: 'Students can no longer submit, and anything outstanding is marked expired. Nothing is deleted — every response already collected stays available, and the results stay readable.' },
  archive: { icon: 'archive-outline', title: 'Archive this campaign?', confirm: 'Archive it',
    message: 'It drops out of the default lists and the campaign picker. All its data is kept and it still counts towards trends.' },
  delete: { icon: 'trash-outline', title: 'Delete this draft?', confirm: 'Delete draft', danger: true,
    message: 'Only a draft can be deleted, and this one has collected nothing. The draft and any assignments generated for it are removed for good.' },
  reminders: { icon: 'notifications-outline', title: 'Send a reminder now?', confirm: 'Send reminders',
    message: 'Every student who has not yet submitted gets a notification. Students who have already answered are not contacted.' },
  sync: { icon: 'sync-outline', title: 'Sync assignments?', confirm: 'Sync now',
    message: 'Picks up students who joined a targeted section after this campaign started, and creates their assignments. Nothing already collected is touched.' },
};

/**
 * Asks, runs and reports one lifecycle action. `flashNode` shows the outcome;
 * `onDone` reloads whatever the screen shows. Duplicate asks nothing — it only
 * makes a draft.
 */
export function useCampaignActions(onDone: () => void) {
  const [pending, setPending] = useState<{ row: any; action: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [flashNode, flash] = useFlash();

  const run = async () => {
    if (!pending) return;
    const { row, action } = pending;
    setBusy(true);
    try {
      if (action === 'activate') {
        const d: any = (await fb.activateCampaign(row._id) as any)?.data;
        flash(d?.status === 'scheduled' ? `Scheduled — it opens on ${fmtDay(row.startDate)}` : `Started — ${d?.created ?? 0} student assignment(s) created`);
      } else if (action === 'close') { await fb.closeCampaign(row._id); flash('Closed — the results stay available'); }
      else if (action === 'archive') { await fb.archiveCampaign(row._id); flash('Archived'); }
      else if (action === 'delete') { await fb.deleteCampaign(row._id); flash('Draft deleted'); }
      else if (action === 'reminders') { const d: any = (await fb.sendReminders(row._id) as any)?.data; flash(`Reminder sent to ${d?.reminded ?? 0} student(s)`); }
      else if (action === 'sync') {
        const d: any = (await fb.syncAssignments(row._id) as any)?.data;
        flash(d?.created ? `${d.created} new assignment(s) created` : 'Already up to date — no new students to add');
      } else if (action === 'duplicate') {
        await fb.duplicateCampaign(row._id, {}); flash(`Copied — “${row.name}” is now a fresh draft you can edit`);
      }
      setPending(null);
      onDone();
    } catch (e) {
      setPending(null);
      flash(errText(e), 'red');
    } finally { setBusy(false); }
  };

  const copy = pending && pending.action !== 'duplicate' ? ACTION_COPY[pending.action] : null;
  const dialog = (
    <Dialog visible={!!copy} icon={copy?.icon} danger={copy?.danger} title={copy?.title ?? ''}
      message={pending && copy ? `“${pending.row.name}” — ${copy.message}` : ''} confirmLabel={copy?.confirm}
      busy={busy} onClose={() => setPending(null)} onConfirm={run} />
  );

  const ask = (row: any, action: string) => setPending({ row, action });

  // Duplicate needs no question — it only creates a draft.
  useEffect(() => { if (pending?.action === 'duplicate' && !busy) run(); }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ask, dialog, flashNode, flash, busyId: busy ? pending?.row?._id : null };
}

/** Save a campaign form — create as draft, or update in place. */
export function useCampaignSave(onSaved: (created: boolean) => void) {
  const [form, setForm] = useState<CampaignFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async (f: any) => {
    setSaving(true); setError('');
    try {
      if (f._id) await fb.updateCampaign(f._id, f); else await fb.createCampaign(f);
      setForm(null);
      onSaved(!f._id);
    } catch (e) { setError(errText(e)); } finally { setSaving(false); }
  };
  const open = (f: CampaignFormState) => { setError(''); setForm(f); };
  const sheet = <CampaignSheet form={form} setForm={setForm} saving={saving} error={error} onClose={() => { setForm(null); setError(''); }} onSave={save} />;
  return { open, sheet };
}

const st = StyleSheet.create({
  footNote: { flex: 1, fontSize: 11.5, color: Colors.textSecondary },
  loadingText: { fontSize: 12.5, color: Colors.textSecondary, textAlign: 'center', paddingVertical: 30 },
  b: { fontWeight: '800', color: Colors.text },
  reach: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#EEF2FF', borderRadius: 14, borderWidth: 1, borderColor: '#E0E7FF', padding: 12, marginBottom: 12 },
  reachEmpty: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  reachBig: { fontSize: 24, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  reachLabel: { fontSize: 10.5, color: Colors.textSecondary },
  reachLine: { fontSize: 12, color: Colors.textSecondary },
  reachWarn: { fontSize: 11, color: '#B45309', fontWeight: '600', marginTop: 2 },
  year: { flexDirection: 'row', gap: 11, backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: '#E0E7FF', padding: 12, marginBottom: 12 },
  yearIcon: { width: 40, height: 40, borderRadius: 11, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  yearLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: Colors.textSecondary },
  yearName: { fontSize: 16, fontWeight: '800', color: Colors.text },
  current: { fontSize: 10.5, fontWeight: '800', color: '#15803D', backgroundColor: '#DCFCE7' },
  yearText: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16, marginTop: 2 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' },
  quickLabel: { fontSize: 12, color: Colors.textSecondary },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 10, backgroundColor: Colors.surface },
  choiceOn: { borderColor: '#A5B4FC', backgroundColor: '#F5F7FF' },
  tpl: { borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 12, backgroundColor: Colors.surface, gap: 6 },
  tplOn: { borderColor: BRAND, backgroundColor: '#F5F7FF' },
  tplTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tplIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  tplName: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  tplDef: { fontSize: 10.5, fontWeight: '800', color: BRAND },
  tplMeta: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 1 },
  tplDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  tplSample: { fontSize: 11.5, color: Colors.text },
  tplMore: { fontSize: 11, color: Colors.textSecondary, fontStyle: 'italic' },
  group: { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 10 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  groupNote: { fontSize: 11, color: Colors.textSecondary, marginTop: 8, lineHeight: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  secClass: { fontSize: 11.5, fontWeight: '800', color: Colors.textSecondary, marginBottom: 5 },
  teach: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 8 },
  muted: { fontSize: 12, color: Colors.textSecondary },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  sumK: { fontSize: 12.5, color: Colors.textSecondary },
  sumV: { fontSize: 12.5, fontWeight: '700', color: Colors.text, flexShrink: 1, textAlign: 'right' },
  sumFoot: { fontSize: 11, color: Colors.textSecondary, marginTop: 8, lineHeight: 15 },
});
