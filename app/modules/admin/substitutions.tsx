import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as subApi from '@/api/substitute.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Card, Badge, SegTabs, Select, Toggle, Input,
  FormModal, ActionBtn, StatTile, StatRow, confirmAsync, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

/**
 * Substitute Subject Teacher — admin screen.
 *
 * Board     one day at a time: who is away, every period they were due to
 *           teach, and who is covering it.
 * Manual    pick any teacher and cover their periods by hand — the whole
 *           workflow when neither attendance nor leave is enabled.
 * Settings  automation, eligibility and notification switches.
 *
 * Mirrors school-frontend/src/pages/admin/Substitutions.jsx.
 */

const todayIso = () => new Date().toISOString().slice(0, 10);
const shiftDay = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmtDay = (iso: string) => new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en-IN', {
  weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC',
});
const periodTime = (p: any) => (p?.startTime ? `${p.startTime}${p.endTime ? `–${p.endTime}` : ''}` : '');

const REASON_TONE: Record<string, any> = { absent: 'danger', leave: 'warning', manual: 'info' };

/* ── A day stepper: mobile has no room for a date field ────────────────────── */
function DateBar({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  return (
    <View style={s.dateBar}>
      <TouchableOpacity style={s.dateBtn} onPress={() => setDate(shiftDay(date, -1))}>
        <Ionicons name="chevron-back" size={18} color={Colors.primary} />
      </TouchableOpacity>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={s.dateText}>{fmtDay(date)}</Text>
        {date !== todayIso() && (
          <TouchableOpacity onPress={() => setDate(todayIso())}>
            <Text style={s.todayLink}>Back to today</Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity style={s.dateBtn} onPress={() => setDate(shiftDay(date, 1))}>
        <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

/* ── The six counts, spec §5 ───────────────────────────────────────────────── */
function WorkloadStrip({ w }: { w: any }) {
  if (!w) return null;
  const Cell = ({ label, value, hot }: { label: string; value: number; hot?: boolean }) => (
    <View style={{ alignItems: 'center', minWidth: 34 }}>
      <Text style={[s.wlValue, hot && value > 0 && { color: Colors.danger }]}>{value}</Text>
      <Text style={s.wlLabel}>{label}</Text>
    </View>
  );
  return (
    <View style={s.wlWrap}>
      <View style={s.wlGroup}>
        <Text style={s.wlHead}>SUBSTITUTE</Text>
        <View style={s.wlCells}>
          <Cell label="Day" value={w.subsToday} hot />
          <Cell label="Wk"  value={w.subsWeek}  hot />
          <Cell label="Mo"  value={w.subsMonth} hot />
        </View>
      </View>
      <View style={[s.wlGroup, s.wlDivider]}>
        <Text style={s.wlHead}>NORMAL</Text>
        <View style={s.wlCells}>
          <Cell label="Day" value={w.normalToday} />
          <Cell label="Wk"  value={w.normalWeek} />
          <Cell label="Mo"  value={w.normalMonth} />
        </View>
      </View>
    </View>
  );
}

/* ── Choose a substitute for one period ────────────────────────────────────── */
function CandidateSheet({ assignment, onClose, onDone }: any) {
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [remarks, setRemarks] = useState(assignment?.remarks ?? '');
  const [saving, setSaving]   = useState('');
  const [error, setError]     = useState('');

  useEffect(() => {
    let alive = true;
    subApi.getCandidates(assignment._id)
      .then((res: any) => { if (alive) setData(unwrap(res)); })
      .catch((e: any) => alive && setError(e?.message ?? 'Could not load candidates'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [assignment._id]);

  const commit = async (teacherId: string, force = false) => {
    setSaving(teacherId);
    setError('');
    try {
      await subApi.assign(assignment._id, teacherId, remarks, force);
      onDone();
    } catch (e: any) {
      const msg = e?.message ?? 'Could not assign';
      // The server refuses an ineligible pick with 409 — offer the override
      // rather than leaving the admin staring at an unexplained failure.
      if (/not available/i.test(msg) && !force) {
        if (await confirmAsync('Not available', `${msg}\n\nAssign anyway?`, 'Assign')) {
          return commit(teacherId, true);
        }
      } else setError(msg);
    } finally { setSaving(''); }
  };

  const current = assignment.substituteTeacher;
  const candidates: any[] = data?.candidates ?? [];

  return (
    <FormModal visible title={`Period ${assignment.periodNumber}`} onClose={onClose}>
      <Text style={s.sheetSub}>
        {assignment.section?.label} · {assignment.subject?.name || '—'}
        {periodTime(assignment) ? ` · ${periodTime(assignment)}` : ''}
      </Text>
      <Text style={s.sheetSub}>Covering for {assignment.originalTeacher?.name}</Text>

      {!!current && (
        <Text style={s.noticeInfo}>
          Currently {current.name}. Picking someone else reassigns the period and notifies both.
        </Text>
      )}
      {!!error && <Text style={s.noticeError}>{error}</Text>}

      <Input label="Instructions (optional)" value={remarks} onChange={setRemarks}
        placeholder="e.g. continue from exercise 4.2" multiline />

      {loading ? <LoaderView /> : !candidates.length ? (
        <Empty icon="close-circle-outline"
          text="No teacher is free for this period. Everyone else is teaching, away, already covering a class, or at their daily limit." />
      ) : (
        <>
          <Text style={s.listHead}>
            {candidates.length} free at this time
            {data?.ineligibleCount ? ` · ${data.ineligibleCount} unavailable` : ''}
          </Text>
          {candidates.map((c: any, i: number) => {
            const isCurrent = current && String(current._id) === String(c.teacher._id);
            return (
              <View key={c.teacher._id} style={[s.candidate, isCurrent && s.candidateCurrent]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <Text style={s.candidateName}>{c.teacher.name}</Text>
                  {/* The top row is what auto-assign would have picked. */}
                  {i === 0 && !isCurrent && <Badge label="Fairest pick" tone="success" />}
                  {isCurrent && <Badge label="Assigned" tone="info" />}
                  {c.subjectMatch && <Badge label="Teaches subject" tone="info" />}
                  {c.sameSection && <Badge label="Knows class" tone="neutral" />}
                </View>
                <WorkloadStrip w={c.workload} />
                <ActionBtn small
                  label={isCurrent ? 'Current' : saving === c.teacher._id ? 'Assigning…' : 'Assign'}
                  tone={isCurrent ? 'neutral' : 'info'}
                  onPress={() => !isCurrent && commit(c.teacher._id)} />
              </View>
            );
          })}
        </>
      )}
    </FormModal>
  );
}

/* ── One period row ────────────────────────────────────────────────────────── */
function PeriodRow({ p, onPick, onCancel }: any) {
  const covered = p.status === 'assigned';
  return (
    <View style={s.periodRow}>
      <View style={s.periodNum}>
        <Text style={s.periodNumText}>P{p.periodNumber}</Text>
        <Text style={s.periodTime}>{periodTime(p) || '—'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.periodClass}>{p.section?.label || '—'}</Text>
        <Text style={s.periodSubject}>{p.subject?.name || '—'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {covered ? (
            <>
              <Ionicons name="person-circle-outline" size={14} color={Colors.success} />
              <Text style={s.subName}>{p.substituteTeacher?.name}</Text>
              {p.assignedVia === 'auto' && <Badge label="Auto" tone="neutral" />}
              {!!p.notifiedAt && <Ionicons name="notifications" size={12} color={Colors.textSecondary} />}
            </>
          ) : (
            <Badge label={p.needsReview ? 'Needs decision' : 'Uncovered'}
              tone={p.needsReview ? 'warning' : 'danger'} />
          )}
        </View>
        {!!p.remarks && <Text style={s.remarks}>“{p.remarks}”</Text>}
      </View>
      <View style={{ gap: 6 }}>
        <ActionBtn small label={covered ? 'Change' : 'Assign'}
          tone={covered ? 'neutral' : 'info'} onPress={() => onPick(p)} />
        {covered && <ActionBtn small label="Cancel" tone="danger" onPress={() => onCancel(p)} />}
      </View>
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function AdminSubstitutionsScreen() {
  const [tab, setTab]         = useState('board');
  const [date, setDate]       = useState(todayIso());
  const [board, setBoard]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError]     = useState('');
  const [running, setRunning] = useState(false);
  const [picking, setPicking] = useState<any>(null);

  // Manual tab
  const [teachers, setTeachers]   = useState<any[]>([]);
  const [teacherId, setTeacherId] = useState('');
  const [detail, setDetail]       = useState<any>(null);

  // Settings tab
  const [settings, setSettings] = useState<any>(null);
  const [flags, setFlags]       = useState<any>({});
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    try {
      const d = unwrap(await subApi.getBoard(date));
      setBoard(d);
      setError('');
    } catch (e: any) {
      if (MODULE_BLOCKED_CODES.includes(e?.data?.code)) setDisabled(true);
      else setError(e?.message ?? 'Failed to load');
    } finally { setLoading(false); setRefreshing(false); }
  }, [date]);

  useEffect(() => { if (tab === 'board') { setLoading(true); load(); } }, [tab, load]);

  useEffect(() => {
    if (tab !== 'manual') return;
    subApi.getSchedulableTeachers(date)
      .then((r: any) => setTeachers(unwrap(r)?.teachers ?? []))
      .catch(() => setTeachers([]));
  }, [tab, date]);

  const loadPeriods = useCallback(async (id: string) => {
    if (!id) { setDetail(null); return; }
    try { setDetail(unwrap(await subApi.getTeacherPeriods(id, date))); }
    catch (e: any) { setError(e?.message ?? 'Could not load periods'); }
  }, [date]);

  useEffect(() => { loadPeriods(teacherId); }, [teacherId, loadPeriods]);

  useEffect(() => {
    if (tab !== 'settings' || settings) return;
    subApi.getSettings()
      .then((r: any) => { const d = unwrap(r); setSettings(d?.settings); setFlags(d?.moduleFlags ?? {}); })
      .catch((e: any) => setError(e?.message ?? 'Could not load settings'));
  }, [tab, settings]);

  const fill = async () => {
    setRunning(true);
    try {
      const r = unwrap(await subApi.runAutoAssign(date, true));
      setBoard(r.board);
      setError('');
    } catch (e: any) { setError(e?.message ?? 'Could not run auto-assign'); }
    finally { setRunning(false); }
  };

  const cancelRow = async (p: any) => {
    const okToGo = await confirmAsync(
      'Cancel substitution',
      `${p.substituteTeacher?.name} will be notified that period ${p.periodNumber} is no longer theirs.`,
      'Cancel it',
    );
    if (!okToGo) return;
    try {
      await subApi.cancel(p._id, 'Cancelled by admin');
      tab === 'manual' ? loadPeriods(teacherId) : load();
    } catch (e: any) { setError(e?.message ?? 'Could not cancel'); }
  };

  const openAndPick = async (p: any) => {
    try {
      const row = unwrap(await subApi.createManual({
        timetableEntryId: p.timetableEntry, originalTeacherId: teacherId, date,
      }));
      await loadPeriods(teacherId);
      setPicking(row);
    } catch (e: any) { setError(e?.message ?? 'Could not open this period'); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      setSettings(unwrap(await subApi.saveSettings(settings)));
      setError('');
    } catch (e: any) { setError(e?.message ?? 'Could not save'); }
    finally { setSaving(false); }
  };

  const teacherOptions = useMemo(
    () => teachers.map((t: any) => ({ label: `${t.name} · ${t.periods}p`, value: t._id })),
    [teachers],
  );

  if (disabled) return (<><Stack.Screen options={{ title: 'Substitutions' }} /><ModuleDisabled /></>);

  const summary = board?.summary ?? {};
  const sources = board?.sources ?? {};
  const manualOnly = board && !sources.attendance && !sources.leave;

  return (
    <>
      <Stack.Screen options={{ title: 'Substitutions' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); tab === 'manual' ? loadPeriods(teacherId) : load(); }}
          tintColor={Colors.primary} />}
      >
        <SegTabs
          tabs={[
            { key: 'board',    label: 'Board' },
            { key: 'manual',   label: 'Manual' },
            { key: 'settings', label: 'Settings' },
          ]}
          active={tab} onChange={setTab}
        />

        {!!error && <Text style={s.noticeError}>{error}</Text>}

        {tab !== 'settings' && <DateBar date={date} setDate={setDate} />}

        {/* ── Board ───────────────────────────────────────────────────────── */}
        {tab === 'board' && (loading ? <LoaderView /> : !board?.hasTimetable ? (
          <Empty icon="calendar-outline"
            text="No published timetable for the active academic year. Publish one before substituting periods." />
        ) : !board.isWorkingDay ? (
          <Empty icon="sunny-outline" text="Not a school day — nothing to cover." />
        ) : (
          <>
            <Text style={s.sourceLine}>
              {manualOnly
                ? 'Attendance and Leave are both off — use the Manual tab'
                : `Detecting from ${[sources.attendance && 'attendance', sources.leave && 'approved leave']
                    .filter(Boolean).join(' and ')}`}
            </Text>

            <StatRow>
              <StatTile label="To cover"  value={summary.total ?? 0}     icon="list"            tone="info" />
              <StatTile label="Covered"   value={summary.assigned ?? 0}  icon="checkmark-circle" tone="success" />
              <StatTile label="Uncovered" value={summary.uncovered ?? 0} icon="alert-circle"    tone="danger" />
            </StatRow>

            <ActionBtn label={running ? 'Working…' : '⚡ Detect & fill uncovered'}
              tone="info" onPress={fill} />

            {!board.absentTeachers?.length ? (
              <Empty icon="happy-outline" text="No teacher is recorded away — nothing to cover today." />
            ) : board.absentTeachers.map((a: any) => (
              <Card key={a.teacher._id}>
                <View style={s.teacherHead}>
                  <Text style={s.teacherName}>{a.teacher.name}</Text>
                  <Badge label={a.label} tone={REASON_TONE[a.reason] ?? 'neutral'} />
                </View>
                <Text style={s.teacherSub}>
                  {a.periods.length} period{a.periods.length === 1 ? '' : 's'} to cover
                </Text>
                {a.needsReview && (
                  <Text style={s.noticeWarn}>
                    Half-day absence — the system cannot tell which half, so nobody was assigned
                    automatically. Cover the periods that apply.
                  </Text>
                )}
                {a.periods.map((p: any) => (
                  <PeriodRow key={p._id} p={p} onPick={setPicking} onCancel={cancelRow} />
                ))}
              </Card>
            ))}
          </>
        ))}

        {/* ── Manual ──────────────────────────────────────────────────────── */}
        {tab === 'manual' && (
          <>
            <Select label="Subject teacher to cover" value={teacherId}
              options={teacherOptions} onChange={setTeacherId}
              placeholder="Select a teacher…" />
            {!detail ? (
              <Empty icon="person-outline"
                text="Pick a teacher whose periods need covering. Works whether or not an absence was recorded." />
            ) : !detail.periods?.length ? (
              <Empty icon="file-tray-outline"
                text={`${detail.teacher.name} has no periods on ${detail.dayOfWeek}.`} />
            ) : (
              <Card>
                <Text style={s.teacherName}>{detail.teacher.name}</Text>
                <Text style={s.teacherSub}>
                  {detail.periods.length} period{detail.periods.length === 1 ? '' : 's'} on {detail.dayOfWeek}
                </Text>
                {detail.periods.map((p: any) => {
                  const row = p.assignment;
                  return (
                    <View key={p.timetableEntry} style={s.periodRow}>
                      <View style={s.periodNum}>
                        <Text style={s.periodNumText}>P{p.periodNumber}</Text>
                        <Text style={s.periodTime}>{periodTime(p) || '—'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.periodClass}>{p.sectionLabel}</Text>
                        <Text style={s.periodSubject}>{p.subjectName || '—'}</Text>
                        <View style={{ marginTop: 4 }}>
                          {row?.substituteTeacher
                            ? <Text style={s.subName}>{row.substituteTeacher.name}</Text>
                            : row ? <Badge label="Uncovered" tone="danger" />
                            : <Text style={s.periodSubject}>No substitution</Text>}
                        </View>
                      </View>
                      <View style={{ gap: 6 }}>
                        {row ? (
                          <>
                            <ActionBtn small label={row.substituteTeacher ? 'Change' : 'Assign'}
                              tone="info" onPress={() => setPicking(row)} />
                            <ActionBtn small label="Cancel" tone="danger" onPress={() => cancelRow(row)} />
                          </>
                        ) : (
                          <ActionBtn small label="Cover" tone="neutral" onPress={() => openAndPick(p)} />
                        )}
                      </View>
                    </View>
                  );
                })}
              </Card>
            )}
          </>
        )}

        {/* ── Settings ────────────────────────────────────────────────────── */}
        {tab === 'settings' && (!settings ? <LoaderView /> : (
          <>
            <Card>
              <Text style={s.sectionTitle}>Automation</Text>
              <Toggle label="Assign substitutes automatically"
                sub="A background sweep covers each period with the fairest available teacher and notifies them."
                value={!!settings.autoAssign}
                onChange={(v) => setSettings((p: any) => ({ ...p, autoAssign: v }))} />
              <Toggle label="Detect from teacher attendance"
                sub={flags.attendance ? 'Absent, Half-Day and Leave records, plus unmarked after the cutoff.'
                  : 'The Attendance module is not enabled for this school.'}
                value={!!settings.useAttendance && !!flags.attendance}
                onChange={(v) => flags.attendance && setSettings((p: any) => ({ ...p, useAttendance: v }))} />
              <Toggle label="Detect from approved leave"
                sub={flags.leave ? 'Any approved leave application covering the date.'
                  : 'The Leave module is not enabled for this school.'}
                value={!!settings.useLeave && !!flags.leave}
                onChange={(v) => flags.leave && setSettings((p: any) => ({ ...p, useLeave: v }))} />
              <Input label="Treat unmarked attendance as absent after (HH:mm)"
                value={settings.unmarkedAbsentAfter ?? '09:30'}
                onChange={(v) => setSettings((p: any) => ({ ...p, unmarkedAbsentAfter: v }))} />
              <Toggle label="Skip periods that already started"
                sub="Nobody can act on a notification that arrives mid-class."
                value={!!settings.skipPeriodsAlreadyStarted}
                onChange={(v) => setSettings((p: any) => ({ ...p, skipPeriodsAlreadyStarted: v }))} />
            </Card>

            <Card>
              <Text style={s.sectionTitle}>Who may be offered</Text>
              <Toggle label="Respect availability blocks"
                sub="The same blocked slots the timetable generator honours."
                value={!!settings.respectAvailabilityBlocks}
                onChange={(v) => setSettings((p: any) => ({ ...p, respectAvailabilityBlocks: v }))} />
              <Toggle label="Respect max periods per day"
                sub="Counts normal periods and substitutions together against the cap."
                value={!!settings.respectDailyPeriodCap}
                onChange={(v) => setSettings((p: any) => ({ ...p, respectDailyPeriodCap: v }))} />
              <Toggle label="Only offer teachers of this subject"
                sub="Off by default — a strict filter can leave periods with nobody at all."
                value={!!settings.requireSubjectMatch}
                onChange={(v) => setSettings((p: any) => ({ ...p, requireSubjectMatch: v }))} />
              <Input label="Max substitutions per teacher per day (0 = no limit)"
                keyboardType="numeric" value={String(settings.maxSubstitutionsPerDay ?? 0)}
                onChange={(v) => setSettings((p: any) => ({ ...p, maxSubstitutionsPerDay: Number(v) || 0 }))} />
            </Card>

            <Card>
              <Text style={s.sectionTitle}>Notifications</Text>
              <Toggle label="Notify the substitute teacher"
                sub="Class, section, subject, date, period, time, the original teacher and any instructions."
                value={!!settings.notifySubstitute}
                onChange={(v) => setSettings((p: any) => ({ ...p, notifySubstitute: v }))} />
              <Toggle label="Tell the absent teacher who is covering"
                value={!!settings.notifyOriginalTeacher}
                onChange={(v) => setSettings((p: any) => ({ ...p, notifyOriginalTeacher: v }))} />
              <Toggle label="Notify on change or cancellation"
                value={!!settings.notifyOnChange}
                onChange={(v) => setSettings((p: any) => ({ ...p, notifyOnChange: v }))} />
              <Toggle label="Also send by email"
                sub="Uses the school's own SMTP settings when configured."
                value={!!settings.emailSubstitute}
                onChange={(v) => setSettings((p: any) => ({ ...p, emailSubstitute: v }))} />
            </Card>

            <ActionBtn label={saving ? 'Saving…' : 'Save settings'} tone="info" onPress={saveSettings} />
          </>
        ))}
      </ScrollView>

      {picking && (
        <CandidateSheet assignment={picking} onClose={() => setPicking(null)}
          onDone={() => {
            setPicking(null);
            tab === 'manual' ? loadPeriods(teacherId) : load();
          }} />
      )}
    </>
  );
}

const s = StyleSheet.create({
  dateBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.md,
  },
  dateBtn: { padding: 6, borderRadius: Radius.sm, backgroundColor: Colors.background },
  dateText: { fontSize: 15, fontWeight: '700', color: Colors.text },
  todayLink: { fontSize: 11, color: Colors.primary, marginTop: 2 },

  sourceLine: { fontSize: 12, color: Colors.textSecondary, marginBottom: Spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },

  teacherHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  teacherName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  teacherSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, marginBottom: Spacing.sm },

  periodRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  periodNum: { width: 52 },
  periodNumText: { fontSize: 14, fontWeight: '700', color: Colors.text },
  periodTime: { fontSize: 10, color: Colors.textSecondary },
  periodClass: { fontSize: 13, fontWeight: '600', color: Colors.text },
  periodSubject: { fontSize: 11, color: Colors.textSecondary },
  subName: { fontSize: 12, fontWeight: '600', color: Colors.text },
  remarks: { fontSize: 11, color: Colors.textSecondary, fontStyle: 'italic', marginTop: 2 },

  sheetSub: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
  listHead: { fontSize: 12, fontWeight: '700', color: Colors.text, marginTop: Spacing.sm, marginBottom: 6 },
  candidate: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    padding: Spacing.sm, marginBottom: 8, gap: 6,
  },
  candidateCurrent: { borderColor: Colors.primary },
  candidateName: { fontSize: 14, fontWeight: '600', color: Colors.text },

  wlWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  wlGroup: { gap: 2 },
  wlDivider: { borderLeftWidth: 1, borderLeftColor: Colors.border, paddingLeft: 10 },
  wlHead: { fontSize: 8, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.4 },
  wlCells: { flexDirection: 'row', gap: 4 },
  wlValue: { fontSize: 13, fontWeight: '700', color: Colors.text },
  wlLabel: { fontSize: 8, color: Colors.textSecondary, textTransform: 'uppercase' },

  noticeInfo: {
    fontSize: 12, color: Colors.text, backgroundColor: Colors.background,
    padding: Spacing.sm, borderRadius: Radius.sm, marginBottom: Spacing.sm,
  },
  noticeWarn: {
    fontSize: 12, color: Colors.warning, backgroundColor: Colors.background,
    padding: Spacing.sm, borderRadius: Radius.sm, marginBottom: Spacing.sm,
  },
  noticeError: {
    fontSize: 12, color: Colors.danger, backgroundColor: Colors.background,
    padding: Spacing.sm, borderRadius: Radius.sm, marginBottom: Spacing.sm,
  },
});
