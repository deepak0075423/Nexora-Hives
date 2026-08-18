import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as ttApi from '@/api/timetable.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Card, Select, Input, Toggle, FormModal, Badge, SearchBar, ActionBtn,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import { DAYS, DAY_SHORT, tk } from '@/components/timetable/ttKit';

const MAX_PERIODS = 10;

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

  const load = useCallback(async (yid?: string) => {
    try {
      const [aRes, mRes] = await Promise.all([
        ttApi.getAvailability(yid),
        years.length ? null : ttApi.getMeta(),
      ]);
      const d = unwrap(aRes);
      setTeachers(d?.teachers ?? []);
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

  const filtered = teachers.filter((t) => !search
    || t.name?.toLowerCase().includes(search.toLowerCase())
    || (t.subjects ?? []).some((s: string) => s.toLowerCase().includes(search.toLowerCase())));

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
        <SearchBar value={search} onChange={setSearch} placeholder="Search teacher or subject…" />
        {error ? <View style={a.errorBox}><Text style={a.errorText}>{error}</Text></View> : null}
        <Text style={tk.hint}>The generator never assigns a teacher during a blocked slot.</Text>

        {!filtered.length ? <Empty icon="person-outline" text="No teachers found" /> : filtered.map((t) => (
          <Card key={t._id}>
            <View style={a.head}>
              <View style={{ flex: 1 }}>
                <Text style={a.title}>{t.name}</Text>
                <Text style={a.sub} numberOfLines={1}>{(t.subjects ?? []).join(', ') || 'No subjects assigned'}</Text>
              </View>
              <Badge label={t.configured ? 'Set' : 'Default'} tone={t.configured ? 'success' : 'neutral'} />
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
                  {Array.from({ length: MAX_PERIODS }, (_, i) => <Text key={i} style={a.gridHead}>P{i + 1}</Text>)}
                </View>
                {DAYS.map((day) => (
                  <View key={day} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={a.gridLabel}>{DAY_SHORT[day]}</Text>
                    {Array.from({ length: MAX_PERIODS }, (_, i) => {
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
              {Array.from({ length: MAX_PERIODS }, (_, i) => i + 1).map((p) => {
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
    </>
  );
}

const a = StyleSheet.create({
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
