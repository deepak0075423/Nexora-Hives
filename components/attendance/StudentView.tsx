/**
 * A student's attendance on the phone — the student's own screen and the
 * parent's read the same pieces. The phone half of
 * school-frontend/src/components/attendance/StudentView.jsx.
 *
 * Both read GET …/attendance/overview (school-backend
 * services/studentAttendanceView.js): the month day by day, the month before,
 * the year with a rank and the class average (never another child's figure,
 * because a parent reads this too), the alerts that apply, and requests.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as studentApi from '@/api/student.api';
import {
  BRAND, INK, MUTE, TEXT, LINE, MARKS, statusOf,
  Card, Tiles, Tile, Change, StatusPill, Btn, Callout, Blank, Chips, Avatar,
  MonthGrid, MonthNav, Legend, DayPicker, SplitBar, Meter, Podium, Timeline,
  Field, Box, MarkPick, FilePick, Attachments, Sheet, appendFiles, requestSteps, requestPill,
  addMonths, dateOf, fmtDay, longDay, monthLabel, todayKey, firstName, num, errText, MON,
  type Picked,
} from './parts';

const LABEL: Record<string, string> = { present: 'Present', absent: 'Absent', late: 'Late', 'half-day': 'Half-Day', unmarked: 'Not marked' };
const share = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '0%');

// ── Overview ─────────────────────────────────────────────────────────────────

export function Alerts({ data, who }: { data: any; who: 'student' | 'parent' }) {
  if (!data?.alerts?.length) return null;
  const name = who === 'student' ? 'You have' : `${firstName(data.student?.name)} has`;
  return (
    <>
      {data.alerts.map((a: any) => (a.kind === 'streak' ? (
        <Callout key="streak" tone="red" title={`${name} been absent ${a.count} school days in a row`}
          body={who === 'student' ? 'If a mark is wrong, ask for a correction.' : 'If something is wrong, please get in touch with the class teacher.'} />
      ) : (
        <Callout key="low" tone="amber" title={`Attendance for the year is ${a.percentage}%, below the ${a.threshold}% minimum`}
          body="Every day attended from here raises it." />
      )))}
    </>
  );
}

export function OverviewTiles({ data }: { data: any }) {
  const sm = data?.summary || { marks: {}, days: {} };
  const pm = data?.previous?.marks || {};
  const d = sm.days || {};
  const marked = d.marked || 0;
  const change = sm.marks?.percentage != null && pm.percentage != null ? sm.marks.percentage - pm.percentage : null;
  return (
    <Tiles>
      <Tile icon="stats-chart" tone="indigo" value={sm.marks?.percentage == null ? '—' : `${sm.marks.percentage}%`} label="Attendance"
        note={change == null ? undefined : <Change value={change} />}
        caption={pm.percentage != null ? `${data.previous.label}: ${pm.percentage}%` : 'This month'} />
      <Tile icon="shield-checkmark" solid tone="green" value={d.present || 0} label="Present" note={share(d.present || 0, marked)} />
      <Tile icon="person-remove-outline" tone="red" value={d.absent || 0} label="Absent" note={share(d.absent || 0, marked)} />
      <Tile icon="speedometer-outline" tone="amber" value={d.late || 0} label="Late" note={share(d.late || 0, marked)} />
      <Tile icon="contrast-outline" tone="indigo" value={d.halfDay || 0} label="Half-Day" note={share(d.halfDay || 0, marked)} wide />
    </Tiles>
  );
}

export function MonthCard({ data, day, onDay, onMonth, loading }: {
  data: any; day: string; onDay: (k: string) => void; onMonth: (ym: string) => void; loading?: boolean;
}) {
  const month = data?.month || todayKey().slice(0, 7);
  const thisMonth = todayKey().slice(0, 7);
  const days = (data?.days || []).map((d: any) => ({
    key: d.key, state: d.state,
    tag: undefined,
  }));
  return (
    <Card title="Attendance Calendar" icon="calendar-outline">
      <MonthNav label={monthLabel(month)} onPrev={() => onMonth(addMonths(month, -1))} onNext={() => onMonth(addMonths(month, 1))}
        nextDisabled={month >= thisMonth} onToday={() => onMonth(thisMonth)} todayDisabled={month === thisMonth} />
      <MonthGrid days={days} selected={day} onSelect={onDay} loading={loading} />
      <Legend keys={['present', 'absent', 'late', 'half-day', 'holiday', 'unmarked']} />
    </Card>
  );
}

/** What one day holds and — for the student — a way to ask for it to be corrected. */
export function DayCard({ data, dayKey, who, onRequest }: { data: any; dayKey: string; who: 'student' | 'parent'; onRequest?: (k: string) => void }) {
  const day = (data?.days || []).find((d: any) => d.key === dayKey);
  if (!day) return null;
  const marked = ['present', 'absent', 'late', 'half-day'].includes(day.state);
  const canAsk = who === 'student' && marked && dayKey >= (data?.canRequestFrom || '') && dayKey <= todayKey();
  const name = who === 'student' ? 'you were' : `${firstName(data?.student?.name)} was`;
  return (
    <Card title={longDay(dayKey)}
      right={marked || day.state === 'holiday' || day.state === 'unmarked' ? <StatusPill status={day.state} label={day.state === 'holiday' ? 'Holiday' : undefined} /> : null}>
      {day.registers ? (
        <View>
          {day.registers.map((g: any, i: number) => (
            <View key={g.attendance} style={[v.regRow, i > 0 && v.rowLine]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={v.regName}>{g.subjectName}</Text>
                {g.remarks ? <Text style={v.muted}>{g.remarks}</Text> : null}
              </View>
              <StatusPill status={g.status || 'unmarked'} small />
            </View>
          ))}
          {day.state === 'half-day' ? (
            <Text style={[v.muted, { marginTop: 10 }]}>A day with some subjects missed shows as a half day; each subject counts on its own towards the percentage.</Text>
          ) : null}
        </View>
      ) : marked ? (
        <Text style={v.body}>
          Marked <Text style={{ fontWeight: '700', color: statusOf(day.state).fg }}>{LABEL[day.state].toLowerCase()}</Text>
          {day.remarks ? <Text style={v.muted}> — {day.remarks}</Text> : null}
        </Text>
      ) : day.state === 'holiday' ? (
        <Text style={v.body}>A school holiday{day.label ? ` — ${day.label}` : ''}. Attendance is not taken.</Text>
      ) : day.state === 'unmarked' ? (
        <Text style={v.body}>{day.registerTaken ? `The register was taken but ${name} not on it. Please tell the class teacher.` : 'No attendance was recorded for this day.'}</Text>
      ) : (
        <Text style={v.muted}>Nothing to show for this day yet.</Text>
      )}
      {who === 'student' && marked ? (
        <View style={{ marginTop: 12 }}>
          <Btn label="Request Correction" icon="create-outline" kind="soft" disabled={!canAsk} onPress={() => onRequest?.(dayKey)} />
          {!canAsk ? <Text style={[v.muted, { marginTop: 6, textAlign: 'center' }]}>Corrections can be asked for within the last month.</Text> : null}
        </View>
      ) : null}
    </Card>
  );
}

export function ThisMonthCard({ data }: { data: any }) {
  const d = data?.summary?.days || {};
  return (
    <Card title="This Month" sub={data?.label} icon="pie-chart-outline"
      right={<Text style={v.bigPct}>{data?.summary?.marks?.percentage == null ? '—' : `${data.summary.marks.percentage}%`}</Text>}>
      <SplitBar parts={[
        { key: 'present', label: 'Present', n: d.present || 0 },
        { key: 'absent', label: 'Absent', n: d.absent || 0 },
        { key: 'late', label: 'Late', n: d.late || 0 },
        { key: 'half-day', label: 'Half-Day', n: d.halfDay || 0 },
        { key: 'unmarked', label: 'Not Marked', n: data?.summary?.notMarked || 0 },
      ]} />
    </Card>
  );
}

export function StandingCard({ data }: { data: any }) {
  const y = data?.year;
  const pct = y?.marks?.percentage;
  const min = data?.threshold || 75;
  const rows: [any, string, string][] = [
    ['trophy-outline', 'Rank in class', y?.rank ? `${y.rank} of ${y.of}` : '—'],
    ['people-outline', 'Class average', y?.classAverage == null ? '—' : `${y.classAverage}%`],
    ['calendar-outline', 'Days marked', String(y?.days?.marked ?? 0)],
    ['contrast-outline', 'Half days', String(y?.days?.halfDay ?? 0)],
  ];
  return (
    <Card title="This Year" icon="ribbon-outline" right={y?.label ? <Text style={v.chip}>{y.label}</Text> : null}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={[v.yearPct, { color: pct == null ? TEXT : pct >= min ? '#16A34A' : '#DC2626' }]}>{pct == null ? '—' : `${pct}%`}</Text>
        <Text style={v.muted}>attendance so far</Text>
      </View>
      <Meter value={pct} mark={min} />
      {rows.map(([icon, k, val]) => (
        <View key={k} style={[v.factRow, v.rowLine]}>
          <Ionicons name={icon} size={16} color={MUTE} />
          <Text style={v.factKey}>{k}</Text>
          <Text style={v.factVal}>{val}</Text>
        </View>
      ))}
    </Card>
  );
}

export function InsightCard({ data, who }: { data: any; who: 'student' | 'parent' }) {
  const now = data?.summary?.marks?.percentage;
  const before = data?.previous?.marks?.percentage;
  const subject = who === 'student' ? 'You are' : `${firstName(data?.student?.name)} is`;
  let tone: 'good' | 'bad' | 'flat' = 'flat'; let text = '';
  if (now == null) text = 'Nothing has been marked this month yet.';
  else if (before == null) text = `${now}% this month — there is no ${data?.previous?.label || 'earlier month'} to compare with.`;
  else if (now > before) { tone = 'good'; text = `${subject} ${now - before}% more regular than last month.`; }
  else if (now < before) { tone = 'bad'; text = `${subject} ${before - now}% less regular than last month.`; }
  else text = 'Steady — the same as last month.';
  const c = tone === 'good' ? ['#F2FCF6', '#D9F5E3', '#16A34A'] : tone === 'bad' ? ['#FFF7F7', '#FDE2E2', '#DC2626'] : ['#fff', LINE, BRAND];
  return (
    <View style={[v.insight, { backgroundColor: c[0], borderColor: c[1] }]}>
      <Ionicons name={tone === 'bad' ? 'trending-down' : tone === 'good' ? 'trending-up' : 'analytics-outline'} size={24} color={c[2]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={v.insightTitle}>Attendance Insights</Text>
        <Text style={v.body}>{text}</Text>
      </View>
    </View>
  );
}

export function RecentRequests({ data, onViewAll }: { data: any; onViewAll: () => void }) {
  const list = data?.requests?.recent || [];
  return (
    <Card title="Correction Requests" icon="time-outline"
      right={<TouchableOpacity onPress={onViewAll} accessibilityLabel="View all requests"><Text style={v.link}>View All</Text></TouchableOpacity>}>
      {list.length === 0 ? <Text style={v.muted}>No correction requests.</Text> : list.map((r: any, i: number) => (
        <TouchableOpacity key={r._id} style={[v.reqRow, i > 0 && v.rowLine]} onPress={onViewAll}>
          <DateTile date={r.date} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={v.reqTitle} numberOfLines={1}>{LABEL[r.currentStatus || 'unmarked']} → {LABEL[r.requestedStatus]}</Text>
            <Text style={v.muted} numberOfLines={1}>{r.subject ? `${r.subject.name} · ` : ''}{r.reason}</Text>
          </View>
          <StatusPill status={requestPill(r)} small />
        </TouchableOpacity>
      ))}
    </Card>
  );
}

export function DateTile({ date }: { date: string }) {
  const d = dateOf(date);
  return (
    <View style={v.dateTile}>
      <Text style={v.dateTileDay}>{String(d.getDate()).padStart(2, '0')}</Text>
      <Text style={v.dateTileMon}>{MON[d.getMonth()]}</Text>
    </View>
  );
}

/** The whole Overview tab. */
export function OverviewBody({ data, who, day, onDay, onMonth, onRequest, onRequests, loading }: {
  data: any; who: 'student' | 'parent'; day: string; onDay: (k: string) => void; onMonth: (ym: string) => void;
  onRequest?: (k: string) => void; onRequests: () => void; loading?: boolean;
}) {
  return (
    <View>
      <Alerts data={data} who={who} />
      <OverviewTiles data={data} />
      <MonthCard data={data} day={day} onDay={onDay} onMonth={onMonth} loading={loading} />
      <DayCard data={data} dayKey={day} who={who} onRequest={onRequest} />
      <ThisMonthCard data={data} />
      <StandingCard data={data} />
      <InsightCard data={data} who={who} />
      <RecentRequests data={data} onViewAll={onRequests} />
    </View>
  );
}

// ── Class ranking (the student's own section) ────────────────────────────────

export function RankingBody({ data, me, unit }: { data: any; me?: string; unit: string }) {
  const rows = useMemo(() => (data?.ranking || []).map((r: any) => ({ ...r, attended: r.present })), [data]);
  if (!rows.length) return <Card><Blank icon="trophy-outline" title="No ranking yet" body="You are not in a section this year, or attendance has not been taken." /></Card>;
  const mine = rows.find((r: any) => String(r.student._id) === String(me));
  const marked = rows.filter((r: any) => r.total > 0);
  const totals = marked.reduce((a: any, r: any) => ({ p: a.p + r.present, t: a.t + r.total }), { p: 0, t: 0 });
  const average = totals.t ? Math.round((totals.p / totals.t) * 100) : null;
  const above = mine?.total && average != null ? mine.percentage >= average : null;
  return (
    <View>
      <Tiles>
        <Tile icon="trophy-outline" tone="amber" value={mine?.total ? `#${mine.rank}` : '—'} label="My Rank" caption={`of ${rows.length} students`} />
        <Tile icon="stats-chart" tone="indigo" value={mine?.total ? `${mine.percentage}%` : '—'} label="My Attendance"
          caption={mine?.total ? `${num(mine.present)}/${mine.total} ${unit}` : 'Nothing marked yet'}
          captionTone={mine?.total ? (mine.percentage >= 75 ? 'green' : 'red') : undefined} />
        <Tile icon="people-outline" tone="green" value={average == null ? '—' : `${average}%`} label="Class Average"
          caption={above == null ? 'This academic year' : above ? 'You are above it' : 'You are below it'}
          captionTone={above == null ? undefined : above ? 'green' : 'red'} />
        <Tile icon="contrast-outline" tone="red" value={mine?.halfDay ?? 0} label="My Half Days" caption="Each counts ½" />
      </Tiles>
      <Card title="Top 3 Students" sub="This academic year" icon="trophy" iconTone="gold">
        {marked.length ? <Podium top={marked.slice(0, 3)} unit={unit} /> : <Blank icon="trophy-outline" title="Nothing marked yet" body="The podium fills as registers are taken." />}
      </Card>
      <Card title="Complete Class Ranking" sub="Ranked by attendance percentage" icon="list" flush>
        {rows.map((r: any, i: number) => {
          const self = String(r.student._id) === String(me);
          return (
            <View key={r.student._id} style={[v.rankRow, i > 0 && v.rowLine, self && v.rankMe]}>
              <Text style={[v.rankNo, r.total && r.rank <= 3 && { color: '#F59E0B' }]}>{r.total ? r.rank : '—'}</Text>
              <Avatar name={r.student.name} size={32} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[v.rankName, self && { fontWeight: '800' }]} numberOfLines={1}>{r.student.name}</Text>
                  {self ? <Text style={v.you}>You</Text> : null}
                </View>
                <Text style={v.muted}>Roll {r.student.rollNumber || '—'} · {num(r.present)}/{r.total}{r.halfDay ? ` · ${r.halfDay} half` : ''}</Text>
              </View>
              <Pct value={r.total ? r.percentage : null} />
            </View>
          );
        })}
      </Card>
    </View>
  );
}

export function Pct({ value }: { value?: number | null }) {
  const c = value == null ? ['#F1F5F9', '#64748B'] : value >= 90 ? ['#DCFCE7', '#16A34A'] : value >= 75 ? ['#DBEAFE', '#2563EB'] : ['#FEE2E2', '#DC2626'];
  return <Text style={[v.pct, { backgroundColor: c[0], color: c[1] }]}>{value == null ? '—' : `${value}%`}</Text>;
}

// ── Requests ─────────────────────────────────────────────────────────────────

export function RequestTiles({ requests }: { requests: any[] }) {
  const n = (st: string) => requests.filter((r) => r.status === st).length;
  const all = requests.length;
  const p = (x: number) => (all ? `${Math.round((x / all) * 100)}%` : '0%');
  return (
    <Tiles>
      <Tile icon="document-text-outline" tone="indigo" value={all} label="Total Requests" caption="All time" />
      <Tile icon="checkmark-circle" solid tone="green" value={n('approved')} label="Approved" note={p(n('approved'))} />
      <Tile icon="time-outline" tone="amber" value={n('pending')} label="Pending" note={p(n('pending'))} />
      <Tile icon="close-circle-outline" tone="red" value={n('rejected')} label="Rejected" note={p(n('rejected'))} />
    </Tiles>
  );
}

export function RequestCard({ request: r, who, name, onReply, onError }: {
  request: any; who: 'student' | 'parent'; name?: string;
  onReply?: (r: any, text: string, files: Picked[]) => Promise<void>; onError?: (m: string) => void;
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const question = [...(r.history || [])].reverse().find((h: any) => h.event === 'info_requested');
  const steps = requestSteps(r, who === 'student' ? 'student-view' : 'parent-view');
  const shown = all ? steps : steps.slice(-3);
  const decisionMessage = (r.history || []).some((h: any) => h.message && h.message === r.teacherRemarks);

  const send = async () => {
    if (!text.trim() && !files.length) { onError?.('Write a reply or attach a file'); return; }
    setBusy(true);
    try { await onReply?.(r, text.trim(), files); setText(''); setFiles([]); }
    catch { /* the screen says why */ }
    finally { setBusy(false); }
  };

  return (
    <View style={[v.rq, r.awaitingReply && v.rqWaiting]}>
      <View style={v.rqHead}>
        <DateTile date={r.date} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <StatusPill status={r.currentStatus || 'unmarked'} small />
            <Ionicons name="arrow-forward" size={13} color="#94A3B8" />
            <StatusPill status={r.requestedStatus} small />
          </View>
          <Text style={[v.muted, { marginTop: 4 }]}>{fmtDay(r.date)}{r.subject ? ` · ${r.subject.name}` : ''}{r.source === 'teacher' ? ' · by the teacher' : ''}</Text>
        </View>
        <StatusPill status={requestPill(r)} small />
      </View>
      <Text style={v.reason}>{r.reason}</Text>
      <Attachments files={r.attachments || []} />
      {r.teacherRemarks && !decisionMessage ? (
        <View style={v.remarks}><Ionicons name="chatbubble-ellipses-outline" size={14} color={MUTE} /><Text style={v.body}><Text style={{ fontWeight: '700' }}>Remarks: </Text>{r.teacherRemarks}</Text></View>
      ) : null}
      <View style={v.trail}>
        <Timeline steps={shown} />
        {steps.length > 3 ? (
          <TouchableOpacity onPress={() => setAll((x) => !x)} style={{ marginTop: 8 }}>
            <Text style={v.link}>{all ? 'Show less' : `Show all ${steps.length} steps`}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {r.awaitingReply && question ? (who === 'student' ? (
        <View style={v.reply}>
          <Text style={v.replyQ}><Text style={{ fontWeight: '800' }}>{question.byName || 'Your teacher'} asked: </Text>{question.message}</Text>
          <Box value={text} onChange={setText} placeholder="Write your reply…" multiline label="Your reply" />
          <View style={{ height: 8 }} />
          <FilePick files={files} onFiles={setFiles} label="Attach a file (optional)" onError={onError} />
          <View style={{ marginTop: 10 }}><Btn label="Send Reply" icon="send" kind="primary" busy={busy} onPress={send} /></View>
        </View>
      ) : (
        <View style={v.replyNote}>
          <Ionicons name="information-circle-outline" size={15} color="#92400E" />
          <Text style={[v.body, { color: '#78350F', flex: 1 }]}>{question.byName || 'The teacher'} asked: “{question.message}” — {firstName(name)} can reply from their own account.</Text>
        </View>
      )) : null}
    </View>
  );
}

export function RequestsBody({ requests, who, name, loading, onReply, onError, emptyBody, wrap }: {
  requests: any[]; who: 'student' | 'parent'; name?: string; loading?: boolean;
  onReply?: (r: any, text: string, files: Picked[]) => Promise<void>; onError?: (m: string) => void; emptyBody: string;
  /** Wraps each card — the screen uses it to let a notification flag one. */
  wrap?: (id: string, card: React.ReactNode) => React.ReactNode;
}) {
  const [status, setStatus] = useState('');
  const count = (st: string) => requests.filter((r) => r.status === st).length;
  const list = status ? requests.filter((r) => r.status === status) : requests;
  return (
    <View>
      <RequestTiles requests={requests} />
      <View style={{ marginBottom: 12 }}>
        <Chips value={status} onChange={setStatus} label="Status" options={[
          { value: '', label: `All (${requests.length})` }, { value: 'pending', label: `Pending (${count('pending')})` },
          { value: 'approved', label: `Approved (${count('approved')})` }, { value: 'rejected', label: `Rejected (${count('rejected')})` },
        ]} />
      </View>
      {loading && !requests.length ? <ActivityIndicator color={BRAND} style={{ marginVertical: 30 }} />
        : list.length === 0 ? <Card><Blank icon="document-text-outline" title={requests.length ? 'Nothing with that status' : 'No correction requests'} body={requests.length ? 'Try another filter.' : emptyBody} /></Card>
        : list.map((r) => {
          const card = <RequestCard key={r._id} request={r} who={who} name={name} onReply={onReply} onError={onError} />;
          return wrap ? <React.Fragment key={r._id}>{wrap(String(r._id), card)}</React.Fragment> : card;
        })}
      <HowItWorks who={who} />
    </View>
  );
}

export function HowItWorks({ who }: { who: 'student' | 'parent' }) {
  const steps: [string, string][] = [
    ['Ask', `${who === 'student' ? 'Pick the day' : 'Your child picks the day'} — within the last month — say what the mark should be and why, and attach any proof.`],
    ['Review', 'The class teacher (or that subject’s teacher) reviews it and may ask a question first.'],
    ['Decision', `Approved corrections change the mark straight away. ${who === 'student' ? 'You and your parents are' : 'You are'} notified at every step.`],
  ];
  return (
    <Card title="How Corrections Work" icon="help-circle-outline">
      {steps.map(([t, b], i) => (
        <View key={t} style={[v.howRow, i > 0 && v.rowLine]}>
          <Text style={v.howN}>{i + 1}</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={v.reqTitle}>{t}</Text>
            <Text style={v.muted}>{b}</Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

// ── Asking for a correction ──────────────────────────────────────────────────

/** Pick the day and register, say what the mark should be and why, attach proof. */
export function CorrectionSheet({ visible, date, minDate, onClose, onSaved }: {
  visible: boolean; date: string; minDate?: string; onClose: () => void; onSaved: () => void;
}) {
  const [day, setDay] = useState(date);
  const [info, setInfo] = useState<any>(null);
  const [loadingDay, setLoadingDay] = useState(false);
  const [register, setRegister] = useState('');
  const [mark, setMark] = useState('');
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (!visible) return;
    setDay(date); setMark(''); setReason(''); setFiles([]); setProblem('');
  }, [visible, date]);

  useEffect(() => {
    if (!visible || !day) { setInfo(null); return undefined; }
    let live = true;
    setLoadingDay(true);
    studentApi.getAttendanceDay({ date: day }).then((res: any) => {
      if (!live) return;
      const d = res?.data ?? res;
      setInfo(d);
      const first = (d?.registers || []).find((g: any) => !g.pending);
      setRegister(first ? String(first.attendance) : '');
      setMark('');
    }).catch(() => live && setInfo(null)).finally(() => live && setLoadingDay(false));
    return () => { live = false; };
  }, [visible, day]);

  const registers: any[] = info?.registers || [];
  const chosen = registers.find((g) => String(g.attendance) === register);

  const go = async () => {
    setProblem('');
    if (!day) return setProblem('Pick the day');
    if (!chosen) return setProblem(registers.length ? 'Choose which register to correct' : 'No attendance was taken on that day');
    if (!mark) return setProblem('Choose what the mark should be');
    if (!reason.trim()) return setProblem('Say why the mark is wrong');
    const body = new FormData();
    body.append('date', day);
    body.append('attendance', register);
    body.append('requestedStatus', mark);
    body.append('reason', reason.trim());
    appendFiles(body, files);
    setBusy(true);
    try { await studentApi.submitCorrection(body); onSaved(); }
    catch (e) { setProblem(errText(e)); }
    finally { setBusy(false); }
  };

  return (
    <Sheet visible={visible} icon="create-outline" title="Request Correction" subtitle="Your class teacher reviews it" onClose={onClose} busy={busy}
      footer={<>
        <Btn label="Cancel" flex onPress={onClose} disabled={busy} />
        <Btn label="Send Request" kind="primary" flex busy={busy} disabled={!chosen} onPress={go} />
      </>}>
      {problem ? <Callout tone="red" body={problem} /> : null}
      <Field label="Day" required hint={day ? `${longDay(day)} · within the last month` : 'Within the last month'}>
        <DayPicker value={day} onChange={setDay} min={minDate} max={todayKey()} />
      </Field>
      {day ? (loadingDay ? <ActivityIndicator color={BRAND} style={{ marginVertical: 12 }} /> : !registers.length ? (
        <Callout tone="warn" body={`No attendance was taken on ${fmtDay(day)}.`} />
      ) : (
        <Field label={registers.length > 1 ? 'Which register' : 'Currently marked'} required>
          {registers.map((g) => {
            const on = String(g.attendance) === register;
            return (
              <TouchableOpacity key={g.attendance} disabled={g.pending} onPress={() => { setRegister(String(g.attendance)); setMark(''); }}
                accessibilityRole="radio" accessibilityState={{ selected: on }}
                style={[v.register, on && v.registerOn, g.pending && { opacity: 0.55 }]}>
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? BRAND : '#94A3B8'} />
                <Text style={v.registerName}>{g.subject?.name || 'Day register'}</Text>
                {g.pending ? <Text style={[v.muted, { color: '#92400E' }]}>Request pending</Text> : <StatusPill status={g.status || 'unmarked'} small />}
              </TouchableOpacity>
            );
          })}
        </Field>
      )) : null}
      {chosen ? (
        <Field label="It should be" required>
          <MarkPick value={mark} onChange={setMark} options={MARKS.filter((m) => m !== chosen.status)} />
        </Field>
      ) : null}
      <Field label="Reason" required>
        <Box value={reason} onChange={setReason} multiline placeholder="e.g. I was in school for the whole day — marked absent by mistake" label="Reason" />
      </Field>
      <FilePick files={files} onFiles={setFiles} onError={setProblem} />
    </Sheet>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const v = StyleSheet.create({
  body: { fontSize: 13.5, color: '#334155', lineHeight: 19 },
  muted: { fontSize: 12, color: MUTE, lineHeight: 16 },
  link: { fontSize: 13, fontWeight: '700', color: BRAND },
  chip: { fontSize: 12, fontWeight: '700', color: BRAND, backgroundColor: '#EEF0FF', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, overflow: 'hidden' },
  rowLine: { borderTopWidth: 1, borderTopColor: '#F1F3F7' },
  regRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  regName: { fontSize: 13.5, fontWeight: '600', color: TEXT },
  bigPct: { fontSize: 20, fontWeight: '800', color: TEXT },
  yearPct: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 38 },
  factKey: { flex: 1, fontSize: 13, color: '#334155' },
  factVal: { fontSize: 13.5, fontWeight: '700', color: TEXT },
  insight: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  insightTitle: { fontSize: 14.5, fontWeight: '700', color: TEXT, marginBottom: 2 },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  reqTitle: { fontSize: 13, fontWeight: '700', color: TEXT },
  dateTile: { width: 42, height: 46, borderRadius: 8, backgroundColor: '#F5F6FF', borderWidth: 1, borderColor: '#E3E6FF', alignItems: 'center', justifyContent: 'center' },
  dateTileDay: { fontSize: 15, fontWeight: '800', color: INK },
  dateTileMon: { fontSize: 10.5, color: MUTE },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  rankMe: { backgroundColor: '#F5F6FF', borderLeftWidth: 3, borderLeftColor: BRAND, paddingLeft: 11 },
  rankNo: { width: 22, fontSize: 13, fontWeight: '700', color: '#334155', textAlign: 'center' },
  rankName: { fontSize: 13.5, fontWeight: '600', color: TEXT, flexShrink: 1 },
  you: { fontSize: 10, fontWeight: '800', color: '#fff', backgroundColor: BRAND, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, overflow: 'hidden' },
  pct: { fontSize: 12.5, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  rq: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: LINE, padding: 14, marginBottom: 12, gap: 10 },
  rqWaiting: { borderColor: '#F8D77A', backgroundColor: '#FFFDF5' },
  rqHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reason: { fontSize: 13.5, color: '#334155', lineHeight: 19 },
  remarks: { flexDirection: 'row', gap: 8, padding: 9, borderRadius: 8, backgroundColor: '#F8FAFC' },
  trail: { borderTopWidth: 1, borderTopColor: '#F1F3F7', paddingTop: 12 },
  reply: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FDEFC8', backgroundColor: '#FFFBEB', gap: 8 },
  replyQ: { fontSize: 13, color: '#78350F', lineHeight: 18 },
  replyNote: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: 8, backgroundColor: '#FFFBEB' },
  howRow: { flexDirection: 'row', gap: 12, paddingVertical: 10 },
  howN: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#EEF0FF', color: BRAND, fontWeight: '800', textAlign: 'center', lineHeight: 26, fontSize: 12.5, overflow: 'hidden' },
  register: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 10, borderWidth: 1, borderColor: LINE, backgroundColor: '#fff', marginBottom: 8 },
  registerOn: { borderColor: BRAND, backgroundColor: '#F5F6FF' },
  registerName: { flex: 1, fontSize: 13.5, fontWeight: '600', color: TEXT },
});
