/**
 * Admin → Timetable → Configuration (phone).
 *
 * The rules the generator works inside, per academic year — the same six tabs as
 * the web screen, over the same GET/PUT /admin/timetable/config:
 *
 *   General       the day, the working week, lunch, and the two teacher limits
 *   Period Grid   the bells — the weekday template, and Saturday's only if
 *                 Saturday is a working day
 *   Working Days  which days run, and what each one holds
 *   Constraints   the hard rules
 *   Optimiser     what the solver pursues once the hard rules hold
 *   Advanced      solver budget, saved rule sets, carrying a year forward
 *
 * Nothing is saved until Save. A year with nothing saved runs on defaults, and
 * sections keep their own period structure until a school-wide grid exists.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, TextInput } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as ttApi from '@/api/timetable.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Card, SectionTitle, SegTabs, Select, Input, Toggle, ActionBtn,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import {
  DAYS, DAY_SHORT, toMinutes, timeRange, duration, plural,
} from '@/components/timetable/viewKit';

const TABS = [
  { key: 'general',   label: 'General' },
  { key: 'grid',      label: 'Period Grid' },
  { key: 'days',      label: 'Working Days' },
  { key: 'limits',    label: 'Constraints' },
  { key: 'optimiser', label: 'Optimiser' },
  { key: 'advanced',  label: 'Advanced' },
];

const PERIOD_TYPES = ['Teaching', 'Break', 'Lunch', 'Assembly', 'Activity', 'Free'];

// The five that matter most first — they are what the General tab shows.
const WEIGHTS: [string, string][] = [
  ['sameSubjectTwiceADay', 'Avoid same subject twice a day'],
  ['difficultConsecutive', 'Avoid back-to-back hard subjects'],
  ['studentGaps',          'Minimise student free gaps'],
  ['sameSubjectAdjacent',  'Avoid same subject in adjacent periods'],
  ['spreadAcrossWeek',     'Spread subjects across the week'],
  ['difficultLastPeriod',  'Avoid hard subjects in the last period'],
  ['teacherLoadBalance',   'Balance teacher load across days'],
  ['teacherGaps',          'Minimise teacher free gaps'],
  ['teacherPreferred',     'Honour teacher day and period preferences'],
  ['subjectPreferred',     'Honour subject day and period preferences'],
  ['dailyOverload',        'Avoid overloading a single day'],
];

const isTime = (t: string) => /^\d{1,2}:\d{2}$/.test(String(t || '').trim()) && toMinutes(t) != null;
const teachingIn = (rows: any[]) => (rows || []).filter((p) => (p.periodType || 'Teaching') === 'Teaching');

export default function TimetableConfigurationScreen() {
  const [cfg, setCfg]       = useState<any>(null);
  const [saved, setSaved]   = useState('');
  const [years, setYears]   = useState<any[]>([]);
  const [yearId, setYearId] = useState('');
  const [tab, setTab]       = useState('general');
  const [loading, setLoad]  = useState(true);
  const [saving, setSaving] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [autoPeriods, setAutoPeriods] = useState('8');
  const [templateName, setTemplateName] = useState('');

  const load = useCallback(async (yid?: string) => {
    setLoad(true);
    try {
      const [cRes, mRes] = await Promise.all([
        ttApi.getConfig(yid),
        years.length ? Promise.resolve(null) : ttApi.getMeta(yid),
      ]);
      const c = unwrap(cRes);
      const shaped = {
        ...c,
        periodTemplate: c?.periodTemplate ?? [],
        saturdayTemplate: c?.saturdayTemplate ?? [],
        ruleTemplates: c?.ruleTemplates ?? [],
        defaults: c?.defaults ?? {},
        softWeights: c?.softWeights ?? {},
        solver: c?.solver ?? {},
        workingDays: c?.workingDays ?? DAYS.slice(0, 5),
      };
      setCfg(shaped);
      setSaved(JSON.stringify(shaped));
      if (!yid) setYearId(String(c?.selectedYearId ?? ''));
      if (mRes) setYears(unwrap(mRes)?.years ?? []);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoad(false); }
  }, [years.length]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !!cfg && saved !== JSON.stringify(cfg);
  const set = (k: string, v: any) => setCfg((c: any) => ({ ...c, [k]: v }));
  const setDefault = (k: string, v: any) => setCfg((c: any) => ({ ...c, defaults: { ...c.defaults, [k]: v } }));
  const setWeight = (k: string, v: number) => setCfg((c: any) => ({ ...c, softWeights: { ...c.softWeights, [k]: v } }));
  const setSolver = (k: string, v: number) => setCfg((c: any) => ({ ...c, solver: { ...c.solver, [k]: v } }));

  const setRow = (key: string, i: number, patch: any) =>
    setCfg((c: any) => ({ ...c, [key]: c[key].map((p: any, k: number) => (k === i ? { ...p, ...patch } : p)) }));
  const removeRow = (key: string, i: number) =>
    setCfg((c: any) => ({ ...c, [key]: c[key].filter((_: any, k: number) => k !== i) }));
  const addRow = (key: string, type: string) => setCfg((c: any) => {
    const n = teachingIn(c[key]).length + 1;
    return {
      ...c,
      [key]: [...c[key], {
        periodNumber: type === 'Teaching' ? n : 0, startTime: '', endTime: '',
        periodType: type, label: type === 'Teaching' ? '' : type,
      }],
    };
  });

  /** The same equal-split maths as the web screen and the section editor. */
  const autoCalc = (key: string) => {
    const toStr = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const n = Math.max(1, Number(autoPeriods) || 8);
    const lunch = Math.max(0, Number(cfg.lunchMinutes) || 0);
    const after = Math.max(0, Number(cfg.lunchAfterPeriod) || 0);
    let cur = toMinutes(cfg.dayStartsAt || '08:00') ?? 480;
    const total = (toMinutes(cfg.dayEndsAt || '14:00') ?? 840) - cur - lunch;
    if (total < n) { Alert.alert('Too short', 'The school day is too short for that many periods.'); return; }
    const len = Math.floor(total / n);
    const rem = total % n;
    const out: any[] = [];
    if (cfg.includeAssembly) {
      out.push({ periodNumber: 0, startTime: toStr(cur), endTime: toStr(cur + 15), periodType: 'Assembly', label: 'Assembly' });
      cur += 15;
    }
    let p = 1;
    for (let i = 1; i <= n + 1; i++) {
      if (i - 1 === after && lunch > 0) {
        out.push({ periodNumber: 0, startTime: toStr(cur), endTime: toStr(cur + lunch), periodType: 'Lunch', label: 'Lunch Break' });
        cur += lunch;
      }
      if (p <= n) {
        const dur = len + (p === n ? rem : 0);
        out.push({ periodNumber: p, startTime: toStr(cur), endTime: toStr(cur + dur), periodType: 'Teaching', label: '' });
        cur += dur;
        p += 1;
      }
    }
    set(key, out);
  };

  const save = async () => {
    if (!cfg.workingDays?.length) { Alert.alert('Working days', 'A school runs on at least one day.'); return; }
    for (const key of ['periodTemplate', 'saturdayTemplate']) {
      const bad = (cfg[key] || []).find((p: any) => (p.startTime && !isTime(p.startTime)) || (p.endTime && !isTime(p.endTime)));
      if (bad) { Alert.alert('Check the times', 'Every start and end time must look like 08:45.'); return; }
    }
    setSaving(true);
    try {
      await ttApi.saveConfig({ ...cfg, yearId });
      await load(yearId);
      Alert.alert('Saved', 'The configuration is saved.');
    } catch (e: any) {
      Alert.alert('Could not save', e?.data?.message || e?.message || 'Try again.');
    } finally { setSaving(false); }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Configuration' }} /><ModuleDisabled /></>);
  if (loading || !cfg) return (<><Stack.Screen options={{ title: 'Configuration' }} /><LoaderView /></>);

  // Saturday runs only if this year's working days say so — and a grid for a day
  // that never runs is an invitation to configure something that cannot happen.
  const saturdayOpen = cfg.workingDays.includes('Saturday');
  // The lunch the weekday grid actually runs. The minutes field above only feeds
  // Auto-calculate, so the two can disagree — and the summary shows the grid's.
  const gridLunch = cfg.periodTemplate.find((p: any) => p.periodType === 'Lunch');
  const gridLunchMins = gridLunch
    ? Math.max(0, (toMinutes(gridLunch.endTime) || 0) - (toMinutes(gridLunch.startTime) || 0)) : null;
  const gridDays = cfg.workingDays.filter((d: string) => d !== 'Sunday'
    && !(d === 'Saturday' && cfg.saturdayTemplate.length));
  const weekdayLabel = gridDays.length > 1
    ? `${DAY_SHORT[gridDays[0]]}–${DAY_SHORT[gridDays[gridDays.length - 1]]}`
    : (gridDays[0] ? DAY_SHORT[gridDays[0]] : 'no days');

  return (
    <>
      <Stack.Screen options={{ title: 'Configuration' }} />
      <ScrollView style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled">

        {!cfg.isSaved && (
          <View style={c.info}>
            <Text style={c.infoText}>
              Nothing is saved for this year yet — these are the defaults. Sections keep their own
              period structure until a school-wide grid is saved here.
            </Text>
          </View>
        )}

        <SegTabs tabs={TABS} active={tab} onChange={setTab} />

        {/* ══ General ══════════════════════════════════════════════════════ */}
        {tab === 'general' && (
          <>
            <Card>
              <Select label="Academic year" value={yearId}
                onChange={(v) => { setYearId(v); load(v); }}
                options={years.map((y: any) => ({
                  label: `${y.yearName}${y.status === 'active' ? ' (Active)' : ''}`, value: String(y._id),
                }))} />
            </Card>

            <SectionTitle>Working days</SectionTitle>
            <Card><DayPicker value={cfg.workingDays} onChange={(v) => set('workingDays', v)} /></Card>

            <SectionTitle>Default timing</SectionTitle>
            <Card>
              <View style={c.pair}>
                <View style={{ flex: 1 }}>
                  <Input label="School starts at" value={cfg.dayStartsAt || '08:00'}
                    onChange={(v) => set('dayStartsAt', v)} placeholder="08:00" />
                </View>
                <View style={{ flex: 1 }}>
                  <Input label="School ends at" value={cfg.dayEndsAt || '14:00'}
                    onChange={(v) => set('dayEndsAt', v)} placeholder="14:00" />
                </View>
              </View>
            </Card>

            <SectionTitle>Break & lunch</SectionTitle>
            <Card>
              <View style={c.pair}>
                <View style={{ flex: 1 }}>
                  <Input label="Lunch after period" keyboardType="numeric"
                    value={String(cfg.lunchAfterPeriod ?? 4)} onChange={(v) => set('lunchAfterPeriod', Number(v) || 0)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Input label="Lunch (minutes)" keyboardType="numeric"
                    value={String(cfg.lunchMinutes ?? 30)} onChange={(v) => set('lunchMinutes', Number(v) || 0)} />
                </View>
              </View>
              {gridLunchMins != null && gridLunchMins !== (cfg.lunchMinutes ?? 30) && (
                <Text style={[c.muted, { marginBottom: 8 }]}>
                  The period grid’s lunch runs {duration(gridLunchMins)} — this number is used when the
                  grid is auto-calculated.
                </Text>
              )}
              <Toggle label="Auto-calculate break times" value={cfg.autoBreaks !== false}
                onChange={(v) => set('autoBreaks', v)} sub="Breaks are placed when the grid is laid out." />
              <Toggle label="Include assembly in timetable" value={!!cfg.includeAssembly}
                onChange={(v) => set('includeAssembly', v)} sub="A morning assembly row rather than eating period 1." />
            </Card>

            <SectionTitle>Hard limits</SectionTitle>
            <Card><Limits cfg={cfg} setDefault={setDefault} set={set} /></Card>

            <SectionTitle>Optimiser weights</SectionTitle>
            <Card>
              {WEIGHTS.slice(0, 5).map(([k, label]) => (
                <Weight key={k} label={label} value={cfg.softWeights?.[k] ?? 0} onChange={(v) => setWeight(k, v)} />
              ))}
              <TouchableOpacity onPress={() => setTab('optimiser')} style={c.linkRow}>
                <Text style={c.link}>Show all {WEIGHTS.length} weights</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
              </TouchableOpacity>
            </Card>

            <Summary cfg={cfg} years={years} yearId={yearId} />
          </>
        )}

        {/* ══ Period grid ══════════════════════════════════════════════════ */}
        {tab === 'grid' && (
          <>
            <View style={c.pair}>
              <View style={{ flex: 1 }}>
                <Input label="Periods to lay out" keyboardType="numeric"
                  value={autoPeriods} onChange={setAutoPeriods} />
              </View>
            </View>

            <GridEditor title={`Period grid (${weekdayLabel})`} rows={cfg.periodTemplate}
              onAuto={() => autoCalc('periodTemplate')}
              onChange={(i, p) => setRow('periodTemplate', i, p)}
              onRemove={(i) => removeRow('periodTemplate', i)}
              onAdd={(t) => addRow('periodTemplate', t)} />

            {saturdayOpen ? (
              <GridEditor title="Saturday grid (optional)"
                hint="Leave this empty to reuse the weekday grid. Use it for a shorter or half-day Saturday."
                rows={cfg.saturdayTemplate}
                onAuto={() => autoCalc('saturdayTemplate')}
                onChange={(i, p) => setRow('saturdayTemplate', i, p)}
                onRemove={(i) => removeRow('saturdayTemplate', i)}
                onAdd={(t) => addRow('saturdayTemplate', t)} />
            ) : cfg.saturdayTemplate.length ? (
              // Hiding the editor must not strand the rows behind it.
              <>
                <SectionTitle>Saturday grid</SectionTitle>
                <Card>
                  <Text style={c.warnText}>
                    Saturday is not a working day, so this grid is never used. A Saturday grid of
                    {' '}{plural(teachingIn(cfg.saturdayTemplate).length, 'teaching period')} is still
                    saved in case Saturday comes back.
                  </Text>
                  <View style={{ marginTop: 10 }}>
                    <ActionBtn label="Remove it" tone="danger" small onPress={() => set('saturdayTemplate', [])} />
                  </View>
                </Card>
              </>
            ) : null}
          </>
        )}

        {/* ══ Working days ═════════════════════════════════════════════════ */}
        {tab === 'days' && (
          <>
            <Card><DayPicker value={cfg.workingDays} onChange={(v) => set('workingDays', v)} /></Card>
            <SectionTitle>What each day holds</SectionTitle>
            <Card>
              {DAYS.map((d) => {
                const on = cfg.workingDays.includes(d);
                const sat = on && d === 'Saturday' && cfg.saturdayTemplate.length > 0;
                const rows = sat ? cfg.saturdayTemplate : cfg.periodTemplate;
                const first = rows[0];
                const last = rows[rows.length - 1];
                const mins = first && last ? (toMinutes(last.endTime) || 0) - (toMinutes(first.startTime) || 0) : 0;
                return (
                  <View key={d} style={[c.dayRow, !on && { opacity: 0.45 }]}>
                    <Text style={c.dayName}>{d}</Text>
                    <Text style={c.dayMeta}>
                      {!on ? 'Closed' : `${sat ? 'Saturday grid' : 'Weekday grid'} · ${teachingIn(rows).length} periods${mins > 0 ? ` · ${duration(mins)}` : ''}`}
                    </Text>
                  </View>
                );
              })}
            </Card>
            <Text style={c.muted}>
              Whether Saturday runs at all — and which Saturdays — is a school-wide setting in School
              Settings. Sections closed on a day are left out of it automatically.
            </Text>
          </>
        )}

        {/* ══ Constraints ══════════════════════════════════════════════════ */}
        {tab === 'limits' && (
          <>
            <Card><Limits cfg={cfg} setDefault={setDefault} set={set} /></Card>
            <SectionTitle>Never negotiable</SectionTitle>
            <Card>
              {[
                'One teacher, one place, one period',
                'One room, one class, one period',
                'One section, one lesson, one period',
                'A blocked availability or room slot is never used',
                'Nothing is placed outside a Teaching period',
              ].map((x) => (
                <View key={x} style={c.ruleRow}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                  <Text style={c.ruleText}>{x}</Text>
                </View>
              ))}
            </Card>
          </>
        )}

        {/* ══ Optimiser ════════════════════════════════════════════════════ */}
        {tab === 'optimiser' && (
          <Card>
            <Text style={[c.muted, { marginBottom: 8 }]}>
              How hard the solver pushes on each soft rule once every hard rule holds. 0 switches one
              off. Weights are trade-offs, not targets.
            </Text>
            {WEIGHTS.map(([k, label]) => (
              <Weight key={k} label={label} value={cfg.softWeights?.[k] ?? 0} onChange={(v) => setWeight(k, v)} />
            ))}
          </Card>
        )}

        {/* ══ Advanced ═════════════════════════════════════════════════════ */}
        {tab === 'advanced' && (
          <>
            <SectionTitle>Solver budget</SectionTitle>
            <Card>
              <Input label="Time budget (seconds)" keyboardType="numeric"
                value={String(Math.round((cfg.solver?.timeBudgetMs ?? 20000) / 1000))}
                onChange={(v) => setSolver('timeBudgetMs', (Number(v) || 20) * 1000)} />
              <Input label="Restarts on failure" keyboardType="numeric"
                value={String(cfg.solver?.maxRestarts ?? 3)} onChange={(v) => setSolver('maxRestarts', Number(v) || 1)} />
              <Input label="Optimisation rounds" keyboardType="numeric"
                value={String(cfg.solver?.optimiseRounds ?? 2000)} onChange={(v) => setSolver('optimiseRounds', Number(v) || 0)} />
            </Card>

            <SectionTitle>Saved rule sets</SectionTitle>
            <Card>
              {!cfg.ruleTemplates.length ? (
                <Text style={c.muted}>
                  None yet. A rule set keeps the weights, the limits and the solver budget — not the
                  period grid, which belongs to the year.
                </Text>
              ) : cfg.ruleTemplates.map((t: any, i: number) => (
                <View key={i} style={c.tplRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={c.tplName}>{t.name}</Text>
                    <Text style={c.muted}>{t.options ? 'Generator preferences' : 'Limits and weights'}</Text>
                  </View>
                  <ActionBtn label="Load" small onPress={() => setCfg((x: any) => ({
                    ...x,
                    defaults: { ...x.defaults, ...(t.defaults || {}) },
                    softWeights: { ...x.softWeights, ...(t.softWeights || {}) },
                    solver: { ...x.solver, ...(t.solver || {}) },
                  }))} />
                  <ActionBtn label="Delete" tone="danger" small
                    onPress={() => set('ruleTemplates', cfg.ruleTemplates.filter((_: any, k: number) => k !== i))} />
                </View>
              ))}
              <Input label="Save the current settings as" value={templateName}
                onChange={setTemplateName} placeholder="e.g. Exam term" />
              <ActionBtn label="Add rule set" small disabled={!templateName.trim()} onPress={() => {
                set('ruleTemplates', [...cfg.ruleTemplates, {
                  name: templateName.trim(), savedAt: new Date().toISOString(),
                  defaults: cfg.defaults, softWeights: cfg.softWeights, solver: cfg.solver,
                }].slice(-25));
                setTemplateName('');
              }} />
            </Card>

            <CarryForward years={years} yearId={yearId} />
          </>
        )}
      </ScrollView>

      {/* The save bar follows every tab, because every tab edits the same document. */}
      <View style={c.saveBar}>
        <Text style={c.saveState} numberOfLines={1}>{dirty ? 'Unsaved changes' : 'Everything is saved'}</Text>
        <ActionBtn label="Reset" small onPress={() => setCfg(JSON.parse(saved))} disabled={!dirty} />
        <ActionBtn label={saving ? 'Saving…' : 'Save'} tone="info" small onPress={save} disabled={!dirty || saving} />
      </View>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Pieces
══════════════════════════════════════════════════════════════════════════ */

function DayPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {DAYS.map((d) => {
        const on = value.includes(d);
        return (
          <TouchableOpacity key={d} activeOpacity={0.8}
            // Kept in week order however they are tapped, so "Mon – Fri" never
            // reads as "Fri – Mon" in the summary.
            onPress={() => onChange(on ? value.filter((x) => x !== d) : DAYS.filter((x) => value.includes(x) || x === d))}
            style={[c.dayPill, on && c.dayPillOn]}>
            <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={14}
              color={on ? Colors.textInverse : Colors.textLight} />
            <Text style={[c.dayPillText, on && { color: Colors.textInverse }]}>{DAY_SHORT[d]}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Limits({ cfg, setDefault, set }: { cfg: any; setDefault: (k: string, v: any) => void; set: (k: string, v: any) => void }) {
  return (
    <>
      <View style={c.pair}>
        <View style={{ flex: 1 }}>
          <Input label="Max periods / day" keyboardType="numeric"
            value={String(cfg.defaults.maxTeacherPeriodsPerDay ?? '')}
            onChange={(v) => setDefault('maxTeacherPeriodsPerDay', Number(v) || 0)} />
        </View>
        <View style={{ flex: 1 }}>
          <Input label="Max periods / week" keyboardType="numeric"
            value={String(cfg.defaults.maxTeacherPeriodsPerWeek ?? '')}
            onChange={(v) => setDefault('maxTeacherPeriodsPerWeek', Number(v) || 0)} />
        </View>
      </View>
      <Toggle label="Teacher daily limit is a hard rule" value={cfg.defaults.hardTeacherDailyLimit !== false}
        onChange={(v) => setDefault('hardTeacherDailyLimit', v)} />
      <Toggle label="Only assigned teachers may teach a subject" value={cfg.defaults.enforceTeacherQualified !== false}
        onChange={(v) => setDefault('enforceTeacherQualified', v)} />
      <Toggle label="Allow subjects in “Activity” periods" value={!!cfg.allowSubjectsInActivity}
        onChange={(v) => set('allowSubjectsInActivity', v)} />
    </>
  );
}

/** A 0–10 weight: −, a ten-step bar, +. No slider package ships with this app. */
function Weight({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const n = Math.max(0, Math.min(10, Number(value) || 0));
  return (
    <View style={c.weight}>
      <Text style={c.weightLabel}>{label}</Text>
      <View style={c.weightCtl}>
        <TouchableOpacity onPress={() => onChange(Math.max(0, n - 1))} style={c.stepBtn} hitSlop={8}>
          <Ionicons name="remove" size={14} color={Colors.primary} />
        </TouchableOpacity>
        <View style={c.steps}>
          {Array.from({ length: 10 }, (_, i) => (
            <View key={i} style={[c.step, i < n && c.stepOn]} />
          ))}
        </View>
        <TouchableOpacity onPress={() => onChange(Math.min(10, n + 1))} style={c.stepBtn} hitSlop={8}>
          <Ionicons name="add" size={14} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={c.weightN}>{n}</Text>
      </View>
    </View>
  );
}

function GridEditor({ title, hint, rows, onAuto, onChange, onRemove, onAdd }: {
  title: string; hint?: string; rows: any[];
  onAuto: () => void; onChange: (i: number, p: any) => void; onRemove: (i: number) => void; onAdd: (t: string) => void;
}) {
  const first = rows[0];
  const last = rows[rows.length - 1];
  const span = first && last ? (toMinutes(last.endTime) || 0) - (toMinutes(first.startTime) || 0) : 0;
  return (
    <>
      <View style={c.gridHead}>
        <Text style={c.gridTitle}>{title}</Text>
        <ActionBtn label="Auto-calculate" small onPress={onAuto} />
      </View>
      {!!hint && <Text style={[c.muted, { marginBottom: 8 }]}>{hint}</Text>}
      <Card>
        {!rows.length ? (
          <Text style={c.muted}>No periods here. Auto-calculate them, or add rows below.</Text>
        ) : rows.map((p, i) => {
          const teaching = (p.periodType || 'Teaching') === 'Teaching';
          return (
            <View key={i} style={[c.gridRow, !teaching && c.gridRowBreak]}>
              <View style={c.gridTop}>
                <View style={[c.gridNum, !teaching && { backgroundColor: Colors.warningLight }]}>
                  <Text style={[c.gridNumText, !teaching && { color: Colors.warning }]}>
                    {teaching ? p.periodNumber : '—'}
                  </Text>
                </View>
                {/* Wrapped, not a sideways strip: in a strip Activity and Free sat
                    past the edge, half a chip showing and nothing saying there
                    was more. */}
                <View style={c.typeChips}>
                  {PERIOD_TYPES.map((t) => (
                    <TouchableOpacity key={t} onPress={() => onChange(i, { periodType: t })}
                      style={[c.typeChip, (p.periodType || 'Teaching') === t && c.typeChipOn]}>
                      <Text style={[c.typeChipText, (p.periodType || 'Teaching') === t && { color: Colors.textInverse }]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity onPress={() => onRemove(i)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={17} color={Colors.danger} />
                </TouchableOpacity>
              </View>
              <View style={c.gridTimes}>
                <TimeField value={p.startTime} onChange={(v) => onChange(i, { startTime: v })} />
                <Text style={c.muted}>to</Text>
                <TimeField value={p.endTime} onChange={(v) => onChange(i, { endTime: v })} />
                {!teaching && (
                  <TextInput style={[c.timeInput, { flex: 1 }]} value={p.label || ''}
                    placeholder={p.periodType} placeholderTextColor={Colors.textLight}
                    onChangeText={(v) => onChange(i, { label: v })} />
                )}
              </View>
            </View>
          );
        })}
        <View style={c.addRow}>
          {['Teaching', 'Break', 'Lunch', 'Assembly'].map((t) => (
            <ActionBtn key={t} label={`+ ${t}`} small onPress={() => onAdd(t)} />
          ))}
        </View>
        {rows.length > 0 && (
          <Text style={[c.muted, { marginTop: 8 }]}>
            {plural(teachingIn(rows).length, 'teaching period')}
            {span > 0 ? ` · ${timeRange(first.startTime, last.endTime)} · ${duration(span)}` : ''}
          </Text>
        )}
      </Card>
    </>
  );
}

function TimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const bad = !!value && !isTime(value);
  return (
    <TextInput style={[c.timeInput, bad && { borderColor: Colors.danger }]} value={value || ''}
      onChangeText={onChange} placeholder="08:00" placeholderTextColor={Colors.textLight}
      keyboardType="numbers-and-punctuation" maxLength={5} />
  );
}

function Summary({ cfg, years, yearId }: { cfg: any; years: any[]; yearId: string }) {
  const teaching = teachingIn(cfg.periodTemplate);
  const lunch = cfg.periodTemplate.find((p: any) => p.periodType === 'Lunch');
  const rows: [string, any][] = [
    ['Academic year', years.find((y: any) => String(y._id) === yearId)?.yearName || '—'],
    ['Working days', cfg.workingDays.length
      ? `${DAY_SHORT[cfg.workingDays[0]]} – ${DAY_SHORT[cfg.workingDays[cfg.workingDays.length - 1]]}` : 'None'],
    ['Periods per day', teaching.length || '—'],
    ['Lunch duration', duration(lunch
      ? Math.max(0, (toMinutes(lunch.endTime) || 0) - (toMinutes(lunch.startTime) || 0))
      : (cfg.lunchMinutes ?? 30))],
    ['Max per teacher (day)', cfg.defaults.maxTeacherPeriodsPerDay ?? '—'],
    ['Max per teacher (week)', cfg.defaults.maxTeacherPeriodsPerWeek ?? '—'],
  ];
  return (
    <>
      <SectionTitle>Current configuration</SectionTitle>
      <Card>
        {rows.map(([k, v]) => (
          <View key={k} style={c.kv}>
            <Text style={c.kvK}>{k}</Text>
            <Text style={c.kvV}>{String(v)}</Text>
          </View>
        ))}
      </Card>
    </>
  );
}

function CarryForward({ years, yearId }: { years: any[]; yearId: string }) {
  const [from, setFrom] = useState(yearId);
  const [to, setTo] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setFrom(yearId); }, [yearId]);

  const run = async (apply: boolean) => {
    if (!from || !to) { Alert.alert('Pick both years'); return; }
    setBusy(true);
    try {
      const d = unwrap(await ttApi.carryForward({ fromYearId: from, toYearId: to, ...(apply ? { apply: true } : {}) }));
      setPreview(d);
    } catch (e: any) {
      Alert.alert('Could not carry forward', e?.data?.message || e?.message || 'Try again.');
    } finally { setBusy(false); }
  };

  const confirm = () => Alert.alert(
    'Replace the target year’s plan?',
    `Subject requirements and combined classes already in ${preview?.toYear} are replaced by ${preview?.fromYear}’s. Published timetables are not touched.`,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Carry forward', style: 'destructive', onPress: () => run(true) }],
  );

  const opts = useMemo(() => years.map((y: any) => ({ label: y.yearName, value: String(y._id) })), [years]);
  return (
    <>
      <SectionTitle>Start a year from another year</SectionTitle>
      <Card>
        <Text style={[c.muted, { marginBottom: 8 }]}>
          Copies subject requirements, combined classes, the period grid and solver settings. The
          placements are not copied — you still generate, so the week fits this year’s staff.
        </Text>
        <Select label="Copy from" value={from} onChange={(v) => { setFrom(v); setPreview(null); }} options={opts} />
        <Select label="Into" value={to} onChange={(v) => { setTo(v); setPreview(null); }}
          options={opts.filter((o) => o.value !== from)} />
        <ActionBtn label={busy ? 'Checking…' : 'Check what would move'} small onPress={() => run(false)} disabled={busy || !from || !to} />
        {preview && !preview.applied && (
          <View style={{ marginTop: 10, gap: 6 }}>
            <Text style={c.kvV}>
              {plural(preview.sections?.length || 0, 'section')} matched · {plural(preview.requirements || 0, 'requirement')} ·
              {' '}{plural(preview.merges || 0, 'combined class', 'combined classes')}
            </Text>
            {preview.unmatchedSections?.length > 0 && (
              <Text style={c.warnText}>No match in {preview.toYear} for: {preview.unmatchedSections.join(', ')}.</Text>
            )}
            <ActionBtn label="Carry it forward" tone="danger" small onPress={confirm}
              disabled={!preview.requirements && !preview.merges} />
          </View>
        )}
        {preview?.applied && (
          <Text style={[c.kvV, { color: Colors.success, marginTop: 10 }]}>
            Carried into {preview.toYear}. Generate when you are ready.
          </Text>
        )}
      </Card>
    </>
  );
}

const c = StyleSheet.create({
  info: { backgroundColor: Colors.infoLight, borderRadius: Radius.md, padding: 12, marginBottom: Spacing.md },
  infoText: { fontSize: 12, color: Colors.info, lineHeight: 17 },
  muted: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16 },
  warnText: { fontSize: 12, color: Colors.warning, lineHeight: 17 },
  pair: { flexDirection: 'row', gap: 10 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  link: { fontSize: 12.5, fontWeight: '700', color: Colors.primary },

  dayPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  dayPillOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayPillText: { fontSize: 12.5, fontWeight: '700', color: Colors.textSecondary },

  weight: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  weightLabel: { fontSize: 12.5, color: Colors.text, marginBottom: 6 },
  weightCtl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface,
  },
  steps: { flex: 1, flexDirection: 'row', gap: 3 },
  step: { flex: 1, height: 8, borderRadius: 2, backgroundColor: Colors.divider },
  stepOn: { backgroundColor: Colors.primary },
  weightN: { width: 20, textAlign: 'right', fontSize: 12.5, fontWeight: '800', color: Colors.textSecondary },

  gridHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.md, marginBottom: 8 },
  gridTitle: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  gridRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: 8 },
  gridRowBreak: { backgroundColor: '#FFFBEB', marginHorizontal: -8, paddingHorizontal: 8, borderRadius: Radius.sm },
  gridTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  gridNum: {
    width: 26, height: 26, borderRadius: Radius.sm, backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center',
  },
  gridNumText: { fontSize: 12, fontWeight: '800', color: Colors.primary },
  gridTimes: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeChips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  typeChip: {
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  typeChipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  typeChipText: { fontSize: 10.5, fontWeight: '700', color: Colors.textSecondary },
  timeInput: {
    width: 76, height: 36, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingHorizontal: 8, fontSize: 13, color: Colors.text, backgroundColor: Colors.surface,
  },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },

  dayRow: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  dayName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  dayMeta: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  ruleText: { flex: 1, fontSize: 12.5, color: Colors.text },

  tplRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tplName: { fontSize: 13, fontWeight: '700', color: Colors.text },

  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: 10 },
  kvK: { fontSize: 12.5, color: Colors.textSecondary },
  kvV: { fontSize: 12.5, fontWeight: '700', color: Colors.text },

  saveBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.md, paddingTop: 10, paddingBottom: 24,
    backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  saveState: { flex: 1, fontSize: 12, color: Colors.textSecondary },
});
