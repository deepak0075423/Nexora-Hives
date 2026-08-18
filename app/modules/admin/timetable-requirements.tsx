import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as ttApi from '@/api/timetable.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Card, Select, Input, Toggle, FormModal, Badge, ActionBtn, confirmAsync,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import { SUBJECT_TYPES, ROOM_TYPES, tk } from '@/components/timetable/ttKit';

export default function TimetableRequirementsScreen() {
  const [meta, setMeta] = useState<any>(null);
  const [yearId, setYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [data, setData] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<any>(null);   // { index, row }

  useEffect(() => {
    ttApi.getMeta()
      .then((res: any) => {
        const d = unwrap(res);
        setMeta(d);
        setYearId(d?.selectedYearId ?? '');
        const c = d?.classes?.[0];
        if (c) { setClassId(c._id); if (c.sections?.[0]) setSectionId(c.sections[0]._id); }
      })
      .catch((err: any) => {
        if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
        else setError(err?.message ?? 'Failed to load');
      })
      .finally(() => setLoading(false));
  }, []);

  const load = useCallback(async (sid: string) => {
    if (!sid) { setData(null); setRows([]); return; }
    try {
      const d = unwrap(await ttApi.getRequirements(sid, yearId));
      setData(d);
      setRows((d?.requirements ?? []).map(normalise));
      setError('');
    } catch (err: any) { setError(err?.message ?? 'Failed to load requirements'); }
    finally { setRefreshing(false); }
  }, [yearId]);

  useEffect(() => { if (sectionId) load(sectionId); }, [sectionId, load]);

  const classes = useMemo(() => meta?.classes ?? [], [meta]);
  const sectionsOf = useMemo(() => classes.find((c: any) => c._id === classId)?.sections ?? [], [classes, classId]);
  const subjectName = (id: string) =>
    (meta?.subjects ?? []).find((s: any) => s._id === id)?.subjectName
    ?? (data?.subjects ?? []).find((s: any) => s._id === id)?.subjectName ?? 'Subject';

  const totalWeekly = rows.reduce((n, r) => n + (Number(r.weeklyPeriods) || 0), 0);
  const capacity = data ? data.periodsPerDay * (data.section?.openOnSaturday ? 6 : 5) : 0;
  const over = capacity > 0 && totalWeekly > capacity;

  const save = async () => {
    setSaving(true);
    try {
      await ttApi.saveRequirements(sectionId, { yearId, requirements: rows });
      await load(sectionId);
      setError('');
    } catch (err: any) { setError(err?.message ?? 'Failed to save'); }
    finally { setSaving(false); }
  };

  const seed = async () => {
    if (!(await confirmAsync('Seed requirements', 'Create default weekly requirements for every section from their subject assignments?', 'Seed'))) return;
    setSaving(true);
    try { await ttApi.seedRequirements({ yearId }); await load(sectionId); }
    catch (err: any) { setError(err?.message ?? 'Failed to seed'); }
    finally { setSaving(false); }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Subject Requirements' }} /><ModuleDisabled /></>);
  if (loading) return (<><Stack.Screen options={{ title: 'Subject Requirements' }} /><LoaderView /></>);

  return (
    <>
      <Stack.Screen options={{ title: 'Subject Requirements' }} />
      <ScrollView
        style={r.screen}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(sectionId); }} tintColor={Colors.primary} />}
      >
        <Select label="Academic Year" value={yearId}
          options={(meta?.years ?? []).map((y: any) => ({ label: y.yearName, value: y._id }))}
          onChange={setYearId} />
        <Select label="Class" value={classId}
          options={classes.map((c: any) => ({ label: c.className, value: c._id }))}
          onChange={(v) => {
            setClassId(v);
            const first = classes.find((c: any) => c._id === v)?.sections?.[0];
            setSectionId(first?._id ?? '');
          }} />
        <Select label="Section" value={sectionId} placeholder="Pick a section"
          options={sectionsOf.map((s: any) => ({ label: `Section ${s.sectionName}`, value: s._id }))}
          onChange={setSectionId} />

        {error ? <View style={r.errorBox}><Text style={r.errorText}>{error}</Text></View> : null}

        {!data ? <Empty icon="book-outline" text="Pick a class and section" /> : (
          <>
            <View style={r.badgeRow}>
              <Badge label={`${totalWeekly} periods/week`} tone={over ? 'danger' : 'info'} />
              <Badge label={`${capacity} slots available`} tone="neutral" />
            </View>
            {over ? (
              <View style={r.warnBox}>
                <Text style={r.warnText}>
                  This section demands {totalWeekly} periods but only has {capacity} slots.
                  Reduce it by {totalWeekly - capacity} or generation will report a shortage.
                </Text>
              </View>
            ) : null}

            {rows.map((row, i) => (
              <Card key={row.subject || i}>
                <View style={r.head}>
                  <View style={{ flex: 1 }}>
                    <Text style={r.title}>{subjectName(row.subject)}</Text>
                    <Text style={r.sub}>
                      {row.weeklyPeriods}/week · max {row.maxPerDay}/day · {row.subjectType}
                      {row.consecutivePeriods > 1 ? ` · ${row.consecutivePeriods} consecutive` : ''}
                    </Text>
                    <Text style={r.sub}>
                      {(data.teachers ?? []).find((t: any) => t._id === row.teacher)?.name ?? 'No teacher'}
                      {row.requiresRoom ? ' · needs a room' : ''}
                    </Text>
                  </View>
                  <View style={{ gap: 6 }}>
                    <ActionBtn label="Edit" tone="info" small onPress={() => setEdit({ index: i, row: { ...row } })} />
                    <ActionBtn label="Remove" tone="danger" small
                      onPress={() => setRows((rs) => rs.filter((_, k) => k !== i))} />
                  </View>
                </View>
              </Card>
            ))}

            {!rows.length && <Empty icon="book-outline" text="No requirements yet — add subjects or seed them" />}

            {(data.missingSubjects ?? []).length > 0 && (
              <Card>
                <Text style={tk.sectionHeading}>Add a subject</Text>
                <View style={r.chipWrap}>
                  {data.missingSubjects.map((m: any) => (
                    <TouchableOpacity key={m._id} style={r.chip}
                      onPress={() => setRows((rs) => [...rs, normalise({
                        subject: m._id, weeklyPeriods: 4, teacher: m.suggestedTeacher, maxPerDay: 1,
                      })])}>
                      <Text style={r.chipText}>+ {m.subjectName}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Card>
            )}

            <TouchableOpacity style={[r.primaryBtn, saving && { opacity: 0.6 }]} disabled={saving} onPress={save}>
              <Text style={r.primaryBtnText}>Save Requirements</Text>
            </TouchableOpacity>
            <TouchableOpacity style={r.secondaryBtn} disabled={saving} onPress={seed}>
              <Text style={r.secondaryBtnText}>↻ Seed from subject assignments</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <FormModal
        visible={!!edit}
        title={edit ? subjectName(edit.row.subject) : ''}
        onClose={() => setEdit(null)}
        onSubmit={() => { setRows((rs) => rs.map((x, k) => (k === edit.index ? edit.row : x))); setEdit(null); }}
        submitLabel="Apply"
      >
        {edit && (
          <>
            <Input label="Weekly periods" value={String(edit.row.weeklyPeriods)} keyboardType="numeric"
              onChange={(v) => setEdit((e: any) => ({ ...e, row: { ...e.row, weeklyPeriods: Number(v) || 0 } }))} />
            <Select label="Teacher" value={edit.row.teacher ?? ''} placeholder="No teacher"
              options={[{ label: 'No teacher', value: '' }, ...(data?.teachers ?? []).map((t: any) => ({ label: t.name, value: t._id }))]}
              onChange={(v) => setEdit((e: any) => ({ ...e, row: { ...e.row, teacher: v } }))} />
            <Select label="Subject type" value={edit.row.subjectType}
              options={SUBJECT_TYPES.map((t) => ({ label: t, value: t }))}
              onChange={(v) => setEdit((e: any) => ({ ...e, row: { ...e.row, subjectType: v } }))} />
            <Input label="Max per day" value={String(edit.row.maxPerDay)} keyboardType="numeric"
              onChange={(v) => setEdit((e: any) => ({ ...e, row: { ...e.row, maxPerDay: Number(v) || 1 } }))} />
            <Input label="Consecutive periods (labs)" value={String(edit.row.consecutivePeriods)} keyboardType="numeric"
              onChange={(v) => setEdit((e: any) => ({ ...e, row: { ...e.row, consecutivePeriods: Number(v) || 1 } }))} />
            <Select label="Difficulty" value={String(edit.row.difficulty)}
              options={[1, 2, 3, 4, 5].map((d) => ({ label: String(d), value: String(d) }))}
              onChange={(v) => setEdit((e: any) => ({ ...e, row: { ...e.row, difficulty: Number(v) } }))} />
            <Toggle label="Needs a specific room / lab" value={edit.row.requiresRoom}
              onChange={(v) => setEdit((e: any) => ({ ...e, row: { ...e.row, requiresRoom: v } }))} />
            {edit.row.requiresRoom && (
              <Select label="Pin to a room" value={edit.row.room ?? ''} placeholder="Any compatible room"
                options={[{ label: 'Any compatible room', value: '' }, ...(data?.rooms ?? []).map((rm: any) => ({ label: `${rm.roomName} (${rm.roomType})`, value: rm._id }))]}
                onChange={(v) => setEdit((e: any) => ({ ...e, row: { ...e.row, room: v } }))} />
            )}
            {edit.row.requiresRoom && !edit.row.room && (
              <>
                <Text style={r.fieldLabel}>Acceptable room types</Text>
                <View style={r.chipWrap}>
                  {ROOM_TYPES.map((t) => {
                    const on = (edit.row.roomTypes ?? []).includes(t);
                    return (
                      <TouchableOpacity key={t} style={[r.chip, on && r.chipOn]}
                        onPress={() => setEdit((e: any) => ({
                          ...e,
                          row: {
                            ...e.row,
                            roomTypes: on
                              ? e.row.roomTypes.filter((x: string) => x !== t)
                              : [...(e.row.roomTypes ?? []), t],
                          },
                        }))}>
                        <Text style={[r.chipText, on && { color: '#fff' }]}>{t}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
            <Toggle label='Treat "max per day" as a hard rule' value={edit.row.hardMaxPerDay}
              onChange={(v) => setEdit((e: any) => ({ ...e, row: { ...e.row, hardMaxPerDay: v } }))} />
          </>
        )}
      </FormModal>
    </>
  );
}

function normalise(x: any) {
  return {
    subject: x.subject?._id ?? x.subject ?? '',
    weeklyPeriods: x.weeklyPeriods ?? 4,
    teacher: x.teacher?._id ?? x.teacher ?? '',
    altTeachers: (x.altTeachers ?? []).map((t: any) => t._id ?? t),
    subjectType: x.subjectType ?? 'Theory',
    room: x.room?._id ?? x.room ?? '',
    roomTypes: x.roomTypes ?? [],
    requiresRoom: !!x.requiresRoom,
    consecutivePeriods: x.consecutivePeriods ?? 1,
    maxPerDay: x.maxPerDay ?? 1,
    hardMaxPerDay: x.hardMaxPerDay !== false,
    minGapPeriods: x.minGapPeriods ?? 0,
    preferredPeriods: x.preferredPeriods ?? [],
    preferredDays: x.preferredDays ?? [],
    difficulty: x.difficulty ?? 3,
    priority: x.priority ?? 0,
    isActive: x.isActive !== false,
  };
}

const r = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: Spacing.sm },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.sm },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
  },
  chipOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: 11.5, fontWeight: '600', color: Colors.textSecondary },

  warnBox: { backgroundColor: Colors.warningLight, borderRadius: Radius.md, padding: 10, marginBottom: 10 },
  warnText: { color: Colors.warning, fontSize: 12 },
  errorBox: { backgroundColor: Colors.dangerLight, borderRadius: Radius.md, padding: 10, marginBottom: 10 },
  errorText: { color: Colors.danger, fontSize: 12.5 },

  primaryBtn: { backgroundColor: Colors.accent, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.md },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
  secondaryBtn: {
    borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center', marginTop: 8,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  secondaryBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13.5 },
});
