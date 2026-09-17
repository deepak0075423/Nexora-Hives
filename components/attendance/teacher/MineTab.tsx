/**
 * Teacher → Attendance → My Attendance, on the phone.
 *
 * The teacher's own days: clocking in and out today, the month against the
 * month before, a calendar with the chosen day's punches, regularization
 * requests for a missed punch, and the history. Statuses come from the server
 * (school-backend services/staffAttendanceDays.js): a clock-in is present,
 * approved leave is leave or half-day, a past working day with nothing is absent.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import * as teacherApi from '@/api/teacher.api';
import { FocusRow } from '@/components/FocusHighlight';
import {
  BRAND, MUTE, TEXT, Card, Tiles, Tile, Chips, Change, Btn, Callout, Blank, Loading, StatusPill,
  MonthGrid, MonthNav, Legend, SplitBar, DayPicker, Field, Box, Sheet,
  addDays, addMonths, dateOf, fmtDay, longDay, monthLabel, todayKey, fmtClock, fmtStamp, workedFor, errText,
} from '../parts';

const unwrap = (res: any) => res?.data ?? res;
const monthParams = (ym: string) => ({ month: dateOf(`${ym}-01`).getMonth() + 1, year: dateOf(`${ym}-01`).getFullYear() });
/** Attendance over the days owed: holidays out, a half day counts half. */
const percentOf = (sm: any = {}) => {
  const half = sm['half-day'] || 0;
  const counted = (sm.present || 0) + (sm.absent || 0) + half;
  return counted ? Math.round((((sm.present || 0) + half * 0.5) / counted) * 100) : null;
};
const shareOf = (n: number, sm: any = {}) => {
  const counted = (sm.present || 0) + (sm.absent || 0) + (sm['half-day'] || 0);
  return counted ? Math.round(((n || 0) / counted) * 100) : null;
};
/** A past working day someone could ask to have corrected. */
const canRegularize = (d: any) => d && d.key < todayKey()
  && (d.status === 'absent' || (d.status === 'present' && (!d.checkIn || !d.checkOut)));
const HMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

export default function MineTab({ refreshKey, onBlocked, flash, scrollRef }: {
  refreshKey: number; onBlocked: (e: any) => boolean; scrollRef: React.RefObject<ScrollView | null>;
  flash: { good: (t: string) => void; bad: (t: string) => void };
}) {
  const today = todayKey();
  const { user } = useAuth() as any;
  const schoolName = user?.school?.name || 'School';
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [cur, setCur] = useState<any>(null);
  const [prev, setPrev] = useState<any>(null);
  const [regs, setRegs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState('');
  const [more, setMore] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([
      teacherApi.getMyAttendance(monthParams(month)),
      teacherApi.getMyAttendance(monthParams(addMonths(month, -1))).catch(() => null),
      teacherApi.getMyRegularizations().catch(() => null),
    ]).then(([a, b, c]: any[]) => {
      if (!live) return;
      setCur(unwrap(a)); setPrev(unwrap(b));
      const r = unwrap(c); setRegs(Array.isArray(r) ? r : r?.requests ?? []);
    }).catch((e) => { if (live && !onBlocked(e)) flash.bad(errText(e)); })
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [month, version, refreshKey]);

  // The month in view keeps a day of its own picked.
  useEffect(() => { setSelected(month === today.slice(0, 7) ? today : `${month}-01`); setMore(false); }, [month]);

  const punch = async (dir: 'in' | 'out') => {
    setBusy(true);
    try {
      const res: any = dir === 'in' ? await teacherApi.clockIn() : await teacherApi.clockOut();
      const at = res?.data?.checkOut || res?.data?.checkIn;
      flash.good(`${dir === 'in' ? 'Clocked in' : 'Clocked out'}${at ? ` at ${fmtClock(at)}` : ''}`);
      setMonth(today.slice(0, 7)); setVersion((x) => x + 1);
    } catch (e) { flash.bad(errText(e)); }
    finally { setBusy(false); }
  };

  if (loading && !cur) return <Loading />;

  const sm = cur?.summary || {};
  const psm = prev?.summary || {};
  const days: any[] = cur?.days || [];
  const day = days.find((d) => d.key === selected);
  const t = cur?.today || null;
  const presentPct = percentOf(sm); const presentPrev = percentOf(psm);
  const absentPct = shareOf(sm.absent, sm); const absentPrev = shareOf(psm.absent, psm);
  const notMarked = days.filter((d) => d.status === 'pending').length;
  const pending = regs.filter((r) => r.status === 'pending').length;
  const caption = month === today.slice(0, 7) ? 'This Month' : monthLabel(month);
  const history = days.filter((d) => d.status && d.status !== 'weekend' && d.key <= today && (!status || d.status === status))
    .sort((a, b) => b.key.localeCompare(a.key));

  let insight = '';
  if (presentPct == null) insight = 'Nothing has been counted this month yet.';
  else if (presentPrev == null) insight = `${presentPct}% attendance so far — there is no ${monthLabel(addMonths(month, -1))} to compare with.`;
  else if (presentPct > presentPrev) insight = `You are ${presentPct - presentPrev}% more consistent than last month.`;
  else if (presentPct < presentPrev) insight = `You are ${presentPrev - presentPct}% less consistent than last month.`;
  else insight = 'Steady — the same as last month.';

  return (
    <View style={loading ? { opacity: 0.6 } : null}>
      <Card title="Today" sub={longDay(today)} icon="finger-print"
        right={t?.onLeave ? <StatusPill status="leave" label={t.leaveLabel || 'On leave'} /> : t?.clockedIn ? <StatusPill status="present" /> : <StatusPill status="pending" />}>
        {!t ? <Text style={x.muted}>Your clock is not available right now.</Text> : t.onLeave ? (
          <Text style={x.body}>You are on approved leave today — there is nothing to clock.</Text>
        ) : (
          <>
            <View style={x.punches}>
              <View style={x.punch}><Text style={x.punchKey}>Clock In</Text><Text style={x.punchVal}>{t.checkIn ? fmtClock(t.checkIn) : '—'}</Text></View>
              <View style={x.punch}><Text style={x.punchKey}>Clock Out</Text><Text style={x.punchVal}>{t.checkOut ? fmtClock(t.checkOut) : '—'}</Text></View>
              <View style={x.punch}><Text style={x.punchKey}>Hours</Text><Text style={x.punchVal}>{workedFor(t.checkIn, t.checkOut) || '—'}</Text></View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Btn flex label={t.clockedIn ? 'Clocked In' : 'Clock In'} icon="log-in-outline" kind={t.clockedIn ? 'ghost' : 'primary'}
                disabled={t.clockedIn} busy={busy && !t.clockedIn} onPress={() => punch('in')} />
              <Btn flex label={t.clockedOut ? 'Clocked Out' : 'Clock Out'} icon="log-out-outline" kind={t.clockedIn && !t.clockedOut ? 'primary' : 'ghost'}
                disabled={!t.clockedIn || t.clockedOut} busy={busy && t.clockedIn && !t.clockedOut} onPress={() => punch('out')} />
            </View>
            {t.checkIn ? <Text style={[x.muted, { marginTop: 8 }]}><Ionicons name="location-outline" size={12} /> {schoolName}</Text> : null}
          </>
        )}
      </Card>

      <Tiles>
        <Tile icon="calendar-outline" tone="green" value={sm.present || 0} label="Present" caption={caption}
          note={presentPct != null && presentPrev != null ? <Change value={presentPct - presentPrev} /> : presentPct == null ? undefined : `${presentPct}%`} />
        <Tile icon="person-remove-outline" tone="red" value={sm.absent || 0} label="Absent" caption={absentPct == null ? caption : `${absentPct}% · ${caption}`}
          note={absentPct != null && absentPrev != null ? <Change value={absentPct - absentPrev} good="down" /> : undefined} />
        <Tile icon="airplane-outline" tone="amber" value={sm.leave || 0} label="Leave" caption={caption} />
        <Tile icon="contrast-outline" tone="indigo" value={sm['half-day'] || 0} label="Half-Day" caption={caption} />
      </Tiles>

      <Card title="My Attendance Calendar" icon="calendar-outline">
        <MonthNav label={monthLabel(month)} onPrev={() => setMonth(addMonths(month, -1))} onNext={() => setMonth(addMonths(month, 1))}
          nextDisabled={month >= today.slice(0, 7)} onToday={() => { setMonth(today.slice(0, 7)); setSelected(today); }} todayDisabled={selected === today} />
        <MonthGrid days={days.map((d) => ({ key: d.key, state: d.status === 'pending' ? 'unmarked' : d.status, tag: undefined }))}
          selected={selected} onSelect={setSelected} />
        <Legend keys={['present', 'absent', 'leave', 'half-day', 'holiday']} />
      </Card>

      {day ? (
        <Card title={longDay(day.key)} right={day.status && day.status !== 'weekend' ? <StatusPill status={day.status} label={day.status === 'pending' ? 'Not clocked in' : day.label && day.status !== 'holiday' ? `${statusLabel(day.status)} · ${day.label}` : undefined} /> : day.status === 'weekend' ? <StatusPill status="weekend" label="Weekly off" /> : null}>
          {[['Clock In', day.checkIn ? fmtClock(day.checkIn) : '—'], ['Clock Out', day.checkOut ? fmtClock(day.checkOut) : '—'],
            ['Total Hours', workedFor(day.checkIn, day.checkOut) || '—'], ['Location', day.checkIn ? schoolName : '—']].map(([k, v], i) => (
            <View key={k} style={[x.fact, i > 0 && x.line]}><Text style={x.factKey}>{k}</Text><Text style={x.factVal}>{v}</Text></View>
          ))}
          {day.source === 'regularized' ? <Text style={[x.muted, { marginTop: 8 }]}>Recorded by a regularization{day.remarks ? ` — ${day.remarks}` : ''}.</Text> : null}
          {day.status === 'holiday' && day.label ? <Text style={[x.muted, { marginTop: 8 }]}>{day.label}</Text> : null}
          <View style={{ marginTop: 12 }}>
            <Btn label="Request Regularization" icon="document-text-outline" kind="soft"
              onPress={() => setAsking(canRegularize(day) ? day.key : '')} />
          </View>
        </Card>
      ) : null}

      <Card title="This Month" sub={monthLabel(month)} icon="pie-chart-outline"
        right={<Text style={x.big}>{presentPct == null ? '—' : `${presentPct}%`}</Text>}>
        <SplitBar parts={[
          { key: 'present', label: 'Present', n: sm.present || 0 }, { key: 'absent', label: 'Absent', n: sm.absent || 0 },
          { key: 'leave', label: 'Leave', n: sm.leave || 0 }, { key: 'half-day', label: 'Half-Day', n: sm['half-day'] || 0 },
          { key: 'unmarked', label: 'Not Marked', n: notMarked },
        ]} />
        <Text style={[x.body, { marginTop: 12 }]}>{insight}</Text>
      </Card>

      <Card title="Regularization Requests" sub={pending ? `${pending} waiting for the school office` : 'Missed punches you asked to have recorded'} icon="refresh-outline"
        right={<Btn small label="New" icon="add" kind="soft" onPress={() => setAsking('')} />}>
        {regs.length === 0 ? <Text style={x.muted}>You have not raised any.</Text> : regs.slice(0, more ? regs.length : 4).map((r, i) => (
          <FocusRow key={r._id ?? i} id={r._id} scrollRef={scrollRef}>
            <View style={[x.req, i > 0 && x.line]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={x.reqTitle}>{fmtDay(r.date)}</Text>
                <Text style={x.muted} numberOfLines={2}>
                  {[r.checkIn && `In ${fmtClock(r.checkIn)}`, r.checkOut && `Out ${fmtClock(r.checkOut)}`].filter(Boolean).join(' · ')}{r.reason ? ` — ${r.reason}` : ''}
                </Text>
                {r.adminRemarks ? <Text style={x.muted}>Office: {r.adminRemarks}</Text> : null}
                {r.createdAt ? <Text style={x.muted}>Sent {fmtStamp(r.createdAt)}</Text> : null}
              </View>
              <StatusPill status={r.status === 'pending' ? 'waiting' : r.status} small />
            </View>
          </FocusRow>
        ))}
        {regs.length > 4 ? <Btn small label={more ? 'Show less' : `Show all ${regs.length}`} onPress={() => setMore((m) => !m)} /> : null}
      </Card>

      <Card title="Attendance History" sub={monthLabel(month)} icon="time-outline" flush>
        <View style={{ paddingHorizontal: 14, marginBottom: 6 }}>
          <Chips label="Status" value={status} onChange={setStatus} options={[
            { value: '', label: 'All' }, { value: 'present', label: 'Present' }, { value: 'absent', label: 'Absent' },
            { value: 'leave', label: 'Leave' }, { value: 'half-day', label: 'Half-Day' }, { value: 'holiday', label: 'Holiday' },
          ]} />
        </View>
        {history.length === 0 ? <Blank icon="calendar-outline" title="No records" body={`Nothing matches in ${monthLabel(month)}.`} /> : history.map((d, i) => (
          <View key={d.key} style={[x.hist, i > 0 && x.line]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={x.reqTitle}>{fmtDay(d.key)}</Text>
              <Text style={x.muted} numberOfLines={1}>
                {d.checkIn ? `${fmtClock(d.checkIn)} – ${d.checkOut ? fmtClock(d.checkOut) : '…'}${workedFor(d.checkIn, d.checkOut) ? ` · ${workedFor(d.checkIn, d.checkOut)}` : ''}` : d.label || d.remarks || '—'}
              </Text>
            </View>
            <StatusPill status={d.status} label={d.status === 'pending' ? 'Not in yet' : undefined} small />
          </View>
        ))}
      </Card>

      <RegularizeSheet visible={asking != null} date={asking || ''} onClose={() => setAsking(null)}
        onSaved={() => { setAsking(null); flash.good('Sent to the school office for approval'); setVersion((v) => v + 1); }} />
    </View>
  );
}

const OFF_LABEL: Record<string, string> = { leave: 'Leave', 'half-day': 'Half-day leave', holiday: 'Holiday', weekend: 'A weekly off' };
const statusLabel = (k: string) => ({ present: 'Present', absent: 'Absent', leave: 'Leave', 'half-day': 'Half-Day' } as any)[k] || k;

/** Ask for a missed punch to be recorded. The school office approves it. */
function RegularizeSheet({ visible, date, onClose, onSaved }: { visible: boolean; date: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ date, checkIn: '', checkOut: '', reason: '' });
  const [day, setDay] = useState<any>(null);
  const [loadingDay, setLoadingDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => { if (visible) { setForm({ date, checkIn: '', checkOut: '', reason: '' }); setProblem(''); } }, [visible, date]);
  useEffect(() => {
    if (!visible || !form.date) { setDay(null); return undefined; }
    let live = true;
    setLoadingDay(true);
    teacherApi.getMyAttendance({ from: form.date, to: form.date }).then((res: any) => {
      if (!live) return;
      const d = unwrap(res)?.days?.[0] || null;
      setDay(d);
      setForm((f) => ({ ...f, checkIn: d?.checkIn || '', checkOut: d?.checkOut || '' }));
    }).catch(() => live && setDay(null)).finally(() => live && setLoadingDay(false));
    return () => { live = false; };
  }, [visible, form.date]);

  const blocked = day && ['leave', 'half-day', 'holiday', 'weekend'].includes(day.status);
  const submit = async () => {
    setProblem('');
    if (!form.date) return setProblem('Pick the day');
    if (!form.checkIn && !form.checkOut) return setProblem('Enter the missed clock-in and/or clock-out time');
    if ((form.checkIn && !HMM.test(form.checkIn)) || (form.checkOut && !HMM.test(form.checkOut))) return setProblem('Times are HH:MM, 24-hour — e.g. 08:05 or 15:30');
    if (!form.reason.trim()) return setProblem('Give a reason');
    setSaving(true);
    try { await teacherApi.submitRegularization({ ...form, reason: form.reason.trim() }); onSaved(); }
    catch (e) { setProblem(errText(e)); }
    finally { setSaving(false); }
  };

  return (
    <Sheet visible={visible} icon="document-text-outline" title="Request Regularization" subtitle="Enter only the punch you missed. The school office approves it."
      onClose={onClose} busy={saving}
      footer={<><Btn flex label="Cancel" onPress={onClose} disabled={saving} /><Btn flex kind="primary" label="Send for approval" busy={saving} disabled={!!blocked} onPress={submit} /></>}>
      {problem ? <Callout tone="red" body={problem} /> : null}
      <Field label="Date" required hint={form.date ? longDay(form.date) : undefined}>
        <DayPicker value={form.date} onChange={(k) => setForm((f) => ({ ...f, date: k }))} max={addDays(todayKey(), -1)} />
      </Field>
      {form.date ? (loadingDay ? <ActivityIndicator color={BRAND} style={{ marginBottom: 12 }} /> : day ? (
        <Callout tone={blocked ? 'warn' : 'info'} body={
          day.status === 'present' ? `Recorded: in ${day.checkIn ? fmtClock(day.checkIn) : 'missing'}, out ${day.checkOut ? fmtClock(day.checkOut) : 'missing'}.`
            : day.status === 'absent' ? 'No punches recorded — this day currently counts as absent.'
            : blocked ? `${OFF_LABEL[day.status]}${day.label ? ` (${day.label})` : ''} — there is nothing to regularize.`
            : 'Nothing is owed on this day.'} />
      ) : null) : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field label="Clock-in (HH:MM)"><Box value={form.checkIn} onChange={(v) => setForm((f) => ({ ...f, checkIn: v }))} placeholder="08:05" keyboardType="numbers-and-punctuation" maxLength={5} label="Clock-in time" /></Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Clock-out (HH:MM)"><Box value={form.checkOut} onChange={(v) => setForm((f) => ({ ...f, checkOut: v }))} placeholder="15:30" keyboardType="numbers-and-punctuation" maxLength={5} label="Clock-out time" /></Field>
        </View>
      </View>
      <Field label="Reason" required>
        <Box value={form.reason} onChange={(v) => setForm((f) => ({ ...f, reason: v }))} multiline placeholder="e.g. Was in school but forgot to clock in" label="Reason" />
      </Field>
    </Sheet>
  );
}

const x = StyleSheet.create({
  body: { fontSize: 13.5, color: '#334155', lineHeight: 19 },
  muted: { fontSize: 12, color: MUTE },
  big: { fontSize: 20, fontWeight: '800', color: TEXT },
  punches: { flexDirection: 'row', gap: 8 },
  punch: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: '#F8FAFC' },
  punchKey: { fontSize: 11, color: MUTE },
  punchVal: { fontSize: 15, fontWeight: '700', color: TEXT, marginTop: 2 },
  fact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 },
  factKey: { fontSize: 13, color: '#334155' },
  factVal: { fontSize: 13.5, fontWeight: '700', color: TEXT },
  line: { borderTopWidth: 1, borderTopColor: '#F1F3F7' },
  req: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  reqTitle: { fontSize: 13.5, fontWeight: '700', color: TEXT },
  hist: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
});
