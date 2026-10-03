/**
 * Create an exam, or edit one, on the phone (Oct 2026) — the web's four-step
 * form as one scrolling page (POST/PUT /admin/results/exams):
 *
 *   where      the year, the class and its sections — one exam is made for
 *              each section ticked
 *   what       its name, type, code and term
 *   when       its dates, the result date, when marks are due
 *   subjects   what the class is taught, each with its maximum and pass
 *              marks — or graded only; a paper's own day if it has one
 *   options    the student portal, the overall result, the rank, the notice,
 *              sharing the timetable; for a final, promotion
 *
 * `?id=` edits: the server says what may still change at the exam's step
 * (subjects are fixed once marks are entered against them), and refuses the
 * rest with its reason. A paper marked in parts keeps its parts here; parts
 * themselves are set up on the web.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as R from '@/api/results.api';
import { Empty, LoaderView, Select, Toggle, FormModal, unwrap } from '@/components/ui/kit';
import { fmtDay, plural } from '@/components/results/parts';
import { DayPicker } from '@/components/attendance/parts';
import { os, say } from '@/components/results/office';

type Paper = { subject: string; name: string; include: boolean; maxMarks: string; passingMarks: string; gradeOnly: boolean; examDate: string; components: any; startTime: string; endTime: string; untaught?: boolean };
const day = (d: any) => (d ? String(d).slice(0, 10) : '');

export default function ResultFormScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const [meta, setMeta] = useState<any>(null);
  const [exam, setExam] = useState<any>(null);
  const [loadError, setLoadError] = useState('');
  const [f, setF] = useState<any>({
    academicYear: '', classId: '', sections: [] as string[], title: '', examType: '', code: '', term: '', description: '',
    startDate: '', endDate: '', publishDate: '', marksDueDate: '',
    showInPortal: true, includeInOverall: false, showRank: true, notifyOnPublish: true, shareTimetable: true,
    promoteOnPass: true, promoteSection: 'same', failedPlacement: 'stay',
  });
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);   // which date: 'startDate' … or `paper:<id>`
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: any) => { setF((x: any) => ({ ...x, ...patch })); setError(''); };

  useEffect(() => {
    (async () => {
      try {
        const m = unwrap(await R.office.formMeta());
        setMeta(m);
        if (editing) {
          const e = unwrap(await R.office.exam(String(id)));
          setExam(e);
          set({
            academicYear: String(e.academicYear?._id || ''), classId: String(e.class?._id || ''), sections: [String(e.section?._id || '')],
            title: e.title || '', examType: e.typeKey || e.examType, code: e.code || '', term: e.term || '', description: e.description || '',
            startDate: day(e.startDate), endDate: day(e.endDate), publishDate: day(e.publishDate), marksDueDate: day(e.marksDueDate),
            showInPortal: e.options?.showInPortal !== false, includeInOverall: !!e.options?.includeInOverall, showRank: e.options?.showRank !== false,
            notifyOnPublish: e.options?.notifyOnPublish !== false, promoteOnPass: !!e.options?.promoteOnPass,
            promoteSection: e.options?.promoteSection || 'same', failedPlacement: e.options?.failedPlacement || 'stay',
          });
          const offered = (unwrap(await R.office.formSubjects({ sections: String(e.section?._id || '') })) || []) as any[];
          const have = new Map((e.subjects || []).map((x: any) => [String(x.subject._id), x]));
          setPapers([
            ...(e.subjects || []).map((x: any) => ({
              subject: String(x.subject._id), name: x.subject.subjectName, include: true, maxMarks: String(x.maxMarks), passingMarks: String(x.passingMarks),
              gradeOnly: !!x.gradeOnly, examDate: day(x.examDate), components: x.components || null, startTime: x.startTime || '', endTime: x.endTime || '',
            })),
            ...offered.filter((o) => !have.has(String(o._id))).map((o) => ({
              subject: String(o._id), name: o.subjectName, include: false, maxMarks: '100', passingMarks: '33', gradeOnly: false, examDate: '', components: null, startTime: '', endTime: '',
            })),
          ]);
        } else {
          const year = m.years.find((y: any) => y.current) || m.years[0];
          set({ academicYear: String(year?._id || ''), examType: m.examTypes[0]?.value || '' });
        }
      } catch (err: any) { setLoadError(err?.message || 'The form could not be loaded'); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const classes = useMemo(() => (meta?.classes || []).filter((c: any) => String(c.academicYear) === f.academicYear), [meta, f.academicYear]);
  const cls = classes.find((c: any) => String(c._id) === f.classId);
  const type = (meta?.allExamTypes || meta?.examTypes || []).find((t: any) => t.value === f.examType);
  const isFinal = type?.kind === 'FINAL' || (editing && exam?.examType === 'FINAL');
  const locked = editing && exam?.status !== 'DRAFT';

  // The subjects the ticked sections are taught (a new exam).
  useEffect(() => {
    if (editing || !f.sections.length) { if (!editing) setPapers([]); return; }
    let alive = true;
    setLoadingSubjects(true);
    R.office.formSubjects({ sections: f.sections.join(',') }).then((res: any) => {
      if (!alive) return;
      const list = (unwrap(res) || []) as any[];
      setPapers(list.map((o) => ({
        subject: String(o._id), name: o.subjectName, include: true, maxMarks: '100', passingMarks: '33', gradeOnly: false,
        examDate: '', components: null, startTime: '', endTime: '', untaught: !!o.untaught?.length,
      })));
    }).catch(() => { if (alive) setPapers([]); }).finally(() => { if (alive) setLoadingSubjects(false); });
    return () => { alive = false; };
  }, [editing, f.sections]);

  const setPaper = (sid: string, patch: Partial<Paper>) => { setPapers((list) => list.map((p) => (p.subject === sid ? { ...p, ...patch } : p))); setError(''); };

  const save = async () => {
    const chosen = papers.filter((p) => p.include);
    if (!editing && !f.sections.length) { setError('Tick at least one section'); return; }
    if (!f.title.trim()) { setError('Give the exam a name'); return; }
    if (!f.startDate || !f.endDate) { setError('Choose the dates the exam starts and ends'); return; }
    if (!chosen.length) { setError('Add at least one subject'); return; }
    const bad = chosen.find((p) => !p.gradeOnly && !p.components && (!(Number(p.maxMarks) >= 1) || !(Number(p.passingMarks) >= 0) || Number(p.passingMarks) > Number(p.maxMarks)));
    if (bad) { setError(`${bad.name}: give a maximum of 1 or more, and a pass mark no more than it`); return; }
    const body: any = {
      title: f.title.trim(), examType: f.examType, code: f.code.trim(), description: f.description.trim(), term: f.term,
      startDate: f.startDate, endDate: f.endDate, publishDate: f.publishDate || null, marksDueDate: f.marksDueDate || null,
      subjects: chosen.map((p) => ({
        subject: p.subject, gradeOnly: p.gradeOnly, components: p.gradeOnly ? null : p.components,
        maxMarks: p.gradeOnly ? 100 : Number(p.maxMarks), passingMarks: p.gradeOnly ? 0 : Number(p.passingMarks),
        examDate: p.examDate || null, startTime: p.examDate ? p.startTime : '', endTime: p.examDate ? p.endTime : '',
      })),
      showInPortal: f.showInPortal, includeInOverall: f.includeInOverall, showRank: f.showRank, notifyOnPublish: f.notifyOnPublish,
      ...(isFinal ? { promoteOnPass: f.promoteOnPass, promoteSection: f.promoteSection, failedPlacement: f.failedPlacement } : null),
    };
    setBusy(true); setError('');
    try {
      if (editing) {
        await R.office.update(String(id), body);
        say('Saved', 'The exam has been updated.');
        router.back();
      } else {
        const res: any = await R.office.create({ ...body, academicYear: f.academicYear, sectionIds: f.sections, shareTimetable: f.shareTimetable });
        const made = res?.exams || [unwrap(res)];
        say('Exam created', made.length > 1 ? `${plural(made.length, 'exam')} made — one for each section, as drafts.` : 'Made as a draft. Open mark entry when the teachers should start.');
        router.replace({ pathname: '/modules/admin/result-exam', params: { id: String(made[0]._id) } } as any);
      }
    } catch (err: any) { setError(err?.message || 'The exam could not be saved'); }
    finally { setBusy(false); }
  };

  if (loadError) return (<><Stack.Screen options={{ title: editing ? 'Edit Exam' : 'New Exam' }} /><Empty icon="alert-circle-outline" text={loadError} /></>);
  if (!meta || (editing && !exam)) return (<><Stack.Screen options={{ title: editing ? 'Edit Exam' : 'New Exam' }} /><LoaderView /></>);

  const dateField = (key: string, label: string, optional = false) => (
    <TouchableOpacity style={x.date} onPress={() => setPicking(key)} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={x.dateLabel}>{label}{optional ? ' (optional)' : ''}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={[x.dateValue, !f[key] && { color: Colors.textLight }]}>{f[key] ? fmtDay(f[key]) : optional ? 'None' : 'Choose…'}</Text>
        {optional && f[key] ? <TouchableOpacity onPress={() => set({ [key]: '' })} hitSlop={8}><Ionicons name="close-circle" size={16} color={Colors.textLight} /></TouchableOpacity> : null}
      </View>
    </TouchableOpacity>
  );
  const pickedPaper = picking?.startsWith('paper:') ? papers.find((p) => p.subject === picking.slice(6)) : null;

  return (
    <>
      <Stack.Screen options={{ title: editing ? 'Edit Exam' : 'New Exam' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={os.screen} contentContainerStyle={[os.body, { paddingBottom: 30 }]} keyboardShouldPersistTaps="handled">
          {editing && exam.status !== 'DRAFT' ? <Text style={os.note}>Mark entry has opened: the type is fixed, and a subject with marks entered keeps its maximum and how it is marked. The server says if anything else cannot change.</Text> : null}

          <View style={os.card}>
            <Text style={os.cap}>WHERE</Text>
            {editing ? (
              <Text style={os.lineName}>{[exam.className, exam.sectionName].filter(Boolean).join(' – ')} · {exam.yearName}</Text>
            ) : (
              <>
                <Select label="Academic year" value={f.academicYear} onChange={(v) => set({ academicYear: v, classId: '', sections: [] })}
                  options={meta.years.map((y: any) => ({ value: String(y._id), label: `${y.yearName}${y.current ? ' (current)' : ''}` }))} />
                <Select label="Class" value={f.classId} onChange={(v) => {
                  const c = classes.find((c2: any) => String(c2._id) === v);
                  set({ classId: v, sections: (c?.sections || []).map((s2: any) => String(s2._id)) });
                }} options={classes.map((c: any) => ({ value: String(c._id), label: c.className }))} placeholder="Choose the class…" />
                {cls ? (
                  <>
                    <Text style={x.label}>Sections — one exam is made for each</Text>
                    <View style={x.chips}>
                      {cls.sections.map((s2: any) => {
                        const on = f.sections.includes(String(s2._id));
                        return (
                          <TouchableOpacity key={s2._id} style={[x.chip, on && x.chipOn]} onPress={() => set({ sections: on ? f.sections.filter((v: string) => v !== String(s2._id)) : [...f.sections, String(s2._id)] })}
                            accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                            <Text style={[x.chipText, on && { color: '#fff' }]}>{s2.sectionName} · {s2.students}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                ) : null}
              </>
            )}
          </View>

          <View style={os.card}>
            <Text style={os.cap}>WHAT</Text>
            <Text style={x.label}>Name</Text>
            <TextInput style={x.input} value={f.title} onChangeText={(v) => set({ title: v.slice(0, 120) })} placeholder="e.g. Half Yearly Examination" placeholderTextColor={Colors.textLight} />
            {locked ? <Text style={[os.lineSub, { marginBottom: 8 }]}>Type: {exam.examTypeLabel} (fixed once mark entry opened)</Text> : (
              <Select label="Type" value={f.examType} onChange={(v) => set({ examType: v })}
                options={(meta.examTypes || []).map((t: any) => ({ value: t.value, label: t.label }))} />
            )}
            <Text style={x.label}>Code (optional)</Text>
            <TextInput style={x.input} value={f.code} autoCapitalize="characters" onChangeText={(v) => set({ code: v.toUpperCase().slice(0, 20) })} placeholder="e.g. HY2026" placeholderTextColor={Colors.textLight} />
            {meta.terms?.length ? (
              <Select label="Term" value={f.term} onChange={(v) => set({ term: v })} options={[{ value: '', label: 'No term' }, ...meta.terms.map((t: any) => ({ value: t.key, label: t.label }))]} />
            ) : null}
            <Text style={x.label}>Description (optional)</Text>
            <TextInput style={[x.input, { minHeight: 60, textAlignVertical: 'top' }]} multiline value={f.description} onChangeText={(v) => set({ description: v.slice(0, 500) })}
              placeholder="e.g. Chapters 1 to 6 in every subject" placeholderTextColor={Colors.textLight} />
          </View>

          <View style={os.card}>
            <Text style={os.cap}>WHEN</Text>
            {dateField('startDate', 'Starts')}
            {dateField('endDate', 'Ends')}
            {dateField('publishDate', 'Result date', true)}
            {dateField('marksDueDate', 'Marks due by', true)}
            {!f.marksDueDate && meta.marksDueDays != null && !editing ? <Text style={os.lineSub}>Left empty: due {plural(meta.marksDueDays, 'day')} after the exam ends.</Text> : null}
          </View>

          <View style={os.card}>
            <Text style={os.cap}>SUBJECTS</Text>
            {loadingSubjects ? <ActivityIndicator color={Colors.primary} /> : null}
            {!editing && !f.sections.length ? <Text style={os.lineSub}>Choose the class and its sections first.</Text> : null}
            {!loadingSubjects && f.sections.length && !papers.length ? <Text style={os.lineSub}>This class has no subjects yet — add them under Subjects.</Text> : null}
            {papers.map((p) => (
              <View key={p.subject} style={[x.paper, !p.include && { opacity: 0.6 }]}>
                <TouchableOpacity style={x.paperHead} onPress={() => setPaper(p.subject, { include: !p.include })} accessibilityRole="checkbox" accessibilityState={{ checked: p.include }}>
                  <Ionicons name={p.include ? 'checkbox' : 'square-outline'} size={20} color={p.include ? Colors.primary : Colors.textLight} />
                  <Text style={[os.lineName, { flex: 1 }]} numberOfLines={1}>{p.name}</Text>
                  {p.untaught ? <Text style={x.warnTag}>no teacher</Text> : null}
                </TouchableOpacity>
                {p.include ? (
                  <>
                    {p.components ? (
                      <Text style={os.lineSub}>In parts: {p.components.map((c: any) => `${c.label} ${c.maxMarks}`).join(' + ')} (set on the web)</Text>
                    ) : !p.gradeOnly ? (
                      <View style={x.marks}>
                        <View style={{ flex: 1 }}>
                          <Text style={x.small}>Max</Text>
                          <TextInput style={x.input} keyboardType="number-pad" value={p.maxMarks} onChangeText={(v) => setPaper(p.subject, { maxMarks: v.replace(/[^0-9.]/g, '') })} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={x.small}>Pass</Text>
                          <TextInput style={x.input} keyboardType="number-pad" value={p.passingMarks} onChangeText={(v) => setPaper(p.subject, { passingMarks: v.replace(/[^0-9.]/g, '') })} />
                        </View>
                      </View>
                    ) : null}
                    <View style={x.paperFoot}>
                      {!p.components ? (
                        <TouchableOpacity style={x.mini} onPress={() => setPaper(p.subject, { gradeOnly: !p.gradeOnly })} accessibilityRole="checkbox" accessibilityState={{ checked: p.gradeOnly }}>
                          <Ionicons name={p.gradeOnly ? 'checkbox' : 'square-outline'} size={16} color={p.gradeOnly ? Colors.primary : Colors.textLight} />
                          <Text style={x.miniText}>Graded only</Text>
                        </TouchableOpacity>
                      ) : <View />}
                      <TouchableOpacity style={x.mini} onPress={() => setPicking(`paper:${p.subject}`)}>
                        <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
                        <Text style={x.miniText}>{p.examDate ? fmtDay(p.examDate) : 'Paper’s day'}</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : null}
              </View>
            ))}
          </View>

          <View style={os.card}>
            <Text style={os.cap}>OPTIONS</Text>
            <Toggle label="Show in the student portal" value={f.showInPortal} onChange={(v) => set({ showInPortal: v })} sub="Students and parents see the results once published" />
            <Toggle label="Include in the overall result" value={f.includeInOverall} onChange={(v) => set({ includeInOverall: v })} sub="Counted in the year’s result" />
            <Toggle label="Show the rank" value={f.showRank} onChange={(v) => set({ showRank: v })} sub="Families see the student’s place" />
            <Toggle label="Notify on publishing" value={f.notifyOnPublish} onChange={(v) => set({ notifyOnPublish: v })} sub="A notice when the results are out" />
            {!editing ? <Toggle label="Share the timetable with families now" value={f.shareTimetable} onChange={(v) => set({ shareTimetable: v })} sub="Off: kept back until it is shared from the exam" /> : null}
            {isFinal ? (
              <>
                <Toggle label="Promote students who pass" value={f.promoteOnPass} onChange={(v) => set({ promoteOnPass: v })} sub="On the result date, to the next class" />
                {f.promoteOnPass ? (
                  <>
                    <Select label="Promote into" value={f.promoteSection} onChange={(v) => set({ promoteSection: v })}
                      options={[{ value: 'same', label: 'The same section' }, { value: 'none', label: 'No section — the school places them' }]} />
                    <Select label="Students who do not pass" value={f.failedPlacement} onChange={(v) => set({ failedPlacement: v })}
                      options={[{ value: 'stay', label: 'Stay where they are' }, { value: 'repeat', label: 'Repeat the class next year' }]} />
                  </>
                ) : null}
              </>
            ) : null}
            <Text style={os.lineSub}>Grace marks and papers in parts are set on the web.</Text>
          </View>

          {error ? <Text style={os.bad}>{error}</Text> : null}
        </ScrollView>
        <View style={[x.foot, { paddingBottom: Spacing.sm + insets.bottom }]}>
          <TouchableOpacity style={[os.btn, { height: 46 }]} onPress={save} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={os.btnText}>{editing ? 'Save Changes' : f.sections.length > 1 ? `Create ${f.sections.length} Exams` : 'Create Exam'}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <FormModal visible={!!picking} title={pickedPaper ? `${pickedPaper.name} — its day` : 'Choose the day'} onClose={() => setPicking(null)}>
        <DayPicker value={pickedPaper ? pickedPaper.examDate || f.startDate : (picking ? f[picking] : '') || f.startDate}
          min={pickedPaper ? f.startDate || undefined : undefined} max={pickedPaper ? f.endDate || undefined : undefined}
          onChange={(k) => { if (pickedPaper) setPaper(pickedPaper.subject, { examDate: k }); else if (picking) set({ [picking]: k }); setPicking(null); }} />
        {pickedPaper?.examDate ? (
          <TouchableOpacity onPress={() => { setPaper(pickedPaper.subject, { examDate: '' }); setPicking(null); }} style={{ paddingVertical: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.primary }}>No day of its own</Text>
          </TouchableOpacity>
        ) : null}
      </FormModal>
    </>
  );
}

const x = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 4, marginTop: 4 },
  small: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, marginBottom: 3 },
  input: { minHeight: 42, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt, paddingHorizontal: 10, fontSize: 15, color: Colors.text, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.text },
  date: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.divider },
  dateLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },
  dateValue: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  paper: { borderTopWidth: 1, borderTopColor: Colors.divider, paddingVertical: 8 },
  paperHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34 },
  marks: { flexDirection: 'row', gap: 10, marginTop: 6 },
  paperFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  miniText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  warnTag: { fontSize: 10.5, fontWeight: '700', color: Colors.warning },
  foot: { backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
});
