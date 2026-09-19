/**
 * The substitution screen's newer pieces, on a phone.
 *
 * The board, the manual flow and the settings were already on mobile; these are
 * what the web screen gained since — the day in period order with its breaks,
 * covering a period by class rather than by teacher, the workload roll-up, and
 * the settings the Settings mockup added. Kept out of the screen file so it
 * stays readable.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as subApi from '@/api/substitute.api';
import * as adminApi from '@/api/admin.api';
import {
  unwrap, LoaderView, Empty, Card, Badge, Select, Toggle, Input, ActionBtn,
  SegTabs,
} from '@/components/ui/kit';
import { timeRange, orderPeriods, subjectTone, plural, Tiles } from '@/components/timetable/viewKit';

/* ── Coverage state, in the same three words as the web board ─────────────
   covered   a substitute is on it
   pending   open, but held for a human — a half day or an unapproved leave
   uncovered open, and nobody has flagged why */
export function statusOf(row: any): 'covered' | 'pending' | 'uncovered' | 'cancelled' {
  if (row.status === 'cancelled') return 'cancelled';
  if (row.status === 'assigned') return 'covered';
  return row.needsReview ? 'pending' : 'uncovered';
}
const STATUS: Record<string, { label: string; tone: any }> = {
  covered: { label: 'Covered', tone: 'success' },
  pending: { label: 'Pending', tone: 'warning' },
  uncovered: { label: 'Uncovered', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
const REASON: Record<string, { label: string; tone: any }> = {
  absent: { label: 'Absent', tone: 'danger' },
  leave: { label: 'Leave', tone: 'warning' },
  manual: { label: 'Manual', tone: 'info' },
};

/* ══════════════════════════════════════════════════════════════════════════
   The day in period order, breaks included
══════════════════════════════════════════════════════════════════════════ */

export function BoardByPeriod({ board, onPick, onCancel }: {
  board: any; onPick: (row: any) => void; onCancel: (row: any) => void;
}) {
  const rows = (board?.assignments ?? []).filter((r: any) => r.status !== 'cancelled');
  const periods = orderPeriods(board?.periods ?? []);

  // Slot each row into the day's grid; anything whose period is not in the
  // grid (a section on a different structure) still appears at the end —
  // dropping it would hide an uncovered class.
  const byPeriod = new Map<number, any[]>();
  for (const r of rows) {
    const k = Number(r.periodNumber);
    if (!byPeriod.has(k)) byPeriod.set(k, []);
    byPeriod.get(k)!.push(r);
  }
  const placed = new Set<string>();

  if (!rows.length) return <Empty icon="happy-outline" text="Nobody is away today — no period needs covering." />;

  return (
    <View style={{ gap: 8 }}>
      {periods.map((p: any, i: number) => {
        if (p.isBreak) {
          return (
            <View key={`b${i}`} style={k.breakRow}>
              <Text style={k.breakText}>{p.label || 'Break'}</Text>
              <Text style={k.breakTime}>{timeRange(p.startTime, p.endTime)}</Text>
            </View>
          );
        }
        const mine = byPeriod.get(p.periodNumber) ?? [];
        return mine.map((r: any) => {
          placed.add(r._id);
          return <CoverRow key={r._id} r={r} onPick={onPick} onCancel={onCancel} />;
        });
      })}
      {rows.filter((r: any) => !placed.has(r._id)).map((r: any) => (
        <CoverRow key={r._id} r={r} onPick={onPick} onCancel={onCancel} />
      ))}
    </View>
  );
}

function CoverRow({ r, onPick, onCancel }: { r: any; onPick: (r: any) => void; onCancel: (r: any) => void }) {
  const st = STATUS[statusOf(r)];
  const reason = REASON[r.reason] ?? REASON.manual;
  const tone = subjectTone(r.subject?._id || r.subject?.name);
  const covered = r.status === 'assigned';
  return (
    <View style={k.row}>
      <View style={[k.num, { backgroundColor: tone.bg }]}>
        <Text style={[k.numText, { color: tone.fg }]}>{r.periodNumber}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={k.rowTitle} numberOfLines={1}>{r.section?.label} · {r.subject?.name || 'Subject'}</Text>
        <Text style={k.rowSub} numberOfLines={1}>
          {timeRange(r.startTime, r.endTime)} · {r.originalTeacher?.name}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Badge label={reason.label} tone={reason.tone} />
          <Badge label={st.label} tone={st.tone} />
          {covered && <Text style={k.rowStrong} numberOfLines={1}>→ {r.substituteTeacher?.name}</Text>}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <ActionBtn small label={covered ? 'Change' : 'Assign'} tone="info" onPress={() => onPick(r)} />
        {covered && <ActionBtn small label="Cancel" tone="danger" onPress={() => onCancel(r)} />}
      </View>
    </View>
  );
}

/** The last few substitutions across days. */
export function RecentList() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    subApi.getRecent({ limit: 6 })
      .then((r: any) => setRows(unwrap(r)?.rows ?? []))
      .catch(() => setRows([]));
  }, []);
  if (!rows) return <LoaderView />;
  if (!rows.length) return <Text style={k.muted}>Nothing substituted recently.</Text>;
  return (
    <View>
      {rows.map((r) => {
        const st = STATUS[statusOf(r)];
        return (
          <View key={r._id} style={k.recent}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={k.rowTitle} numberOfLines={1}>{r.originalTeacher?.name}</Text>
              <Text style={k.rowSub} numberOfLines={1}>
                {r.date} · P{r.periodNumber} · {r.section?.label}
              </Text>
            </View>
            <Badge label={st.label} tone={st.tone} />
          </View>
        );
      })}
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Cover a period by class, section and period
══════════════════════════════════════════════════════════════════════════ */

/**
 * The web Manual Assignment form. An admin who knows "7-B period 3 needs
 * someone" does not always know whose period it is — this asks the server what
 * is taught there, who takes it, whether they are away, and who is free.
 */
export function SlotAssign({ date, onDone }: { date: string; onDone: () => void }) {
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [period, setPeriod] = useState('');
  const [slot, setSlot] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [teacherId, setTeacherId] = useState('');
  const [reason, setReason] = useState('absent');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState<'available' | 'unavailable'>('available');

  useEffect(() => {
    adminApi.getClassesWithSections()
      .then((r: any) => setClasses(unwrap(r) ?? []))
      .catch(() => setClasses([]));
  }, []);

  const klass = classes.find((c: any) => String(c._id) === classId);

  useEffect(() => {
    if (!sectionId || !period) { setSlot(null); return; }
    let alive = true;
    setLoading(true);
    setTeacherId('');
    subApi.getSlot({ date, sectionId, periodNumber: period })
      .then((r: any) => {
        if (!alive) return;
        const d = unwrap(r);
        setSlot(d);
        const first = d?.teaching?.[0];
        if (first?.absence) setReason(first.absence.reason === 'leave' ? 'leave' : 'absent');
      })
      .catch((e: any) => { if (alive) { setSlot(null); Alert.alert('Could not read that period', e?.message ?? ''); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [date, sectionId, period]);

  const current = slot?.teaching?.[0];
  const candidates = slot?.candidates ?? [];
  const unavailable = slot?.unavailable ?? [];

  const submit = async (force = false): Promise<void> => {
    setSaving(true);
    try {
      await subApi.assignSlot({
        date, sectionId, periodNumber: Number(period),
        originalTeacherId: current?.teacher?._id,
        substituteTeacherId: teacherId, reason, remarks: note,
        ...(force ? { force: true } : {}),
      });
      Alert.alert('Assigned', 'The substitute has been told.');
      setTeacherId(''); setNote('');
      onDone();
    } catch (e: any) {
      const msg = e?.data?.message || e?.message || 'Could not assign';
      if (/not available/i.test(msg) && !force) {
        Alert.alert('Not available', `${msg}\n\nAssign anyway?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Assign anyway', style: 'destructive', onPress: () => { submit(true); } },
        ]);
      } else Alert.alert('Could not assign', msg);
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <Select label="Class" value={classId} placeholder="Choose a class…"
        onChange={(v) => { setClassId(v); setSectionId(''); setPeriod(''); }}
        options={classes.map((c: any) => ({ label: c.className, value: String(c._id) }))} />
      <Select label="Section" value={sectionId} placeholder="Choose a section…"
        onChange={(v) => { setSectionId(v); setPeriod(''); }}
        options={(klass?.sections ?? []).map((s: any) => ({ label: s.sectionName, value: String(s._id) }))} />
      <Select label="Period" value={period} placeholder="Choose a period…" onChange={setPeriod}
        options={Array.from({ length: 10 }, (_, i) => ({ label: `Period ${i + 1}`, value: String(i + 1) }))} />

      {loading ? <LoaderView /> : !slot ? (
        <Text style={k.muted}>Choose a class, section and period to see who is free.</Text>
      ) : !current ? (
        <Text style={k.warn}>Nothing is timetabled for that class at that period.</Text>
      ) : (
        <>
          <View style={k.slotCard}>
            <Text style={k.rowTitle}>{current.subject?.name} · {timeRange(slot.startTime, slot.endTime)}</Text>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
              <Text style={k.rowSub}>{current.teacher?.name}</Text>
              {current.absence
                ? <Badge label={current.absence.label} tone={current.absence.reason === 'leave' ? 'warning' : 'danger'} />
                : <Badge label="Not recorded away" tone="neutral" />}
            </View>
          </View>

          <SegTabs
            tabs={[
              { key: 'available', label: `Free (${candidates.length})` },
              { key: 'unavailable', label: `Busy (${unavailable.length})` },
            ]}
            active={list} onChange={(v) => setList(v as any)} />

          {list === 'available' ? (
            !candidates.length ? <Text style={k.warn}>Nobody is free for this period.</Text> : candidates.map((c: any, i: number) => {
              const on = String(c.teacher._id) === teacherId;
              return (
                <TouchableOpacity key={c.teacher._id} onPress={() => setTeacherId(on ? '' : String(c.teacher._id))}
                  style={[k.cand, on && k.candOn]} activeOpacity={0.8}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={k.rowTitle} numberOfLines={1}>{c.teacher.name}</Text>
                    <Text style={k.rowSub} numberOfLines={1}>
                      {(c.subjects ?? []).join(', ') || 'No subjects recorded'} · {c.workload?.subsToday ?? 0} covers today
                    </Text>
                  </View>
                  {i === 0 && <Badge label="Fairest" tone="success" />}
                  {c.subjectMatch && <Badge label="Teaches it" tone="info" />}
                </TouchableOpacity>
              );
            })
          ) : unavailable.map((x: any) => (
            <View key={x.teacher._id} style={k.cand}>
              <Text style={[k.rowTitle, { flex: 1 }]} numberOfLines={1}>{x.teacher.name}</Text>
              <Text style={k.rowSub} numberOfLines={1}>{x.reason}</Text>
            </View>
          ))}

          <Select label="Reason" value={reason} onChange={setReason} options={[
            { label: 'Absent', value: 'absent' },
            { label: 'On leave', value: 'leave' },
            { label: 'Official duty / other', value: 'manual' },
          ]} />
          <Input label={`Note (optional) · ${note.length}/200`} value={note}
            onChange={(v) => setNote(v.slice(0, 200))} placeholder="e.g. worksheets are on my desk" />
          <ActionBtn label={saving ? 'Assigning…' : 'Assign substitute'} tone="info"
            onPress={() => { submit(false); }} disabled={!teacherId || saving} />
        </>
      )}
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Workload
══════════════════════════════════════════════════════════════════════════ */

export function WorkloadTab({ date }: { date: string }) {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setData(null);
    subApi.getWorkloadReport({ date, ...(status ? { status } : {}) })
      .then((r: any) => setData(unwrap(r)))
      .catch(() => setData({ teachers: [], summary: {}, thresholds: {} }));
  }, [date, status]);

  if (!data) return <LoaderView />;
  const s = data.summary ?? {};
  const th = data.thresholds ?? { target: 0, overAt: 0, underAt: 0 };

  return (
    <>
      <Tiles items={[
        { label: 'Teachers', value: s.totalTeachers ?? 0, icon: 'people', tone: 'info' },
        { label: 'Avg / week', value: s.averagePerWeek ?? 0, icon: 'stats-chart', tone: 'neutral' },
        { label: 'Overloaded', value: s.overloaded ?? 0, icon: 'arrow-up', tone: s.overloaded ? 'danger' : 'neutral' },
        { label: 'Under', value: s.underloaded ?? 0, icon: 'arrow-down', tone: s.underloaded ? 'warning' : 'neutral' },
      ]} />
      <Text style={k.muted}>
        Target {th.target} a week · overloaded above {th.overAt} · balanced {th.underAt}–{th.overAt} ·
        underloaded below {th.underAt}. {data.includeSubsInWorkload ? 'Covers are counted in.' : 'Covers are not counted.'}
      </Text>

      <SegTabs
        tabs={[
          { key: '', label: 'All' },
          { key: 'overloaded', label: `Over (${s.overloaded ?? 0})` },
          { key: 'balanced', label: `Balanced (${s.balanced ?? 0})` },
          { key: 'underloaded', label: `Under (${s.underloaded ?? 0})` },
        ]}
        active={status} onChange={setStatus} />

      <Card>
        {!(data.teachers ?? []).length ? <Empty text="No teacher in that band." /> : data.teachers.map((t: any) => {
          const pct = th.target ? Math.min(100, (t.totalLoad / th.target) * 100) : 0;
          const colour = t.status === 'overloaded' ? Colors.danger : t.status === 'underloaded' ? Colors.warning : Colors.success;
          return (
            <View key={t.teacher._id} style={k.wl}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[k.rowTitle, { flex: 1 }]} numberOfLines={1}>{t.teacher.name}</Text>
                <Text style={k.rowStrong}>{t.totalLoad}</Text>
                <Badge label={t.status === 'overloaded' ? 'Overloaded' : t.status === 'underloaded' ? 'Underloaded' : 'Balanced'}
                  tone={t.status === 'overloaded' ? 'danger' : t.status === 'underloaded' ? 'warning' : 'success'} />
              </View>
              <Text style={k.rowSub} numberOfLines={1}>
                {t.designation} · {t.assignedPeriods} timetabled + {plural(t.substitutionPeriods ?? 0, 'cover')}
                {t.subjects?.length ? ` · ${t.subjects.map((x: any) => x.name).join(', ')}` : ''}
              </Text>
              <View style={k.track}><View style={[k.fill, { width: `${pct}%`, backgroundColor: colour }]} /></View>
            </View>
          );
        })}
      </Card>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The settings the Settings mockup added
══════════════════════════════════════════════════════════════════════════ */

export function SettingsExtra({ settings, flags, set }: {
  settings: any; flags: any; set: (k: string, v: any) => void;
}) {
  const num = (key: string) => (v: string) => set(key, Math.max(0, Number(v) || 0));
  return (
    <>
      <Card>
        <Text style={k.cardTitle}>Absence detection</Text>
        <Input label="Consider half-day absent if absent after (HH:mm)"
          value={settings.halfDayAbsentAfter ?? '12:00'} onChange={(v) => set('halfDayAbsentAfter', v)} />
        <Text style={k.muted}>
          Where the register says “half day” without saying which half, periods from this time on are
          the ones covered.
        </Text>
        <Toggle label="Include unapproved leaves"
          sub={flags.leave ? 'Off by default — a pending application is not yet an absence.' : 'The Leave module is off.'}
          value={!!settings.useUnapprovedLeave && !!flags.leave}
          onChange={(v) => flags.leave && set('useUnapprovedLeave', v)} />
        <Toggle label="Include on duty / official work"
          sub={flags.leave ? 'Leave types coded OD / On duty / Official.' : 'The Leave module is off.'}
          value={!!settings.useOnDuty && !!flags.leave}
          onChange={(v) => flags.leave && set('useOnDuty', v)} />
      </Card>

      <Card>
        <Text style={k.cardTitle}>Who else may be offered</Text>
        <Toggle label="Allow cross-department substitutes"
          sub="Off keeps cover inside the absent teacher’s department. Teachers with no recorded department are never excluded."
          value={!!settings.allowCrossDepartment}
          onChange={(v) => set('allowCrossDepartment', v)} />
        <Toggle label="Exclude teachers with leave on the same day"
          sub="Never offer somebody who is themselves away — including the other half of a half day."
          value={!!settings.excludeTeachersOnLeave}
          onChange={(v) => set('excludeTeachersOnLeave', v)} />
      </Card>

      <Card>
        <Text style={k.cardTitle}>Fairness weights</Text>
        <Text style={k.muted}>
          Candidates are ranked lowest score first. Weights push a teacher down as their load grows;
          bonuses lift somebody who already knows the subject or the class.
        </Text>
        <View style={k.grid2}>
          <View style={k.half}><Input label="Covers today" keyboardType="numeric" value={String(settings.weightSubsToday ?? 100)} onChange={num('weightSubsToday')} /></View>
          <View style={k.half}><Input label="Covers this week" keyboardType="numeric" value={String(settings.weightSubsWeek ?? 20)} onChange={num('weightSubsWeek')} /></View>
          <View style={k.half}><Input label="Covers this month" keyboardType="numeric" value={String(settings.weightSubsMonth ?? 5)} onChange={num('weightSubsMonth')} /></View>
          <View style={k.half}><Input label="Normal periods today" keyboardType="numeric" value={String(settings.weightNormalToday ?? 8)} onChange={num('weightNormalToday')} /></View>
          <View style={k.half}><Input label="Bonus: teaches subject" keyboardType="numeric" value={String(settings.bonusSubjectMatch ?? 30)} onChange={num('bonusSubjectMatch')} /></View>
          <View style={k.half}><Input label="Bonus: teaches class" keyboardType="numeric" value={String(settings.bonusSameSection ?? 10)} onChange={num('bonusSameSection')} /></View>
        </View>
      </Card>

      <Card>
        <Text style={k.cardTitle}>Reports & records</Text>
        <Select label="Keep substitution history for" value={String(settings.historyYears ?? 1)}
          onChange={(v) => set('historyYears', Number(v))}
          options={[1, 2, 3, 5, 10].map((n) => ({ label: `${n} academic year${n === 1 ? '' : 's'}`, value: String(n) }))} />
        <Text style={k.muted}>Older rows are never deleted — they stop being listed, and come back if this is lengthened.</Text>
        <Toggle label="Include substitutions in teacher workload" value={!!settings.includeSubsInWorkload}
          onChange={(v) => set('includeSubsInWorkload', v)} sub="Count covered periods in the workload reports." />
        <Toggle label="Show in teacher timetable" value={!!settings.showInTeacherTimetable}
          onChange={(v) => set('showInTeacherTimetable', v)} sub="Covers appear on timetables — student, parent and teacher." />
        <Toggle label="Allow export of substitution records" value={!!settings.allowExport}
          onChange={(v) => set('allowExport', v)} sub="Offer the CSV download on the web board and reports." />
      </Card>
    </>
  );
}

const k = StyleSheet.create({
  muted: { fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16, marginBottom: Spacing.sm },
  warn: { fontSize: 12, color: Colors.warning, marginVertical: Spacing.sm },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11,
    backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
  },
  num: { width: 30, height: 30, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 13, fontWeight: '800' },
  rowTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  rowSub: { fontSize: 11, color: Colors.textSecondary },
  rowStrong: { fontSize: 12, fontWeight: '700', color: Colors.text },

  breakRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.warningLight, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8,
  },
  breakText: { fontSize: 12.5, fontWeight: '700', color: Colors.warning },
  breakTime: { fontSize: 11, color: Colors.warning },

  recent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },

  slotCard: { backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, padding: 10, marginVertical: Spacing.sm },
  cand: {
    flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, marginBottom: 6,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.surface,
  },
  candOn: { borderColor: Colors.primary, backgroundColor: '#EEF2FF' },

  wl: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: 3 },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.divider, overflow: 'hidden', marginTop: 4 },
  fill: { height: '100%', borderRadius: 3 },

  grid2: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  half: { width: '50%', paddingHorizontal: 4 },
});
