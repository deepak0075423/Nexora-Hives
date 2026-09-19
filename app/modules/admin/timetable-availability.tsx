import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as ttApi from '@/api/timetable.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Card, Select, Input, Toggle, FormModal, Badge, SearchBar, ActionBtn,
  SegTabs, confirmAsync, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import { Tiles } from '@/components/timetable/viewKit';
import { DAYS, DAY_SHORT, tk } from '@/components/timetable/ttKit';

// The editor draws the school's own week — its working days and its periods a
// day — rather than a fixed 10 × 6 grid an eight-period school never uses.
const STATUS: Record<string, { label: string; tone: any }> = {
  active: { label: 'Active', tone: 'success' },
  restricted: { label: 'Restricted', tone: 'warning' },
  overloaded: { label: 'Overloaded', tone: 'danger' },
  unavailable: { label: 'Unavailable', tone: 'danger' },
};

export default function TimetableAvailabilityScreen() {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [years, setYears] = useState<any[]>([]);
  const [yearId, setYearId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<any>({});
  const [gridDays, setGridDays] = useState<string[]>(DAYS.slice(0, 5));
  const [periodCount, setPeriodCount] = useState(8);
  const [weekCap, setWeekCap] = useState(0);
  const [avail, setAvail] = useState('');
  const [bulk, setBulk] = useState<any>(null);
  const [imp, setImp] = useState<any>(null);

  const load = useCallback(async (yid?: string) => {
    try {
      const [aRes, mRes] = await Promise.all([
        ttApi.getAvailabilityOverview(yid),
        years.length ? null : ttApi.getMeta(),
      ]);
      const d = unwrap(aRes);
      setTeachers(d?.teachers ?? []);
      setSummary(d?.summary ?? {});
      if (d?.days?.length) setGridDays(d.days);
      if (d?.periodsPerDay) setPeriodCount(d.periodsPerDay);
      setWeekCap(d?.weekCap ?? 0);
      if (!yid) setYearId(d?.selectedYearId ?? '');
      if (mRes) setYears(unwrap(mRes)?.years ?? []);
      setError('');
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else setError(err?.message ?? 'Failed to load');
    } finally { setLoading(false); setRefreshing(false); }
  }, [years.length]);

  useEffect(() => { load(); }, []); // eslint-disable-line

  const save = async () => {
    setSaving(true);
    try {
      await ttApi.saveAvailability(edit._id, {
        yearId,
        unavailable: edit.unavailable,
        maxPeriodsPerDay: edit.maxPeriodsPerDay === '' ? null : Number(edit.maxPeriodsPerDay),
        maxPeriodsPerWeek: edit.maxPeriodsPerWeek === '' ? null : Number(edit.maxPeriodsPerWeek),
        hardDailyLimit: edit.hardDailyLimit,
        preferredDays: edit.preferredDays,
        preferredPeriods: edit.preferredPeriods,
        notes: edit.notes,
      });
      setEdit(null);
      await load(yearId);
      setError('');
    } catch (err: any) { setError(err?.message ?? 'Failed to save'); }
    finally { setSaving(false); }
  };

  const toggleSlot = (day: string, period: number) => setEdit((t: any) => {
    const has = t.unavailable.some((u: any) => u.dayOfWeek === day && u.periodNumber === period);
    return {
      ...t,
      unavailable: has
        ? t.unavailable.filter((u: any) => !(u.dayOfWeek === day && u.periodNumber === period))
        : [...t.unavailable, { dayOfWeek: day, periodNumber: period, reason: '' }],
    };
  });

  const toggleList = (key: string, value: any) => setEdit((t: any) => ({
    ...t,
    [key]: t[key].includes(value) ? t[key].filter((x: any) => x !== value) : [...t[key], value],
  }));

  if (disabled) return (<><Stack.Screen options={{ title: 'Teacher Availability' }} /><ModuleDisabled /></>);
  if (loading) return (<><Stack.Screen options={{ title: 'Teacher Availability' }} /><LoaderView /></>);

  const filtered = teachers.filter((t) => (!avail || t.availability === avail) && (!search
    || t.name?.toLowerCase().includes(search.toLowerCase())
    || (t.subjects ?? []).some((s: string) => s.toLowerCase().includes(search.toLowerCase()))));

  const runBulk = async () => {
    if (!bulk.ids.length) { setError('Pick at least one teacher'); return; }
    setSaving(true);
    let done = 0;
    for (const id of bulk.ids) {
      const t = teachers.find((x) => String(x._id) === id);
      if (!t) continue;
      try {
        await ttApi.saveAvailability(id, {
          yearId,
          // Blocked slots are per person; a bulk edit only clears them when asked to.
          unavailable: bulk.clearBlocks ? [] : (t.unavailable ?? []),
          maxPeriodsPerDay: bulk.day === '' ? t.maxPeriodsPerDay : Number(bulk.day),
          maxPeriodsPerWeek: bulk.week === '' ? t.maxPeriodsPerWeek : Number(bulk.week),
          hardDailyLimit: t.hardDailyLimit,
          preferredDays: t.preferredDays, preferredPeriods: t.preferredPeriods, notes: t.notes,
        });
        done += 1;
      } catch { /* counted below */ }
    }
    setSaving(false);
    setBulk(null);
    setError(done === bulk.ids.length ? '' : `Updated ${done} of ${bulk.ids.length} teachers`);
    await load(yearId);
  };

  const runImport = async (apply: boolean) => {
    setSaving(true);
    try {
      const d = unwrap(await ttApi.importAvailability({
        yearId, from: imp.from || undefined, to: imp.to || undefined, apply,
      }));
      if (apply) { setImp(null); await load(yearId); }
      else setImp((x: any) => ({ ...x, found: d?.found ?? [] }));
    } catch (err: any) { setError(err?.message ?? 'Import failed'); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Teacher Availability' }} />
      <ScrollView
        style={a.screen}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(yearId); }} tintColor={Colors.primary} />}
      >
        <Select label="Academic Year" value={yearId}
          options={years.map((y: any) => ({ label: y.yearName, value: y._id }))}
          onChange={(v) => { setYearId(v); setLoading(true); load(v); }} />
        <Tiles items={[
          { label: 'Teachers', value: summary.total ?? 0, icon: 'people', tone: 'info' },
          { label: 'Always free', value: summary.always ?? 0, icon: 'checkmark-circle', tone: 'success' },
          { label: 'Restricted', value: summary.restricted ?? 0, icon: 'time', tone: 'warning' },
          { label: 'Avg load', value: summary.averageLoad ?? 0, icon: 'stats-chart', tone: 'neutral' },
        ]} />
        <SegTabs
          tabs={[
            { key: '', label: 'All' },
            { key: 'always', label: 'Always available' },
            { key: 'restricted', label: 'Restricted' },
            { key: 'none', label: `Unavailable (${summary.none ?? 0})` },
          ]}
          active={avail} onChange={setAvail} />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: Spacing.sm }}>
          <ActionBtn label="Bulk update" tone="info" small
            onPress={() => setBulk({ ids: [], day: '', week: '', clearBlocks: false })} />
          <ActionBtn label="Import from leave" small onPress={() => setImp({ from: '', to: '', found: null })} />
        </View>
        <SearchBar value={search} onChange={setSearch} placeholder="Search teacher or subject…" />
        {error ? <View style={a.errorBox}><Text style={a.errorText}>{error}</Text></View> : null}
        <Text style={tk.hint}>The generator never assigns a teacher during a blocked slot.</Text>

        {!filtered.length ? <Empty icon="person-outline" text="No teachers found" /> : filtered.map((t) => (
          <Card key={t._id}>
            <View style={a.head}>
              <View style={{ flex: 1 }}>
                <Text style={a.title}>{t.name}</Text>
                <Text style={a.sub} numberOfLines={1}>
                  {t.designation ? `${t.designation} · ` : ''}{(t.subjects ?? []).join(', ') || 'No subjects assigned'}
                </Text>
              </View>
              <Badge label={(STATUS[t.status] ?? STATUS.active).label} tone={(STATUS[t.status] ?? STATUS.active).tone} />
            </View>
            <View style={a.loadRow}>
              <View style={a.track}>
                <View style={[a.fill, {
                  width: `${t.cap ? Math.min(100, (t.periods / t.cap) * 100) : 0}%`,
                  backgroundColor: t.cap && t.periods > t.cap ? Colors.danger : Colors.success,
                }]} />
              </View>
              <Text style={a.loadText}>{t.periods ?? 0} / {t.cap || weekCap || '—'} a week</Text>
            </View>
            <View style={a.badgeRow}>
              <Badge label={t.unavailable?.length ? `${t.unavailable.length} blocked` : 'Always available'}
                tone={t.unavailable?.length ? 'warning' : 'info'} />
              {t.maxPeriodsPerDay ? <Badge label={`≤${t.maxPeriodsPerDay}/day`} tone="neutral" /> : null}
              {t.maxPeriodsPerWeek ? <Badge label={`≤${t.maxPeriodsPerWeek}/week`} tone="neutral" /> : null}
            </View>
            <View style={{ marginTop: 10 }}>
              <ActionBtn label="Edit availability" tone="info" small onPress={() => setEdit({
                ...t,
                unavailable: [...(t.unavailable ?? [])],
                preferredDays: [...(t.preferredDays ?? [])],
                preferredPeriods: [...(t.preferredPeriods ?? [])],
                maxPeriodsPerDay: t.maxPeriodsPerDay != null ? String(t.maxPeriodsPerDay) : '',
                maxPeriodsPerWeek: t.maxPeriodsPerWeek != null ? String(t.maxPeriodsPerWeek) : '',
                notes: t.notes ?? '',
              })} />
            </View>
          </Card>
        ))}
      </ScrollView>

      <FormModal
        visible={!!edit}
        title={edit ? `${edit.name} — availability` : ''}
        onClose={() => setEdit(null)}
        onSubmit={save}
        submitting={saving}
      >
        {edit && (
          <>
            <Text style={a.fieldLabel}>Unavailable slots (tap to block)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator style={{ marginBottom: Spacing.md }}>
              <View>
                <View style={{ flexDirection: 'row' }}>
                  <View style={a.gridLabel} />
                  {Array.from({ length: periodCount }, (_, i) => <Text key={i} style={a.gridHead}>P{i + 1}</Text>)}
                </View>
                {gridDays.map((day) => (
                  <View key={day} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={a.gridLabel}>{DAY_SHORT[day]}</Text>
                    {Array.from({ length: periodCount }, (_, i) => {
                      const period = i + 1;
                      const off = edit.unavailable.some((u: any) => u.dayOfWeek === day && u.periodNumber === period);
                      return (
                        <TouchableOpacity key={period} onPress={() => toggleSlot(day, period)}
                          style={[a.gridCell, off ? a.gridCellOff : a.gridCellOn]}>
                          <Text style={[a.gridCellText, { color: off ? Colors.danger : Colors.success }]}>{off ? '✕' : '✓'}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>

            <Input label="Max periods per day" value={edit.maxPeriodsPerDay} keyboardType="numeric"
              onChange={(v) => setEdit((t: any) => ({ ...t, maxPeriodsPerDay: v }))} placeholder="School default" />
            <Input label="Max periods per week" value={edit.maxPeriodsPerWeek} keyboardType="numeric"
              onChange={(v) => setEdit((t: any) => ({ ...t, maxPeriodsPerWeek: v }))} placeholder="School default" />
            <Toggle label="Daily limit is a hard rule" sub="Otherwise it is only optimised for"
              value={edit.hardDailyLimit} onChange={(v) => setEdit((t: any) => ({ ...t, hardDailyLimit: v }))} />

            <Text style={a.fieldLabel}>Preferred days</Text>
            <View style={a.chipWrap}>
              {DAYS.map((d) => {
                const on = edit.preferredDays.includes(d);
                return (
                  <TouchableOpacity key={d} style={[a.chip, on && a.chipOn]} onPress={() => toggleList('preferredDays', d)}>
                    <Text style={[a.chipText, on && { color: '#fff' }]}>{DAY_SHORT[d]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={a.fieldLabel}>Preferred periods</Text>
            <View style={a.chipWrap}>
              {Array.from({ length: periodCount }, (_, i) => i + 1).map((p) => {
                const on = edit.preferredPeriods.includes(p);
                return (
                  <TouchableOpacity key={p} style={[a.chip, on && a.chipOn]} onPress={() => toggleList('preferredPeriods', p)}>
                    <Text style={[a.chipText, on && { color: '#fff' }]}>P{p}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Input label="Notes" value={edit.notes} onChange={(v) => setEdit((t: any) => ({ ...t, notes: v }))} />
          </>
        )}
      </FormModal>

      <BulkSheet bulk={bulk} setBulk={setBulk} teachers={teachers} saving={saving} onSubmit={runBulk} />
      <ImportSheet imp={imp} setImp={setImp} saving={saving}
        onCheck={() => runImport(false)}
        onApply={async () => {
          if (await confirmAsync('Block these slots?', 'Each weekday found is blocked for that teacher for the whole year.', 'Block them')) {
            runImport(true);
          }
        }} />
    </>
  );
}

function BulkSheet({ bulk, setBulk, teachers, saving, onSubmit }: any) {
  return (
    <FormModal visible={!!bulk} title="Bulk update availability" onClose={() => setBulk(null)}
      onSubmit={onSubmit} submitting={saving} submitLabel={`Update ${bulk?.ids?.length ?? 0}`}>
      {bulk && (
        <>
          <Text style={tk.hint}>Leave a limit blank to leave it as it is. Blocked slots are kept unless you say otherwise.</Text>
          <Input label="Daily limit" keyboardType="numeric" value={bulk.day} placeholder="Unchanged"
            onChange={(v) => setBulk((b: any) => ({ ...b, day: v }))} />
          <Input label="Weekly limit" keyboardType="numeric" value={bulk.week} placeholder="Unchanged"
            onChange={(v) => setBulk((b: any) => ({ ...b, week: v }))} />
          <Toggle label="Also clear every blocked slot" value={bulk.clearBlocks}
            onChange={(v) => setBulk((b: any) => ({ ...b, clearBlocks: v }))} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 }}>
            <Text style={a.title}>Who to update</Text>
            <ActionBtn small label={bulk.ids.length === teachers.length ? 'Clear all' : 'Select all'}
              onPress={() => setBulk((b: any) => ({
                ...b, ids: b.ids.length === teachers.length ? [] : teachers.map((t: any) => String(t._id)),
              }))} />
          </View>
          {teachers.map((t: any) => (
            <Toggle key={t._id} label={t.name} value={bulk.ids.includes(String(t._id))}
              onChange={(on) => setBulk((b: any) => ({
                ...b,
                ids: on ? [...b.ids, String(t._id)] : b.ids.filter((x: string) => x !== String(t._id)),
              }))} />
          ))}
        </>
      )}
    </FormModal>
  );
}

function ImportSheet({ imp, setImp, saving, onCheck, onApply }: any) {
  return (
    <FormModal visible={!!imp} title="Block slots from approved leave" onClose={() => setImp(null)}
      onSubmit={imp?.found?.length ? onApply : onCheck} submitting={saving}
      submitLabel={imp?.found?.length ? `Block ${imp.found.length}` : 'Check'}>
      {imp && (
        <>
          <Text style={tk.hint}>
            Availability is a weekly pattern; leave is a range of dates. What maps between them is a
            teacher away the same weekday, repeatedly. This finds those and offers to block that day.
          </Text>
          <Input label="From (YYYY-MM-DD)" value={imp.from} placeholder="Today"
            onChange={(v) => setImp((x: any) => ({ ...x, from: v, found: null }))} />
          <Input label="To (YYYY-MM-DD)" value={imp.to} placeholder="30 days on"
            onChange={(v) => setImp((x: any) => ({ ...x, to: v, found: null }))} />
          {imp.found && (imp.found.length ? imp.found.map((f: any) => (
            <View key={`${f.teacher}${f.dayOfWeek}`} style={a.found}>
              <Text style={[a.title, { flex: 1 }]} numberOfLines={1}>{f.name}</Text>
              <Badge label={f.dayOfWeek} tone="warning" />
              <Text style={a.sub}>{f.days}×</Text>
            </View>
          )) : <Text style={a.sub}>No repeating weekday absence in that range. Nothing would change.</Text>)}
        </>
      )}
    </FormModal>
  );
}

const a = StyleSheet.create({
  loadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.divider, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  loadText: { fontSize: 10.5, color: Colors.textSecondary },
  found: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  screen: { flex: 1, backgroundColor: Colors.background },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 },

  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  gridHead: { width: 30, fontSize: 9, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center' },
  gridLabel: { width: 34, fontSize: 10, fontWeight: '700', color: Colors.textSecondary },
  gridCell: { width: 30, height: 24, margin: 1, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  gridCellOn: { borderColor: Colors.border, backgroundColor: Colors.successLight },
  gridCellOff: { borderColor: Colors.danger, backgroundColor: Colors.dangerLight },
  gridCellText: { fontSize: 11, fontWeight: '700' },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.md },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
  },
  chipOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: 11.5, fontWeight: '600', color: Colors.textSecondary },

  errorBox: { backgroundColor: Colors.dangerLight, borderRadius: Radius.md, padding: 10, marginBottom: 10 },
  errorText: { color: Colors.danger, fontSize: 12.5 },
});
