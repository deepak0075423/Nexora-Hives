import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as ttApi from '@/api/timetable.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { unwrap, LoaderView, Card, Select, Toggle, Empty, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
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

const SCOPES: { key: 'single' | 'multiple' | 'school'; label: string; sub: string }[] = [
  { key: 'single',   label: 'Single Class',     sub: 'One section only' },
  { key: 'multiple', label: 'Multiple Classes', sub: 'Pick the sections' },
  { key: 'school',   label: 'Entire School',    sub: 'Every active section' },
];

export default function TimetableGenerateScreen() {
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');

  const [yearId, setYearId] = useState('');
  const [scope, setScope] = useState<'single' | 'multiple' | 'school'>('single');
  const [classId, setClassId] = useState('');
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [options, setOptions] = useState<Record<string, boolean>>(
    Object.fromEntries(OPTIONS.map(([k]) => [k, true])),
  );

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
  const sectionsOf = useMemo(
    () => classes.find((c: any) => c._id === classId)?.sections ?? [],
    [classes, classId],
  );
  const totalSections = classes.reduce((n: number, c: any) => n + (c.sections?.length ?? 0), 0);
  const scopeCount = scope === 'school' ? totalSections : sectionIds.length;

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
    if (scope !== 'school' && !sectionIds.length) { setError('Select at least one section'); return; }
    setError(''); setStarting(true); setConflicts([]);
    try {
      const d = unwrap(await ttApi.generate({
        yearId, scopeType: scope, sectionIds: scope === 'school' ? [] : sectionIds, options,
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

        <Text style={tk.sectionHeading}>Generation Scope</Text>
        {SCOPES.map((s) => (
          <TouchableOpacity key={s.key} activeOpacity={0.7}
            style={[g.scopeCard, scope === s.key && g.scopeCardActive]}
            onPress={() => { setScope(s.key); setSectionIds([]); }}>
            <Ionicons name={scope === s.key ? 'radio-button-on' : 'radio-button-off'} size={18}
              color={scope === s.key ? Colors.accent : Colors.textLight} />
            <View style={{ flex: 1 }}>
              <Text style={g.scopeLabel}>{s.label}</Text>
              <Text style={g.scopeSub}>{s.key === 'school' ? `All ${totalSections} active section(s)` : s.sub}</Text>
            </View>
          </TouchableOpacity>
        ))}

        {scope === 'single' && (
          <>
            <Select label="Class" value={classId} placeholder="Pick a class"
              options={classes.map((c: any) => ({ label: c.className, value: c._id }))}
              onChange={(v) => { setClassId(v); setSectionIds([]); }} />
            <Select label="Section" value={sectionIds[0] ?? ''} placeholder="Pick a section"
              options={sectionsOf.map((s: any) => ({ label: `Section ${s.sectionName}`, value: s._id }))}
              onChange={(v) => setSectionIds(v ? [v] : [])} />
          </>
        )}

        {scope === 'multiple' && (
          <Card>
            <Text style={tk.sectionHeading}>Sections</Text>
            {!classes.length && <Empty icon="school-outline" text="No classes in this year" />}
            {classes.map((c: any) => (
              <View key={c._id} style={{ marginBottom: 10 }}>
                <Text style={g.className}>{c.className}</Text>
                <View style={g.chipWrap}>
                  {(c.sections ?? []).map((s: any) => {
                    const on = sectionIds.includes(s._id);
                    return (
                      <TouchableOpacity key={s._id}
                        style={[g.chip, on && g.chipOn]}
                        onPress={() => setSectionIds((prev) => on ? prev.filter((x) => x !== s._id) : [...prev, s._id])}>
                        <Text style={[g.chipText, on && g.chipTextOn]}>{s.sectionName}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {!(c.sections ?? []).length && <Text style={g.scopeSub}>No sections</Text>}
                </View>
              </View>
            ))}
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
          style={[g.primaryBtn, (!scopeCount || starting) && { opacity: 0.5 }]}
          disabled={!scopeCount || starting}
          onPress={start}>
          {starting ? <ActivityIndicator color="#fff" />
            : <Text style={g.primaryBtnText}>⚡ Generate Timetable ({scopeCount} section{scopeCount === 1 ? '' : 's'})</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={g.secondaryBtn} onPress={() => router.back()}>
          <Text style={g.secondaryBtnText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
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

  scopeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 8,
  },
  scopeCardActive: { borderColor: Colors.accent, backgroundColor: Colors.surfaceAlt },
  scopeLabel: { fontSize: 13.5, fontWeight: '600', color: Colors.text },
  scopeSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },

  className: { fontSize: 12, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
  },
  chipOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextOn: { color: '#fff' },

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
