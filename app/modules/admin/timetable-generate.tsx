import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as ttApi from '@/api/timetable.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Card, Select, Toggle, Input, Empty, FormModal, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import { ConflictRow, MiniStat, tk } from '@/components/timetable/ttKit';

const OPTIONS: [string, string][] = [
  ['avoidSameSubjectTwiceADay', 'Avoid the same subject twice a day'],
  ['balanceDifficultSubjects',  'Balance difficult subjects'],
  ['minimizeTeacherGaps',       'Minimise teacher gaps'],
  ['minimizeStudentGaps',       'Minimise student gaps'],
  ['preferTeacherAvailability', 'Prefer teacher availability'],
  ['keepPracticalsConsecutive', 'Keep practicals consecutive'],
  ['spreadAcrossWeek',          'Spread subjects across the week'],
];

const ALL_SECTIONS = '__all__';
const SUBJECT_TYPES = ['Theory', 'Practical', 'Laboratory', 'Activity', 'Sports', 'Library', 'Other'];
const DAY_SHORT: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat',
};

/* Merge groups are shown by colour — the stored key stays opaque. */
const GROUP_TONES = ['#4f46e5', '#0d9488', '#b45309', '#be185d', '#0369a1', '#7c3aed'];

export default function TimetableGenerateScreen() {
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');

  const [yearId, setYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');   // a section id, or ALL_SECTIONS
  const [options, setOptions] = useState<Record<string, boolean>>(
    Object.fromEntries(OPTIONS.map(([k]) => [k, true])),
  );

  /* The subject plan: periods a week per subject, and which subjects are merged
     into the same period. Reloaded whenever the class or section pick changes. */
  const [plan, setPlan] = useState<any>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [rules, setRules] = useState<Record<string, any>>({});
  const [merges, setMerges] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [tuning, setTuning] = useState<string | null>(null);   // subject whose rules are open

  const [starting, setStarting] = useState(false);
  const [versionId, setVersionId] = useState('');
  const [progress, setProgress] = useState<any>(null);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const pollRef = useRef<any>(null);

  useEffect(() => {
    ttApi.getMeta()
      .then((res: any) => { const d = unwrap(res); setMeta(d); setYearId(d?.selectedYearId ?? ''); })
      .catch((err: any) => {
        if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true); else setError(err?.message ?? 'Failed to load');
      })
      .finally(() => setLoading(false));
    return () => clearInterval(pollRef.current);
  }, []);

  const classes = useMemo(() => meta?.classes ?? [], [meta]);
  const selectedClass = useMemo(() => classes.find((c: any) => c._id === classId), [classes, classId]);
  const sectionsOf = useMemo(() => selectedClass?.sections ?? [], [selectedClass]);

  const allSections = sectionId === ALL_SECTIONS;
  const scopeSectionIds = useMemo<string[]>(
    () => (allSections ? sectionsOf.map((s: any) => s._id) : (sectionId ? [sectionId] : [])),
    [allSections, sectionId, sectionsOf],
  );
  const scopeCount = scopeSectionIds.length;

  /* ── The class's subjects + what the week can actually hold ─────────────── */
  useEffect(() => {
    if (!classId || !scopeCount) { setPlan(null); setRules({}); setMerges({}); setPicked([]); setTuning(null); return; }
    let cancelled = false;
    setPlanLoading(true);
    ttApi.getClassPlan(classId, allSections ? [] : scopeSectionIds, yearId)
      .then((res: any) => {
        if (cancelled) return;
        const d = unwrap(res);
        setPlan(d);
        setRules(Object.fromEntries(d.subjects.map((x: any) => [x._id, ruleFrom(x)])));
        setMerges(Object.fromEntries(d.subjects.filter((x: any) => x.mergeGroup).map((x: any) => [x._id, x.mergeGroup])));
        setPicked([]);
        setTuning(null);
      })
      .catch((err: any) => {
        if (!cancelled) { setPlan(null); setRules({}); setMerges({}); setError(err?.message ?? 'Could not load subjects'); }
      })
      .finally(() => { if (!cancelled) setPlanLoading(false); });
    return () => { cancelled = true; };
  }, [classId, sectionId, yearId, allSections, scopeCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const subjects: any[] = plan?.subjects ?? [];
  const capacity: number = plan?.capacity?.periodsPerWeek ?? 0;
  const subjectsMatch = plan?.structureMatches?.sameSubjects !== false;

  /* Merged subjects share their periods, so a group costs the week one run of
     slots — not one per member. Mirrors the backend's arithmetic. */
  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const sub of subjects) {
      const key = merges[sub._id];
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(sub);
    }
    return map;
  }, [subjects, merges]);

  const groupTone = (key: string) => GROUP_TONES[[...groups.keys()].indexOf(key) % GROUP_TONES.length];

  const periodsOf = (subjectId: string) => Number(rules[subjectId]?.weeklyPeriods) || 0;

  const assigned = useMemo(() => {
    let total = 0;
    const counted = new Set<string>();
    for (const sub of subjects) {
      const key = merges[sub._id];
      if (key) {
        if (counted.has(key)) continue;
        counted.add(key);
      }
      total += Number(rules[sub._id]?.weeklyPeriods) || 0;
    }
    return total;
  }, [subjects, rules, merges]);

  const remaining = capacity - assigned;
  const lonelyGroups = [...groups.entries()].filter(([, members]) => members.length < 2);

  const patchRule = (subjectId: string, patch: object) =>
    setRules((r) => ({ ...r, [subjectId]: { ...r[subjectId], ...patch } }));

  /* Editing one member of a merged group moves all of them — they run together. */
  const setPeriods = (subjectId: string, raw: string) => {
    const n = Math.max(0, Math.min(60, Number(String(raw).replace(/[^0-9]/g, '')) || 0));
    const key = merges[subjectId];
    setRules((r) => {
      if (!key) return { ...r, [subjectId]: { ...r[subjectId], weeklyPeriods: n } };
      const next = { ...r };
      for (const sub of subjects) {
        if (merges[sub._id] === key) next[sub._id] = { ...next[sub._id], weeklyPeriods: n };
      }
      return next;
    });
  };

  const togglePick = (subjectId: string) => setPicked((p) =>
    p.includes(subjectId) ? p.filter((x) => x !== subjectId) : [...p, subjectId]);

  const mergePicked = () => {
    if (picked.length < 2) { setError('Pick at least two subjects to merge'); return; }
    const key = `merge-${Date.now().toString(36)}`;
    const shared = Math.max(...picked.map(periodsOf));
    setMerges((m) => ({ ...m, ...Object.fromEntries(picked.map((id) => [id, key])) }));
    setRules((r) => {
      const next = { ...r };
      for (const id of picked) next[id] = { ...next[id], weeklyPeriods: shared };
      return next;
    });
    setPicked([]);
    setError('');
  };

  const unmerge = (key: string) =>
    setMerges((m) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== key)));

  const canGenerate = !!scopeCount && !!subjects.length && subjectsMatch
    && assigned > 0 && remaining >= 0 && !lonelyGroups.length;

  const poll = (id: string) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const d = unwrap(await ttApi.getProgress(id));
        setProgress(d);
        if (d.status !== 'generating') {
          clearInterval(pollRef.current);
          if (d.errorCount > 0) {
            const c = unwrap(await ttApi.getConflicts(id));
            setConflicts(c?.conflicts ?? []);
          }
        }
      } catch (err: any) {
        clearInterval(pollRef.current);
        setError(err?.message ?? 'Lost contact with the server');
      }
    }, 900);
  };

  const start = async () => {
    if (!classId) { setError('Select a class'); return; }
    if (!scopeCount) { setError('Select a section, or choose all sections'); return; }
    if (!subjects.length) { setError('This class has no subjects to schedule'); return; }
    if (!subjectsMatch) { setError('These sections do not teach the same subjects'); return; }
    if (assigned <= 0) { setError('Give at least one subject a weekly period count'); return; }
    if (remaining < 0) { setError(`The plan needs ${assigned} periods but only ${capacity} are available`); return; }
    if (lonelyGroups.length) { setError('A merged group needs at least two subjects'); return; }

    setError(''); setStarting(true); setConflicts([]);
    try {
      const d = unwrap(await ttApi.generate({
        yearId,
        classId,
        allSections,
        sectionIds: allSections ? [] : scopeSectionIds,
        periodsPerWeek: capacity,
        subjectPlan: subjects.map((sub: any) => ({
          ...rules[sub._id],
          subject: sub._id,
          subjectName: sub.subjectName,
          mergeGroup: merges[sub._id] || '',
        })),
        options,
      }));
      setVersionId(d.versionId);
      setProgress({ status: 'generating', progress: d.progress });
      poll(d.versionId);
    } catch (err: any) {
      if (err?.status === 409 && err?.data?.data?.versionId) {
        setVersionId(err.data.data.versionId);
        setProgress({ status: 'generating', progress: { percent: 0, steps: [] } });
        poll(err.data.data.versionId);
      } else setError(err?.message ?? 'Could not start generation');
    } finally { setStarting(false); }
  };

  const reset = () => { clearInterval(pollRef.current); setProgress(null); setVersionId(''); setConflicts([]); };

  if (disabled) return (<><Stack.Screen options={{ title: 'Generate Timetable' }} /><ModuleDisabled /></>);
  if (loading) return (<><Stack.Screen options={{ title: 'Generate Timetable' }} /><LoaderView /></>);

  /* ── Progress / result ─────────────────────────────────────────────────── */
  if (progress) {
    const p = progress.progress ?? {};
    const running = progress.status === 'generating';
    const failed = progress.status === 'failed';
    const conflicted = (progress.errorCount ?? 0) > 0;
    const stats = progress.stats ?? {};

    return (
      <>
        <Stack.Screen options={{ title: running ? 'Generating…' : 'Generation Result' }} />
        <ScrollView style={g.screen} contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}>
          <Card>
            {(p.steps ?? []).map((s: any) => (
              <View key={s.key} style={g.stepRow}>
                {s.status === 'done'
                  ? <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                  : s.status === 'active'
                    ? <ActivityIndicator size="small" color={Colors.accent} />
                    : <Ionicons name="ellipse-outline" size={16} color={Colors.textLight} />}
                <Text style={[g.stepText, s.status === 'pending' && { color: Colors.textLight }]}>{s.label}</Text>
              </View>
            ))}

            <View style={g.barTrack}>
              <View style={[g.barFill, {
                width: `${p.percent ?? 0}%`,
                backgroundColor: failed ? Colors.danger : conflicted ? Colors.warning : Colors.success,
              }]} />
            </View>
            <Text style={g.barLabel}>Progress: {p.percent ?? 0}%</Text>
          </Card>

          {!running && (
            <>
              <View style={g.statRow}>
                <MiniStat label="Classes" value={stats.classesProcessed} />
                <MiniStat label="Teachers" value={stats.teachersProcessed} />
                <MiniStat label="Entries" value={stats.entriesGenerated} />
                <MiniStat label="Conflicts" value={progress.conflictCount ?? 0}
                  tone={progress.errorCount ? Colors.danger : Colors.success} />
                <MiniStat label="Time" value={stats.generationTimeMs != null ? `${(stats.generationTimeMs / 1000).toFixed(1)}s` : '—'} />
              </View>

              <View style={[g.banner, {
                backgroundColor: failed ? Colors.dangerLight : conflicted ? Colors.warningLight : Colors.successLight,
              }]}>
                <Text style={[g.bannerText, {
                  color: failed ? Colors.danger : conflicted ? Colors.warning : Colors.success,
                }]}>
                  {failed ? 'Unable to generate a complete timetable.'
                    : conflicted ? `Timetable generated with ${progress.errorCount} conflict(s).`
                    : 'Timetable generated successfully.'}
                </Text>
                {p.error ? <Text style={g.bannerSub}>{p.error}</Text> : null}
              </View>

              {conflicts.length > 0 && (
                <Card>
                  <Text style={tk.sectionHeading}>{conflicts.length} conflict(s)</Text>
                  {conflicts.slice(0, 10).map((c: any, i: number) => <ConflictRow key={c._id ?? i} conflict={c} />)}
                </Card>
              )}

              <TouchableOpacity style={g.primaryBtn}
                onPress={() => router.push({ pathname: '/modules/admin/timetable-version', params: { id: versionId } } as any)}>
                <Text style={g.primaryBtnText}>Preview Timetable</Text>
              </TouchableOpacity>
              <TouchableOpacity style={g.secondaryBtn} onPress={reset}>
                <Text style={g.secondaryBtnText}>Generate Again</Text>
              </TouchableOpacity>
            </>
          )}

          {running && (
            <Text style={g.note}>
              Generation runs on the server — you can leave this screen and check the version list later.
            </Text>
          )}
        </ScrollView>
      </>
    );
  }

  /* ── Form ──────────────────────────────────────────────────────────────── */
  return (
    <>
      <Stack.Screen options={{ title: 'Generate Timetable' }} />
      <ScrollView style={g.screen} contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}>
        {error ? <View style={g.errorBox}><Text style={g.errorText}>{error}</Text></View> : null}

        <Select label="Academic Year" value={yearId}
          options={(meta?.years ?? []).map((y: any) => ({ label: y.yearName + (y.status === 'active' ? ' (active)' : ''), value: y._id }))}
          onChange={setYearId} />

        <Select label="Class" value={classId} placeholder="Pick a class"
          options={classes.map((c: any) => ({ label: c.className, value: c._id }))}
          onChange={(v) => { setClassId(v); setSectionId(''); }} />

        <Select label="Section" value={sectionId} placeholder="Pick a section"
          options={[
            ...(sectionsOf.length > 1 ? [{ label: `All sections (${sectionsOf.length})`, value: ALL_SECTIONS }] : []),
            ...sectionsOf.map((s: any) => ({ label: `Section ${s.sectionName}`, value: s._id })),
          ]}
          onChange={setSectionId} />

        {allSections && (
          <View style={g.infoBox}>
            <Text style={g.infoText}>
              All {sectionsOf.length} sections of {selectedClass?.className} are scheduled together, so their
              teachers and rooms are shared without clashes.
            </Text>
          </View>
        )}

        {plan && !subjectsMatch && (
          <View style={g.errorBox}>
            <Text style={g.errorText}>{plan.structureMatches.message}</Text>
          </View>
        )}
        {plan && subjectsMatch && !plan.capacity.uniform && (
          <View style={g.warnBox}>
            <Text style={g.warnText}>{plan.structureMatches.message}</Text>
          </View>
        )}

        {/* ── Subjects & weekly periods ──────────────────────────────────── */}
        <Text style={tk.sectionHeading}>Subjects & Weekly Periods</Text>
        {!classId || !scopeCount ? (
          <Empty icon="book-outline" text="Pick a class and section to load its subjects" />
        ) : planLoading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginVertical: 20 }} />
        ) : !subjects.length ? (
          <Empty icon="book-outline" text="This class has no subjects assigned" />
        ) : (
          <Card>
            {/* How the week's capacity is arrived at, so the number is never a mystery. */}
            <View style={g.chipWrap}>
              {(plan.capacity.breakdown ?? []).map((d: any) => (
                <View key={d.day} style={g.dayChip}>
                  <Text style={g.dayChipText}>{DAY_SHORT[d.day] ?? d.day} · {d.periods}</Text>
                </View>
              ))}
            </View>
            <Text style={g.capacityLine}>
              <Text style={{ fontWeight: '700' }}>{capacity}</Text> teaching periods a week
              {allSections ? ` per section${plan.capacity.uniform ? '' : ' (smallest week)'}` : ''}
              {'  ·  '}
              <Text style={{ fontWeight: '700', color: remaining < 0 ? Colors.danger : Colors.text }}>{assigned}</Text> assigned
              {'  ·  '}
              <Text style={{
                fontWeight: '700',
                color: remaining < 0 ? Colors.danger : remaining === 0 ? Colors.success : Colors.warning,
              }}>
                {Math.abs(remaining)}
              </Text> {remaining < 0 ? 'over' : 'free'}
            </Text>

            {subjects.map((sub: any) => {
              const key = merges[sub._id];
              const tone = key ? groupTone(key) : null;
              const partners = key ? (groups.get(key) ?? []).filter((x: any) => x._id !== sub._id) : [];
              const on = picked.includes(sub._id);
              return (
                <View key={sub._id} style={g.subjectRow}>
                  <TouchableOpacity disabled={!!key} onPress={() => togglePick(sub._id)} style={{ paddingRight: 8 }}>
                    <Ionicons
                      name={key ? 'link' : on ? 'checkbox' : 'square-outline'}
                      size={19}
                      color={key ? (tone as string) : on ? Colors.accent : Colors.textLight} />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={g.subjectName}>{sub.subjectName}</Text>
                    <Text style={g.subjectSub}>
                      {sub.teachers.length ? sub.teachers.map((t: any) => t.name).join(', ') : 'No teacher assigned'}
                      {partners.length ? ` · merged with ${partners.map((p: any) => p.subjectName).join(' + ')}` : ''}
                    </Text>
                    {!!sub.missingIn?.length && (
                      <Text style={g.subjectWarn}>Not taught in every selected section</Text>
                    )}
                  </View>
                  <TextInput
                    style={g.periodInput}
                    value={String(rules[sub._id]?.weeklyPeriods ?? 0)}
                    onChangeText={(v) => setPeriods(sub._id, v)}
                    keyboardType="numeric"
                    selectTextOnFocus
                    maxLength={2} />
                  <TouchableOpacity onPress={() => setTuning(sub._id)} hitSlop={8} style={{ paddingLeft: 10 }}>
                    <Ionicons name="options-outline" size={19} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              );
            })}

            <TouchableOpacity
              style={[g.mergeBtn, picked.length < 2 && { opacity: 0.45 }]}
              disabled={picked.length < 2}
              onPress={mergePicked}>
              <Ionicons name="link-outline" size={16} color={Colors.accent} />
              <Text style={g.mergeBtnText}>
                Merge selected{picked.length ? ` (${picked.length})` : ''}
              </Text>
            </TouchableOpacity>
            <Text style={tk.hint}>
              Merged subjects are taught in the same period — tick two or more, then merge.
            </Text>

            {[...groups.entries()].map(([key, members]) => (
              <View key={key} style={[g.groupChip, { borderColor: groupTone(key) }]}>
                <Text style={[g.groupChipText, { color: groupTone(key) }]} numberOfLines={1}>
                  {members.map((m: any) => m.subjectName).join(' + ')} · {periodsOf(members[0]?._id)}×/week
                </Text>
                <TouchableOpacity onPress={() => unmerge(key)} hitSlop={8}>
                  <Ionicons name="close" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ))}

            {!!lonelyGroups.length && (
              <View style={g.warnBox}>
                <Text style={g.warnText}>A merged group needs at least two subjects. Unmerge it or add a partner.</Text>
              </View>
            )}
            {remaining < 0 && (
              <View style={g.errorBox}>
                <Text style={g.errorText}>
                  The plan needs {assigned} periods a week but only {capacity} are available.
                  Reduce it by {Math.abs(remaining)}.
                </Text>
              </View>
            )}
          </Card>
        )}

        <Text style={tk.sectionHeading}>Optimisation Options</Text>
        <Text style={tk.hint}>
          Hard rules (clashes, availability, weekly requirements, lab rooms) are always enforced.
        </Text>
        {OPTIONS.map(([key, label]) => (
          <Toggle key={key} label={label} value={!!options[key]}
            onChange={(v) => setOptions((o) => ({ ...o, [key]: v }))} />
        ))}

        <TouchableOpacity
          style={[g.primaryBtn, (!canGenerate || starting) && { opacity: 0.5 }]}
          disabled={!canGenerate || starting}
          onPress={start}>
          {starting ? <ActivityIndicator color="#fff" />
            : <Text style={g.primaryBtnText}>
                ⚡ Generate Timetable{scopeCount ? ` (${scopeCount} section${scopeCount === 1 ? '' : 's'})` : ''}
              </Text>}
        </TouchableOpacity>
        <TouchableOpacity style={g.secondaryBtn} onPress={() => router.back()}>
          <Text style={g.secondaryBtnText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>

      {tuning && rules[tuning] && (
        <SubjectRules
          subject={subjects.find((x: any) => x._id === tuning)}
          rule={rules[tuning]}
          teachers={meta?.teachers ?? []}
          rooms={meta?.rooms ?? []}
          workingDays={plan?.capacity?.days ?? []}
          perSectionTeachers={allSections}
          onChange={(patch: object) => patchRule(tuning, patch)}
          onClose={() => setTuning(null)}
        />
      )}
    </>
  );
}

/* A plan row starts from what was saved for this class, or from sane defaults
   the first time a subject is scheduled. */
function ruleFrom(sub: any) {
  return {
    weeklyPeriods: sub.weeklyPeriods ?? 0,
    teacher: sub.teacher ?? null,
    altTeachers: sub.altTeachers ?? [],
    subjectType: sub.subjectType ?? 'Theory',
    consecutivePeriods: sub.consecutivePeriods ?? 1,
    maxPerDay: sub.maxPerDay ?? 1,
    hardMaxPerDay: sub.hardMaxPerDay !== false,
    difficulty: sub.difficulty ?? 3,
    priority: sub.priority ?? 0,
    minGapPeriods: sub.minGapPeriods ?? 0,
    requiresRoom: !!sub.requiresRoom,
    room: sub.room ?? '',
    roomTypes: sub.roomTypes ?? [],
    preferredDays: sub.preferredDays ?? [],
    preferredPeriods: sub.preferredPeriods ?? [],
  };
}

/* ── Scheduling rules for one subject ──────────────────────────────────────
   Everything the solver honours for a single subject. Hard rules first,
   preferences — optimised for, never enforced — last. */
function SubjectRules({ subject, rule, teachers, rooms, workingDays, perSectionTeachers, onChange, onClose }: {
  subject: any; rule: any; teachers: any[]; rooms: any[]; workingDays: string[];
  perSectionTeachers?: boolean; onChange: (patch: object) => void; onClose: () => void;
}) {
  const toggleDay = (day: string) => {
    const list: string[] = rule.preferredDays ?? [];
    onChange({ preferredDays: list.includes(day) ? list.filter((d) => d !== day) : [...list, day] });
  };

  // A subject can never run fewer times a day than the week demands of it.
  const days = Math.max(1, workingDays.length || 5);
  const minPerDay = Math.max(rule.consecutivePeriods || 1, Math.ceil((rule.weeklyPeriods || 0) / days));

  return (
    <FormModal
      visible
      title={`${subject?.subjectName ?? 'Subject'} — rules`}
      onClose={onClose}
      onSubmit={onClose}
      submitLabel="Done">

      <Input label="Periods per week" value={String(rule.weeklyPeriods ?? 0)} keyboardType="numeric"
        onChange={(v) => onChange({ weeklyPeriods: Math.max(0, Math.min(60, Number(v.replace(/[^0-9]/g, '')) || 0)) })} />

      {perSectionTeachers ? (
        <Text style={g.ruleHint}>
          Each section keeps its own subject teacher — pick a single section to choose one here.
        </Text>
      ) : (
        <Select label="Teacher" value={rule.teacher ?? ''} placeholder="No teacher"
          options={teachers.map((t: any) => ({ label: t.name, value: t._id }))}
          onChange={(v) => onChange({ teacher: v || null })} />
      )}

      <Select label="Subject type" value={rule.subjectType ?? 'Theory'}
        options={SUBJECT_TYPES.map((t) => ({ label: t, value: t }))}
        onChange={(v) => onChange({ subjectType: v })} />

      <Input label="Max periods per day" value={String(rule.maxPerDay ?? 1)} keyboardType="numeric"
        onChange={(v) => onChange({ maxPerDay: Math.max(1, Number(v.replace(/[^0-9]/g, '')) || 1) })} />
      {minPerDay > (rule.maxPerDay || 1) && (
        <Text style={g.ruleHint}>
          {rule.weeklyPeriods} periods across {days} working days needs at least {minPerDay} a day —
          this will be raised to {minPerDay} on generate.
        </Text>
      )}

      <Input label="Consecutive periods per block" value={String(rule.consecutivePeriods ?? 1)} keyboardType="numeric"
        onChange={(v) => onChange({ consecutivePeriods: Math.max(1, Math.min(4, Number(v.replace(/[^0-9]/g, '')) || 1)) })} />

      <Input label="Difficulty (1–5)" value={String(rule.difficulty ?? 3)} keyboardType="numeric"
        onChange={(v) => onChange({ difficulty: Math.max(1, Math.min(5, Number(v.replace(/[^0-9]/g, '')) || 3)) })} />

      <Input label="Minimum gap between blocks" value={String(rule.minGapPeriods ?? 0)} keyboardType="numeric"
        onChange={(v) => onChange({ minGapPeriods: Math.max(0, Number(v.replace(/[^0-9]/g, '')) || 0) })} />

      <Toggle label="Max per day is a hard rule" value={rule.hardMaxPerDay !== false}
        sub="Never broken, even to fit the week in"
        onChange={(v) => onChange({ hardMaxPerDay: v })} />

      <Toggle label="Needs a specific room / lab" value={!!rule.requiresRoom}
        onChange={(v) => onChange({ requiresRoom: v })} />

      {!!rule.requiresRoom && (
        <Select label="Pin to one room" value={rule.room ?? ''} placeholder="Any compatible room"
          options={rooms.map((r: any) => ({ label: `${r.roomName} (${r.roomType})`, value: r._id }))}
          onChange={(v) => onChange({ room: v })} />
      )}

      <Text style={g.ruleLabel}>Preferred days</Text>
      <View style={g.chipWrap}>
        {workingDays.map((d) => {
          const on = (rule.preferredDays ?? []).includes(d);
          return (
            <TouchableOpacity key={d} onPress={() => toggleDay(d)}
              style={[g.dayChip, on && { backgroundColor: Colors.accent, borderColor: Colors.accent }]}>
              <Text style={[g.dayChipText, on && { color: '#fff' }]}>{DAY_SHORT[d] ?? d}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={g.ruleHint}>
        Preferences are optimised for, never enforced — they cannot make a timetable impossible.
      </Text>
    </FormModal>
  );
}

const g = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  stepText: { fontSize: 13, color: Colors.text },

  barTrack: { height: 8, borderRadius: 4, backgroundColor: Colors.surfaceAlt, marginTop: 12, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  barLabel: { fontSize: 11, color: Colors.textSecondary, textAlign: 'right', marginTop: 4 },

  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },

  banner: { borderRadius: Radius.md, padding: 12, marginBottom: 10 },
  bannerText: { fontSize: 13, fontWeight: '700' },
  bannerSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 3 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayChip: {
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
  },
  dayChipText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  capacityLine: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 8, marginBottom: 4 },

  subjectRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 9,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  subjectName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  subjectSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  subjectWarn: { fontSize: 10.5, color: Colors.danger, marginTop: 1 },
  periodInput: {
    width: 52, height: 36, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt, textAlign: 'center', fontSize: 14, fontWeight: '700',
    color: Colors.text, paddingVertical: 0,
  },

  mergeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.accent, paddingVertical: 10,
  },
  mergeBtnText: { color: Colors.accent, fontWeight: '700', fontSize: 13 },
  groupChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
    borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 7,
  },
  groupChipText: { flex: 1, fontSize: 11.5, fontWeight: '700' },

  ruleLabel: { fontSize: 12, fontWeight: '700', color: Colors.text, marginTop: 10, marginBottom: 6 },
  ruleHint: { fontSize: 11, color: Colors.textSecondary, marginTop: 6, marginBottom: 4 },

  infoBox: { backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, padding: 10, marginBottom: 10 },
  infoText: { fontSize: 12, color: Colors.textSecondary },
  warnBox: { backgroundColor: Colors.warningLight, borderRadius: Radius.md, padding: 10, marginTop: 10 },
  warnText: { fontSize: 12, color: Colors.warning },

  primaryBtn: {
    backgroundColor: Colors.accent, borderRadius: Radius.md, paddingVertical: 14,
    alignItems: 'center', marginTop: Spacing.md,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
  secondaryBtn: {
    borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center', marginTop: 8,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  secondaryBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13.5 },

  errorBox: { backgroundColor: Colors.dangerLight, borderRadius: Radius.md, padding: 10, marginBottom: 10 },
  errorText: { color: Colors.danger, fontSize: 12.5 },
  note: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', marginTop: 14 },
});
