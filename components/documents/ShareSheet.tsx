/**
 * Share a document from the phone, or change one (Nov 2026) — the counterpart
 * of the web's two share forms (pages/teacher/ShareDocument.jsx,
 * pages/admin/ShareDocument.jsx).
 *
 * The same four questions: what is it, who gets it, how is it filed, what is
 * attached. A teacher picks from the sections they teach this year; the office
 * picks how wide first (whole school, whole classes, sections, all teachers,
 * or teachers by name — narrowed by department, subject or designation) and
 * then which.
 *
 * `editing` opens it on an existing document: its files are listed and each
 * stays unless it is taken off, and whatever the form does not ask about (the
 * question breakdown, the kind of work) is left exactly as it was.
 *
 * The rules are the server's: an assignment needs a file, cannot go to
 * teachers alone, and its due date is a day (due at the end of it).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '@/constants/theme';
import { FormModal, Input, Select, Toggle } from '@/components/ui/kit';
import { DocPick, appendDocFiles, type Picked } from './filePick';

const TYPES = [
  { value: 'notice', label: 'Notice' },
  { value: 'circular', label: 'Circular' },
  { value: 'study_material', label: 'Study material' },
  { value: 'assignment', label: 'Assignment — work to hand in' },
  { value: 'other', label: 'Other' },
];

const AUDIENCES = [
  { value: 'whole_school', label: 'Whole school' },
  { value: 'class', label: 'Whole classes' },
  { value: 'class_sections', label: 'Specific sections' },
  { value: 'all_teachers', label: 'All teachers' },
  { value: 'specific_teachers', label: 'Specific teachers' },
];
const STAFF_AUDIENCES = ['all_teachers', 'specific_teachers'];

const KINDS = [
  { value: 'homework', label: 'Homework' }, { value: 'classwork', label: 'Classwork' },
  { value: 'project', label: 'Project' }, { value: 'practice', label: 'Practice' },
  { value: 'lab', label: 'Lab work' }, { value: 'reading', label: 'Reading' },
];
/** The marking form's own line for what the named questions leave over. */
const RESERVED_QUESTION = 'other marks';
type Question = { label: string; maxMarks: string };

const EMPTY = {
  docType: 'notice', isAssignment: false, title: '', description: '', category: '', subject: '',
  targetType: 'whole_school', classIds: [] as string[], sectionIds: [] as string[], teacherIds: [] as string[],
  dueDate: '', totalMarks: '', allowSubmission: true,
  assignmentType: 'homework', questions: [] as Question[],
};

// How many teachers are drawn at once — the filters are how a long staff list is read.
const PEOPLE_SHOWN = 40;

const Chip = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
  <TouchableOpacity style={[s.chip, on && s.chipOn]} onPress={onPress}
    accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label}>
    <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={15} color={on ? Colors.primary : Colors.textLight} />
    <Text style={[s.chipText, on && { color: Colors.primary }]}>{label}</Text>
  </TouchableOpacity>
);

const optionsOf = (list: any[], pick: (t: any) => string[]) =>
  [...new Set(list.flatMap(pick).filter(Boolean))].sort((a, b) => a.localeCompare(b));

export function ShareSheet({ visible, onClose, onDone, mode, sections = [], classes = [], teachers = [], categories = [], send, editing = null, update }: {
  visible: boolean; onClose: () => void; onDone: () => void; mode: 'teacher' | 'admin';
  /** A teacher's own sections this year: [{ _id, label }]. */
  sections?: { _id: string; label: string }[];
  /** The office's picker: classes, each with its sections. */
  classes?: any[];
  /** The office's staff list: [{ _id, name, department, designation, subjects }]. */
  teachers?: any[];
  categories?: string[];
  send: (body: FormData) => Promise<any>;
  /** The document being changed (the detail page's header payload), and how to save it. */
  editing?: any;
  update?: (id: string, body: FormData) => Promise<any>;
}) {
  const [f, setF] = useState({ ...EMPTY });
  const [files, setFiles] = useState<Picked[]>([]);
  const [kept, setKept] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [find, setFind] = useState('');
  const [by, setBy] = useState({ department: '', subject: '', designation: '' });
  const set = (patch: Partial<typeof EMPTY>) => setF((v) => ({ ...v, ...patch }));

  const offered = (id: string) => sections.some((x) => String(x._id) === id);
  // Sections already on the document that this form cannot offer — an earlier
  // year's, or a class no longer taught. They stay on it; the server keeps them.
  const locked = editing && mode === 'teacher'
    ? (editing.targetSections || []).map(String).filter((id: string) => !offered(id)).length : 0;
  const dueWas = editing?.dueDate ? String(editing.dueDate).slice(0, 10) : '';

  useEffect(() => {
    if (!visible) return;
    setFiles([]); setFind(''); setBy({ department: '', subject: '', designation: '' });
    if (!editing) {
      setKept([]);
      setF({ ...EMPTY, sectionIds: mode === 'teacher' && sections.length === 1 ? [String(sections[0]._id)] : [] });
      return;
    }
    setKept(editing.files || []);
    setF({
      docType: editing.docType || 'other',
      isAssignment: !!editing.isAssignment,
      title: editing.title || '',
      description: editing.description || '',
      category: editing.category || '',
      subject: editing.subject || '',
      targetType: editing.targetType || 'whole_school',
      classIds: (editing.targetClasses || []).map(String),
      sectionIds: (editing.targetSections || []).map(String).filter((id: string) => mode !== 'teacher' || offered(id)),
      teacherIds: (editing.targetUsers || []).map(String),
      dueDate: dueWas,
      totalMarks: editing.totalMarks == null ? '' : String(editing.totalMarks),
      allowSubmission: editing.allowSubmission !== false,
      assignmentType: editing.assignmentType || 'homework',
      questions: (editing.questions || []).map((q: any) => ({ label: String(q.label || ''), maxMarks: q.maxMarks == null ? '' : String(q.maxMarks) })),
    });
  }, [visible, editing?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const assigned = f.isAssignment;
  const toggle = (key: 'classIds' | 'sectionIds' | 'teacherIds', id: string) =>
    set({ [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] } as any);

  const allSections = useMemo(
    () => classes.flatMap((c: any) => (c.sections || []).map((x: any) => ({ _id: String(x._id), label: `${c.className} - ${x.sectionName}` }))),
    [classes],
  );

  // ── Specific teachers ──────────────────────────────────────────────────────
  const departments  = useMemo(() => optionsOf(teachers, (t) => [t.department]), [teachers]);
  const subjects     = useMemo(() => optionsOf(teachers, (t) => t.subjects || []), [teachers]);
  const designations = useMemo(() => optionsOf(teachers, (t) => [t.designation]), [teachers]);
  const shownTeachers = useMemo(() => {
    const term = find.trim().toLowerCase();
    return teachers.filter((t: any) => {
      if (by.department && t.department !== by.department) return false;
      if (by.designation && t.designation !== by.designation) return false;
      if (by.subject && !(t.subjects || []).includes(by.subject)) return false;
      if (term && !`${t.name} ${t.department} ${t.designation} ${(t.subjects || []).join(' ')}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [teachers, by, find]);
  const shownIds = shownTeachers.map((t: any) => String(t._id));
  const allShownOn = shownIds.length > 0 && shownIds.every((id) => f.teacherIds.includes(id));
  const hidden = f.teacherIds.filter((id) => !shownIds.includes(id)).length;

  const wrong = (): string => {
    if (!f.title.trim()) return 'Give it a title';
    if (!f.category) return 'Pick a category';
    if (mode === 'teacher' && !f.sectionIds.length && !locked) return 'Choose at least one section';
    if (mode === 'admin' && f.targetType === 'class' && !f.classIds.length) return 'Pick at least one class';
    if (mode === 'admin' && f.targetType === 'class_sections' && !f.sectionIds.length) return 'Pick at least one section';
    if (mode === 'admin' && f.targetType === 'specific_teachers' && !f.teacherIds.length) return 'Pick at least one teacher';
    if (assigned) {
      if (mode === 'admin' && STAFF_AUDIENCES.includes(f.targetType)) return 'Only students hand work in — pick classes, sections or the whole school for an assignment';
      if (!files.length && !kept.length) return 'Attach the assignment or its instructions — students need a file to work from';
      if (f.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(f.dueDate)) return 'Write the due date as YYYY-MM-DD, for example 2026-12-05';
      // Only a date that was changed is held to "not in the past".
      if (f.dueDate && f.dueDate !== dueWas && new Date(`${f.dueDate}T23:59:59`) < new Date()) return 'That due date has already passed';
      if (f.totalMarks && !(Number(f.totalMarks) > 0)) return 'Marks must be more than zero';
      const labels = f.questions.map((q) => q.label.trim().toLowerCase());
      if (labels.some((l) => !l)) return 'Every question needs a name';
      if (new Set(labels).size !== labels.length) return 'Two questions share a name';
      if (labels.includes(RESERVED_QUESTION)) return '“Other marks” is kept for what the questions leave over — call the question something else';
    }
    if (files.length + kept.length > 10) return 'A document can hold up to 10 files';
    return '';
  };

  const submit = async () => {
    const problem = wrong();
    if (problem) { Alert.alert('Not ready yet', problem); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title', f.title.trim());
      fd.append('description', f.description.trim());
      fd.append('docType', f.docType);
      fd.append('category', f.category);
      fd.append('subject', f.subject.trim());
      fd.append('isAssignment', assigned ? 'true' : 'false');
      fd.append('allowSubmission', assigned && f.allowSubmission ? 'true' : 'false');
      fd.append('dueDate', assigned ? f.dueDate : '');
      fd.append('totalMarks', assigned ? f.totalMarks : '');
      fd.append('assignmentType', f.assignmentType);
      fd.append('questions', JSON.stringify(assigned ? f.questions.map((q) => ({ label: q.label.trim(), maxMarks: q.maxMarks })) : []));
      if (mode === 'teacher') {
        fd.append('sectionIds', JSON.stringify(f.sectionIds));
      } else {
        fd.append('targetType', f.targetType);
        fd.append('targetClasses', JSON.stringify(f.targetType === 'class' ? f.classIds : []));
        fd.append('targetSections', JSON.stringify(f.targetType === 'class_sections' ? f.sectionIds : []));
        fd.append('targetUsers', JSON.stringify(f.targetType === 'specific_teachers' ? f.teacherIds : []));
      }
      appendDocFiles(fd, files);
      if (editing) {
        // Which of the files already attached are staying; new ones are added to them.
        fd.append('keepFiles', JSON.stringify(kept.map((x) => x.storedName)));
        if (!update) throw new Error('This document cannot be changed from here');
        await update(String(editing._id), fd);
      } else {
        await send(fd);
      }
      onDone();
    } catch (e: any) {
      Alert.alert(editing ? 'Could not save it' : 'Could not share it', e?.data?.message || e?.message || 'Please try again.');
    } finally { setSaving(false); }
  };

  return (
    <FormModal visible={visible} title={editing ? 'Edit document' : 'Share a document'} onClose={onClose} onSubmit={submit}
      submitting={saving} submitLabel={editing ? 'Save changes' : 'Share it'}>
      <Select label="What is it?" value={f.docType} options={TYPES}
        onChange={(v) => set({
          docType: v,
          // The type and the flag move together: an assignment is one, a notice
          // or circular never is, and anything else keeps what it had.
          isAssignment: v === 'assignment' ? true : ['notice', 'circular'].includes(v) ? false : f.isAssignment,
        })} />
      {['study_material', 'other'].includes(f.docType) && (
        <Toggle label="Students hand work in against this" value={f.isAssignment}
          onChange={(v) => set({ isAssignment: v })} sub="Turns it into an assignment with submissions and marking" />
      )}
      <Input label="Title" value={f.title} onChange={(v) => set({ title: v.slice(0, 160) })} placeholder="e.g. Chapter 5 — practice questions" />
      <Input label="Description" value={f.description} onChange={(v) => set({ description: v.slice(0, 300) })}
        placeholder="One line about what this is and what to do with it" multiline />

      <Text style={s.label}>Who gets it?</Text>
      {mode === 'teacher' ? (
        <>
          {sections.length ? (
            <View style={s.chips}>
              {sections.map((x) => (
                <Chip key={String(x._id)} label={x.label} on={f.sectionIds.includes(String(x._id))}
                  onPress={() => toggle('sectionIds', String(x._id))} />
              ))}
            </View>
          ) : <Text style={s.note}>You are not assigned to a section yet, so there is nowhere to share to.</Text>}
          {locked > 0 && (
            <Text style={s.note}>
              Also shared with {locked} section{locked === 1 ? '' : 's'} from an earlier year or that you no longer
              teach — {locked === 1 ? 'it stays as it is' : 'they stay as they are'}.
            </Text>
          )}
        </>
      ) : (
        <>
          <Select label="How wide" value={f.targetType} options={AUDIENCES}
            onChange={(v) => { set({ targetType: v, classIds: [], sectionIds: [], teacherIds: [] }); setFind(''); }} />
          {f.targetType === 'class' && (
            <View style={s.chips}>
              {classes.map((c: any) => (
                <Chip key={String(c._id)} label={c.className} on={f.classIds.includes(String(c._id))}
                  onPress={() => toggle('classIds', String(c._id))} />
              ))}
            </View>
          )}
          {f.targetType === 'class_sections' && (
            <View style={s.chips}>
              {allSections.map((x) => (
                <Chip key={x._id} label={x.label} on={f.sectionIds.includes(x._id)} onPress={() => toggle('sectionIds', x._id)} />
              ))}
            </View>
          )}
          {f.targetType === 'specific_teachers' && (
            <View style={{ marginBottom: 12 }}>
              {/* The three things a teacher is picked by. They narrow the
                  list; what is sent is the teachers ticked. */}
              {departments.length > 0 && (
                <Select label="Department" value={by.department} onChange={(v) => setBy((x) => ({ ...x, department: v }))}
                  options={[{ value: '', label: 'All departments' }, ...departments.map((d) => ({ value: d, label: d }))]} />
              )}
              {subjects.length > 0 && (
                <Select label="Subject" value={by.subject} onChange={(v) => setBy((x) => ({ ...x, subject: v }))}
                  options={[{ value: '', label: 'All subjects' }, ...subjects.map((d) => ({ value: d, label: d }))]} />
              )}
              {designations.length > 0 && (
                <Select label="Designation" value={by.designation} onChange={(v) => setBy((x) => ({ ...x, designation: v }))}
                  options={[{ value: '', label: 'All designations' }, ...designations.map((d) => ({ value: d, label: d }))]} />
              )}
              <Input label="Find a teacher" value={find} onChange={setFind} placeholder="Name, department or subject" />

              <View style={s.pickBar}>
                <Text style={s.picked}>{f.teacherIds.length} selected</Text>
                {shownIds.length > 0 && (
                  <TouchableOpacity accessibilityRole="button"
                    onPress={() => set({
                      teacherIds: allShownOn
                        ? f.teacherIds.filter((id) => !shownIds.includes(id))
                        : [...new Set([...f.teacherIds, ...shownIds])],
                    })}>
                    <Text style={s.link}>{allShownOn ? 'Clear' : 'Select'} all {shownIds.length} shown</Text>
                  </TouchableOpacity>
                )}
              </View>

              {!teachers.length ? <Text style={s.note}>There are no teachers on record yet.</Text>
                : !shownTeachers.length ? <Text style={s.note}>No teacher matches these filters.</Text> : null}
              {shownTeachers.slice(0, PEOPLE_SHOWN).map((t: any) => {
                const on = f.teacherIds.includes(String(t._id));
                const about = [t.designation, t.department, (t.subjects || []).join(', ')].filter(Boolean).join(' · ');
                return (
                  <TouchableOpacity key={String(t._id)} style={[s.person, on && s.chipOn]} onPress={() => toggle('teacherIds', String(t._id))}
                    accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={t.name}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.personName} numberOfLines={1}>{t.name}</Text>
                      {about ? <Text style={s.personSub} numberOfLines={1}>{about}</Text> : null}
                    </View>
                    <Ionicons name={on ? 'checkmark-circle' : 'add-circle-outline'} size={20} color={on ? Colors.primary : Colors.textLight} />
                  </TouchableOpacity>
                );
              })}
              {shownTeachers.length > PEOPLE_SHOWN && (
                <Text style={s.note}>{shownTeachers.length - PEOPLE_SHOWN} more match — narrow the filters or the search to see them.</Text>
              )}
              {/* People ticked under a filter that has since changed still get it — say so. */}
              {hidden > 0 && (
                <Text style={s.note}>{hidden} selected teacher{hidden === 1 ? ' is' : 's are'} hidden by the filters above.</Text>
              )}
            </View>
          )}
        </>
      )}

      <Select label="Category" value={f.category} placeholder="Select a category…"
        options={[
          // A label since removed from the list is still this document's label.
          ...(f.category && !categories.includes(f.category) ? [{ value: f.category, label: `${f.category} (removed)` }] : []),
          ...categories.map((c) => ({ value: c, label: c })),
        ]} onChange={(v) => set({ category: v })} />
      <Input label="Subject (optional)" value={f.subject} onChange={(v) => set({ subject: v.slice(0, 60) })} placeholder="e.g. Mathematics" />

      {assigned && (
        <>
          <Input label="Due date (optional)" value={f.dueDate} onChange={(v) => set({ dueDate: v.trim() })}
            placeholder="YYYY-MM-DD" keyboardType="numeric" />
          <Text style={s.hint}>It is due at the end of that day.</Text>
          <Input label="Out of (optional)" value={f.totalMarks} onChange={(v) => set({ totalMarks: v })}
            placeholder="e.g. 50" keyboardType="decimal-pad" />
          <Select label="Kind of work" value={f.assignmentType} options={KINDS} onChange={(v) => set({ assignmentType: v })} />

          {/* Optional: with questions, marking asks for a score per question
              and the analytics can say which one the class lost marks on. */}
          <Text style={s.label}>Break the marks down by question (optional)</Text>
          {f.questions.map((q, i) => (
            <View key={i} style={s.qRow}>
              <View style={{ flex: 2 }}>
                <Input label={`Question ${i + 1}`} value={q.label} placeholder={`Q${i + 1}`}
                  onChange={(v) => set({ questions: f.questions.map((x, k) => (k === i ? { ...x, label: v.slice(0, 20) } : x)) })} />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="Marks" value={q.maxMarks} keyboardType="decimal-pad"
                  onChange={(v) => set({ questions: f.questions.map((x, k) => (k === i ? { ...x, maxMarks: v } : x)) })} />
              </View>
              <TouchableOpacity style={s.qDrop} onPress={() => set({ questions: f.questions.filter((_, k) => k !== i) })}
                accessibilityRole="button" accessibilityLabel={`Remove ${q.label || `question ${i + 1}`}`}>
                <Ionicons name="close" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity accessibilityRole="button" style={{ marginBottom: 10 }}
            onPress={() => set({ questions: [...f.questions, { label: `Q${f.questions.length + 1}`, maxMarks: '' }] })}>
            <Text style={s.link}>+ Add question</Text>
          </TouchableOpacity>
          {f.questions.length > 0 && (() => {
            const total = f.questions.reduce((n, q) => n + (Number(q.maxMarks) || 0), 0);
            const of = Number(f.totalMarks) || 0;
            return (
              <Text style={s.note}>
                {total} across {f.questions.length} question{f.questions.length === 1 ? '' : 's'}{of ? ` · out of ${of}` : ''}
                {of && total > of ? ' — more than the total above' : ''}
                {of && total < of ? ` — ${Math.round((of - total) * 100) / 100} left over, given as “Other marks” when marking` : ''}
              </Text>
            );
          })()}

          <Toggle label="Accept submissions" value={f.allowSubmission} onChange={(v) => set({ allowSubmission: v })}
            sub="Turn this off to close it without deleting anything already handed in" />
        </>
      )}

      <Text style={s.label}>{assigned ? 'The question paper or instructions (required)' : 'Files (optional)'}</Text>
      {kept.map((x, i) => (
        <View key={`${x.storedName || x.originalName}-${i}`} style={s.kept}>
          <Ionicons name="document-attach-outline" size={16} color={Colors.primary} />
          <Text style={s.keptName} numberOfLines={1}>{x.originalName}</Text>
          <TouchableOpacity onPress={() => setKept(kept.filter((_, k) => k !== i))} hitSlop={8}
            accessibilityRole="button" accessibilityLabel={`Remove ${x.originalName}`}>
            <Ionicons name="close" size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      ))}
      <DocPick files={files} onFiles={setFiles} max={Math.max(0, 10 - kept.length)}
        label={kept.length ? 'Add more files' : 'Attach files'}
        hint={kept.length ? `${10 - kept.length} more can go on this document — already attached files stay unless removed` : undefined} />
    </FormModal>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginTop: 4, marginBottom: 6 },
  hint: { fontSize: 11, color: Colors.textSecondary, marginTop: -6, marginBottom: 10 },
  note: { fontSize: 12, lineHeight: 17, color: Colors.textSecondary, marginBottom: 10 },
  link: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 10,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.surface,
  },
  chipOn: { borderColor: Colors.primary, backgroundColor: '#EDE9FE' },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.text },
  pickBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  picked: { fontSize: 12, fontWeight: '700', color: Colors.text },
  person: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, marginBottom: 6,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.surface,
  },
  personName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  personSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  qRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  qDrop: { padding: 10, marginBottom: 14 },
  kept: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.surface,
  },
  keptName: { flex: 1, fontSize: 13, color: Colors.text },
});
