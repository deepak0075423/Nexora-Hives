import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as ttApi from '@/api/timetable.api';
import {
  unwrap, LoaderView, Empty, Card, SegTabs, Select, FormModal, confirmAsync, ActionBtn,
} from '@/components/ui/kit';
import {
  DAYS, DAY_SHORT, StatusBadge, ConflictRow, MiniStat, isTeaching, periodTypeOf, subjectColor, tk,
} from '@/components/timetable/ttKit';

/**
 * Draft preview + manual editing on mobile.
 *
 * Drag-and-drop is a poor fit for a phone-sized grid, so a period is moved by
 * tapping it and choosing the target slot — the same validated move endpoint the
 * web drag-and-drop uses, so the rules and the audit trail are identical.
 */
export default function TimetableVersionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [tab, setTab] = useState('class');
  const [sectionId, setSectionId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [day, setDay] = useState('Monday');
  const [selected, setSelected] = useState<any>(null);      // entry tapped for editing
  const [moving, setMoving] = useState<any>(null);          // entry being relocated
  const [regenerating, setRegenerating] = useState<any>(null);  // { percent, steps }
  const pollRef = useRef<any>(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  /* Conflicts are usually a solver outcome, not a data error: a fresh starting
     point often clears them. The retry becomes its own version, so the one being
     looked at is never overwritten. */
  const regenerate = async () => {
    const manual = (data?.entries ?? []).filter((e: any) => e.isManual || e.isLocked).length;
    const ok = await confirmAsync(
      'Regenerate timetable',
      manual
        ? `Solve these ${data.sections?.length ?? 0} section(s) again into a NEW version? Your ${manual} hand-edited period(s) are kept in place, and this version is left untouched.`
        : `Solve these ${data.sections?.length ?? 0} section(s) again into a NEW version? This version is left untouched.`,
      'Regenerate',
    );
    if (!ok) return;

    setBusy(true);
    try {
      const d = unwrap(await ttApi.regenerate(String(id), {
        options: { ...(data.version?.options ?? {}), preserveManualEdits: manual > 0 },
      }));
      setRegenerating({ percent: 0, steps: [] });
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const p = unwrap(await ttApi.getProgress(d.versionId));
          setRegenerating({ ...(p.progress ?? {}), status: p.status });
          if (p.status === 'generating') return;
          clearInterval(pollRef.current);
          setRegenerating(null);
          if (p.status === 'failed') { setError('Regeneration failed'); return; }
          router.replace({ pathname: '/modules/admin/timetable-version', params: { id: d.versionId } } as any);
        } catch (err: any) {
          clearInterval(pollRef.current);
          setRegenerating(null);
          setError(err?.message ?? 'Lost contact with the server');
        }
      }, 1000);
    } catch (err: any) {
      setError(err?.message ?? 'Could not start regeneration');
    } finally { setBusy(false); }
  };

  const load = useCallback(async () => {
    try {
      const d = unwrap(await ttApi.getVersion(String(id)));
      setData(d);
      setSectionId((prev) => prev || d.sections?.[0]?._id || '');
      setDay((prev) => (d.days?.includes(prev) ? prev : d.days?.[0] ?? 'Monday'));
      setError('');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load this version');
    } finally { setLoading(false); setRefreshing(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const maps = useMemo(() => {
    if (!data) return null;
    return {
      subject: new Map<string, any>((data.subjects ?? []).map((s: any) => [s._id, s])),
      teacher: new Map<string, any>((data.teachers ?? []).map((t: any) => [t._id, t])),
      room: new Map<string, any>((data.rooms ?? []).map((r: any) => [r._id, r])),
      section: new Map<string, any>((data.sections ?? []).map((s: any) => [s._id, s])),
    };
  }, [data]);

  const bySlot = useMemo(() => {
    const m = new Map<string, any>();
    for (const e of data?.entries ?? []) m.set(`${e.section}#${e.dayOfWeek}#${e.periodNumber}`, e);
    return m;
  }, [data]);

  /* Merged subjects share one entry row. A class grid shows them as one cell,
     but the teacher-wise view needs a line per subject taught. */
  const occupants = useMemo<any[]>(() => (data?.entries ?? []).flatMap((e: any) => [
    e,
    ...(e.additionalSubjects ?? []).map((m: any) => ({
      ...e, subject: m.subject, teacher: m.teacher, room: m.room, additionalSubjects: [],
    })),
  ]), [data]);

  const teachersInUse = useMemo(() => {
    if (!data || !maps) return [];
    const ids = [...new Set(occupants.map((e: any) => e.teacher).filter(Boolean))] as string[];
    return ids.map((t) => maps.teacher.get(t)).filter(Boolean).sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [data, maps, occupants]);

  useEffect(() => { if (!teacherId && teachersInUse.length) setTeacherId(teachersInUse[0]._id); }, [teachersInUse]); // eslint-disable-line

  if (loading) return (<><Stack.Screen options={{ title: 'Timetable' }} /><LoaderView /></>);
  if (!data) return (
    <>
      <Stack.Screen options={{ title: 'Timetable' }} />
      <Empty icon="alert-circle-outline" text={error || 'Version not found'} />
    </>
  );

  const { version, sections, structures, conflicts, days } = data;
  const editable = ['draft', 'generated', 'conflict', 'validated', 'failed'].includes(version.status);
  const name = {
    subject: (sid?: string) => maps!.subject.get(String(sid))?.subjectName ?? '—',
    teacher: (tid?: string) => maps!.teacher.get(String(tid))?.name ?? '',
    room:    (rid?: string) => maps!.room.get(String(rid))?.roomName ?? '',
    section: (sid?: string) => maps!.section.get(String(sid))?.label ?? '',
  };

  /* One slot, possibly several subjects: "Maths + Computer" with both teachers. */
  const uniqJoin = (vals: (string | undefined)[], sep: string) =>
    [...new Set(vals.filter(Boolean))].join(sep);
  const slot = {
    subject: (e: any) => uniqJoin([e.subject, ...(e.additionalSubjects ?? []).map((m: any) => m.subject)]
      .map(name.subject), ' + '),
    teacher: (e: any) => uniqJoin([e.teacher, ...(e.additionalSubjects ?? []).map((m: any) => m.teacher)]
      .map(name.teacher), ' · '),
    room: (e: any) => uniqJoin([e.room, ...(e.additionalSubjects ?? []).map((m: any) => m.room)]
      .map(name.room), ' · '),
    // The other sections sitting in this same lesson.
    withSections: (e: any) => (e.mergedSections ?? []).map(name.section).filter(Boolean).join(', '),
  };

  /* ── Actions ───────────────────────────────────────────────────────────── */
  const doMove = async (targetDay: string, targetPeriod: number) => {
    setBusy(true);
    try {
      await ttApi.moveEntry(String(id), moving._id, { dayOfWeek: targetDay, periodNumber: targetPeriod });
      setMoving(null);
      await load();
    } catch (err: any) {
      const blocking = err?.data?.data?.conflicts?.[0];
      setError(blocking?.description ?? err?.message ?? 'Cannot move this timetable entry.');
    } finally { setBusy(false); }
  };

  const removeEntry = async () => {
    if (!(await confirmAsync('Clear period', `Remove ${name.subject(selected.subject)} from ${selected.dayOfWeek} P${selected.periodNumber}?`, 'Clear'))) return;
    setBusy(true);
    try { await ttApi.deleteEntry(String(id), selected._id); setSelected(null); await load(); }
    catch (err: any) { setError(err?.message ?? 'Failed'); } finally { setBusy(false); }
  };

  const runValidate = async () => {
    setBusy(true);
    try {
      const d = unwrap(await ttApi.validateVersion(String(id)));
      setError(d.valid ? '' : d.message);
      await load();
      return d.valid;
    } catch (err: any) { setError(err?.message ?? 'Validation failed'); return false; }
    finally { setBusy(false); }
  };

  const doPublish = async () => {
    const valid = await runValidate();
    if (!valid) { setTab('conflicts'); return; }
    const okToGo = await confirmAsync(
      'Publish timetable',
      'Publishing this timetable will make it visible to teachers and students, replacing the current schedule. Continue?',
      'Publish',
    );
    if (!okToGo) return;
    await publishNow(false);
  };

  /**
   * The server refuses a publish that would silently destroy work: hand edits
   * made in the live grid since the last publish, or a clash with a section this
   * version does not own. Both come back as 409 with the detail — show it and
   * let the admin decide, rather than dead-ending on a toast.
   */
  const publishNow = async (overwriteLiveEdits: boolean) => {
    setBusy(true);
    try {
      const d = unwrap(await ttApi.publishVersion(String(id),
        overwriteLiveEdits ? { overwriteLiveEdits: true } : undefined));
      await load();
      setTab('class');
      setError(d.message ?? 'Timetable published.');
    } catch (err: any) {
      const detail = err?.data?.data ?? err?.data;
      const outside: any[] = detail?.outsideClashes ?? [];
      const liveEdits: any[] = detail?.liveEdits ?? [];

      if (outside.length) {
        const shown = outside.slice(0, 6).map((c: any) => `• ${c.message}`).join('\n');
        const more = outside.length > 6 ? `\n…and ${outside.length - 6} more` : '';
        const go = await confirmAsync(
          'Clashes with other sections',
          `This draft is fine on its own, but ${outside.length} period(s) collide with timetables already `
          + `published for sections it does not cover.\n\n${shown}${more}`,
          'Publish anyway',
        );
        if (go) await publishNow(true);
        else setBusy(false);
        return;
      }

      if (liveEdits.length) {
        const shown = liveEdits.slice(0, 6)
          .map((e: any) => `• ${e.sectionName} ${e.dayOfWeek} P${e.periodNumber} — ${e.subjectName}`).join('\n');
        const more = liveEdits.length > 6 ? `\n…and ${liveEdits.length - 6} more` : '';
        const go = await confirmAsync(
          'Hand edits will be replaced',
          `${liveEdits.length} period(s) were edited by hand since the last publish. Publishing rebuilds `
          + `every section from this draft, so those corrections will be lost.\n\n${shown}${more}`,
          'Replace and publish',
        );
        if (go) await publishNow(true);
        else setBusy(false);
        return;
      }

      setError(err?.message ?? 'Publish failed');
      setTab('conflicts');
      await load();
    }
    finally { setBusy(false); }
  };

  /* ── Grids ─────────────────────────────────────────────────────────────── */
  const periodsOf = (secId: string) => (structures?.[secId] ?? []) as any[];

  const renderClassGrid = () => {
    const section = maps!.section.get(sectionId);
    const periods = periodsOf(sectionId);
    if (!section) return <Empty icon="school-outline" text="Pick a class" />;
    if (!periods.length) return <Empty icon="time-outline" text="No period structure for this section" />;
    const activeDays = (days ?? DAYS).filter((d: string) => d !== 'Saturday' || section.openOnSaturday !== false);

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View style={v.row}>
            <View style={[v.headCell, { width: 54 }]}><Text style={v.headText}>P</Text></View>
            {activeDays.map((d: string) => (
              <View key={d} style={v.headCell}><Text style={v.headText}>{DAY_SHORT[d]}</Text></View>
            ))}
          </View>
          {periods.map((p: any, i: number) => {
            if (!isTeaching(p)) {
              return (
                <View key={i} style={v.row}>
                  <View style={[v.cell, { width: 54, backgroundColor: '#FEF9C3' }]}>
                    <Text style={v.breakText}>{periodTypeOf(p)[0]}</Text>
                  </View>
                  <View style={[v.cell, { width: 96 * activeDays.length, backgroundColor: '#FEF9C3' }]}>
                    <Text style={v.breakText}>{p.recessName || periodTypeOf(p)}</Text>
                  </View>
                </View>
              );
            }
            return (
              <View key={i} style={v.row}>
                <View style={[v.cell, { width: 54 }]}>
                  <Text style={v.periodNum}>P{p.periodNumber}</Text>
                  {p.startTime ? <Text style={v.periodTime}>{p.startTime}</Text> : null}
                </View>
                {activeDays.map((d: string) => {
                  const entry = bySlot.get(`${sectionId}#${d}#${p.periodNumber}`);
                  const isTarget = moving && !entry;
                  return (
                    <TouchableOpacity key={d} style={[v.cell, isTarget && v.cellTarget]} activeOpacity={0.7}
                      onPress={() => {
                        if (moving) { if (!entry) doMove(d, p.periodNumber); return; }
                        if (entry) setSelected(entry);
                      }}>
                      {entry ? (
                        <View style={[tk.periodCard, { backgroundColor: subjectColor(entry.subject).bg }]}>
                          <Text numberOfLines={1} style={[tk.periodSubject, { color: subjectColor(entry.subject).fg }]}>
                            {slot.subject(entry)}{entry.isLocked ? ' 🔒' : entry.isManual ? ' ✎' : ''}
                          </Text>
                          {slot.teacher(entry) ? <Text numberOfLines={1} style={tk.periodMeta}>{slot.teacher(entry)}</Text> : null}
                          {slot.room(entry) ? <Text numberOfLines={1} style={tk.periodMeta}>📍{slot.room(entry)}</Text> : null}
                          {slot.withSections(entry)
                            ? <Text numberOfLines={1} style={tk.periodMeta}>🔗 with {slot.withSections(entry)}</Text>
                            : null}
                        </View>
                      ) : (
                        <Text style={v.emptyCell}>{isTarget ? '＋' : ''}</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
    );
  };

  const renderTeacherGrid = () => {
    if (!teachersInUse.length) return <Empty icon="person-outline" text="No teachers assigned" />;
    const rows = occupants.filter((e: any) => String(e.teacher) === teacherId);
    const periodNumbers = [...new Set(
      sections.flatMap((s: any) => periodsOf(s._id).filter(isTeaching).map((p: any) => p.periodNumber)),
    )].sort((a: any, b: any) => a - b);

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View style={v.row}>
            <View style={[v.headCell, { width: 44 }]}><Text style={v.headText}>P</Text></View>
            {(days ?? DAYS).map((d: string) => <View key={d} style={v.headCell}><Text style={v.headText}>{DAY_SHORT[d]}</Text></View>)}
          </View>
          {periodNumbers.map((pn: any) => (
            <View key={pn} style={v.row}>
              <View style={[v.cell, { width: 44 }]}><Text style={v.periodNum}>P{pn}</Text></View>
              {(days ?? DAYS).map((d: string) => {
                const hit = rows.find((e: any) => e.dayOfWeek === d && e.periodNumber === pn);
                return (
                  <View key={d} style={v.cell}>
                    {hit ? (
                      <View style={[tk.periodCard, { backgroundColor: subjectColor(hit.subject).bg }]}>
                        <Text numberOfLines={1} style={[tk.periodSubject, { color: subjectColor(hit.subject).fg }]}>
                          {name.subject(hit.subject)}
                        </Text>
                        <Text numberOfLines={1} style={tk.periodMeta}>{name.section(hit.section)}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  const renderDayGrid = () => {
    const periodNumbers = [...new Set(
      sections.flatMap((s: any) => periodsOf(s._id).filter(isTeaching).map((p: any) => p.periodNumber)),
    )].sort((a: any, b: any) => a - b);
    const active = sections.filter((s: any) => day !== 'Saturday' || s.openOnSaturday !== false);

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View style={v.row}>
            <View style={[v.headCell, { width: 44 }]}><Text style={v.headText}>P</Text></View>
            {active.map((s: any) => <View key={s._id} style={v.headCell}><Text numberOfLines={1} style={v.headText}>{s.label}</Text></View>)}
          </View>
          {periodNumbers.map((pn: any) => (
            <View key={pn} style={v.row}>
              <View style={[v.cell, { width: 44 }]}><Text style={v.periodNum}>P{pn}</Text></View>
              {active.map((s: any) => {
                const entry = bySlot.get(`${s._id}#${day}#${pn}`);
                return (
                  <View key={s._id} style={v.cell}>
                    {entry ? (
                      <View style={[tk.periodCard, { backgroundColor: subjectColor(entry.subject).bg }]}>
                        <Text numberOfLines={1} style={[tk.periodSubject, { color: subjectColor(entry.subject).fg }]}>
                          {slot.subject(entry)}
                        </Text>
                        <Text numberOfLines={1} style={tk.periodMeta}>{slot.teacher(entry)}</Text>
                        {slot.withSections(entry)
                          ? <Text numberOfLines={1} style={tk.periodMeta}>🔗 with {slot.withSections(entry)}</Text>
                          : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: version.label || `Version ${version.versionNumber}` }} />
      <ScrollView
        style={v.screen}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <View style={v.statusRow}>
          <StatusBadge status={version.status} />
          <Text style={v.subtle}>{data.yearName} · {sections.length} section(s) · {data.entries.length} periods</Text>
        </View>

        {error ? (
          <View style={v.errorBox}>
            <Text style={v.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => setError('')}><Ionicons name="close" size={16} color={Colors.danger} /></TouchableOpacity>
          </View>
        ) : null}

        {moving ? (
          <View style={v.movingBar}>
            <Text style={v.movingText}>Tap an empty slot to move “{name.subject(moving.subject)}”</Text>
            <TouchableOpacity onPress={() => setMoving(null)}><Text style={v.cancelMove}>Cancel</Text></TouchableOpacity>
          </View>
        ) : null}

        <View style={v.statRow}>
          <MiniStat label="Entries" value={data.entries.length} />
          <MiniStat label="Fill" value={version.stats?.fillRate != null ? `${version.stats.fillRate}%` : '—'} />
          <MiniStat label="Conflicts" value={conflicts.length}
            tone={version.errorCount ? Colors.danger : Colors.success} />
        </View>

        <SegTabs
          tabs={[
            { key: 'class', label: '🏫 Class' },
            { key: 'teacher', label: '🧑‍🏫 Teacher' },
            { key: 'day', label: '📅 Day' },
            { key: 'conflicts', label: `⚠️ Conflicts${conflicts.length ? ` (${conflicts.length})` : ''}` },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'class' && (
          <>
            <Select label="Class" value={sectionId}
              options={sections.map((s: any) => ({ label: s.label, value: s._id }))}
              onChange={setSectionId} />
            {editable ? <Text style={tk.hint}>Tap a period to edit or move it.</Text> : null}
            <Card style={{ padding: 6 }}>{renderClassGrid()}</Card>
          </>
        )}

        {tab === 'teacher' && (
          <>
            <Select label="Teacher" value={teacherId}
              options={teachersInUse.map((t: any) => ({ label: t.name, value: t._id }))}
              onChange={setTeacherId} />
            <Card style={{ padding: 6 }}>{renderTeacherGrid()}</Card>
          </>
        )}

        {tab === 'day' && (
          <>
            <View style={v.dayRow}>
              {(days ?? DAYS).map((d: string) => (
                <TouchableOpacity key={d} style={[v.dayChip, day === d && v.dayChipOn]} onPress={() => setDay(d)}>
                  <Text style={[v.dayChipText, day === d && { color: '#fff' }]}>{DAY_SHORT[d]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Card style={{ padding: 6 }}>{renderDayGrid()}</Card>
          </>
        )}

        {tab === 'conflicts' && (
          <>
            {/* Offered before the admin starts moving periods by hand. */}
            {editable && (
              <Card>
                <Text style={v.regenTitle}>
                  {conflicts.length ? 'Try solving these again' : 'Try for a better arrangement'}
                </Text>
                <Text style={v.regenSub}>
                  Regenerating with a different starting point often clears conflicts outright.
                  It creates a new version — this one is left exactly as it is.
                </Text>
                <TouchableOpacity style={[v.regenBtn, busy && { opacity: 0.6 }]} disabled={busy} onPress={regenerate}>
                  <Ionicons name="refresh" size={16} color={Colors.accent} />
                  <Text style={v.regenBtnText}>Regenerate</Text>
                </TouchableOpacity>
              </Card>
            )}
            {conflicts.length === 0
              ? <Empty icon="checkmark-circle-outline" text="No conflicts — this version can be published" />
              : <View>{conflicts.map((c: any, i: number) => <ConflictRow key={c._id ?? i} conflict={c} />)}</View>}
          </>
        )}

        {editable && (
          <>
            <TouchableOpacity style={[v.primaryBtn, busy && { opacity: 0.6 }]} disabled={busy} onPress={doPublish}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={v.primaryBtnText}>🚀 Validate &amp; Publish</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={v.secondaryBtn} disabled={busy} onPress={runValidate}>
              <Text style={v.secondaryBtnText}>✓ Validate only</Text>
            </TouchableOpacity>
          </>
        )}
        {version.status === 'published' && (
          <Text style={v.note}>This is the live timetable. Duplicate it from the versions list to make changes.</Text>
        )}
      </ScrollView>

      {/* Progress overlay so the admin can see the retry through. */}
      {regenerating && (
        <View style={v.regenOverlay}>
          <View style={v.regenCard}>
            <Text style={v.regenTitle}>Regenerating…</Text>
            <View style={{ marginTop: 10 }}>
              {(regenerating.steps ?? []).map((st: any) => (
                <View key={st.key} style={v.regenStep}>
                  {st.status === 'done'
                    ? <Ionicons name="checkmark-circle" size={15} color={Colors.success} />
                    : st.status === 'active'
                      ? <ActivityIndicator size="small" color={Colors.accent} />
                      : <Ionicons name="ellipse-outline" size={15} color={Colors.textLight} />}
                  <Text style={[v.regenStepText, st.status === 'pending' && { color: Colors.textLight }]}>{st.label}</Text>
                </View>
              ))}
            </View>
            <View style={v.regenTrack}>
              <View style={[v.regenFill, { width: `${regenerating.percent ?? 0}%` }]} />
            </View>
            <Text style={v.regenPct}>{regenerating.percent ?? 0}%</Text>
            <Text style={v.regenSub}>
              This runs on the server — you can leave this screen and pick the new version up from the version list.
            </Text>
          </View>
        </View>
      )}

      {/* ── Period actions ───────────────────────────────────────────────── */}
      <FormModal
        visible={!!selected}
        title={selected ? `${name.subject(selected.subject)} · ${selected.dayOfWeek} P${selected.periodNumber}` : ''}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <View style={{ gap: 8 }}>
            <Text style={v.detailLine}>Class: {name.section(selected.section)}</Text>
            <Text style={v.detailLine}>Teacher: {name.teacher(selected.teacher) || '—'}</Text>
            <Text style={v.detailLine}>Room: {name.room(selected.room) || '—'}</Text>
            {selected.isManual ? <Text style={v.detailLine}>✎ Manually edited</Text> : null}

            {editable && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <ActionBtn label="Move to another slot" tone="info"
                  onPress={() => { setMoving(selected); setSelected(null); setTab('class'); }} />
                <ActionBtn label={selected.isLocked ? 'Unlock' : 'Lock in place'} tone="warning"
                  onPress={async () => {
                    setBusy(true);
                    try { await ttApi.updateEntry(String(id), selected._id, { isLocked: !selected.isLocked }); setSelected(null); await load(); }
                    catch (err: any) { setError(err?.message ?? 'Failed'); } finally { setBusy(false); }
                  }} />
                <ActionBtn label="Clear period" tone="danger" onPress={removeEntry} />
              </View>
            )}
          </View>
        )}
      </FormModal>
    </>
  );
}

const v = StyleSheet.create({
  regenTitle: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  regenSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 3, marginBottom: 10 },
  regenBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.accent, paddingVertical: 10,
  },
  regenBtnText: { color: Colors.accent, fontWeight: '700', fontSize: 13 },
  regenOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: Spacing.lg,
  },
  regenCard: {
    width: '100%', maxWidth: 340, backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: Spacing.md,
  },
  regenStep: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  regenStepText: { fontSize: 12.5, color: Colors.text },
  regenTrack: { height: 8, borderRadius: 4, backgroundColor: Colors.surfaceAlt, marginTop: 12, overflow: 'hidden' },
  regenFill: { height: '100%', borderRadius: 4, backgroundColor: Colors.accent },
  regenPct: { fontSize: 11, color: Colors.textSecondary, textAlign: 'right', marginTop: 4 },

  screen: { flex: 1, backgroundColor: Colors.background },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  subtle: { fontSize: 11.5, color: Colors.textSecondary, flex: 1 },
  statRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.md },

  row: { flexDirection: 'row' },
  headCell: {
    width: 96, paddingVertical: 6, paddingHorizontal: 4, backgroundColor: Colors.surfaceAlt,
    borderWidth: 0.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  headText: { fontSize: 10.5, fontWeight: '700', color: Colors.textSecondary },
  cell: {
    width: 96, minHeight: 52, padding: 3, borderWidth: 0.5, borderColor: Colors.border,
    backgroundColor: Colors.surface, justifyContent: 'center',
  },
  cellTarget: { backgroundColor: '#ECFDF5', borderColor: Colors.success },
  emptyCell: { textAlign: 'center', color: Colors.success, fontSize: 16 },
  periodNum: { fontSize: 11, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  periodTime: { fontSize: 8, color: Colors.textLight, textAlign: 'center' },
  breakText: { fontSize: 10, fontStyle: 'italic', color: '#92400E', textAlign: 'center' },

  dayRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: Spacing.sm },
  dayChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  dayChipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayChipText: { fontSize: 11.5, fontWeight: '600', color: Colors.textSecondary },

  movingBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    backgroundColor: Colors.infoLight, borderRadius: Radius.md, padding: 10, marginBottom: 10,
  },
  movingText: { fontSize: 12, color: Colors.info, flex: 1, fontWeight: '600' },
  cancelMove: { fontSize: 12, color: Colors.danger, fontWeight: '700' },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.dangerLight, borderRadius: Radius.md, padding: 10, marginBottom: 10,
  },
  errorText: { color: Colors.danger, fontSize: 12.5, flex: 1 },

  detailLine: { fontSize: 13, color: Colors.text },

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
  note: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', marginTop: 14 },
});
