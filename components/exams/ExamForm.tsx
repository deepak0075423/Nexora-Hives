import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { unwrap, FormModal, Input, Select } from '@/components/ui/kit';
import { examApi, ExamSide } from './examApi';
import { plural } from './parts';

/**
 * Create or edit an exam's details — for a teacher or the school office.
 *
 * A teacher's form offers only what the server will accept
 * (services/examPermissions.js): any subject in a section they are class
 * teacher or vice class teacher of, and only the subjects they teach elsewhere.
 * The meta says so with `restricted`; the school office's meta is not
 * restricted, and every section of the year is open to it.
 */

const err = (e: any) => e?.data?.message ?? e?.message ?? 'Something went wrong';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const blank = () => ({
  title: '', subjectId: '', sectionIds: [] as string[], examDate: today(), startTime: '10:00',
  duration: '60', totalQuestions: '10', totalMarks: '10', maxViolations: '3',
});

const fromExam = (e: any) => ({
  title: e.title ?? '',
  subjectId: String(e.subject?._id ?? e.subject ?? ''),
  sectionIds: (e.sections ?? []).map((x: any) => String(x?._id ?? x)),
  examDate: e.examDate ? new Date(e.examDate).toISOString().slice(0, 10) : today(),
  startTime: e.startTime ?? '10:00',
  duration: String(e.duration ?? 60),
  totalQuestions: String(e.totalQuestions ?? 10),
  totalMarks: String(e.totalMarks ?? 10),
  maxViolations: String(e.maxViolations ?? 3),
});

export default function ExamForm({ visible, side, exam, onClose, onSaved }: {
  visible: boolean; side: ExamSide; exam?: any; onClose: () => void; onSaved: (id: string) => void;
}) {
  const xapi = examApi(side);
  const [meta, setMeta] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState(blank());
  const editing = !!exam?._id;

  useEffect(() => {
    if (!visible) return;
    setF(editing ? fromExam(exam) : blank());
    xapi.meta().then((r) => setMeta(unwrap(r))).catch((e) => Alert.alert('Could not load classes', err(e)));
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const restricted = !!meta?.restricted;
  const classes: any[] = meta?.classes ?? [];
  const subjects: any[] = meta?.subjects ?? [];
  // A General Aptitude exam is open to the office, and to a class or vice class teacher.
  const canGeneral = !restricted || classes.some((c) => c.sections.some((x: any) => x.general));
  const allows = (sec: any) => !restricted || (f.subjectId ? (sec.subjectIds ?? []).includes(f.subjectId) : !!sec.general);

  useEffect(() => {
    if (!visible || editing) return;
    if (!canGeneral && !f.subjectId && subjects.length) setF((x) => ({ ...x, subjectId: subjects[0]._id }));
  }, [visible, canGeneral, subjects.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Changing the subject drops the sections it can no longer go to. Sections
  // the picker does not list are left alone — they are the server's to judge.
  useEffect(() => {
    const blocked = classes.flatMap((c) => c.sections.filter((x: any) => !allows(x)).map((x: any) => String(x._id)));
    setF((x) => (x.sectionIds.some((id) => blocked.includes(id)) ? { ...x, sectionIds: x.sectionIds.filter((id) => !blocked.includes(id)) } : x));
  }, [f.subjectId, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setF((x) => ({ ...x, sectionIds: x.sectionIds.includes(id) ? x.sectionIds.filter(s => s !== id) : [...x.sectionIds, id] }));

  const reach = classes.flatMap(c => c.sections).filter((x: any) => f.sectionIds.includes(String(x._id)));
  const problems: string[] = [];
  if (!f.title.trim()) problems.push('Give the exam a title');
  if (!f.sectionIds.length) problems.push('Choose at least one section');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.examDate)) problems.push('Date must be YYYY-MM-DD');
  if (!/^\d{1,2}:\d{2}$/.test(f.startTime)) problems.push('Start time must be HH:MM');
  if (!(Number(f.duration) >= 1)) problems.push('Duration must be at least 1 minute');
  if (!(Number(f.totalQuestions) >= 1)) problems.push('Total questions must be at least 1');
  if (!(Number(f.totalMarks) >= 1)) problems.push('Total marks must be at least 1');

  const submit = async () => {
    if (problems.length) { Alert.alert('Check the form', problems[0]); return; }
    setSaving(true);
    const body = {
      title: f.title.trim(), subjectId: f.subjectId || null, sectionIds: f.sectionIds,
      examDate: f.examDate, startTime: f.startTime,
      duration: Number(f.duration), totalQuestions: Number(f.totalQuestions), totalMarks: Number(f.totalMarks),
      maxViolations: Number(f.maxViolations) || 3,
    };
    try {
      const saved = unwrap(editing ? await xapi.update(exam._id, body) : await xapi.create(body));
      onSaved(String(saved?._id ?? exam?._id));
    } catch (e: any) {
      // The server refuses a subject or a section this person may not set.
      Alert.alert(editing ? 'Not saved' : 'Cannot create this exam', err(e));
    } finally { setSaving(false); }
  };

  return (
    <FormModal
      visible={visible}
      title={editing ? 'Edit exam' : 'Create exam'}
      onClose={onClose}
      onSubmit={submit}
      submitting={saving}
      submitLabel={editing ? 'Save changes' : 'Create draft'}
    >
      <Input label="Title" value={f.title} onChange={(v) => setF(x => ({ ...x, title: v }))} placeholder="e.g. Logical Reasoning Assessment" />
      <Select
        label="Subject"
        value={f.subjectId}
        onChange={(v) => setF(x => ({ ...x, subjectId: v }))}
        placeholder={canGeneral ? 'General Aptitude (no subject)' : 'Choose a subject'}
        options={[...(canGeneral ? [{ label: 'General Aptitude (no subject)', value: '' }] : []), ...subjects.map(s => ({ label: s.subjectName, value: String(s._id) }))]}
      />
      {restricted && (
        <Text style={s.hint}>
          {canGeneral
            ? 'Any subject in a class you are class teacher or vice class teacher of; elsewhere, only the subjects you teach.'
            : 'You can set exams for the subjects you are assigned to teach.'}
        </Text>
      )}

      <Text style={s.fieldLabel}>
        Who sits it{reach.length ? ` · ${plural(reach.length, 'section')} · ${plural(reach.reduce((n: number, x: any) => n + (x.students ?? 0), 0), 'student')}` : ''}
      </Text>
      {classes.length > 0 && <Text style={s.hint}>Tap sections to include them. The number on each is its student count.</Text>}
      {meta && classes.length === 0 ? (
        <Text style={s.hint}>
          {restricted
            ? 'You are not a class teacher, vice class teacher or subject teacher of any section this year, so you cannot set exams. Ask your school admin to assign you.'
            : 'There are no active sections in the current academic year.'}
        </Text>
      ) : classes.map((c) => (
        <View key={c._id} style={s.pickRow}>
          <Text style={s.pickClass}>{c.className}</Text>
          <View style={s.pickSecs}>
            {c.sections.map((sec: any) => {
              const on = f.sectionIds.includes(String(sec._id));
              const blocked = !allows(sec);
              return (
                <TouchableOpacity
                  key={sec._id}
                  style={[s.pickSec, on && s.pickSecOn, blocked && s.pickSecOff]}
                  disabled={blocked}
                  onPress={() => toggle(String(sec._id))}
                >
                  <Text style={[s.pickSecText, on && { color: Colors.primary, fontWeight: '700' }]}>{sec.sectionName}</Text>
                  <Text style={s.pickSecSub}>{sec.students}</Text>
                  {sec.role && sec.role !== 'subject_teacher' && <Text style={s.pickRole}>{sec.role === 'class_teacher' ? 'CT' : 'VCT'}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}

      <Input label="Date (YYYY-MM-DD)" value={f.examDate} onChange={(v) => setF(x => ({ ...x, examDate: v }))} placeholder="2026-09-25" />
      <Input label="Start time (HH:MM, 24-hour)" value={f.startTime} onChange={(v) => setF(x => ({ ...x, startTime: v }))} placeholder="10:00" />
      <Input label="Duration (minutes)" value={f.duration} onChange={(v) => setF(x => ({ ...x, duration: v }))} keyboardType="numeric" />
      <Input label="Total questions" value={f.totalQuestions} onChange={(v) => setF(x => ({ ...x, totalQuestions: v }))} keyboardType="numeric" />
      <Input label="Total marks" value={f.totalMarks} onChange={(v) => setF(x => ({ ...x, totalMarks: v }))} keyboardType="numeric" />
      <Input label="Allowed app switches before auto-submit" value={f.maxViolations} onChange={(v) => setF(x => ({ ...x, maxViolations: v }))} keyboardType="numeric" />
      <Text style={s.hint}>
        To publish, the exam needs exactly {plural(Number(f.totalQuestions) || 0, 'question')} whose marks add up to {Number(f.totalMarks) || 0}.
      </Text>
    </FormModal>
  );
}

const s = StyleSheet.create({
  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginTop: Spacing.sm, marginBottom: 6 },
  hint: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16, marginBottom: Spacing.sm },
  pickRow: { marginBottom: 10 },
  pickClass: { fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  pickSecs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pickSec: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  pickSecOn: { borderColor: Colors.primary, backgroundColor: '#EDE9FE' },
  pickSecOff: { opacity: 0.4 },
  pickSecText: { fontSize: 12, fontWeight: '600', color: Colors.text },
  pickSecSub: { fontSize: 10, color: Colors.textLight },
  pickRole: { fontSize: 9, fontWeight: '800', color: '#4338CA', backgroundColor: '#E0E7FF', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
});
