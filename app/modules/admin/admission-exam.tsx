/**
 * One exam or interview, for the office on the phone (Oct 2026):
 *
 *   Candidates  who can be scheduled (all, or the ones ticked), who is, their
 *               time (a bookable one, or set by hand — full times only with a
 *               tick), room, extra time on an online exam (with the reason),
 *               attendance, admit cards, removing one.
 *   Times       the times families choose themselves: places and room per
 *               time, how late and how often a family may change.
 *   Results     marks per subject (written exams and interviews), absent,
 *               staff-only remarks; submitting, approving and publishing.
 *
 * Setting the exam up (subjects, timed sections, questions, draws, the retake
 * rule) and marking written answers of an online exam stay on the web.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { admin } from '@/api/admission.api';
import { confirmAsync } from '@/components/ui/kit';
import { openAdmissionFile } from '@/components/admission/files';
import { AskSheet, Blocked, BLOCKED, useOffice } from '@/components/admission/office/office';
import {
  Page, Hero, Tabs, Panel, Line, Tag, Pill, Btn, Row, Note, Muted, Sheet, Field, Box, Pick, Tick, Facts, Fact, Blank, BRAND,
  useApi, EXAM_MODE, RESULTS_STATUS, fmtDate, fmtTime, fmtDateTime, errMsg, say, unwrapList,
} from '@/components/admission/parts';
import { EXAM_STATUS } from './admission-exams';

export default function AdmissionExamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: d, loading, error, errorCode, reload } = useApi<any>(() => admin.exam(String(id)), [id]);
  const [tab, setTab] = useState('candidates');
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!d && BLOCKED.includes(errorCode)) return <Page title="Exam"><Blocked message={error} /></Page>;
  const exam = d?.exam;
  const online = exam?.mode === 'online';
  const counts = d?.candidates || {};
  const scheduled = Object.entries(counts).filter(([k]) => k !== 'withdrawn').reduce((s, [, v]) => s + Number(v), 0);
  const schedule = async () => {
    setBusy(true);
    try { await admin.scheduleExam(exam._id); say('Scheduled', 'Now add the candidates.'); reload(); } catch (e) { say('Not scheduled', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Page title={exam?.name || 'Exam'} loading={loading && !d} error={!d ? error : ''} onRetry={reload} onRefresh={reload}>
      {d && exam ? (
        <>
          <Hero tone="violet" eyebrow={`${EXAM_MODE[exam.mode] || exam.mode} · ${fmtDateTime(exam.startsAt)}`} title={exam.name}
            sub={`${scheduled} candidate${scheduled === 1 ? '' : 's'} · ${exam.maxMarks} marks${online ? ` · ${unwrapList(d.questions).length} questions` : ''}`}
            right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Pill tone={EXAM_STATUS[exam.status]?.tone || 'slate'}>{EXAM_STATUS[exam.status]?.label || exam.status}</Pill><Tag map={RESULTS_STATUS} value={exam.resultsStatus} /></View>}>
            <Row>
              {exam.status === 'draft' ? <Btn kind="primary" icon="calendar-outline" disabled={busy || unwrapList(d.readiness).length > 0} onPress={schedule}>Schedule</Btn> : null}
              {['draft', 'scheduled', 'completed'].includes(exam.status) && !['approved', 'published'].includes(exam.resultsStatus) ? <Btn kind="danger" icon="close-circle-outline" onPress={() => setCancelling(true)}>Cancel exam</Btn> : null}
            </Row>
          </Hero>
          {exam.status === 'draft' && unwrapList(d.readiness).length ? <Note tone="amber" icon="alert-circle-outline" title="Before scheduling">{unwrapList(d.readiness).join('; ')}</Note> : null}
          {exam.status === 'cancelled' ? <Note tone="red" icon="close-circle-outline">This exam was cancelled. The families scheduled for it were told.</Note> : null}
          <Tabs value={tab} onChange={setTab} items={[
            { key: 'candidates', label: 'Candidates', count: scheduled },
            ...(!online ? [{ key: 'times', label: 'Times families choose' }] : []),
            { key: 'results', label: 'Results' },
            { key: 'setup', label: 'Setup' },
          ]} />
          <View style={{ height: 12 }} />
          {tab === 'candidates' ? <Candidates exam={exam} reloadExam={reload} /> : null}
          {tab === 'times' ? <Times exam={exam} reload={reload} /> : null}
          {tab === 'results' ? <Results examId={exam._id} onChanged={reload} /> : null}
          {tab === 'setup' ? <Setup exam={exam} /> : null}
          {cancelling ? (
            <AskSheet title="Cancel this exam?" message="Every scheduled family gets an update and an email." label="Reason (families are told)" confirm="Cancel exam" danger
              onClose={() => setCancelling(false)} onConfirm={async (why) => { await admin.cancelExam(exam._id, why); reload(); }} />
          ) : null}
        </>
      ) : null}
    </Page>
  );
}

// ── Candidates ────────────────────────────────────────────────────────────────

function Candidates({ exam, reloadExam }: { exam: any; reloadExam: () => void }) {
  const router = useRouter();
  const { className } = useOffice();
  const board = useApi<any>(() => admin.results(exam._id), [exam._id]);
  const eligible = useApi<any[]>(() => (exam.status === 'scheduled' ? admin.eligible(exam._id) : Promise.resolve({ data: [] })), [exam._id, exam.status]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const [slot, setSlot] = useState<any>(null);
  const reload = () => { board.reload(); eligible.reload(); reloadExam(); };
  const online = exam.mode === 'online';
  const add = async (which: 'all' | 'some') => {
    setBusy(which);
    try { const r: any = await admin.assignCandidates(exam._id, which === 'all' ? 'all' : [...picked]); say(`${r?.data?.added ?? 0} scheduled`, 'The families are told.'); setPicked(new Set()); reload(); }
    catch (e) { say('Not scheduled', errMsg(e)); } finally { setBusy(''); }
  };
  const attend = async (cid: string, present: boolean) => {
    try { await admin.attendance(exam._id, cid, present); board.reload(); } catch (e) { say('Not saved', errMsg(e)); }
  };
  const remove = async (b: any) => {
    if (!(await confirmAsync(`Remove ${b.studentName}?`, 'They are taken off this exam.', 'Remove'))) return;
    try { await admin.removeCandidate(exam._id, b.candidateId); reload(); } catch (e) { say('Not removed', errMsg(e)); }
  };
  const elig = unwrapList(eligible.data);
  const rows = unwrapList(board.data?.board);
  return (
    <>
      {exam.status === 'scheduled' ? (
        <Panel icon="person-add-outline" tone="indigo" title="Can be scheduled" subtitle={`${elig.length} application${elig.length === 1 ? '' : 's'} that meet the exam's conditions`}>
          {elig.map((r, i) => {
            const on = picked.has(String(r._id));
            return (
              <TouchableOpacity key={r._id} onPress={() => { const n = new Set(picked); if (on) n.delete(String(r._id)); else n.add(String(r._id)); setPicked(n); }} style={[st.pick, i === elig.length - 1 && { borderBottomWidth: 0 }]}
                accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={19} color={on ? BRAND : Colors.textSecondary} />
                <View style={{ flex: 1 }}><Text style={st.name}>{r.studentName}</Text><Muted>{`${r.applicationNumber} · ${className(r.class)}`}</Muted></View>
                <Tag value={r.status} />
              </TouchableOpacity>
            );
          })}
          {!elig.length ? <Muted>Nobody waiting to be scheduled. Applications appear here when they reach the statuses the exam allows.</Muted> : (
            <Row>
              <Btn disabled={!!busy || !picked.size} onPress={() => add('some')}>{`Schedule ticked (${picked.size})`}</Btn>
              <Btn kind="primary" disabled={!!busy} onPress={() => add('all')}>Schedule all</Btn>
            </Row>
          )}
        </Panel>
      ) : exam.status === 'draft' ? <Note>Schedule the exam first — then the applications that qualify can be added.</Note> : null}

      <Panel icon="people-outline" tone="violet" title="Scheduled">
        {board.loading && !board.data ? <Muted>Loading…</Muted> : rows.length ? rows.map((b, i) => {
          const done = b.resultStatus && ['approved', 'published'].includes(b.resultStatus);
          return (
            <View key={b.candidateId} style={[st.cand, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={st.candTop}>
                <Text style={st.roll}>{b.rollNumber}</Text>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push({ pathname: '/modules/admin/admission-application' as any, params: { id: b.applicationId } })}>
                  <Text style={st.name}>{b.studentName}</Text>
                  <Muted>{exam.booking?.enabled && !b.slotId && !b.slot ? 'Time not chosen yet' : `${fmtDateTime(b.slot || exam.startsAt)}${b.room ? ` · ${b.room}` : ''}${b.extraMinutes ? ` · +${b.extraMinutes} min` : ''}`}</Muted>
                </TouchableOpacity>
              </View>
              <Row>
                {online ? (
                  b.attemptId ? <Pill tone="green">{String(b.attemptStatus).replace('_', ' ')}</Pill> : <Pill tone={b.candidateStatus === 'absent' ? 'red' : 'slate'}>{b.candidateStatus}</Pill>
                ) : (
                  <>
                    <Btn kind={['present', 'evaluated'].includes(b.candidateStatus) ? 'primary' : 'ghost'} disabled={done} onPress={() => attend(b.candidateId, true)}>Present</Btn>
                    <Btn kind={b.candidateStatus === 'absent' ? 'stop' : 'ghost'} disabled={done} onPress={() => attend(b.candidateId, false)}>Absent</Btn>
                  </>
                )}
                {exam.admitCard?.enabled ? <Btn icon="id-card-outline" onPress={() => openAdmissionFile(admin.admitUrl(exam._id, b.candidateId), `admit-card-${b.rollNumber}.pdf`).catch((e) => say('Could not open it', errMsg(e)))}>Admit card</Btn> : null}
                <Btn icon="time-outline" onPress={() => setSlot(b)}>{online ? 'Extra time' : 'Time and room'}</Btn>
                {!b.attemptId && !b.resultId ? <Btn kind="danger" onPress={() => remove(b)}>Remove</Btn> : null}
              </Row>
            </View>
          );
        }) : <Muted>Nobody scheduled yet.</Muted>}
      </Panel>
      {slot ? <SlotSheet row={slot} exam={exam} onClose={() => setSlot(null)} onDone={reload} /> : null}
    </>
  );
}

/** A candidate's time (a bookable one, or set by hand), room, and — online — extra time. */
function SlotSheet({ row, exam, onClose, onDone }: { row: any; exam: any; onClose: () => void; onDone: () => void }) {
  const times = unwrapList(exam.booking?.slots);
  const taken = useApi<any>(() => (times.length ? admin.examSlots(exam._id) : Promise.resolve({ data: null })), [row.candidateId]);
  const cur = row.slot ? new Date(row.slot) : null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const [f, setF] = useState({
    slotId: row.slotId || '', force: false, room: row.room || '',
    day: cur ? `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}` : '', time: cur ? `${pad(cur.getHours())}:${pad(cur.getMinutes())}` : '',
    extraMinutes: String(row.extraMinutes || 0), extraReason: '',
  });
  const [busy, setBusy] = useState(false);
  const online = exam.mode === 'online';
  const go = async () => {
    setBusy(true);
    try {
      const own = /^\d{4}-\d{2}-\d{2}$/.test(f.day) && /^\d{2}:\d{2}$/.test(f.time) ? new Date(`${f.day}T${f.time}:00`).toISOString() : null;
      const time = online ? {} : f.slotId && f.slotId !== (row.slotId || '') ? { slotId: f.slotId, force: !!f.force } : f.slotId ? {} : { slot: own };
      const extra = online && (Number(f.extraMinutes) || 0) !== (row.extraMinutes || 0) ? { extraMinutes: Number(f.extraMinutes) || 0, extraReason: f.extraReason.trim() } : {};
      await admin.updateCandidate(exam._id, row.candidateId, { ...time, ...extra, room: f.room.trim() });
      onClose(); onDone();
    } catch (e) { say('Not saved', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible icon="time-outline" tone="violet" title={`${row.studentName} — ${row.rollNumber}`} onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="primary" disabled={busy || (online && Number(f.extraMinutes) > 0 && Number(f.extraMinutes) !== (row.extraMinutes || 0) && !f.extraReason.trim())} onPress={go}>Save</Btn></>}>
      {!online && times.length ? (
        <Field label="One of the bookable times" hint="The family is told. Choose “Another time” to set one by hand.">
          <Pick label="Time" value={f.slotId} onChange={(v) => setF({ ...f, slotId: v })}
            options={[{ value: '', label: 'Another time…' }, ...times.map((t: any) => {
              const n = unwrapList(taken.data?.slots).find((x: any) => x.id === t.id)?.taken;
              return { value: t.id, label: `${fmtDateTime(t.startsAt)}${t.room ? ` · ${t.room}` : ''}`, sub: n != null ? `${n} of ${t.capacity} taken` : undefined };
            })]} />
          {f.slotId && f.slotId !== (row.slotId || '') ? <Tick on={f.force} onChange={(v) => setF({ ...f, force: v })} label="Place them even if the time is full" /> : null}
        </Field>
      ) : null}
      {!online && !f.slotId ? (
        <>
          <Field label={exam.mode === 'interview' ? 'Interview day' : 'Own day'} hint="YYYY-MM-DD — leave empty for the exam's time"><Box value={f.day} onChange={(v) => setF({ ...f, day: v })} text="date" /></Field>
          <Field label="Time" hint="HH:MM, 24-hour"><Box value={f.time} onChange={(v) => setF({ ...f, time: v })} text="time" /></Field>
        </>
      ) : null}
      <Field label="Room"><Box value={f.room} onChange={(v) => setF({ ...f, room: v })} maxLength={60} text="code" /></Field>
      {online ? (
        <>
          <Field label="Extra time (minutes)" hint="An accommodation — spread over the sections; it may run past the exam's window"><Box value={f.extraMinutes} onChange={(v) => setF({ ...f, extraMinutes: v })} text="digits" keyboardType="number-pad" /></Field>
          <Field label="Why" required={Number(f.extraMinutes) > 0} hint="For example, a certificate, a writer"><Box value={f.extraReason} onChange={(v) => setF({ ...f, extraReason: v })} maxLength={200} /></Field>
        </>
      ) : null}
    </Sheet>
  );
}

// ── Times families choose ─────────────────────────────────────────────────────

function Times({ exam, reload }: { exam: any; reload: () => void }) {
  const office = useApi<any>(() => admin.examSlots(exam._id), [exam._id, exam.updatedAt]);
  const [b, setB] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const x = exam.booking || {};
    setB({ enabled: !!x.enabled, changeUntilHours: String(x.changeUntilHours ?? 24), maxChanges: String(x.maxChanges ?? 2), slots: unwrapList(x.slots).map((s: any) => ({ ...s, capacity: String(s.capacity) })) });
  }, [exam]);
  if (!b) return null;
  const takenOf = (sid: string) => unwrapList(office.data?.slots).find((x: any) => x.id === sid)?.taken || 0;
  const setSlot = (i: number, patch: any) => setB({ ...b, slots: b.slots.map((s: any, j: number) => (j === i ? { ...s, ...patch } : s)) });
  const save = async () => {
    setBusy(true);
    try {
      await admin.updateExam(exam._id, { booking: { enabled: b.enabled, changeUntilHours: Number(b.changeUntilHours) || 0, maxChanges: Number(b.maxChanges) || 0,
        slots: b.slots.map((s: any) => ({ ...(s.id ? { id: s.id } : {}), startsAt: new Date(s.startsAt).toISOString(), capacity: Number(s.capacity) || 1, room: String(s.room || '').trim() })) } });
      say('Saved'); reload(); office.reload();
    } catch (e) { say('Not saved', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Panel icon="calendar-outline" tone="indigo" title="Times families choose" right={<Btn kind="primary" disabled={busy} onPress={save}>Save</Btn>}>
      <Tick on={b.enabled} onChange={(v) => setB({ ...b, enabled: v })} label="Families choose their own time — each scheduled family picks one of these on its application; the admit card follows the time chosen" />
      <Row>
        <View style={{ flex: 1, minWidth: 140 }}><Field label="Book or change until (hours before)"><Box value={b.changeUntilHours} onChange={(v) => setB({ ...b, changeUntilHours: v })} text="digits" keyboardType="number-pad" /></Field></View>
        <View style={{ flex: 1, minWidth: 140 }}><Field label="Changes a family may make"><Box value={b.maxChanges} onChange={(v) => setB({ ...b, maxChanges: v })} text="digits" keyboardType="number-pad" /></Field></View>
      </Row>
      <Muted>{`Not chosen yet: ${office.data?.unbooked ?? '—'} candidate(s)`}</Muted>
      {b.slots.map((s: any, i: number) => (
        <View key={s.id || s.tempKey} style={st.slot}>
          <View style={{ flex: 1 }}>
            <Text style={st.name}>{`${fmtDate(s.startsAt)} · ${fmtTime(s.startsAt)}`}</Text>
            <Muted>{s.id ? `${takenOf(s.id)} of ${s.capacity} taken` : 'New — save to keep it'}</Muted>
          </View>
          <View style={{ width: 70 }}><Box value={String(s.capacity)} onChange={(v) => setSlot(i, { capacity: v })} text="digits" keyboardType="number-pad" /></View>
          <View style={{ width: 90 }}><Box value={s.room || ''} onChange={(v) => setSlot(i, { room: v })} text="code" placeholder="Room" /></View>
          {!takenOf(s.id) ? <TouchableOpacity onPress={() => setB({ ...b, slots: b.slots.filter((_: any, j: number) => j !== i) })} accessibilityLabel="Remove this time"><Ionicons name="trash-outline" size={18} color={Colors.danger} /></TouchableOpacity> : null}
        </View>
      ))}
      <View style={{ height: 10 }} />
      <Btn icon="add" onPress={() => setAdding(true)}>Add times</Btn>
      {adding ? <AddTimes onClose={() => setAdding(false)} onAdd={(list) => { setB({ ...b, slots: [...b.slots, ...list].sort((x: any, y: any) => +new Date(x.startsAt) - +new Date(y.startsAt)) }); setAdding(false); }} /> : null}
    </Panel>
  );
}

function AddTimes({ onClose, onAdd }: { onClose: () => void; onAdd: (list: any[]) => void }) {
  const t = new Date(Date.now() + 86400000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const [f, setF] = useState({ day: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`, times: '09:00, 09:30, 10:00, 10:30', capacity: '2', room: '' });
  const list = /^\d{4}-\d{2}-\d{2}$/.test(f.day) ? String(f.times).split(/[,\s]+/).filter((x) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(x)).map((x) => {
    const [h, m] = x.split(':').map(Number);
    const dt = new Date(`${f.day}T00:00:00`); dt.setHours(h, m, 0, 0);
    return { startsAt: dt.toISOString(), capacity: String(Number(f.capacity) || 1), room: f.room.trim(), tempKey: `${x}-${Math.random().toString(36).slice(2)}` };
  }).filter((x) => new Date(x.startsAt) > new Date()) : [];
  return (
    <Sheet visible icon="add-circle-outline" tone="indigo" title="Add times" subtitle="Remember to save the times on the exam once they are added." onClose={onClose}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="primary" disabled={!list.length} onPress={() => onAdd(list)}>{`Add ${list.length} time${list.length === 1 ? '' : 's'}`}</Btn></>}>
      <Field label="Day" hint="YYYY-MM-DD"><Box value={f.day} onChange={(v) => setF({ ...f, day: v })} text="date" /></Field>
      <Field label="Times" hint="24-hour, separated by commas"><Box value={f.times} onChange={(v) => setF({ ...f, times: v })} text="any" /></Field>
      <Field label="Places in each"><Box value={f.capacity} onChange={(v) => setF({ ...f, capacity: v })} text="digits" keyboardType="number-pad" /></Field>
      <Field label="Room" hint="Optional"><Box value={f.room} onChange={(v) => setF({ ...f, room: v })} maxLength={60} text="code" /></Field>
    </Sheet>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────

/** Also the marking screen of a teacher who evaluates the exam (app/modules/admission-duty-exam.tsx). */
export function Results({ examId, onChanged }: { examId: string; onChanged: () => void }) {
  const { data, loading, error, reload } = useApi<any>(() => admin.results(examId), [examId]);
  const [rows, setRows] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (!data) return;
    setRows(Object.fromEntries(unwrapList(data.board).map((b) => [b.candidateId, { marks: Object.fromEntries(Object.entries(b.marks || {}).map(([k, v]) => [k, v == null ? '' : String(v)])), absent: !!b.absent, remarks: b.remarks || '' }])));
    setDirty(false);
  }, [data]);
  if (loading && !data) return <Muted>Loading…</Muted>;
  if (error && !data) return <Note tone="red" icon="alert-circle-outline">{error}</Note>;
  const exam = data.exam;
  const locked = ['approved', 'published'].includes(exam.resultsStatus);
  const offline = exam.mode !== 'online';
  const subjects = unwrapList(exam.subjects);
  const board = unwrapList(data.board);
  const outdated = board.filter((b) => b.published?.outdated).length;
  const refresh = () => { reload(); onChanged(); };
  const mark = (cid: string, patch: any) => { setRows((x) => ({ ...x, [cid]: { ...x[cid], ...patch } })); setDirty(true); };
  const saveMarks = async () => {
    setBusy('save');
    try {
      const list = board.filter((b) => !b.resultStatus || !['approved', 'published'].includes(b.resultStatus))
        .map((b) => ({ candidate: b.candidateId, absent: rows[b.candidateId]?.absent, remarks: rows[b.candidateId]?.remarks, marks: Object.fromEntries(Object.entries(rows[b.candidateId]?.marks || {}).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])) }));
      const r: any = await admin.marks(examId, list);
      say(`${r?.data?.saved ?? 0} saved`, unwrapList(r?.data?.problems).slice(0, 4).join('\n'));
      refresh();
    } catch (e) { say('Not saved', errMsg(e)); } finally { setBusy(''); }
  };
  const act = async (kind: 'submit' | 'approve' | 'publish') => {
    const words = { submit: ['Submit the results for approval?', 'An administrator approves them next.'], approve: ['Approve the results?', 'They can then be published.'], publish: [exam.resultsStatus === 'published' ? 'Publish the corrections?' : 'Publish the results now?', 'Families are told and see their results.'] }[kind];
    if (!(await confirmAsync(words[0], words[1], kind === 'publish' ? 'Publish' : kind === 'approve' ? 'Approve' : 'Submit'))) return;
    setBusy(kind);
    try {
      if (kind === 'submit') await admin.submitResults(examId);
      if (kind === 'approve') await admin.approveResults(examId);
      if (kind === 'publish') { const r: any = await admin.publishResults(examId); say(`${r?.data?.published ?? 0} result(s) published`, 'Families are told.'); }
      refresh();
    } catch (e) { say('Not done', errMsg(e)); } finally { setBusy(''); }
  };
  return (
    <>
      <Panel icon="clipboard-outline" tone="violet" title="Results" subtitle={`${board.length} candidate(s)`} right={<Tag map={RESULTS_STATUS} value={exam.resultsStatus} />}>
        {data.panelOnly ? <Note>You see the candidates whose interview panel you sit on. The exam’s evaluators submit the results.</Note> : null}
        {unwrapList(data.missing).length && !locked ? <Note tone="amber" icon="alert-circle-outline" title={`Still to do (${data.missing.length})`}>{unwrapList(data.missing).slice(0, 6).join('; ')}</Note> : null}
        {outdated ? <Note tone="amber">{`${outdated} published result(s) were corrected since — publish again to show families the correction.`}</Note> : null}
        {!offline ? <Note tone="slate" icon="desktop-outline">Marking the written answers of an online exam is done on the web, where each answer is shown in full.</Note> : null}
        <Row>
          {offline && !locked ? <Btn kind="primary" icon="save-outline" disabled={!!busy || !dirty} onPress={saveMarks}>{busy === 'save' ? 'Saving…' : 'Save marks'}</Btn> : null}
          {['none', 'in_progress'].includes(exam.resultsStatus) && exam.approvalRequired && !data.panelOnly ? <Btn disabled={!!busy || dirty} onPress={() => act('submit')}>Submit for approval</Btn> : null}
          {data.isAdmin && (exam.resultsStatus === 'submitted' || (!exam.approvalRequired && ['in_progress', 'submitted'].includes(exam.resultsStatus))) ? <Btn kind="primary" disabled={!!busy || dirty} onPress={() => act('approve')}>Approve results</Btn> : null}
          {data.isAdmin && (exam.resultsStatus === 'approved' || (exam.resultsStatus === 'published' && outdated)) ? <Btn kind="primary" icon="megaphone-outline" disabled={!!busy} onPress={() => act('publish')}>{exam.resultsStatus === 'published' ? 'Publish corrections' : 'Publish results'}</Btn> : null}
        </Row>
      </Panel>
      {board.length ? board.map((b) => {
        const r = rows[b.candidateId] || { marks: {}, absent: false, remarks: '' };
        const off = locked || ['approved', 'published'].includes(b.resultStatus);
        return (
          <Panel key={b.candidateId} icon="person-outline" tone="slate" title={`${b.rollNumber} · ${b.studentName}`} subtitle={b.applicationNumber}
            right={b.passed == null || b.absent ? undefined : <Pill tone={b.passed ? 'green' : 'red'}>{b.passed ? 'Qualified' : 'Not qualified'}</Pill>}>
            {offline ? (
              <>
                <Tick on={!!r.absent} onChange={(v) => !off && mark(b.candidateId, { absent: v })} label="Absent" />
                {!r.absent ? subjects.map((s: any) => (
                  <Field key={s.key} label={`${s.name} (out of ${s.maxMarks})`}>
                    <Box value={r.marks?.[s.key] ?? ''} onChange={(v) => !off && mark(b.candidateId, { marks: { ...r.marks, [s.key]: v } })} text="decimal" keyboardType="decimal-pad" />
                  </Field>
                )) : null}
                <Field label="Remarks" hint="Staff only — never shown to families"><Box value={r.remarks ?? ''} onChange={(v) => !off && mark(b.candidateId, { remarks: v })} maxLength={500} /></Field>
              </>
            ) : (
              <Facts>
                <Fact k="Attempt" v={b.attemptId ? String(b.attemptStatus).replace('_', ' ') : b.candidateStatus === 'absent' ? 'Absent' : 'Not started'} />
                <Fact k="Objective" v={b.autoScore == null ? '—' : String(b.autoScore)} />
                <Fact k="Written" v={Number(b.manualPending) ? `${b.manualPending} to mark` : b.manualScore == null ? '—' : String(b.manualScore)} />
                {b.extraMinutes ? <Fact k="Extra time" v={`+${b.extraMinutes} min`} /> : null}
              </Facts>
            )}
            <Facts>
              <Fact k="Total" v={b.absent ? 'AB' : b.total == null ? '—' : String(b.total)} />
              <Fact k="Percentage" v={b.percentage == null ? '—' : `${b.percentage}%`} />
              {b.grade ? <Fact k="Grade" v={b.grade} /> : null}
            </Facts>
          </Panel>
        );
      }) : <Blank icon="people-outline" title="No candidates yet" body="Schedule candidates first." />}
    </>
  );
}

// ── Setup (read here, changed on the web) ─────────────────────────────────────

function Setup({ exam }: { exam: any }) {
  const subjects = unwrapList(exam.subjects);
  return (
    <>
      <Panel icon="information-circle-outline" tone="slate" title="The exam">
        <Facts>
          <Fact k="Kind" v={EXAM_MODE[exam.mode] || exam.mode} />
          <Fact k="Starts" v={fmtDateTime(exam.startsAt)} />
          {exam.endsAt ? <Fact k="Ends" v={fmtDateTime(exam.endsAt)} /> : null}
          {exam.durationMinutes ? <Fact k="Duration" v={`${exam.durationMinutes} minutes`} /> : null}
          <Fact k="Marks" v={String(exam.maxMarks)} />
          {exam.passMarks != null ? <Fact k="Pass marks" v={String(exam.passMarks)} /> : null}
          {exam.venue?.name ? <Fact k="Venue" v={[exam.venue.name, exam.venue.room, exam.venue.address].filter(Boolean).join(', ')} /> : null}
          {exam.mode === 'online' ? <Fact k="Retake rule" v={({ latest: 'The latest attempt counts', best: 'The best attempt counts', average: 'The average counts' } as any)[exam.settings?.retakeRule] || 'The latest attempt counts'} /> : null}
          {exam.mode === 'online' && exam.settings?.negativeMarking ? <Fact k="Negative marking" v="On" /> : null}
        </Facts>
      </Panel>
      {subjects.length ? (
        <Panel icon="list-outline" tone="slate" title={exam.mode === 'online' && subjects.some((s: any) => s.minutes) ? 'Timed sections' : 'Subjects'}>
          {subjects.map((s: any, i: number) => (
            <Line key={s.key || i} last={i === subjects.length - 1} title={s.name} sub={`${s.maxMarks} marks${s.minutes ? ` · ${s.minutes} minutes` : ''}${s.draw ? ` · ${s.draw} questions drawn per candidate` : ''}`} />
          ))}
        </Panel>
      ) : null}
      <Note tone="slate" icon="desktop-outline">Subjects, timed sections, questions, the draw per candidate and the retake rule are set on the web, under Admissions → Exams.</Note>
    </>
  );
}

const st = StyleSheet.create({
  pick: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  name: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  cand: { gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  candTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roll: { minWidth: 62, fontSize: 12, fontWeight: '800', color: Colors.textSecondary },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },
});
