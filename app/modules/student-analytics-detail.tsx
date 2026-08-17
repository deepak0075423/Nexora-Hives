import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as analyticsApi from '@/api/analytics.api';
import {
  unwrap, LoaderView, Empty, Badge, KV, SegTabs, fmtDate, fmtMoney,
} from '@/components/ui/kit';
import {
  VIZ, VizCard, Hero, Meter, StatusSplit, RankBars, MiniColumns,
  toneForPercent, fmtMonth,
} from '@/components/ui/viz';

// The 360° view of one student. Tabs are built from the school's enabled module
// flags — the backend only sends blocks for modules that are switched on.
export default function StudentAnalyticsDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('general');

  const load = useCallback(async () => {
    if (!id) { setLoading(false); setError('No student selected'); return; }
    try {
      setData(unwrap(await analyticsApi.getStudentAnalytics(String(id))));
      setError('');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const modules = data?.modules ?? {};
  const tabs = useMemo(() => ([
    { key: 'general',    label: 'General',     show: true },
    { key: 'attendance', label: 'Attendance',  show: !!modules.attendance },
    { key: 'results',    label: 'Results',     show: !!modules.result },
    { key: 'aptitude',   label: 'Aptitude',    show: !!modules.aptitudeExam },
    { key: 'fees',       label: 'Fees',        show: !!modules.fees },
    { key: 'library',    label: 'Library',     show: !!modules.library },
    { key: 'transport',  label: 'Transport',   show: !!modules.transport },
    { key: 'videos',     label: 'Videos',      show: !!modules.videoLibrary },
    { key: 'documents',  label: 'Assignments', show: !!modules.document },
    { key: 'timetable',  label: 'Timetable',   show: !!modules.timetable },
    { key: 'inventory',  label: 'Inventory',   show: !!modules.inventory },
    { key: 'alerts',     label: 'Alerts',      show: !!modules.notification },
  ].filter(t => t.show).map(({ key, label }) => ({ key, label }))), [modules]);

  if (loading) return (<><Stack.Screen options={{ title: 'Student' }} /><LoaderView /></>);
  if (error || !data?.general) {
    return (<><Stack.Screen options={{ title: 'Student' }} />
      <Empty icon="alert-circle-outline" text={error || 'Student not found'} /></>);
  }

  const g = data.general;

  return (
    <>
      <Stack.Screen options={{ title: g.student.name || 'Student' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* Identity */}
        <View style={s.header}>
          <View style={s.avatar}><Text style={s.avatarText}>{(g.student.name || '?').charAt(0).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{g.student.name}</Text>
            <Text style={s.sub}>
              {`${g.placement.className} ${g.placement.sectionName}`.trim()}
              {g.profile.rollNumber ? ` · Roll ${g.profile.rollNumber}` : ''}
            </Text>
            <View style={s.chips}>
              <Badge label={g.student.isActive ? 'Active' : 'Inactive'} tone={g.student.isActive ? 'success' : 'neutral'} />
              {(data.viewer?.roles ?? []).map((r: string) => <Badge key={r} label={r} tone="info" />)}
            </View>
          </View>
        </View>

        {/* Headline numbers across enabled modules */}
        <View style={s.heroRow}>
          {modules.attendance && (
            <View style={s.heroCell}>
              <Hero value={data.attendance?.percent ?? '--'} unit={data.attendance?.percent != null ? '%' : ''}
                label="Attendance" tone={toneForPercent(data.attendance?.percent)} />
            </View>
          )}
          {modules.result && (
            <View style={s.heroCell}>
              <Hero value={data.results?.summary?.average ?? '--'} unit={data.results?.summary?.average != null ? '%' : ''}
                label="Avg result" tone={toneForPercent(data.results?.summary?.average)} />
            </View>
          )}
          {modules.fees && (
            <View style={s.heroCell}>
              <Hero value={fmtMoney(data.fees?.summary?.balance)} label="Fee balance"
                tone={(data.fees?.summary?.balance ?? 0) > 0 ? 'bad' : 'good'} />
            </View>
          )}
        </View>

        <SegTabs tabs={tabs} active={tab} onChange={setTab} />

        {tab === 'general'    && <GeneralTab g={g} />}
        {tab === 'attendance' && <AttendanceTab a={data.attendance} />}
        {tab === 'results'    && <ResultsTab r={data.results} />}
        {tab === 'aptitude'   && <AptitudeTab a={data.aptitude} />}
        {tab === 'fees'       && <FeesTab f={data.fees} />}
        {tab === 'library'    && <LibraryTab l={data.library} />}
        {tab === 'transport'  && <TransportTab t={data.transport} />}
        {tab === 'videos'     && <VideosTab v={data.videos} />}
        {tab === 'documents'  && <DocumentsTab d={data.documents} />}
        {tab === 'timetable'  && <TimetableTab t={data.timetable} />}
        {tab === 'inventory'  && <InventoryTab i={data.inventory} />}
        {tab === 'alerts'     && <AlertsTab n={data.notifications} />}
      </ScrollView>
    </>
  );
}

// ── Reusable row for the many small lists below ───────────────────────────────
function ListRow({ title, sub, right, tone }: { title: string; sub?: string; right?: string; tone?: string }) {
  return (
    <View style={s.listRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={s.rowSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right ? <Text style={[s.rowRight, tone ? { color: tone } : null]}>{right}</Text> : null}
    </View>
  );
}

const Nothing = ({ text = 'Nothing recorded yet' }: { text?: string }) => (
  <Text style={s.nothing}>{text}</Text>
);

// ── General ───────────────────────────────────────────────────────────────────
function GeneralTab({ g }: any) {
  const p = g.profile;
  const address = [p.address, p.city, p.state, p.pincode, p.country].filter(Boolean).join(', ');
  return (
    <>
      <VizCard title="Personal">
        <KV label="Gender" value={p.gender ? p.gender[0].toUpperCase() + p.gender.slice(1) : '--'} />
        <KV label="Date of birth" value={p.dob ? `${fmtDate(p.dob)}${p.age != null ? ` (${p.age} yrs)` : ''}` : '--'} />
        <KV label="Blood group" value={p.bloodGroup || '--'} />
        <KV label="Religion" value={p.religion || '--'} />
        <KV label="Category" value={p.category || '--'} />
      </VizCard>

      <VizCard title="Contact">
        <KV label="Email" value={g.student.email || '--'} />
        <KV label="Phone" value={g.student.phone || '--'} />
        <KV label="Address" value={address || '--'} />
        <KV label="Last seen" value={g.student.lastSeenAt ? fmtDate(g.student.lastSeenAt) : 'Never signed in'} />
      </VizCard>

      <VizCard title="Enrolment">
        <KV label="Class" value={`${g.placement.className} ${g.placement.sectionName}`.trim() || '--'} />
        <KV label="Roll number" value={p.rollNumber || '--'} />
        <KV label="Admission number" value={p.admissionNumber || '--'} />
        <KV label="Class teacher" value={g.placement.classTeacher?.name || '--'} />
        <KV label="Vice class teacher" value={g.placement.viceClassTeacher?.name || '--'} />
      </VizCard>

      <VizCard title="Parent / guardian">
        {g.parent ? (
          <>
            <KV label="Name" value={g.parent.name} />
            <KV label="Email" value={g.parent.email} />
            <KV label="Phone" value={g.parent.phone || '--'} />
          </>
        ) : <Nothing text="No parent account linked" />}
      </VizCard>

      <VizCard title="Subject teachers">
        {g.placement.subjectTeachers?.length
          ? g.placement.subjectTeachers.map((t: any, i: number) => (
              <KV key={i} label={t.subject || 'Subject'} value={t.teacher || '--'} />))
          : <Nothing text="No subject teachers assigned" />}
      </VizCard>

      {!!g.sectionHistory?.length && (
        <VizCard title="Section history">
          {g.sectionHistory.map((h: any, i: number) => (
            <KV key={i} label={fmtDate(h.date)} value={`${h.from || '--'} → ${h.to || '--'}`} />))}
        </VizCard>
      )}
    </>
  );
}

// ── Attendance ────────────────────────────────────────────────────────────────
function AttendanceTab({ a }: any) {
  if (!a?.tracked) return <VizCard><Nothing text="No attendance marked for this section yet" /></VizCard>;
  const monthly = (a.monthly ?? []).map((m: any) => ({ label: fmtMonth(m.month), value: m.percent }));
  return (
    <>
      <VizCard title="This year" subtitle={`${a.total} sessions marked`}>
        <Hero value={a.percent} unit="%" label="Attendance" tone={toneForPercent(a.percent)}
          sub={a.rank ? `Rank ${a.rank} of ${a.sectionSize} in the section` : null} />
        <View style={{ marginTop: Spacing.md }}>
          <StatusSplit items={[
            { label: 'Present', value: a.present, color: VIZ.good, percent: a.total ? (a.present / a.total) * 100 : 0 },
            { label: 'Late',    value: a.late,    color: VIZ.warn, percent: a.total ? (a.late / a.total) * 100 : 0 },
            { label: 'Absent',  value: a.absent,  color: VIZ.bad,  percent: a.total ? (a.absent / a.total) * 100 : 0 },
          ]} />
        </View>
      </VizCard>

      <VizCard title="Monthly attendance" subtitle="Share of marked days attended, per month">
        <MiniColumns data={monthly} unit="%" />
      </VizCard>

      <VizCard title="Recent days">
        {a.recent?.length
          ? a.recent.map((r: any, i: number) => (
              <ListRow key={i} title={fmtDate(r.date)} sub={r.remarks || undefined}
                right={r.status}
                tone={r.status === 'present' ? VIZ.good : r.status === 'late' ? VIZ.warn : VIZ.bad} />))
          : <Nothing />}
      </VizCard>
    </>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────
function ResultsTab({ r }: any) {
  const sum = r?.summary ?? {};
  const subjects = (r?.subjectAverages ?? []).slice(0, 8).map((x: any) => ({ label: x.subject, value: x.average }));
  const trend = (r?.trend ?? []).filter((t: any) => t.percentage != null)
    .map((t: any) => ({ label: (t.label || '').slice(0, 6), value: t.percentage }));
  return (
    <>
      <VizCard title="Standing" subtitle={`${sum.examsTaken ?? 0} exams · ${sum.testsTaken ?? 0} class tests`}>
        <Hero value={sum.average ?? '--'} unit={sum.average != null ? '%' : ''} label="Average across exams"
          tone={toneForPercent(sum.average)} sub={sum.bestRank ? `Best rank: ${sum.bestRank}` : null} />
        <View style={{ marginTop: Spacing.md }}>
          <KV label="Best exam score" value={sum.best != null ? `${sum.best}%` : '--'} />
          <KV label="Exams failed" value={sum.failedExams ?? 0} />
          <KV label="Strongest subject" value={r?.strongest ? `${r.strongest.subject} · ${r.strongest.average}%` : '--'} />
          <KV label="Weakest subject" value={r?.weakest ? `${r.weakest.subject} · ${r.weakest.average}%` : '--'} />
        </View>
      </VizCard>

      {!!trend.length && (
        <VizCard title="Result trend" subtitle="Percentage per formal exam, oldest first">
          <MiniColumns data={trend} unit="%" />
        </VizCard>
      )}

      <VizCard title="Subject strength" subtitle="Average % per subject across exams and class tests">
        <RankBars data={subjects} max={100} unit="%" />
      </VizCard>

      <VizCard title="Formal exams">
        {r?.exams?.length
          ? r.exams.map((e: any) => (
              <ListRow key={e._id} title={e.title}
                sub={`${fmtDate(e.date)} · ${e.obtained}/${e.max}${e.grade ? ` · ${e.grade}` : ''}${e.rank ? ` · rank ${e.rank}` : ''}`}
                right={`${e.percentage}%`} tone={e.isPassed ? VIZ.good : VIZ.bad} />))
          : <Nothing text="No published exam results" />}
      </VizCard>

      <VizCard title="Class tests">
        {r?.classTests?.length
          ? r.classTests.map((t: any) => (
              <ListRow key={t._id} title={t.title}
                sub={`${t.subject || ''} · ${fmtDate(t.date)}${t.classAvg != null ? ` · class avg ${t.classAvg}` : ''}`}
                right={t.isAbsent ? 'Absent' : `${t.percent}%`}
                tone={t.isAbsent ? Colors.textLight : undefined} />))
          : <Nothing text="No class tests recorded" />}
      </VizCard>
    </>
  );
}

// ── Aptitude ──────────────────────────────────────────────────────────────────
function AptitudeTab({ a }: any) {
  const sum = a?.summary ?? {};
  return (
    <>
      <VizCard title="Aptitude exams">
        <Hero value={sum.average ?? '--'} unit={sum.average != null ? '%' : ''} label="Average score"
          tone={toneForPercent(sum.average)} sub={`${sum.evaluated ?? 0} evaluated of ${sum.attempted ?? 0} attempted`} />
        <View style={{ marginTop: Spacing.md }}>
          <KV label="Best score" value={sum.best != null ? `${sum.best}%` : '--'} />
          <KV label="Submitted" value={sum.submitted ?? 0} />
          <KV label="Integrity violations" value={sum.violations ?? 0} />
        </View>
      </VizCard>

      {!!a?.violationTypes?.length && (
        <VizCard title="Violations by type" subtitle="Anti-cheat events raised during attempts">
          <StatusSplit items={a.violationTypes.map((x: any) => ({
            label: String(x.type).replace(/_/g, ' '), value: x.count, color: VIZ.warn,
            percent: (x.count / Math.max(1, sum.violations ?? 1)) * 100,
          }))} />
        </VizCard>
      )}

      <VizCard title="Exam history">
        {a?.exams?.length
          ? a.exams.map((e: any) => (
              <ListRow key={e._id} title={e.title}
                sub={`${e.subject || ''} · ${fmtDate(e.date)} · ${e.obtained}/${e.max}`}
                right={`${e.percentage}%`} tone={toneForPercent(e.percentage) === 'good' ? VIZ.good : undefined} />))
          : <Nothing text="No aptitude exams taken" />}
      </VizCard>
    </>
  );
}

// ── Fees ──────────────────────────────────────────────────────────────────────
function FeesTab({ f }: any) {
  const sum = f?.summary ?? {};
  const monthly = (f?.monthly ?? []).map((m: any) => ({ label: fmtMonth(m.month), value: m.paid }));
  return (
    <>
      <VizCard title="Fee position" subtitle={sum.structure ? `Structure: ${sum.structure}` : 'No structure assigned'}>
        <Hero value={fmtMoney(sum.balance)} label="Outstanding balance"
          tone={(sum.balance ?? 0) > 0 ? 'bad' : 'good'} />
        <View style={{ marginTop: Spacing.md }}>
          <KV label="Total charged" value={fmtMoney(sum.charged)} />
          <KV label="Total paid" value={fmtMoney(sum.paid)} />
          <KV label="Concession" value={fmtMoney(sum.concession)} />
          <KV label="Fines" value={fmtMoney(sum.fine)} />
          <KV label="Last payment" value={f?.lastPaymentAt ? fmtDate(f.lastPaymentAt) : '--'} />
        </View>
        {sum.charged > 0 && (
          <View style={{ marginTop: Spacing.md }}>
            <Meter value={(sum.paid / Math.max(1, sum.charged)) * 100} label="Collected"
              tone={(sum.balance ?? 0) > 0 ? 'warn' : 'good'}
              right={`${Math.round((sum.paid / Math.max(1, sum.charged)) * 100)}%`} />
          </View>
        )}
      </VizCard>

      {!!monthly.length && (
        <VizCard title="Payments by month" subtitle="Amount credited each month">
          <MiniColumns data={monthly} format={(n) => fmtMoney(n) as string} />
        </VizCard>
      )}

      {!!f?.concessions?.length && (
        <VizCard title="Concessions">
          {f.concessions.map((c: any, i: number) => (
            <ListRow key={i} title={c.name} sub={`${c.type}${c.from ? ` · from ${fmtDate(c.from)}` : ''}`}
              right={c.type === 'percentage' ? `${c.value}%` : fmtMoney(c.value) as string} />))}
        </VizCard>
      )}

      <VizCard title="Payments">
        {f?.payments?.length
          ? f.payments.map((p: any) => (
              <ListRow key={p._id} title={fmtMoney(p.amount) as string}
                sub={`${fmtDate(p.date)}${p.receipt ? ` · ${p.receipt}` : ''} · ${p.mode || ''}`}
                right={p.refunded ? 'refunded' : p.status}
                tone={p.status === 'completed' && !p.refunded ? VIZ.good : VIZ.warn} />))
          : <Nothing text="No payments recorded" />}
      </VizCard>

      <VizCard title="Ledger" subtitle="Most recent entries first">
        {f?.ledger?.length
          ? f.ledger.map((e: any, i: number) => (
              <ListRow key={i} title={e.description}
                sub={`${fmtDate(e.date)}${e.period ? ` · ${e.period}` : ''} · balance ${fmtMoney(e.balance)}`}
                right={`${e.type === 'credit' ? '−' : '+'}${fmtMoney(e.amount)}`}
                tone={e.type === 'credit' ? VIZ.good : undefined} />))
          : <Nothing text="No ledger entries" />}
      </VizCard>
    </>
  );
}

// ── Library ───────────────────────────────────────────────────────────────────
function LibraryTab({ l }: any) {
  const sum = l?.summary ?? {};
  return (
    <>
      <VizCard title="Borrowing" subtitle={`${sum.totalIssued ?? 0} books borrowed all-time`}>
        <Hero value={sum.currentlyOut ?? 0} label="Currently out"
          tone={sum.overdue ? 'bad' : 'good'} sub={`${sum.overdue ?? 0} overdue`} />
        <View style={{ marginTop: Spacing.md }}>
          <KV label="Returned" value={sum.returned ?? 0} />
          <KV label="Returned on time" value={`${sum.onTimeReturns ?? 0} (${sum.punctuality ?? 0}%)`} />
          <KV label="Renewals used" value={sum.renewals ?? 0} />
          <KV label="Active reservations" value={sum.reservations ?? 0} />
          <KV label="Pending fines" value={fmtMoney(sum.finePending)} />
        </View>
        {sum.returned > 0 && (
          <View style={{ marginTop: Spacing.md }}>
            <Meter value={sum.punctuality} label="Return punctuality" right={`${sum.punctuality}%`} />
          </View>
        )}
      </VizCard>

      <VizCard title="Currently borrowed">
        {l?.current?.length
          ? l.current.map((b: any) => (
              <ListRow key={b._id} title={b.title} sub={`${b.author ? `${b.author} · ` : ''}due ${fmtDate(b.dueDate)}`}
                right={b.daysOverdue > 0 ? `${b.daysOverdue}d late` : 'On time'}
                tone={b.daysOverdue > 0 ? VIZ.bad : VIZ.good} />))
          : <Nothing text="No books currently borrowed" />}
      </VizCard>

      <VizCard title="History">
        {l?.history?.length
          ? l.history.map((b: any) => (
              <ListRow key={b._id} title={b.title}
                sub={`${fmtDate(b.issueDate)} → ${b.returnDate ? fmtDate(b.returnDate) : 'not returned'}`}
                right={b.status} tone={b.status === 'returned' ? VIZ.good : VIZ.warn} />))
          : <Nothing text="No borrowing history" />}
      </VizCard>
    </>
  );
}

// ── Transport ─────────────────────────────────────────────────────────────────
function TransportTab({ t }: any) {
  if (!t?.assigned) {
    return (
      <>
        <VizCard><Nothing text="This student is not assigned to a transport route" /></VizCard>
        {!!t?.fees?.invoices && <TransportInvoices fees={t.fees} />}
      </>
    );
  }
  const a = t.assignment;
  return (
    <>
      <VizCard title="Route assignment">
        <KV label="Route" value={`${a.route}${a.routeCode ? ` (${a.routeCode})` : ''}`} />
        <KV label="Vehicle" value={[a.vehicle, a.busName].filter(Boolean).join(' · ') || '--'} />
        <KV label="Pickup stop" value={a.pickupStop || '--'} />
        <KV label="Drop stop" value={a.dropStop || '--'} />
        <KV label="Shift" value={a.shift} />
        <KV label="Seat" value={a.seatNumber || '--'} />
        <KV label="Assigned since" value={fmtDate(a.since)} />
      </VizCard>

      <VizCard title="Bus attendance" subtitle="Last 90 days of trips on this route">
        <Hero value={t.trips.percent ?? '--'} unit={t.trips.percent != null ? '%' : ''} label="Boarding rate"
          tone={toneForPercent(t.trips.percent)} sub={`${t.trips.boarded} of ${t.trips.total} trips`} />
        <View style={{ marginTop: Spacing.md }}>
          <StatusSplit items={[
            { label: 'Boarded', value: t.trips.boarded, color: VIZ.good, percent: t.trips.total ? (t.trips.boarded / t.trips.total) * 100 : 0 },
            { label: 'Absent',  value: t.trips.absent,  color: VIZ.warn, percent: t.trips.total ? (t.trips.absent / t.trips.total) * 100 : 0 },
            { label: 'No show', value: t.trips.noShow,  color: VIZ.bad,  percent: t.trips.total ? (t.trips.noShow / t.trips.total) * 100 : 0 },
          ]} />
        </View>
      </VizCard>

      <VizCard title="Recent trips">
        {t.trips.recent?.length
          ? t.trips.recent.map((x: any, i: number) => (
              <ListRow key={i} title={fmtDate(x.date)} sub={`${x.shift} · ${x.direction}${x.delayMinutes ? ` · ${x.delayMinutes} min late` : ''}`}
                right={x.status}
                tone={['boarded', 'dropped'].includes(x.status) ? VIZ.good : x.status === 'absent' ? VIZ.warn : VIZ.bad} />))
          : <Nothing text="No trip attendance recorded" />}
      </VizCard>

      <TransportInvoices fees={t.fees} />

      {!!t.complaints?.length && (
        <VizCard title="Complaints">
          {t.complaints.map((c: any) => (
            <ListRow key={c._id} title={c.subject} sub={`${c.code} · ${c.category} · ${fmtDate(c.raisedAt)}`}
              right={c.status} tone={['resolved', 'closed'].includes(c.status) ? VIZ.good : VIZ.warn} />))}
        </VizCard>
      )}
    </>
  );
}

function TransportInvoices({ fees }: any) {
  return (
    <VizCard title="Transport fees" subtitle={`${fmtMoney(fees.paid)} paid of ${fmtMoney(fees.billed)} billed`}>
      {fees.list?.length
        ? fees.list.map((i: any) => (
            <ListRow key={i._id} title={i.number || 'Invoice'}
              sub={`${i.period || ''}${i.dueDate ? ` · due ${fmtDate(i.dueDate)}` : ''} · ${fmtMoney(i.paid)} of ${fmtMoney(i.amount)}`}
              right={i.status} tone={i.status === 'paid' ? VIZ.good : i.status === 'overdue' ? VIZ.bad : VIZ.warn} />))
        : <Nothing text="No transport invoices" />}
    </VizCard>
  );
}

// ── Videos ────────────────────────────────────────────────────────────────────
function VideosTab({ v }: any) {
  const sum = v?.summary ?? {};
  return (
    <>
      <VizCard title="Video learning">
        <Hero value={sum.videosCompleted ?? 0} label="Videos completed"
          tone={(sum.completionRate ?? 0) >= 60 ? 'good' : (sum.completionRate ?? 0) >= 30 ? 'warn' : 'bad'}
          sub={`${sum.videosStarted ?? 0} started · ${sum.watchHours ?? 0} h watched`} />
        <View style={{ marginTop: Spacing.md }}>
          <Meter value={sum.completionRate} label="Completion rate" right={`${sum.completionRate ?? 0}%`} />
        </View>
        <View style={{ marginTop: Spacing.md }}>
          <KV label="Assignments received" value={sum.assignments ?? 0} />
          <KV label="Active assignments" value={sum.activeAssignments ?? 0} />
          <KV label="Average progress" value={sum.avgProgress != null ? `${sum.avgProgress}%` : '--'} />
          <KV label="Last watched" value={sum.lastWatchedAt ? fmtDate(sum.lastWatchedAt) : '--'} />
        </View>
      </VizCard>

      <VizCard title="Watch history">
        {v?.recent?.length
          ? v.recent.map((x: any) => (
              <View key={x._id} style={{ marginBottom: Spacing.sm }}>
                <Meter value={x.progress} label={x.title} right={`${x.progress}%`} />
                <Text style={s.rowSub}>{x.watchedMin} min · {x.completed ? 'completed' : 'in progress'} · {fmtDate(x.lastAt)}</Text>
              </View>))
          : <Nothing text="No videos watched yet" />}
      </VizCard>

      <VizCard title="Assignments">
        {v?.assignments?.length
          ? v.assignments.map((x: any) => (
              <ListRow key={x._id} title={x.title}
                sub={`${x.videoCount} video${x.videoCount === 1 ? '' : 's'}${x.dueDate ? ` · due ${fmtDate(x.dueDate)}` : ''}${x.mandatory ? ' · mandatory' : ''}`}
                right={x.status} />))
          : <Nothing text="No video assignments" />}
      </VizCard>
    </>
  );
}

// ── Documents ─────────────────────────────────────────────────────────────────
function DocumentsTab({ d }: any) {
  const sum = d?.summary ?? {};
  return (
    <>
      <VizCard title="Assignment submissions">
        <Hero value={sum.submitted ?? 0} label="Submitted" tone={sum.pending ? 'warn' : 'good'}
          sub={`${sum.pending ?? 0} pending of ${sum.assigned ?? 0} assigned`} />
        <View style={{ marginTop: Spacing.md }}>
          <KV label="Reviewed" value={sum.reviewed ?? 0} />
          <KV label="Submitted late" value={sum.late ?? 0} />
          <KV label="On-time rate" value={`${sum.onTimeRate ?? 0}%`} />
          <KV label="Average marks" value={sum.avgMarks != null ? sum.avgMarks : '--'} />
        </View>
      </VizCard>

      <VizCard title="Pending">
        {d?.pending?.length
          ? d.pending.map((x: any) => (
              <ListRow key={x._id} title={x.title} sub={x.dueDate ? `due ${fmtDate(x.dueDate)}` : undefined}
                right={x.overdue ? 'Overdue' : 'Pending'} tone={x.overdue ? VIZ.bad : VIZ.warn} />))
          : <Nothing text="Nothing pending" />}
      </VizCard>

      <VizCard title="Submissions">
        {d?.submissions?.length
          ? d.submissions.map((x: any) => (
              <ListRow key={x._id} title={x.title}
                sub={`${fmtDate(x.submittedAt)}${x.marks != null ? ` · ${x.marks}${x.totalMarks ? `/${x.totalMarks}` : ''} marks` : ''}`}
                right={x.status} tone={x.status === 'submitted' ? VIZ.good : VIZ.warn} />))
          : <Nothing text="No submissions" />}
      </VizCard>
    </>
  );
}

// ── Timetable ─────────────────────────────────────────────────────────────────
function TimetableTab({ t }: any) {
  if (!t?.hasTimetable) return <VizCard><Nothing text="No timetable published for this section" /></VizCard>;
  return (
    <>
      <VizCard title="Weekly load" subtitle={`${t.periodsPerWeek} periods a week`}>
        <RankBars data={t.subjects.map((x: any) => ({ label: x.subject, value: x.periods }))} unit="" />
      </VizCard>
      <VizCard title="Subjects and teachers">
        {t.subjects.map((x: any) => (
          <ListRow key={x.subject} title={x.subject} sub={(x.teachers ?? []).join(', ') || undefined}
            right={`${x.periods}/wk`} />))}
      </VizCard>
    </>
  );
}

// ── Inventory ─────────────────────────────────────────────────────────────────
function InventoryTab({ i }: any) {
  const sum = i?.summary ?? {};
  return (
    <>
      <VizCard title="Items issued to this student">
        <Hero value={sum.open ?? 0} label="Not yet returned" tone={sum.overdue ? 'bad' : 'good'}
          sub={`${sum.returned ?? 0} returned · ${sum.overdue ?? 0} past return date`} />
      </VizCard>
      <VizCard title="Issue history">
        {i?.items?.length
          ? i.items.map((x: any) => (
              <ListRow key={x._id} title={x.item}
                sub={`Qty ${x.quantity} · issued ${fmtDate(x.issueDate)}${x.expectedReturn ? ` · return by ${fmtDate(x.expectedReturn)}` : ''}`}
                right={String(x.status).replace(/_/g, ' ')}
                tone={x.status === 'returned' ? VIZ.good : VIZ.warn} />))
          : <Nothing text="No items issued" />}
      </VizCard>
    </>
  );
}

// ── Alerts ────────────────────────────────────────────────────────────────────
function AlertsTab({ n }: any) {
  const sum = n?.summary ?? {};
  return (
    <VizCard title="Notifications" subtitle="How reliably this student reads what the school sends">
      <Hero value={sum.received ?? 0} label="Received" tone="accent"
        sub={`${sum.read ?? 0} read · ${sum.unread ?? 0} unread`} />
      <View style={{ marginTop: Spacing.md }}>
        <Meter value={sum.readRate} label="Read rate" right={`${sum.readRate ?? 0}%`} height={10} />
      </View>
    </VizCard>
  );
}

const s = StyleSheet.create({
  header:     { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  avatar:     { width: 48, height: 48, borderRadius: 24, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: VIZ.accent, fontWeight: '700', fontSize: 18 },
  name:       { fontSize: 16, fontWeight: '700', color: Colors.text },
  sub:        { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  chips:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },

  heroRow:  { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  heroCell: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },

  listRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.divider },
  rowTitle: { fontSize: 13, color: Colors.text, fontWeight: '500' },
  rowSub:   { fontSize: 11, color: Colors.textLight, marginTop: 2 },
  rowRight: { fontSize: 12, fontWeight: '700', color: Colors.text, marginLeft: Spacing.sm },
  nothing:  { fontSize: 12, color: Colors.textLight, paddingVertical: Spacing.md, textAlign: 'center' },
});
