/**
 * Teacher → Attendance → Student Corrections, on the phone.
 *
 * Requests on registers this teacher holds (class/vice class teacher: the
 * section; subject teacher: their subjects' registers). Open one to read it —
 * reason, proof, history — then approve, reject, or ask the student for more.
 * A teacher can also correct a mark themselves, with the reason on record.
 *
 * Notifications open ?tab=corrections&focus=<request>; the server answers with
 * the page holding it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as teacherApi from '@/api/teacher.api';
import { FocusRow, useFocusId } from '@/components/FocusHighlight';
import {
  BRAND, MUTE, TEXT, LINE, MARKS, statusOf, Card, Tiles, Tile, Chips, Btn, Callout, Blank, Loading, Avatar, StatusPill,
  MonthNav, Timeline, Attachments, Field, Box, MarkPick, DayPicker, Sheet, requestSteps, requestPill,
  addMonths, fmtDay, longDay, monthLabel, todayKey, errText, plural,
} from '../parts';
import { DateTile } from '../StudentView';

const LIMIT = 10;
const label = (k?: string) => statusOf(k || 'unmarked').label;

export default function CorrectionsTab({ refreshKey, onBlocked, flash, scrollRef }: {
  refreshKey: number; onBlocked: (e: any) => boolean; scrollRef: React.RefObject<ScrollView | null>;
  flash: { good: (t: string) => void; bad: (t: string) => void };
}) {
  const wanted = useFocusId();
  const [focus, setFocus] = useState<string | null>(wanted);
  const [status, setStatus] = useState('');
  const [section, setSection] = useState('');
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const [allMonths, setAllMonths] = useState(!!wanted);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => { const t = setTimeout(() => setSearch(query.trim()), 300); return () => clearTimeout(t); }, [query]);
  useEffect(() => { setPage(1); }, [status, section, month, allMonths, search, version, refreshKey]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    teacherApi.getStudentCorrections({
      status: status || undefined, section: section || undefined, search: search || undefined,
      month: allMonths ? undefined : month, page, limit: LIMIT, focus: focus || undefined,
    }).then((res: any) => {
      if (!live) return;
      const list = Array.isArray(res?.data) ? res.data : [];
      setMeta(res);
      setRows((old) => (page > 1 && !focus ? [...old, ...list] : list));
      if (focus) {
        if (res?.focusFound === false) flash.bad('That request is not on a register you hold');
        setFocus(null);
      }
    }).catch((e) => { if (live && !onBlocked(e)) flash.bad(errText(e)); })
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [status, section, month, allMonths, search, page, version, refreshKey]);

  const counts = meta?.counts || { all: 0, pending: 0, approved: 0, rejected: 0 };
  const sections: any[] = meta?.sections || [];
  const share = (n: number) => (counts.all ? `${Math.round((n / counts.all) * 100)}%` : '0%');
  const refresh = (row?: any) => { setVersion((v) => v + 1); if (row?._id) setOpen((o: any) => (o?._id === row._id ? row : o)); };

  if (loading && !meta) return <Loading />;

  return (
    <View>
      <Tiles>
        <Tile icon="document-text-outline" tone="indigo" value={counts.all} label="Total Requests" caption={allMonths ? 'All months' : monthLabel(month)} />
        <Tile icon="checkmark-circle" solid tone="green" value={counts.approved} label="Approved" note={share(counts.approved)} />
        <Tile icon="time-outline" tone="amber" value={counts.pending} label="Pending" note={share(counts.pending)} />
        <Tile icon="close-circle-outline" tone="red" value={counts.rejected} label="Rejected" note={share(counts.rejected)} />
      </Tiles>

      <View style={{ marginBottom: 12 }}>
        <Btn label="New Correction" icon="add" kind="primary" disabled={!sections.length} onPress={() => setCreating(true)} />
      </View>

      <Card>
        <View style={{ gap: 10 }}>
          <Chips label="Status" value={status} onChange={setStatus} options={[
            { value: '', label: `All (${counts.all})` }, { value: 'pending', label: `Pending (${counts.pending})` },
            { value: 'approved', label: `Approved (${counts.approved})` }, { value: 'rejected', label: `Rejected (${counts.rejected})` },
          ]} />
          {sections.length > 1 ? (
            <Chips label="Section" value={section} onChange={setSection}
              options={[{ value: '', label: 'All classes' }, ...sections.map((x) => ({ value: String(x._id), label: x.label }))]} />
          ) : null}
          {allMonths ? (
            <Btn small label="Showing all months — filter by month" icon="calendar-outline" onPress={() => setAllMonths(false)} />
          ) : (
            <View>
              <MonthNav label={monthLabel(month)} onPrev={() => setMonth(addMonths(month, -1))} onNext={() => setMonth(addMonths(month, 1))}
                nextDisabled={month >= todayKey().slice(0, 7)} />
              <Btn small label="All months" icon="albums-outline" onPress={() => setAllMonths(true)} />
            </View>
          )}
          <View style={c.search}>
            <Ionicons name="search" size={16} color={MUTE} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Search student, roll number or reason" placeholderTextColor="#94A3B8"
              style={c.searchInput} accessibilityLabel="Search requests" />
          </View>
        </View>
      </Card>

      {!sections.length ? (
        <Card><Blank icon="document-text-outline" title="No registers of yours" body="Requests appear here for the registers you take." /></Card>
      ) : rows.length === 0 ? (
        loading ? <Loading /> : <Card><Blank icon="checkmark-done-outline" title="No correction requests" body={search || status ? 'Nothing matches these filters.' : 'Nothing has been asked for in this period.'} /></Card>
      ) : (
        <>
          {rows.map((r) => (
            <FocusRow key={r._id} id={r._id} scrollRef={scrollRef}>
              <TouchableOpacity style={[c.row, r.awaitingReply && c.rowWaiting]} onPress={() => setOpen(r)} activeOpacity={0.8}
                accessibilityLabel={`Request from ${r.student.name}`}>
                <View style={c.rowHead}>
                  <Avatar name={r.student.name} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={c.name} numberOfLines={1}>{r.student.name}</Text>
                    <Text style={c.muted} numberOfLines={1}>Roll {r.student.rollNumber || '—'} · {r.section.label}</Text>
                  </View>
                  <StatusPill status={requestPill(r)} small />
                </View>
                <View style={c.change}>
                  <Text style={c.date}>{fmtDay(r.date)}{r.subject ? ` · ${r.subject.name}` : ''}</Text>
                  <StatusPill status={r.currentStatus} small />
                  <Ionicons name="arrow-forward" size={12} color="#94A3B8" />
                  <StatusPill status={r.requestedStatus} small />
                </View>
                <Text style={c.reason} numberOfLines={2}>{r.reason}</Text>
                {r.attachments?.length ? <Text style={c.muted}><Ionicons name="attach" size={12} /> {plural(r.attachments.length, 'file')}</Text> : null}
              </TouchableOpacity>
            </FocusRow>
          ))}
          {meta?.pages > page ? (
            <Btn label={loading ? 'Loading…' : `Show more (${Math.max(0, meta.total - rows.length)} left)`} disabled={loading}
              onPress={() => setPage((meta?.page || page) + 1)} />
          ) : null}
        </>
      )}

      <DetailSheet row={open} onClose={() => setOpen(null)} flash={flash}
        onDone={(row, msg) => { flash.good(msg); setOpen(null); refresh(row); }} />
      <NewCorrectionSheet visible={creating} sections={sections} mode={meta?.mode || 'day'} onClose={() => setCreating(false)}
        onDone={() => { setCreating(false); flash.good('Mark corrected — the family is told'); refresh(); }} />
    </View>
  );
}

// ── One request ──────────────────────────────────────────────────────────────

const DECISION = {
  approve: { verb: 'Approve', label: 'Remarks (optional)', required: false, done: 'Approved — the mark is updated' },
  reject:  { verb: 'Reject', label: 'Why it is rejected', required: true, done: 'Rejected — the student is told' },
  info:    { verb: 'Send to student', label: 'What do you need from the student?', required: true, done: 'Question sent to the student' },
} as const;

function DetailSheet({ row, onClose, onDone, flash }: {
  row: any; onClose: () => void; onDone: (row: any, msg: string) => void; flash: { bad: (t: string) => void };
}) {
  const [kind, setKind] = useState<keyof typeof DECISION | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => { setKind(null); setText(''); setProblem(''); }, [row?._id]);
  if (!row) return null;
  const pending = row.status === 'pending';

  const go = async () => {
    if (!kind) return;
    const d = DECISION[kind];
    if (d.required && !text.trim()) { setProblem('Please add a note'); return; }
    setBusy(true); setProblem('');
    try {
      const res: any = kind === 'info'
        ? await teacherApi.requestCorrectionInfo(row._id, { message: text.trim() })
        : await teacherApi.reviewCorrection({ id: row._id, status: kind === 'approve' ? 'approved' : 'rejected', remarks: text.trim() });
      onDone(res?.data ?? res, d.done);
    } catch (e) { setProblem(errText(e)); flash.bad(errText(e)); }
    finally { setBusy(false); }
  };

  return (
    <Sheet visible={!!row} icon="document-text-outline" title={row.student.name} subtitle={`Roll ${row.student.rollNumber || '—'} · ${row.section.label}`}
      onClose={onClose} busy={busy}
      footer={pending ? (kind ? (
        <>
          <Btn flex label="Back" onPress={() => { setKind(null); setText(''); setProblem(''); }} disabled={busy} />
          <Btn flex label={DECISION[kind].verb} kind={kind === 'reject' ? 'reject' : kind === 'approve' ? 'approve' : 'primary'} busy={busy} onPress={go} />
        </>
      ) : (
        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn flex label="Approve" icon="checkmark-circle-outline" kind="approve" onPress={() => setKind('approve')} />
            <Btn flex label="Reject" icon="close-circle-outline" kind="reject" onPress={() => setKind('reject')} />
          </View>
          <Btn label="Request More Info" icon="chatbubble-ellipses-outline" kind="soft" onPress={() => setKind('info')} />
        </View>
      )) : <Btn flex label="Close" onPress={onClose} />}>
      {problem ? <Callout tone="red" body={problem} /> : null}
      <Card>
        <View style={c.detailHead}>
          <DateTile date={row.date} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={c.name}>{longDay(row.date)}</Text>
            <Text style={c.muted}>{row.subject ? row.subject.name : 'Day register'}{row.source === 'teacher' ? ' · corrected by a teacher' : ''}</Text>
          </View>
          <StatusPill status={requestPill(row)} />
        </View>
        {[['Current mark', <StatusPill key="c" status={row.currentStatus} small />], ['Requested', <StatusPill key="r" status={row.requestedStatus} small />]].map(([k, v]: any, i) => (
          <View key={k} style={[c.fact, c.line]}><Text style={c.factKey}>{k}</Text><View>{v}</View></View>
        ))}
        <Text style={[c.factKey, { marginTop: 10 }]}>Reason</Text>
        <Text style={c.reasonFull}>{row.reason}</Text>
        {row.attachments?.length ? <><Text style={[c.factKey, { marginTop: 10 }]}>Attachments</Text><Attachments files={row.attachments} /></> : null}
        {row.teacherRemarks ? <Text style={[c.muted, { marginTop: 10 }]}>Remarks: {row.teacherRemarks}</Text> : null}
      </Card>
      <Card title="Activity" icon="time-outline">
        <Timeline steps={requestSteps(row, 'teacher-view')} />
      </Card>
      {kind ? (
        <Card title={kind === 'info' ? 'Request more information' : kind === 'approve' ? 'Approve correction' : 'Reject correction'}>
          <Text style={[c.muted, { marginBottom: 10 }]}>
            {label(row.currentStatus)} → {label(row.requestedStatus)}{kind === 'approve' ? ' — approving writes this mark onto the register.' : ''}
          </Text>
          <Field label={DECISION[kind].label} required={DECISION[kind].required}>
            <Box value={text} onChange={setText} multiline label={DECISION[kind].label}
              placeholder={kind === 'info' ? 'e.g. Please attach the doctor’s note for that day' : ''} />
          </Field>
        </Card>
      ) : null}
    </Sheet>
  );
}

// ── A teacher's own correction ───────────────────────────────────────────────

function NewCorrectionSheet({ visible, sections, mode, onClose, onDone }: {
  visible: boolean; sections: any[]; mode: string; onClose: () => void; onDone: () => void;
}) {
  const [section, setSection] = useState('');
  const [subject, setSubject] = useState('');
  const [date, setDate] = useState(todayKey());
  const [student, setStudent] = useState('');
  const [mark, setMark] = useState('present');
  const [reason, setReason] = useState('');
  const [find, setFind] = useState('');
  const [reg, setReg] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSection(sections[0]?._id ? String(sections[0]._id) : ''); setSubject(''); setDate(todayKey());
    setStudent(''); setMark('present'); setReason(''); setFind(''); setProblem('');
  }, [visible]);

  useEffect(() => {
    if (!visible || !section) return undefined;
    let live = true;
    setLoading(true);
    teacherApi.getAttendance({ section, subject: subject || undefined, date }).then((res: any) => {
      if (!live) return;
      const d = res?.data ?? res;
      setReg(d);
      if (d?.subject?._id && String(d.subject._id) !== subject) setSubject(String(d.subject._id));
    }).catch(() => live && setReg(null)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [visible, section, subject, date]);

  const students: any[] = reg?.students || [];
  const markOf = (id: string) => reg?.records?.find((r: any) => String(r.student) === String(id))?.status || null;
  const was = student ? markOf(student) : null;
  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return students.filter((s) => !q || s.name.toLowerCase().includes(q) || String(s.rollNumber).toLowerCase().includes(q));
  }, [students, find]);

  const go = async () => {
    setProblem('');
    if (!student) return setProblem('Choose a student');
    if (mark === was) return setProblem('Choose a different mark');
    if (!reason.trim()) return setProblem('Give a reason for the correction');
    setBusy(true);
    try {
      await teacherApi.createStudentCorrection({ studentId: student, date, section, subject: subject || undefined, status: mark, reason: reason.trim() });
      onDone();
    } catch (e) { setProblem(errText(e)); }
    finally { setBusy(false); }
  };

  return (
    <Sheet visible={visible} icon="create-outline" title="New Correction" subtitle="Change one student’s mark, with the reason on record"
      onClose={onClose} busy={busy}
      footer={<><Btn flex label="Cancel" onPress={onClose} disabled={busy} /><Btn flex kind="primary" label="Correct mark" busy={busy} disabled={!student || mark === was} onPress={go} /></>}>
      {problem ? <Callout tone="red" body={problem} /> : null}
      {sections.length > 1 ? (
        <Field label="Class" required>
          <Chips label="Class" value={section} onChange={(id) => { setSection(id); setSubject(''); setStudent(''); }}
            options={sections.map((x) => ({ value: String(x._id), label: x.label }))} />
        </Field>
      ) : null}
      <Field label="Date" required hint={longDay(date)}>
        <DayPicker value={date} onChange={(k) => { setDate(k); setStudent(''); }} max={todayKey()} />
      </Field>
      {mode === 'subject' && (reg?.subjects || []).length ? (
        <Field label="Subject register" required>
          <Chips label="Subject" value={subject} onChange={(id) => { setSubject(id); setStudent(''); }}
            options={reg.subjects.map((x: any) => ({ value: String(x._id), label: x.name }))} />
        </Field>
      ) : null}
      <Field label="Student" required hint={student ? `Currently ${label(was).toLowerCase()}` : undefined}>
        <View style={c.search}>
          <Ionicons name="search" size={16} color={MUTE} />
          <TextInput value={find} onChangeText={setFind} placeholder="Find a student" placeholderTextColor="#94A3B8" style={c.searchInput} accessibilityLabel="Find a student" />
        </View>
        <View style={c.pickList}>
          {loading ? <ActivityIndicator color={BRAND} style={{ margin: 16 }} /> : shown.length === 0 ? (
            <Text style={[c.muted, { padding: 12 }]}>{students.length ? 'No student matches' : 'No students in this class'}</Text>
          ) : shown.map((s, i) => {
            const on = String(s._id) === student;
            return (
              <TouchableOpacity key={s._id} style={[c.pick, i > 0 && c.line, on && c.pickOn]} onPress={() => setStudent(String(s._id))}
                accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={s.name}>
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? BRAND : '#94A3B8'} />
                <Text style={c.pickName} numberOfLines={1}>{s.rollNumber ? `${s.rollNumber}. ` : ''}{s.name}</Text>
                <StatusPill status={markOf(s._id) || 'unmarked'} small />
              </TouchableOpacity>
            );
          })}
        </View>
      </Field>
      <Field label="Correct mark" required>
        <MarkPick value={mark} onChange={setMark} options={[...MARKS]} />
      </Field>
      <Field label="Reason" required>
        <Box value={reason} onChange={setReason} multiline placeholder="e.g. Was on a school trip, marked absent by mistake" label="Reason" />
      </Field>
    </Sheet>
  );
}

const c = StyleSheet.create({
  muted: { fontSize: 12, color: MUTE },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 11, borderRadius: 9, borderWidth: 1, borderColor: LINE, backgroundColor: '#fff' },
  searchInput: { flex: 1, fontSize: 13.5, color: TEXT },
  row: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: LINE, padding: 12, marginBottom: 10, gap: 8 },
  rowWaiting: { borderColor: '#F8D77A' },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 14, fontWeight: '700', color: TEXT },
  change: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  date: { fontSize: 12.5, fontWeight: '600', color: '#334155', marginRight: 2 },
  reason: { fontSize: 13, color: '#334155', lineHeight: 18 },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  fact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 38 },
  factKey: { fontSize: 12.5, color: MUTE, fontWeight: '600' },
  line: { borderTopWidth: 1, borderTopColor: '#F1F3F7' },
  reasonFull: { fontSize: 13.5, color: TEXT, lineHeight: 19, marginTop: 3 },
  pickList: { marginTop: 8, borderWidth: 1, borderColor: LINE, borderRadius: 10, backgroundColor: '#fff', overflow: 'hidden' },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  pickOn: { backgroundColor: '#F5F6FF' },
  pickName: { flex: 1, fontSize: 13.5, color: TEXT },
});
