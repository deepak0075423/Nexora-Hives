import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import { FormModal, Select, Toggle, unwrap } from '@/components/ui/kit';

/**
 * Copy one academic year's structure into another.
 *
 * Shared by Academic Years and Subjects, because both want the same operation
 * from different starting points — the first is building a year out, the second
 * only wants that year's subject list. `defaultParts` is what separates them.
 *
 * The subject list and the curriculum are separate parts: copying last year's
 * subjects must not also put last year's curriculum onto this year's classes.
 *
 * The year being written to is the one the caller passed; it is not a field
 * here, so the sheet can never write somewhere the screen was not pointing.
 */

export const ALL_PARTS: Record<string, boolean> = {
  classes: true, sections: true, subjects: true, curriculum: true, assignments: true,
};

const LABEL: Record<string, string> = {
  classes: 'Classes', sections: 'Sections', subjects: 'Subjects',
  curriculum: 'Curriculum', assignments: 'Subject teachers',
};

/**
 * `needs` is what a part rests on. A class↔subject link has nothing to join
 * without a class and a subject; a subject teacher needs the section and that
 * link as well, since a teacher against a subject the class is not marked as
 * teaching cannot be stored. Enforced server-side too — this only greys the row
 * early rather than failing the submit.
 */
const PARTS: { key: string; label: string; hint: string; needs?: string[] }[] = [
  { key: 'classes',     label: LABEL.classes,     hint: 'Class 1, Class 2, …' },
  { key: 'sections',    label: LABEL.sections,    hint: 'A, B, C under each class', needs: ['classes'] },
  { key: 'subjects',    label: LABEL.subjects,    hint: 'The year’s subject list — Science, Hindi, …' },
  { key: 'curriculum',  label: LABEL.curriculum,  hint: 'Which class teaches which subject',
    needs: ['subjects', 'classes'] },
  { key: 'assignments', label: LABEL.assignments, hint: 'Who teaches a subject in one section',
    needs: ['subjects', 'classes', 'sections', 'curriculum'] },
];

/** "Subjects and Classes", "Subjects, Classes and Sections". */
const listOf = (keys: string[]) => keys.map(k => LABEL[k]).reduce((acc, name, i, all) =>
  (i === 0 ? name : `${acc}${i === all.length - 1 ? ' and ' : ', '}${name}`), '');

/** Dependencies of `part` that neither the ticks nor the target year supply. */
const unmetOf = (part: { needs?: string[] }, pick: Record<string, boolean>, has: any) =>
  (!has || !part.needs) ? [] : part.needs.filter(k => !pick[k] && !(has[k] > 0));

/** Unticking a part takes whatever rested on it with it, transitively. */
function settle(next: Record<string, boolean>, has: any) {
  if (!has) return next;
  let out = next;
  for (let pass = 0; pass < PARTS.length; pass += 1) {
    for (const p of PARTS) {
      if (!out[p.key] || !p.needs) continue;
      if (p.needs.some(k => !out[k] && !(has[k] > 0))) out = { ...out, [p.key]: false };
    }
  }
  return out;
}

const KIND_LABEL: Record<string, string> = {
  class: 'Classes', section: 'Sections', subjectRow: 'Subjects', subject: 'Curriculum',
  assignment: 'Subject teachers', classTeacher: 'Class teachers',
};

const planTotal = (p: any) => (p.subjectsToCreate ?? 0) + p.classesToCreate + p.sectionsToCreate
  + p.linksToCreate + p.assignmentsToCreate + p.classTeachersToSet;

/**
 * Why nothing can be created — the source had none of it, something it depends
 * on is missing, or the target already has it. The count alone cannot say, and
 * the three need different actions from the admin.
 */
function zeroReason(plan: any, parts: Record<string, boolean>) {
  if (planTotal(plan) > 0) return '';
  const bare = !Object.entries(parts).filter(([, on]) => on)
    .some(([k]) => (plan.sourceTotals?.[k] ?? 0) > 0);
  if (bare) return `${plan.fromYear.yearName} has nothing of the kind you ticked — there is nothing to copy out of it.`;
  const blocking = (plan.skipped ?? []).find((sk: any) =>
    sk.reason !== 'already in this year' && !String(sk.reason).endsWith('not part of this import'));
  if (blocking) return `Nothing can be created yet — ${blocking.reason}. Tick the parts it depends on.`;
  return `Nothing new to bring over — ${plan.toYear.yearName} already has all of it.`;
}

/** 48 identical skips read as one row, not forty-eight. */
function groupSkips(skipped: any[] = []) {
  const out: { kind: string; reason: string; count: number }[] = [];
  for (const sk of skipped) {
    const hit = out.find(g => g.kind === sk.kind && g.reason === sk.reason);
    if (hit) hit.count += 1; else out.push({ kind: sk.kind, reason: sk.reason, count: 1 });
  }
  return out;
}

export default function ImportYearStructureSheet({
  visible, targetYear, years, defaultParts = ALL_PARTS, onClose, onImported,
}: {
  visible: boolean;
  targetYear: any;
  years: any[];
  defaultParts?: Record<string, boolean>;
  onClose: () => void;
  onImported: () => void;
}) {
  const [fromYear, setFromYear] = useState('');
  const [parts, setParts]       = useState<Record<string, boolean>>(ALL_PARTS);
  const [withTeachers, setWithTeachers] = useState(false);
  const [plan, setPlan]   = useState<any>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const options = (years ?? []).filter(y => String(y._id) !== String(targetYear?._id));
  const nothingPicked = !Object.values(parts).some(Boolean);

  const preview = async (src: string, pick: Record<string, boolean>, teachersToo: boolean) => {
    if (!src || !targetYear?._id || !Object.values(pick).some(Boolean)) { setPlan(null); return; }
    try {
      const res: any = await adminApi.importYearStructure(targetYear._id, {
        fromYear: src, include: pick, includeClassTeachers: teachersToo, preview: true,
      });
      const next = unwrap(res);
      setPlan(next); setError('');
      // A row ticked before the year's contents were known may now be illegal.
      if (next?.targetHas) setParts(cur => {
        const out = settle(cur, next.targetHas);
        return Object.keys(out).every(k => out[k] === cur[k]) ? cur : out;
      });
    } catch (err: any) { setPlan(null); setError(err.message ?? 'Could not read that year'); }
  };

  useEffect(() => {
    if (!visible) return;
    const src = options[0]?._id ?? '';
    const pick = { ...ALL_PARTS, ...defaultParts };
    setFromYear(src); setParts(pick); setWithTeachers(false); setPlan(null); setError('');
    preview(src, pick, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, targetYear?._id]);

  const togglePart = (key: string) => {
    const next = settle({ ...parts, [key]: !parts[key] }, plan?.targetHas);
    setParts(next);
    preview(fromYear, next, withTeachers);
  };

  const submit = async () => {
    // FormModal has no disabled state for its button, so the guard lives here:
    // the server refuses these too, this just says so without a round trip.
    if (plan?.blocked?.length) { setError(plan.blocked[0].message); return; }
    setSaving(true);
    try {
      const res: any = await adminApi.importYearStructure(targetYear._id, {
        fromYear, include: parts, includeClassTeachers: withTeachers,
      });
      const d = unwrap(res);
      const made = (d.createdSubjects ?? 0) + d.createdClasses + d.createdSections
        + d.createdLinks + d.createdAssignments;
      onImported();
      onClose();
      Alert.alert('Imported', made
        ? `${d.createdSubjects ?? 0} subject(s), ${d.createdClasses} class(es), ${d.createdSections} section(s), `
          + `${d.createdLinks} curriculum link(s) and ${d.createdAssignments} teacher assignment(s).`
        : 'Nothing to import — that structure is already in this year.');
    } catch (err: any) { setError(err.message ?? 'Could not import'); }
    finally { setSaving(false); }
  };

  return (
    <FormModal
      visible={visible}
      title={`Import into ${targetYear?.yearName ?? ''}`}
      onClose={onClose}
      onSubmit={submit}
      submitting={saving}
      submitLabel={plan && !error && !nothingPicked ? `Import ${planTotal(plan)} records` : 'Import'}
    >
      <Select
        label="Copy from"
        value={fromYear}
        options={options.map((y: any) => ({
          label: `${y.yearName}${y.status === 'active' ? ' · active' : ''}`, value: y._id,
        }))}
        onChange={v => { setFromYear(v); preview(v, parts, withTeachers); }}
      />

      <Text style={s.partsLabel}>What to import</Text>
      {PARTS.map(part => {
        const missing = unmetOf(part, parts, plan?.targetHas);
        const off = missing.length > 0;
        return (
          <TouchableOpacity key={part.key} style={[s.partRow, off && { opacity: 0.55 }]}
            disabled={off} onPress={() => togglePart(part.key)}>
            <Ionicons name={parts[part.key] && !off ? 'checkbox' : 'square-outline'} size={20}
              color={parts[part.key] && !off ? Colors.accent : Colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={s.partName}>{part.label}</Text>
              <Text style={s.partHint}>{part.hint}</Text>
              {off && (
                <Text style={s.err}>
                  Needs {listOf(missing)} — tick {missing.length > 1 ? 'them' : 'it'} too, or set
                  {missing.length > 1 ? ' them' : ' it'} up in {targetYear?.yearName} first.
                </Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
      {nothingPicked && <Text style={s.err}>Tick at least one.</Text>}

      <Toggle
        label="Also carry over class / vice class teachers"
        sub="Off by default — these change year to year more often than the structure does."
        value={withTeachers}
        onChange={v => { setWithTeachers(v); preview(fromYear, parts, v); }}
      />

      {error ? <Text style={s.err}>{error}</Text> : plan ? (
        <>
          {plan.blocked?.length > 0 && plan.blocked.map((b: any) => (
            <Text key={b.part} style={s.err}>{b.message}</Text>
          ))}
          <Text style={s.summary}>
            {plan.subjectsToCreate ?? 0} subject(s) · {plan.classesToCreate} class(es) ·{' '}
            {plan.sectionsToCreate} section(s) · {plan.linksToCreate} curriculum link(s) ·{' '}
            {plan.assignmentsToCreate} subject teacher(s)
            {withTeachers ? ` · ${plan.classTeachersToSet} class teacher(s)` : ''}
          </Text>
          {zeroReason(plan, parts) ? <Text style={s.err}>{zeroReason(plan, parts)}</Text> : null}
          <Text style={s.note}>
            Subjects are matched by name, so one already added by hand is reused rather than
            duplicated. Students, roll numbers and timetables are not brought over.
          </Text>
          {groupSkips(plan.skipped).map((g, i) => (
            <Text key={i} style={g.reason === 'already in this year' ? s.skipMuted : s.skipWarn}>
              {KIND_LABEL[g.kind] ?? g.kind} — {g.reason} ×{g.count}
            </Text>
          ))}
        </>
      ) : null}
    </FormModal>
  );
}

const s = StyleSheet.create({
  partsLabel: { fontSize: 13, fontWeight: '500', color: Colors.text, marginTop: 4, marginBottom: 6 },
  partRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 5 },
  partName:   { fontSize: 13, color: Colors.text },
  partHint:   { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  summary:    { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 8, lineHeight: 19 },
  note:       { fontSize: 11, color: Colors.textSecondary, lineHeight: 16, marginTop: 6, marginBottom: 6 },
  err:        { fontSize: 12, color: Colors.danger, lineHeight: 18, marginTop: 6 },
  skipMuted:  { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  skipWarn:   { fontSize: 11, color: Colors.danger, marginTop: 2 },
});
