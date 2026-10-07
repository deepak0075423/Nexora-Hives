/**
 * Result Settings on the phone (Oct 2026) — the web's Results → Settings page
 * (GET/PUT /admin/results/settings), section by section:
 *
 *   Grading            the scale (a preset, or the school's own grades) and
 *                      classes on a scale of their own
 *   Exam types         renamed, switched off, or the school's own
 *   Terms & the year   terms, and how the year's result adds up
 *   Promotion          classes that detain nobody, the re-exam limit, the
 *                      re-check window, the distinction line
 *   Report cards       co-scholastic areas and grades, what a card shows, the
 *                      signature title, footer and remark bank
 *   Reminders & clock  marks reminders, when marks fall due, the office's own
 *                      reminders, and the school's time zone
 *
 * The checks are the web page's (and the server checks again). The signature
 * and seal are shown but uploaded on the web: the app has no file picker.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { TextInput } from '@/components/ui/TextInput';
import { Stack, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as R from '@/api/results.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Empty, LoaderView, Toggle, Select, confirmAsync, unwrap, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import { gradeColor } from '@/components/results/parts';
import { schoolLogoUrl } from '@/utils/branding';
import { os, say } from '@/components/results/office';

const ZONES = ['Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dhaka', 'Asia/Colombo', 'Asia/Karachi', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar',
  'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Africa/Nairobi', 'Africa/Lagos', 'Europe/London', 'Europe/Berlin', 'America/New_York',
  'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];
const CLASS_TEST = 'CLASS_TEST';
let seq = 0;
const uid = () => `n${(seq += 1)}`;
const blankOr = (v: any) => (v === null || v === undefined ? '' : String(v));

type Band = { id: string; grade: string; min: string; point: string; pass: boolean };

/** The server's settings as the screen edits them. */
function draftOf(c: any) {
  return {
    gradePreset: c.scale.preset,
    bands: (c.scale.bands as any[]).map((b: any): Band => ({ id: uid(), grade: b.grade, min: String(b.min), point: blankOr(b.point), pass: b.pass !== false })),
    examTypes: c.examTypes.map((t: any) => ({ id: uid(), key: t.key, label: t.label, kind: t.kind, builtIn: !!t.builtIn, active: t.active !== false })),
    coScholastic: c.coScholastic.map((a: any) => ({ id: uid(), key: a.key, label: a.label })),
    coGrades: c.coScholasticGrades.join(', '),
    showAttendance: c.report.showAttendance, showRank: c.report.showRank, showGradePoints: c.report.showGradePoints,
    principalTitle: c.report.principalTitle, footer: c.report.footer,
    remindersEnabled: c.reminders.enabled, afterDays: String(c.reminders.afterDays), repeatDays: String(c.reminders.repeatDays),
    classScales: (c.classScales || []).map((r: any) => ({ id: uid(), from: String(r.from), to: String(r.to), preset: r.preset, bands: r.bands || null })),
    terms: (c.terms || []).map((t: any) => ({ id: uid(), key: t.key, label: t.label, weight: blankOr(t.weight) })),
    overallMethod: c.overall?.method || 'marks',
    overallParts: (c.overall?.parts || []).map((x: any) => ({ id: uid(), source: x.source, weight: String(x.weight), best: blankOr(x.best) })),
    passRule: c.overall?.passRule || 'every', passPercent: String(c.overall?.passPercent ?? 33),
    noDetentionUpTo: blankOr(c.noDetentionUpTo), reExamMaxSubjects: blankOr(c.reExamMaxSubjects),
    recheckDays: String(c.recheckDays || 0), distinctionPercent: String(c.distinctionPercent ?? 75),
    remarkBank: (c.remarkBank || []).join('\n'), marksDueDays: blankOr(c.marksDueDays),
    officeReminders: c.officeReminders !== false, timezone: c.timezone || '',
    showClassFigures: !!c.report.showClassFigures, showSubjectRemarks: c.report.showSubjectRemarks !== false,
  };
}
type Draft = ReturnType<typeof draftOf>;
const plain = (d: Draft) => JSON.stringify(d, (k, v) => (k === 'id' ? undefined : v));

function bandErrors(bands: Band[]) {
  if (bands.length < 2 || bands.length > 12) return 'A grading scale has between 2 and 12 grades';
  for (const [i, b] of bands.entries()) {
    const g = b.grade.trim();
    if (!g) return `Grade ${i + 1} has no name`;
    if (g.length > 6) return `"${g}" is too long for a grade (6 characters at most)`;
    if (g.toUpperCase() === 'AB') return '"AB" is kept for an absent paper — choose another grade name';
    const min = Number(b.min);
    if (b.min === '' || !Number.isFinite(min) || min < 0 || min > 100) return `${g}: the lowest percentage must be between 0 and 100`;
    if (b.point !== '' && (!Number.isFinite(Number(b.point)) || Number(b.point) < 0 || Number(b.point) > 10)) return `${g}: a grade point is between 0 and 10`;
  }
  const names = bands.map((b) => b.grade.trim().toUpperCase());
  if (new Set(names).size !== names.length) return 'Two grades have the same name';
  const mins = bands.map((b) => Number(b.min));
  if (new Set(mins).size !== mins.length) return 'Two grades start at the same percentage';
  if (Math.min(...mins) !== 0) return 'The lowest grade must start at 0%';
  if (!bands.some((b) => b.pass)) return 'At least one grade must be a passing grade';
  if (!bands.some((b) => !b.pass)) return 'At least one grade must be a failing grade';
  const lowestPass = Math.min(...bands.filter((b) => b.pass).map((b) => Number(b.min)));
  if (bands.some((b) => !b.pass && Number(b.min) > lowestPass)) return 'Every passing grade must be above every failing grade';
  return '';
}

/** The first problem, said for the section it is in — the server checks all of it again. */
function check(d: Draft): { section: string; message: string } | null {
  const whole = (v: string, lo: number, hi: number) => v !== '' && Number.isInteger(Number(v)) && Number(v) >= lo && Number(v) <= hi;
  const wholeOrBlank = (v: string, lo: number, hi: number) => v === '' || whole(v, lo, hi);
  if (d.gradePreset === 'custom') { const m = bandErrors(d.bands); if (m) return { section: 'grading', message: m }; }
  for (const [i, r] of d.classScales.entries()) {
    if (!whole(r.from, -5, 20) || !whole(r.to, -5, 20)) return { section: 'grading', message: `Class scale ${i + 1}: give the classes as whole numbers` };
    if (Number(r.from) > Number(r.to)) return { section: 'grading', message: `Class scale ${i + 1}: the first class must come before the last` };
  }
  const sorted = [...d.classScales].sort((a, b) => Number(a.from) - Number(b.from));
  if (sorted.some((r, i) => i && Number(r.from) <= Number(sorted[i - 1].to))) return { section: 'grading', message: 'Two class scales cover the same class' };
  const labels = d.examTypes.map((t: any) => t.label.trim().toLowerCase());
  if (d.examTypes.some((t: any) => !t.label.trim())) return { section: 'types', message: 'Every exam type needs a name' };
  if (new Set(labels).size !== labels.length) return { section: 'types', message: 'Two exam types have the same name' };
  if (!d.examTypes.some((t: any) => t.active)) return { section: 'types', message: 'At least one exam type must stay switched on' };
  const termNames = d.terms.map((t: any) => t.label.trim().toLowerCase());
  if (d.terms.some((t: any) => !t.label.trim())) return { section: 'year', message: 'Every term needs a name' };
  if (new Set(termNames).size !== termNames.length) return { section: 'year', message: 'Two terms have the same name' };
  if (d.terms.some((t: any) => t.weight !== '' && !(Number(t.weight) > 0 && Number(t.weight) <= 100))) return { section: 'year', message: 'A term’s weight is between 1 and 100 — or leave every weight empty' };
  if (d.overallMethod === 'weighted') {
    if (!d.overallParts.length) return { section: 'year', message: 'Give at least one part its weight' };
    if (d.overallParts.some((x: any) => !(Number(x.weight) > 0 && Number(x.weight) <= 100))) return { section: 'year', message: 'Each part’s weight is between 1 and 100' };
    if (d.overallParts.some((x: any) => !wholeOrBlank(x.best, 1, 10))) return { section: 'year', message: '“Best of” is a whole number from 1 to 10, or empty for all' };
    if (new Set(d.overallParts.map((x: any) => x.source)).size !== d.overallParts.length) return { section: 'year', message: 'Each part can be listed once' };
  }
  if (d.passRule === 'aggregate' && !(d.passPercent !== '' && Number(d.passPercent) >= 0 && Number(d.passPercent) <= 100)) return { section: 'year', message: 'The pass percentage is 0 to 100' };
  if (!wholeOrBlank(d.noDetentionUpTo, -5, 20)) return { section: 'promotion', message: 'Classes that detain nobody: a class number, or empty' };
  if (!wholeOrBlank(d.reExamMaxSubjects, 1, 20)) return { section: 'promotion', message: 'Re-exam limit: a whole number, 1 to 20 — or empty' };
  if (!whole(d.recheckDays, 0, 60)) return { section: 'promotion', message: 'Re-check window: a whole number of days, 0 to 60' };
  if (!(d.distinctionPercent !== '' && Number(d.distinctionPercent) > 0 && Number(d.distinctionPercent) <= 100)) return { section: 'promotion', message: 'Distinction: a percentage, 1 to 100' };
  const areas = d.coScholastic.map((a: any) => a.label.trim().toLowerCase());
  if (d.coScholastic.some((a: any) => !a.label.trim())) return { section: 'cards', message: 'Every co-scholastic area needs a name' };
  if (new Set(areas).size !== areas.length) return { section: 'cards', message: 'Two co-scholastic areas have the same name' };
  const grades = d.coGrades.split(',').map((g: string) => g.trim()).filter(Boolean);
  if (grades.length < 2 || grades.length > 8) return { section: 'cards', message: 'Give between 2 and 8 co-scholastic grades, separated by commas' };
  if (grades.some((g: string) => g.length > 4)) return { section: 'cards', message: 'A co-scholastic grade is 4 characters at most' };
  if (new Set(grades.map((g: string) => g.toUpperCase())).size !== grades.length) return { section: 'cards', message: 'Two co-scholastic grades are the same' };
  if (!d.principalTitle.trim()) return { section: 'cards', message: 'Give the title for the head of school’s signature' };
  const remarks = d.remarkBank.split('\n').map((x: string) => x.trim()).filter(Boolean);
  if (remarks.length > 100) return { section: 'cards', message: 'At most 100 remarks in the bank' };
  if (remarks.some((x: string) => x.length > 300)) return { section: 'cards', message: 'A remark is 300 characters at most' };
  if (!whole(d.afterDays, 0, 30)) return { section: 'reminders', message: 'First reminder: a whole number of days, 0 to 30' };
  if (!whole(d.repeatDays, 1, 30)) return { section: 'reminders', message: 'Repeat: a whole number of days, 1 to 30' };
  if (!wholeOrBlank(d.marksDueDays, 0, 60)) return { section: 'reminders', message: 'Marks due: a whole number of days, 0 to 60 — or empty' };
  return null;
}

/* ── small pieces ── */
function Section({ id, title, sub, open, onToggle, children }: { id: string; title: string; sub: string; open: boolean; onToggle: (id: string) => void; children: React.ReactNode }) {
  return (
    <View style={os.card}>
      <TouchableOpacity style={x.secHead} onPress={() => onToggle(id)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={os.title}>{title}</Text>
          <Text style={os.lineSub}>{sub}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textSecondary} />
      </TouchableOpacity>
      {open ? <View style={{ marginTop: 10 }}>{children}</View> : null}
    </View>
  );
}
const Field = ({ label, value, onChange, numeric, placeholder, multiline, hint }: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean; placeholder?: string; multiline?: boolean; hint?: string }) => (
  <View style={{ marginBottom: 10 }}>
    <Text style={x.label}>{label}</Text>
    <TextInput style={[x.input, multiline && { minHeight: 90, textAlignVertical: 'top', paddingTop: 10 }]} value={value} onChangeText={onChange}
      keyboardType={numeric ? 'number-pad' : 'default'} placeholder={placeholder} placeholderTextColor={Colors.textLight} multiline={multiline} />
    {hint ? <Text style={x.hint}>{hint}</Text> : null}
  </View>
);
const Mini = ({ icon, label, onPress, danger }: { icon: string; label?: string; onPress: () => void; danger?: boolean }) => (
  <TouchableOpacity style={[x.mini, danger && { borderColor: Colors.dangerLight }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={label || icon}>
    <Ionicons name={icon as any} size={15} color={danger ? Colors.danger : Colors.primary} />
    {label ? <Text style={[x.miniText, danger && { color: Colors.danger }]}>{label}</Text> : null}
  </TouchableOpacity>
);
const Radio = ({ options, value, onChange }: { options: [string, string, string?][]; value: string; onChange: (v: string) => void }) => (
  <View style={{ gap: 6, marginBottom: 10 }}>
    {options.map(([v, label, sub]) => (
      <TouchableOpacity key={v} style={[x.radio, value === v && x.radioOn]} onPress={() => onChange(v)} accessibilityRole="radio" accessibilityState={{ checked: value === v }}>
        <Ionicons name={value === v ? 'radio-button-on' : 'radio-button-off'} size={18} color={value === v ? Colors.primary : Colors.textLight} />
        <View style={{ flex: 1 }}><Text style={os.lineName}>{label}</Text>{sub ? <Text style={os.lineSub}>{sub}</Text> : null}</View>
      </TouchableOpacity>
    ))}
  </View>
);

export default function ResultSettingsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [conf, setConf] = useState<any>(null);
  const [d, setD] = useState<Draft | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState('grading');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ section: string; message: string } | null>(null);

  const load = useCallback(async () => {
    try { const c = unwrap(await R.office.settings()); setConf(c); setD(draftOf(c)); setLoadError(''); }
    catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else setLoadError(err?.message || 'Settings could not be loaded');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const base = useMemo(() => (conf ? plain(draftOf(conf)) : ''), [conf]);
  const dirty = !!d && plain(d) !== base;
  // Changes not saved: ask before leaving.
  useEffect(() => navigation.addListener('beforeRemove', (e: any) => {
    if (!dirty || busy) return;
    e.preventDefault();
    confirmAsync('Discard the changes?', 'The settings you changed have not been saved.', 'Discard').then((ok) => { if (ok) navigation.dispatch(e.data.action); });
  }), [navigation, dirty, busy]);

  if (disabled) return (<><Stack.Screen options={{ title: 'Result Settings' }} /><ModuleDisabled /></>);
  if (loadError) return (<><Stack.Screen options={{ title: 'Result Settings' }} /><Empty icon="alert-circle-outline" text={loadError} /></>);
  if (!d || !conf) return (<><Stack.Screen options={{ title: 'Result Settings' }} /><LoaderView /></>);

  const set = (patch: Partial<Draft>) => { setD((x2) => (x2 ? { ...x2, ...patch } : x2)); setProblem(null); };
  const toggle = (id: string) => setOpen((o) => (o === id ? '' : id));
  const presetRows = (key: string) => (key === 'custom' ? [] : conf.presets.find((p: any) => p.key === key)?.rows || []);
  const ownBands = () => d.bands.map((b) => ({ grade: b.grade.trim(), min: Number(b.min), point: b.point === '' ? null : Number(b.point), pass: b.pass }));
  const sources = [...d.examTypes.filter((t: any) => t.key).map((t: any) => ({ value: t.key, label: t.label || t.key })), { value: CLASS_TEST, label: 'Class tests' }];

  const save = async () => {
    const p = check(d);
    if (p) { setProblem(p); setOpen(p.section); return; }
    setBusy(true);
    try {
      const body = {
        gradePreset: d.gradePreset,
        ...(d.gradePreset === 'custom' ? { gradeBands: ownBands() } : null),
        examTypes: d.examTypes.map((t: any) => ({ ...(t.key ? { key: t.key } : null), label: t.label.trim(), kind: t.kind, active: t.active })),
        coScholastic: d.coScholastic.map((a: any) => ({ ...(a.key ? { key: a.key } : null), label: a.label.trim() })),
        coScholasticGrades: d.coGrades.split(',').map((g: string) => g.trim()).filter(Boolean),
        showAttendance: d.showAttendance, showRank: d.showRank, showGradePoints: d.showGradePoints,
        principalTitle: d.principalTitle.trim(), reportFooter: d.footer.trim(),
        remindersEnabled: d.remindersEnabled, reminderAfterDays: Number(d.afterDays), reminderRepeatDays: Number(d.repeatDays),
        classScales: d.classScales.map((r: any) => ({ from: Number(r.from), to: Number(r.to), preset: r.preset, ...(r.preset === 'custom' ? { bands: r.bands || ownBands() } : null) })),
        terms: d.terms.map((t: any) => ({ ...(t.key ? { key: t.key } : null), label: t.label.trim(), weight: t.weight === '' ? null : Number(t.weight) })),
        overall: { method: d.overallMethod, passRule: d.passRule, passPercent: Number(d.passPercent),
          parts: d.overallParts.map((x2: any) => ({ source: x2.source, weight: Number(x2.weight), best: x2.best === '' ? null : Number(x2.best) })) },
        noDetentionUpTo: d.noDetentionUpTo === '' ? null : Number(d.noDetentionUpTo),
        reExamMaxSubjects: d.reExamMaxSubjects === '' ? null : Number(d.reExamMaxSubjects),
        recheckDays: Number(d.recheckDays), distinctionPercent: Number(d.distinctionPercent),
        remarkBank: d.remarkBank.split('\n').map((x2: string) => x2.trim()).filter(Boolean),
        marksDueDays: d.marksDueDays === '' ? null : Number(d.marksDueDays),
        officeReminders: d.officeReminders, showClassFigures: d.showClassFigures, showSubjectRemarks: d.showSubjectRemarks,
        ...(d.timezone !== (conf.timezone || '') ? { timezone: d.timezone } : null),
      };
      const c = unwrap(await R.office.saveSettings(body));
      setConf(c); setD(draftOf(c));
      say('Saved', 'The result settings have been saved.');
    } catch (err: any) { setProblem({ section: open, message: err?.message || 'The settings could not be saved' }); }
    finally { setBusy(false); }
  };

  const sigUrl = conf.report.principalSignature ? schoolLogoUrl({ logo: conf.report.principalSignature }) : null;
  const sealUrl = conf.report.schoolSeal ? schoolLogoUrl({ logo: conf.report.schoolSeal }) : null;
  const zones = d.timezone && !ZONES.includes(d.timezone) ? [d.timezone, ...ZONES] : ZONES;

  return (
    <>
      <Stack.Screen options={{ title: 'Result Settings' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={os.screen} contentContainerStyle={[os.body, { paddingBottom: dirty ? 120 : 40 }]} keyboardShouldPersistTaps="handled">
          {problem ? <Text style={os.bad}>{problem.message}</Text> : null}

          <Section id="grading" title="Grading Scale" sub="How a percentage becomes a grade" open={open === 'grading'} onToggle={toggle}>
            <View style={{ gap: 6 }}>
              {[...conf.presets.map((p: any) => ({ key: p.key, label: p.label })), { key: 'custom', label: 'The school’s own' }].map((p: any) => (
                <TouchableOpacity key={p.key} style={[x.radio, d.gradePreset === p.key && x.radioOn]} accessibilityRole="radio" accessibilityState={{ checked: d.gradePreset === p.key }}
                  onPress={() => set(p.key === 'custom' && d.gradePreset !== 'custom'
                    ? { gradePreset: 'custom', bands: presetRows(d.gradePreset).map((r: any) => ({ id: uid(), grade: r.grade, min: String(r.from), point: blankOr(r.point), pass: r.pass })) }
                    : { gradePreset: p.key })}>
                  <Ionicons name={d.gradePreset === p.key ? 'radio-button-on' : 'radio-button-off'} size={18} color={d.gradePreset === p.key ? Colors.primary : Colors.textLight} />
                  <View style={{ flex: 1 }}>
                    <Text style={os.lineName}>{p.label}</Text>
                    <View style={x.chips}>
                      {(p.key === 'custom' ? (d.gradePreset === 'custom' ? d.bands.map((b) => ({ grade: b.grade, pass: b.pass })) : []) : presetRows(p.key)).map((r: any) => (
                        <Text key={r.grade} style={[x.chip, { color: gradeColor(r.grade, [r]).fg, backgroundColor: gradeColor(r.grade, [r]).bg }]}>{r.grade}</Text>
                      ))}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            {d.gradePreset === 'custom' ? (
              <View style={{ marginTop: 10 }}>
                <View style={x.bandHead}><Text style={[x.small, { flex: 1.2 }]}>Grade</Text><Text style={[x.small, { flex: 1 }]}>From %</Text><Text style={[x.small, { flex: 1 }]}>Point</Text><Text style={[x.small, { width: 64 }]}>Result</Text><View style={{ width: 34 }} /></View>
                {d.bands.map((b) => (
                  <View key={b.id} style={x.bandRow}>
                    <TextInput text="code" style={[x.input, x.cell, { flex: 1.2 }]} value={b.grade} maxLength={6} onChangeText={(v) => set({ bands: d.bands.map((y) => (y.id === b.id ? { ...y, grade: v } : y)) })} accessibilityLabel="Grade" />
                    <TextInput style={[x.input, x.cell, { flex: 1 }]} value={b.min} keyboardType="decimal-pad" onChangeText={(v) => set({ bands: d.bands.map((y) => (y.id === b.id ? { ...y, min: v } : y)) })} accessibilityLabel="Starts at" />
                    <TextInput style={[x.input, x.cell, { flex: 1 }]} value={b.point} placeholder="—" placeholderTextColor={Colors.textLight} keyboardType="decimal-pad" onChangeText={(v) => set({ bands: d.bands.map((y) => (y.id === b.id ? { ...y, point: v } : y)) })} accessibilityLabel="Grade point" />
                    <TouchableOpacity style={[x.pass, !b.pass && x.fail]} onPress={() => set({ bands: d.bands.map((y) => (y.id === b.id ? { ...y, pass: !y.pass } : y)) })}>
                      <Text style={[x.passText, !b.pass && { color: Colors.danger }]}>{b.pass ? 'Pass' : 'Fail'}</Text>
                    </TouchableOpacity>
                    <Mini icon="trash-outline" danger onPress={() => d.bands.length > 2 && set({ bands: d.bands.filter((y) => y.id !== b.id) })} />
                  </View>
                ))}
                {d.bands.length < 12 ? <Mini icon="add" label="Add grade" onPress={() => set({ bands: [...d.bands, { id: uid(), grade: '', min: '', point: '', pass: true }] })} /> : null}
              </View>
            ) : null}
            <Text style={[x.label, { marginTop: 14 }]}>Classes on a scale of their own</Text>
            {d.classScales.map((r: any) => (
              <View key={r.id} style={x.ruleRow}>
                <TextInput style={[x.input, x.cell, { width: 54 }]} value={r.from} keyboardType="number-pad" onChangeText={(v) => set({ classScales: d.classScales.map((y: any) => (y.id === r.id ? { ...y, from: v } : y)) })} accessibilityLabel="From class" />
                <Text style={os.lineSub}>to</Text>
                <TextInput style={[x.input, x.cell, { width: 54 }]} value={r.to} keyboardType="number-pad" onChangeText={(v) => set({ classScales: d.classScales.map((y: any) => (y.id === r.id ? { ...y, to: v } : y)) })} accessibilityLabel="To class" />
                <View style={{ flex: 1 }}>
                  <Select label="" value={r.preset} onChange={(v) => set({ classScales: d.classScales.map((y: any) => (y.id === r.id ? { ...y, preset: v, bands: v === 'custom' ? (y.bands || ownBands()) : null } : y)) })}
                    options={[...conf.presets.map((p: any) => ({ value: p.key, label: p.label })), ...(d.gradePreset === 'custom' || r.preset === 'custom' ? [{ value: 'custom', label: 'The school’s own' }] : [])]} />
                </View>
                <Mini icon="trash-outline" danger onPress={() => set({ classScales: d.classScales.filter((y: any) => y.id !== r.id) })} />
              </View>
            ))}
            {d.classScales.length < 10 ? <Mini icon="add" label="Add classes" onPress={() => set({ classScales: [...d.classScales, { id: uid(), from: '', to: '', preset: conf.presets[0]?.key || 'standard', bands: null }] })} /> : null}
          </Section>

          <Section id="types" title="Exam Types" sub="Offered when an exam is created; only a final promotes" open={open === 'types'} onToggle={toggle}>
            {d.examTypes.map((t: any) => (
              <View key={t.id} style={x.typeRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <TextInput text="title" style={x.input} value={t.label} maxLength={40} onChangeText={(v) => set({ examTypes: d.examTypes.map((y: any) => (y.id === t.id ? { ...y, label: v } : y)) })} placeholder="e.g. Half Yearly" placeholderTextColor={Colors.textLight} accessibilityLabel="Exam type name" />
                  {t.builtIn || t.key ? <Text style={x.hint}>Counts as {conf.kinds.find((k: any) => k.value === t.kind)?.label}{t.builtIn ? ' · built in' : ''}</Text> : (
                    <Select label="Counts as" value={t.kind} onChange={(v) => set({ examTypes: d.examTypes.map((y: any) => (y.id === t.id ? { ...y, kind: v } : y)) })}
                      options={conf.kinds.map((k: any) => ({ value: k.value, label: k.label }))} />
                  )}
                </View>
                <TouchableOpacity style={[x.pass, !t.active && x.fail]} onPress={() => set({ examTypes: d.examTypes.map((y: any) => (y.id === t.id ? { ...y, active: !y.active } : y)) })}>
                  <Text style={[x.passText, !t.active && { color: Colors.textSecondary }]}>{t.active ? 'On' : 'Off'}</Text>
                </TouchableOpacity>
                {!t.builtIn ? <Mini icon="trash-outline" danger onPress={() => set({ examTypes: d.examTypes.filter((y: any) => y.id !== t.id) })} /> : <View style={{ width: 34 }} />}
              </View>
            ))}
            <Mini icon="add" label="Add exam type" onPress={() => set({ examTypes: [...d.examTypes, { id: uid(), key: '', label: '', kind: 'MID_TERM', builtIn: false, active: true }] })} />
            <Text style={x.hint}>A type an exam already uses cannot be removed — switch it off instead.</Text>
          </Section>

          <Section id="year" title="Terms & the Year’s Result" sub="Terms, and how the counted exams add up" open={open === 'year'} onToggle={toggle}>
            {d.terms.map((t: any) => (
              <View key={t.id} style={x.ruleRow}>
                <TextInput text="title" style={[x.input, x.cell, { flex: 1 }]} value={t.label} maxLength={30} placeholder="e.g. Term 1" placeholderTextColor={Colors.textLight} onChangeText={(v) => set({ terms: d.terms.map((y: any) => (y.id === t.id ? { ...y, label: v } : y)) })} accessibilityLabel="Term name" />
                <TextInput style={[x.input, x.cell, { width: 80 }]} value={t.weight} placeholder="Equal" placeholderTextColor={Colors.textLight} keyboardType="number-pad" onChangeText={(v) => set({ terms: d.terms.map((y: any) => (y.id === t.id ? { ...y, weight: v } : y)) })} accessibilityLabel="Weight" />
                <Mini icon="trash-outline" danger onPress={() => set({ terms: d.terms.filter((y: any) => y.id !== t.id) })} />
              </View>
            ))}
            {d.terms.length < 4 ? <Mini icon="add" label="Add term" onPress={() => set({ terms: [...d.terms, { id: uid(), key: '', label: '', weight: '' }] })} /> : null}
            <Text style={[x.hint, { marginBottom: 10 }]}>Weights make each term a share of the year — leave them empty to weigh the terms equally.</Text>
            <Radio value={d.overallMethod} onChange={(v) => set({ overallMethod: v })} options={[
              ['marks', 'Marks added up', 'Every counted exam’s marks together'],
              ['weighted', 'Weighted parts', 'Each exam type — or class tests — a share of every subject'],
            ]} />
            {d.overallMethod === 'weighted' ? (
              <View style={{ marginBottom: 10 }}>
                {d.overallParts.map((p: any) => (
                  <View key={p.id} style={x.ruleRow}>
                    <View style={{ flex: 1 }}>
                      <Select label="" value={p.source} onChange={(v) => set({ overallParts: d.overallParts.map((y: any) => (y.id === p.id ? { ...y, source: v } : y)) })} options={sources} />
                    </View>
                    <TextInput style={[x.input, x.cell, { width: 60 }]} value={p.weight} placeholder="%" placeholderTextColor={Colors.textLight} keyboardType="number-pad" onChangeText={(v) => set({ overallParts: d.overallParts.map((y: any) => (y.id === p.id ? { ...y, weight: v } : y)) })} accessibilityLabel="Weight" />
                    <TextInput style={[x.input, x.cell, { width: 60 }]} value={p.best} placeholder="Best" placeholderTextColor={Colors.textLight} keyboardType="number-pad" onChangeText={(v) => set({ overallParts: d.overallParts.map((y: any) => (y.id === p.id ? { ...y, best: v } : y)) })} accessibilityLabel="Best of" />
                    <Mini icon="trash-outline" danger onPress={() => set({ overallParts: d.overallParts.filter((y: any) => y.id !== p.id) })} />
                  </View>
                ))}
                {d.overallParts.length < 8 ? <Mini icon="add" label="Add part" onPress={() => {
                  const free = sources.find((o) => !d.overallParts.some((y: any) => y.source === o.value));
                  set({ overallParts: [...d.overallParts, { id: uid(), source: free?.value || sources[0].value, weight: '', best: '' }] });
                }} /> : null}
              </View>
            ) : null}
            <Radio value={d.passRule} onChange={(v) => set({ passRule: v })} options={[
              ['every', 'Pass every exam', 'The year is passed by passing every counted exam'],
              ['aggregate', 'Pass on the aggregate', 'Each subject is passed on its percentage for the year'],
            ]} />
            {d.passRule === 'aggregate' ? <Field label="Pass percentage in each subject" value={d.passPercent} numeric onChange={(v) => set({ passPercent: v })} /> : null}
          </Section>

          <Section id="promotion" title="Promotion, Re-exams & Re-checks" sub="Rules a final’s promotion and re-exams follow" open={open === 'promotion'} onToggle={toggle}>
            <Field label="Classes that detain nobody (up to class)" value={d.noDetentionUpTo} numeric placeholder="None" onChange={(v) => set({ noDetentionUpTo: v })} hint="Up to this class, every student moves up whatever the result" />
            <Field label="Re-exam in at most (papers)" value={d.reExamMaxSubjects} numeric placeholder="No limit" onChange={(v) => set({ reExamMaxSubjects: v })} hint="A student who failed more sits none" />
            <Field label="Re-check requests within (days)" value={d.recheckDays} numeric onChange={(v) => set({ recheckDays: v })} hint="After results reach families; 0 — not offered" />
            <Field label="Distinction from (%)" value={d.distinctionPercent} numeric onChange={(v) => set({ distinctionPercent: v })} />
          </Section>

          <Section id="cards" title="Report Cards" sub="What a card carries besides the marks" open={open === 'cards'} onToggle={toggle}>
            <Text style={x.label}>Co-scholastic areas</Text>
            {d.coScholastic.map((a: any) => (
              <View key={a.id} style={x.ruleRow}>
                <TextInput text="title" style={[x.input, x.cell, { flex: 1 }]} value={a.label} maxLength={40} placeholder="e.g. Art Education" placeholderTextColor={Colors.textLight} onChangeText={(v) => set({ coScholastic: d.coScholastic.map((y: any) => (y.id === a.id ? { ...y, label: v } : y)) })} accessibilityLabel="Area" />
                <Mini icon="trash-outline" danger onPress={() => set({ coScholastic: d.coScholastic.filter((y: any) => y.id !== a.id) })} />
              </View>
            ))}
            {d.coScholastic.length < 12 ? <Mini icon="add" label="Add area" onPress={() => set({ coScholastic: [...d.coScholastic, { id: uid(), key: '', label: '' }] })} /> : null}
            <View style={{ height: 10 }} />
            <Field label="Grades an area can be given" value={d.coGrades} onChange={(v) => set({ coGrades: v })} hint="Best first, separated by commas — e.g. A, B, C" />
            <Toggle label="Attendance" value={d.showAttendance} onChange={(v) => set({ showAttendance: v })} sub="Days present out of the days marked" />
            <Toggle label="Rank in the section" value={d.showRank} onChange={(v) => set({ showRank: v })} />
            <Toggle label="Grade points" value={d.showGradePoints} onChange={(v) => set({ showGradePoints: v })} />
            <Toggle label="Class average and highest" value={d.showClassFigures} onChange={(v) => set({ showClassFigures: v })} />
            <Toggle label="Subject teachers’ remarks" value={d.showSubjectRemarks} onChange={(v) => set({ showSubjectRemarks: v })} />
            <Field label="Signature title" value={d.principalTitle} onChange={(v) => set({ principalTitle: v })} />
            <Field label="Footer (optional)" value={d.footer} multiline onChange={(v) => set({ footer: v.slice(0, 300) })} placeholder="e.g. School reopens on 2 April" />
            <Field label="Remark bank — one remark per line (optional)" value={d.remarkBank} multiline onChange={(v) => set({ remarkBank: v })} placeholder={'A sincere and hard-working student.\nNeeds to be more regular with homework.'} />
            <Text style={x.label}>Signature and seal</Text>
            <View style={x.imgs}>
              {[['Signature', sigUrl], ['Seal', sealUrl]].map(([label, url]) => (
                <View key={label as string} style={x.imgBox}>
                  {url ? <Image source={{ uri: url as string }} style={x.img} resizeMode="contain" accessibilityLabel={label as string} /> : <Text style={x.hint}>No {String(label).toLowerCase()}</Text>}
                  <Text style={x.small}>{label}</Text>
                </View>
              ))}
            </View>
            <Text style={x.hint}>Uploaded from the web, under Results → Settings.</Text>
          </Section>

          <Section id="reminders" title="Reminders & the School’s Clock" sub="Marks reminders, due dates, the time zone" open={open === 'reminders'} onToggle={toggle}>
            <Toggle label="Remind teachers about marks still to enter" value={d.remindersEnabled} onChange={(v) => set({ remindersEnabled: v })} />
            {d.remindersEnabled ? (
              <View style={x.two}>
                <View style={{ flex: 1 }}><Field label="First (days after)" value={d.afterDays} numeric onChange={(v) => set({ afterDays: v })} /></View>
                <View style={{ flex: 1 }}><Field label="Then every (days)" value={d.repeatDays} numeric onChange={(v) => set({ repeatDays: v })} /></View>
              </View>
            ) : null}
            <Field label="Marks due (days after an exam ends)" value={d.marksDueDays} numeric placeholder="No due date" onChange={(v) => set({ marksDueDays: v })} hint="The “Marks due by” date new exams start with" />
            <Toggle label="Remind the office too" value={d.officeReminders} onChange={(v) => set({ officeReminders: v })} sub="Overdue marks, results waiting to be published" />
            <Select label="Time zone" value={d.timezone} onChange={(v) => set({ timezone: v })} options={zones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))} />
          </Section>
        </ScrollView>
        {dirty ? (
          <View style={[x.foot, { paddingBottom: Spacing.sm + insets.bottom }]}>
            <TouchableOpacity style={[os.ghost, { flex: 1, height: 46 }]} onPress={() => { setD(draftOf(conf)); setProblem(null); }} disabled={busy}><Text style={os.ghostText}>Discard</Text></TouchableOpacity>
            <TouchableOpacity style={[os.btn, { flex: 1, height: 46 }]} onPress={save} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={os.btnText}>Save Changes</Text>}
            </TouchableOpacity>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </>
  );
}

const x = StyleSheet.create({
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  small: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  hint: { fontSize: 11, color: Colors.textSecondary, marginTop: 3 },
  input: { minHeight: 42, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt, paddingHorizontal: 10, fontSize: 14, color: Colors.text },
  cell: { minHeight: 38 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  chip: { fontSize: 11, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm, overflow: 'hidden' },
  radio: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  radioOn: { borderColor: Colors.primary, backgroundColor: '#F5F3FF' },
  bandHead: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  pass: { width: 64, height: 38, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.successLight, backgroundColor: Colors.successLight, alignItems: 'center', justifyContent: 'center' },
  fail: { borderColor: Colors.dangerLight, backgroundColor: Colors.dangerLight },
  passText: { fontSize: 12, fontWeight: '700', color: Colors.success },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  typeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 10 },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minWidth: 34, height: 34, paddingHorizontal: 8, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center' },
  miniText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  imgs: { flexDirection: 'row', gap: 10 },
  imgBox: { flex: 1, height: 90, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6 },
  img: { width: '100%', height: 56 },
  two: { flexDirection: 'row', gap: 10 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 8, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
});
