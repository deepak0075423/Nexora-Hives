/**
 * The Medical Room for a teacher, on the phone (Oct 2026) — the web's
 * /teacher/medical. Send a student to the room and follow the request until
 * they are back in class (or sent home); see the medical alerts of the
 * students they teach, with the emergency card where the school allows it;
 * report an injury or an accident.
 *
 * A teacher never sees a student's medical history — only what the room
 * shares with teachers for a child's safety. The server decides that; this
 * screen just shows what comes back.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { Colors } from '@/constants/theme';
import {
  teacherMedMeta, teacherMedOverview, teacherMedStudents, sendToMedicalRoom, withdrawMedRequest,
  teacherMedAlerts, teacherMedEmergency, teacherMedIncidents, teacherReportIncident, teacherEmergencyAccess, myStaffHealth, saveMyStaffHealth,
  safeguardingMe, raiseConcern, myConcerns,
} from '@/api/medical.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { LoaderView, unwrap, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import {
  Head, Tiles, Tile, Tabs, Panel, Note, Blank, Muted, Btn, Sheet, Field, Box, Pick, Pill,
  REQUEST_STATUS, URGENCY, INCIDENT_SEVERITY, INCIDENT_STATUS, INCIDENT_TYPE,
  Status, Person, Card, Line, Chips, Seg, SwitchRow, Progress, AlertCards, EmergencyCard, StudentPick, Sub, Phone,
  studentLine, labelOf, fmtStamp, fmtDay, ago, call, plural, BRAND,
} from '@/components/medical/parts';
import { useMedLive, medicalNotice } from '@/components/medical/live';

const WHEN = [
  { value: '0', label: 'Just now' }, { value: '15', label: '15 min ago' }, { value: '30', label: '30 min ago' }, { value: '60', label: '1 hour ago' },
];

/* ── Send ─────────────────────────────────────────────────────────────────── */

function SendTab({ meta, onSent }: { meta: any; onSent: () => void }) {
  const [student, setStudent] = useState<any>(null);
  const [mine, setMine] = useState(true);
  const [reason, setReason] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [location, setLocation] = useState('');
  const [urgency, setUrgency] = useState('normal');
  const [escortedBy, setEscortedBy] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  const [sent, setSent] = useState<any>(null);

  const send = async () => {
    if (!student) { setFail('Choose the student'); return; }
    if (!reason.trim()) { setFail('Say why the student needs the Medical Room'); return; }
    setBusy(true); setFail('');
    try {
      const r = unwrap(await sendToMedicalRoom({ student: student._id, reason: reason.trim(), symptoms, location, urgency, escortedBy, remarks }));
      setSent({ number: r?.number, name: student.name });
      setStudent(null); setReason(''); setSymptoms(''); setLocation(''); setUrgency('normal'); setEscortedBy(''); setRemarks('');
      onSent();
    } catch (err: any) {
      setFail(err?.message || 'The request could not be sent');
    } finally { setBusy(false); }
  };

  return (
    <Panel icon="paper-plane-outline" tone="red" title="Send a student to the Medical Room"
      subtitle="The Medical Room is told at once. You will see here when they are expecting the student and what happened.">
      {sent ? (
        <Note tone="green" icon="checkmark-circle-outline" title={`Sent${sent.number ? ` — ${sent.number}` : ''}`}>
          {`The Medical Room knows ${sent.name} is coming. Follow it under My Requests.`}
        </Note>
      ) : null}
      <Field label="Student" required>
        <StudentPick value={student} onChange={setStudent} deps={[mine]}
          search={async (q) => unwrap(await teacherMedStudents(q, mine)) || []}
          extra={<SwitchRow label="Only students of my sections" sub="Turn off to send any student of the school — for example on playground duty." value={mine} onChange={setMine} />} />
      </Field>
      <Field label="Reason" required>
        <Box value={reason} onChange={setReason} placeholder="e.g. Headache, fell in the corridor" />
        <View style={{ marginTop: 8 }}>
          <Chips options={(meta?.visitReasons || []).map((r: string) => ({ value: r, label: r }))} value={reason} onChange={setReason} />
        </View>
      </Field>
      <Field label="Symptoms (optional)"><Box value={symptoms} onChange={setSymptoms} placeholder="What you noticed" multiline /></Field>
      <Field label="Where the student is now (optional)">
        <Box value={location} onChange={setLocation} placeholder="e.g. Classroom" />
        <View style={{ marginTop: 8 }}>
          <Chips options={(meta?.locations || []).map((r: string) => ({ value: r, label: r }))} value={location} onChange={setLocation} clearable />
        </View>
      </Field>
      <Field label="How urgent">
        <Seg options={(meta?.urgency || []).map((u: any) => ({ value: u.value, label: u.label, tone: URGENCY[u.value]?.tone }))} value={urgency} onChange={setUrgency} />
      </Field>
      {urgency === 'emergency' && meta?.roomPhone ? (
        <Note tone="red" icon="call-outline" title="An emergency">
          <Text style={st.noteText}>Stay with the student, and call the Medical Room as well.</Text>
          <View style={{ marginTop: 8, alignSelf: 'flex-start' }}><Btn kind="danger" icon="call" onPress={() => call(meta.roomPhone)}>{`Call ${meta.roomPhone}`}</Btn></View>
        </Note>
      ) : null}
      <Field label="Coming with (optional)"><Box value={escortedBy} onChange={setEscortedBy} placeholder="e.g. Class monitor" /></Field>
      <Field label="Remarks (optional)"><Box value={remarks} onChange={setRemarks} multiline /></Field>
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
      <Btn kind="primary" icon="paper-plane" onPress={send} disabled={busy}>{busy ? 'Sending…' : 'Send to Medical Room'}</Btn>
    </Panel>
  );
}

/* ── My requests ──────────────────────────────────────────────────────────── */

function RequestCard({ r, onWithdraw }: { r: any; onWithdraw?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Card critical={r.urgency === 'emergency' && !['returned', 'sent_home', 'referred', 'closed', 'cancelled'].includes(r.status)}>
      <Person name={r.studentName} photo={r.studentPhoto} sub={studentLine(r)} />
      <View style={st.pills}><Status map={REQUEST_STATUS} value={r.status} /><Status map={URGENCY} value={r.urgency} /></View>
      <Text style={st.reason}>{r.reason}{r.symptoms ? <Text style={st.reasonMore}>{` — ${r.symptoms}`}</Text> : null}</Text>
      <Line>{[r.number, `sent ${ago(r.createdAt)}`, r.location].filter(Boolean).join(' · ')}</Line>
      <Progress status={r.status} />
      {r.outcomeNote ? <Line tone="green">{r.outcomeNote}</Line> : null}
      {r.cancelReason ? <Line>{`Withdrawn: ${r.cancelReason}`}</Line> : null}
      {(r.history || []).length ? (
        <TouchableOpacity onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
          <Text style={st.toggle}>{open ? '▾' : '▸'} Timeline</Text>
        </TouchableOpacity>
      ) : null}
      {open ? (r.history || []).map((h: any, i: number) => (
        <Line key={i}>{`${fmtStamp(h.at)} — ${labelOf(REQUEST_STATUS, h.status)}${h.byName ? ` (${h.byName})` : ''}`}</Line>
      )) : null}
      {onWithdraw && ['requested', 'accepted'].includes(r.status) ? (
        <View style={{ alignSelf: 'flex-start' }}><Btn kind="danger" onPress={onWithdraw}>Withdraw request</Btn></View>
      ) : null}
    </Card>
  );
}

function WithdrawSheet({ request, onClose, onDone }: { request: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  useEffect(() => { if (request) { setReason(''); setFail(''); } }, [request]);
  const go = async () => {
    if (!reason.trim()) { setFail('Say why you are withdrawing it'); return; }
    setBusy(true); setFail('');
    try { await withdrawMedRequest(request._id, reason.trim()); onDone(); } catch (err: any) { setFail(err?.message || 'The request could not be withdrawn'); } finally { setBusy(false); }
  };
  return (
    <Sheet visible={!!request} icon="arrow-undo-outline" tone="red" title="Withdraw the request" subtitle={request ? `${request.studentName} · ${request.number}` : ''}
      onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Keep it</Btn><Btn kind="primary" onPress={go} disabled={busy} block>{busy ? 'Withdrawing…' : 'Withdraw'}</Btn></>}>
      <Note tone="amber" icon="information-circle-outline">The Medical Room is told the student is no longer coming.</Note>
      <Field label="Why" required><Box value={reason} onChange={setReason} placeholder="e.g. Feeling better after resting" multiline /></Field>
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

function RequestsTab({ ov, reload }: { ov: any; reload: () => void }) {
  const [withdraw, setWithdraw] = useState<any>(null);
  const open = ov?.open || [];
  const recent = ov?.recent || [];
  return (
    <>
      <Panel icon="file-tray-outline" tone="amber" title="Open right now" subtitle={open.length ? 'Updates every few seconds while one is open' : undefined}>
        {open.length
          ? open.map((r: any) => <RequestCard key={r._id} r={r} onWithdraw={() => setWithdraw(r)} />)
          : <Blank icon="checkmark-done-outline" title="No open requests" body="Students you send appear here until they are back in class." />}
      </Panel>
      <Panel icon="time-outline" tone="slate" title="Earlier this week">
        {recent.length ? recent.map((r: any) => <RequestCard key={r._id} r={r} />) : <Muted>Requests you sent in the last 7 days appear here.</Muted>}
      </Panel>
      <WithdrawSheet request={withdraw} onClose={() => setWithdraw(null)} onDone={() => { setWithdraw(null); reload(); }} />
    </>
  );
}

/* ── Alerts ───────────────────────────────────────────────────────────────── */

// Who else a teacher looks after, beyond their classes (server services/medicalNeedToKnow).
const GROUP_ICON: Record<string, any> = { covering: 'people-outline', invigilating: 'clipboard-outline', bus: 'bus-outline', hostel: 'home-outline', mess: 'restaurant-outline' };

/** In an emergency: any student's card, by saying what is happening. Logged; the room is told. */
function EmergencyAccessSheet({ open, onClose, onOpened }: { open: boolean; onClose: () => void; onOpened: (card: any) => void }) {
  const [student, setStudent] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  useEffect(() => { if (open) { setStudent(null); setReason(''); setFail(''); setBusy(false); } }, [open]);
  const go = async () => {
    setBusy(true); setFail('');
    try { onOpened(unwrap(await teacherEmergencyAccess({ student: student?._id, reason: reason.trim() }))); }
    catch (err: any) { setFail(err?.message || 'The card could not be opened'); } finally { setBusy(false); }
  };
  return (
    <Sheet visible={open} icon="medkit-outline" tone="red" title="Emergency — any student" subtitle="For a real emergency only. The Medical Room is told at once." onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Cancel</Btn><Btn kind="stop" disabled={busy || !student || reason.trim().length < 5} onPress={go} block>{busy ? 'Opening…' : 'Open the card'}</Btn></>}>
      <Field label="Student" required><StudentPick value={student} onChange={setStudent} search={async (q: string) => unwrap(await teacherMedStudents(q, false)) || []} /></Field>
      <Field label="What is happening" required><Box value={reason} onChange={setReason} multiline placeholder="e.g. Collapsed on the playground" /></Field>
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

function AlertsTab({ breakGlass }: { breakGlass?: boolean }) {
  const [d, setD] = useState<any>(null);
  const [fail, setFail] = useState('');
  const [off, setOff] = useState(false);
  const [card, setCard] = useState<any>(null);
  const [cardFail, setCardFail] = useState('');
  const [opening, setOpening] = useState('');
  const [access, setAccess] = useState(false);

  useEffect(() => {
    (async () => {
      try { setD(unwrap(await teacherMedAlerts())); } catch (err: any) {
        if (err?.data?.code === 'MEDICAL_ALERTS_OFF') setOff(true);
        else setFail(err?.message || 'The alerts could not be loaded');
      }
    })();
  }, []);

  const openCard = async (id: string) => {
    setOpening(id); setCardFail('');
    try { setCard(unwrap(await teacherMedEmergency(id))); } catch (err: any) { setCardFail(err?.message || 'The emergency card could not be opened'); } finally { setOpening(''); }
  };

  if (off) return <Blank icon="shield-checkmark-outline" title="Medical alerts are not shared with teachers" body="Your school keeps students' medical alerts within the Medical Room. Ask the Medical Room if you need to know about a student." />;
  if (fail) return <Blank icon="cloud-offline-outline" title="The alerts could not be loaded" body={fail} />;
  if (!d) return <LoaderView />;
  const rows = [...(d.rows || [])].sort((a, b) => Number(b.critical) - Number(a.critical));
  const sections = (d.sections || []).map((x: any) => `${[x.className, x.sectionName].filter(Boolean).join(' – ')} (${x.role.toLowerCase()})`).join(', ');
  return (
    <>
      <Note tone="indigo" icon="shield-checkmark-outline">
        {`What the Medical Room shares with teachers about the students of your sections${sections ? ` — ${sections}` : ''}. For their safety only: please keep it to yourself.`}
      </Note>
      {cardFail ? <Note tone="red" icon="alert-circle-outline">{cardFail}</Note> : null}
      {breakGlass || d.breakGlass ? (
        <View style={{ alignSelf: 'flex-start', marginBottom: 10 }}><Btn kind="danger" icon="medkit-outline" onPress={() => setAccess(true)}>Emergency — any student</Btn></View>
      ) : null}
      {(d.restrictions || []).length || (d.away || []).length ? (
        <Panel icon="hand-left-outline" tone="orange" title="What to know today" subtitle="From the Medical Room — what to do, not why">
          {(d.restrictions || []).map((x: any) => (
            <Card key={x._id}>
              <Person name={x.student.name} photo={x.student.photo} sub={x.student.classLabel} />
              <Line strong>{x.teacherText}</Line>
              <Line>{`${x.state === 'upcoming' ? `From ${fmtDay(x.startsOn)} · ` : ''}${x.endsOn ? `until ${fmtDay(x.endsOn)}` : 'until further notice'}`}</Line>
            </Card>
          ))}
          {(d.away || []).map((x: any) => (
            <Card key={x._id}>
              <Person name={x.student.name} photo={x.student.photo} sub={x.student.classLabel} />
              <Line strong>Off school for health reasons</Line>
              <Line>{x.earliestReturn ? `Back no earlier than ${fmtDay(x.earliestReturn)}` : 'Back when the Medical Room clears them'}</Line>
            </Card>
          ))}
        </Panel>
      ) : null}
      {rows.length ? rows.map((r: any) => (
        <Card key={r.student._id} critical={r.critical}>
          <Person name={r.student.name} photo={r.student.photo} sub={studentLine(r.student)} critical={r.critical} />
          <AlertCards alerts={r.alerts} instructions={r.instructions} title={false} />
          {d.emergencyInfo ? (
            <View style={{ alignSelf: 'flex-start' }}>
              <Btn icon="medkit-outline" onPress={() => openCard(r.student._id)} disabled={!!opening}>{opening === r.student._id ? 'Opening…' : 'Emergency card'}</Btn>
            </View>
          ) : null}
        </Card>
      )) : !(d.groups || []).length ? <Blank icon="happy-outline" title="No medical alerts" body="None of the students you teach has an allergy, condition or medicine the Medical Room shares with teachers." /> : null}
      {(d.groups || []).map((g: any) => (
        <View key={g.key} style={{ marginTop: 14 }}>
          <Sub icon={GROUP_ICON[g.key] || 'people-outline'}>{g.label}</Sub>
          <Muted>{[g.sub, g.until ? 'today only' : '', `${g.rows.length} of ${g.students} with ${g.foodOnly ? 'a food allergy or a diet' : 'critical alerts'}`].filter(Boolean).join(' · ')}</Muted>
          {g.rows.length ? g.rows.map((r: any) => (
            <Card key={`${g.key}:${r.student._id}`} critical={r.critical}>
              <Person name={r.student.name} photo={r.student.photo} sub={studentLine(r.student)} critical={r.critical} />
              <AlertCards alerts={r.alerts} instructions={r.instructions} title={false} />
              {r.diet ? <Line strong>{`Diet: ${r.diet}`}</Line> : null}
              {(r.contacts || []).map((c: any, i: number) => <Phone key={i} value={c.phone} label={`${c.name}${c.relation ? ` (${c.relation})` : ''}`} />)}
              {!g.foodOnly ? (
                <View style={{ alignSelf: 'flex-start' }}>
                  <Btn icon="medkit-outline" onPress={() => openCard(r.student._id)} disabled={!!opening}>{opening === r.student._id ? 'Opening…' : 'Emergency card'}</Btn>
                </View>
              ) : null}
            </Card>
          )) : <Muted>{g.foodOnly ? 'No food allergies or special diets among them.' : 'No critical alerts among them.'}</Muted>}
        </View>
      ))}
      <EmergencyAccessSheet open={access} onClose={() => setAccess(false)} onOpened={(c) => { setAccess(false); setCard(c); }} />
      <Sheet visible={!!card} icon="medkit-outline" tone="red" title="Emergency card" subtitle="Opening it is recorded." onClose={() => setCard(null)}>
        <EmergencyCard e={card} />
      </Sheet>
    </>
  );
}

/* ── Report an incident ───────────────────────────────────────────────────── */

function IncidentTab({ meta }: { meta: any }) {
  // Only the kinds the school records — the server refuses any other.
  const allowed: string[] = (meta?.incidentTypes || []).map((t: any) => t.value);
  const firstType = allowed.includes('playground') || !allowed.length ? 'playground' : allowed[0];
  const [student, setStudent] = useState<any>(null);
  const [mine, setMine] = useState(true);
  const [type, setType] = useState(firstType);
  useEffect(() => { if (allowed.length && !allowed.includes(type)) setType(firstType); }, [allowed.join(','), type]); // eslint-disable-line react-hooks/exhaustive-deps
  const [severity, setSeverity] = useState('minor');
  const [when, setWhen] = useState('0');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [injury, setInjury] = useState('');
  const [firstAid, setFirstAid] = useState('');
  const [witnesses, setWitnesses] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  const [done, setDone] = useState('');
  const [mineList, setMineList] = useState<any[] | null>(null);

  const loadMine = useCallback(async () => {
    try { setMineList(unwrap(await teacherMedIncidents()) || []); } catch { setMineList([]); }
  }, []);
  useEffect(() => { loadMine(); }, [loadMine]);

  const submit = async () => {
    if (!student) { setFail('Choose the student'); return; }
    if (!description.trim()) { setFail('Describe what happened'); return; }
    setBusy(true); setFail('');
    try {
      const occurredAt = new Date(Date.now() - Number(when) * 60000).toISOString();
      const r = unwrap(await teacherReportIncident({ student: student._id, type: !allowed.length || allowed.includes(type) ? type : firstType, severity, occurredAt, location, description: description.trim(), injury, firstAid, witnesses }));
      setDone(`${r?.number || 'The incident'} reported — the Medical Room has been told.`);
      setStudent(null); setDescription(''); setInjury(''); setFirstAid(''); setWitnesses(''); setLocation(''); setWhen('0'); setSeverity('minor');
      loadMine();
    } catch (err: any) {
      setFail(err?.message || 'The incident could not be reported');
    } finally { setBusy(false); }
  };

  return (
    <>
      <Panel icon="warning-outline" tone="orange" title="Report an injury or accident" subtitle="The Medical Room is told at once. If the student needs care now, send them as well.">
        {done ? <Note tone="green" icon="checkmark-circle-outline">{done}</Note> : null}
        <Field label="Student" required>
          <StudentPick value={student} onChange={setStudent} deps={[mine]}
            search={async (q) => unwrap(await teacherMedStudents(q, mine)) || []}
            extra={<SwitchRow label="Only students of my sections" sub="Turn off for any student of the school." value={mine} onChange={setMine} />} />
        </Field>
        <Field label="What kind">
          <Pick label="What kind" value={type} onChange={setType}
            options={(meta?.incidentTypes || []).map((t: any) => ({ value: t.value, label: t.label }))} />
        </Field>
        <Field label="How serious">
          <Seg options={(meta?.severities || []).map((x: any) => ({ value: x.value, label: x.label, tone: INCIDENT_SEVERITY[x.value]?.tone }))} value={severity} onChange={setSeverity} />
        </Field>
        <Field label="When"><Seg options={WHEN} value={when} onChange={setWhen} /></Field>
        <Field label="Where (optional)">
          <Box value={location} onChange={setLocation} placeholder="e.g. Playground" />
          <View style={{ marginTop: 8 }}>
            <Chips options={(meta?.locations || []).map((r: string) => ({ value: r, label: r }))} value={location} onChange={setLocation} clearable />
          </View>
        </Field>
        <Field label="What happened" required><Box value={description} onChange={setDescription} placeholder="What you saw or were told" multiline /></Field>
        <Field label="Injury (optional)"><Box value={injury} onChange={setInjury} placeholder="e.g. Grazed right knee" /></Field>
        <Field label="First aid given (optional)"><Box value={firstAid} onChange={setFirstAid} placeholder="e.g. Cleaned with water" /></Field>
        <Field label="Witnesses (optional)"><Box value={witnesses} onChange={setWitnesses} /></Field>
        {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
        <Btn kind="primary" icon="send" onPress={submit} disabled={busy}>{busy ? 'Reporting…' : 'Report incident'}</Btn>
      </Panel>

      <Panel icon="list-outline" tone="slate" title="Incidents you reported">
        {mineList === null ? <LoaderView /> : mineList.length ? mineList.map((i: any) => (
          <Card key={i._id}>
            <Person name={i.studentName} photo={i.studentPhoto} sub={studentLine(i)} />
            <View style={st.pills}><Status map={INCIDENT_SEVERITY} value={i.severity} /><Status map={INCIDENT_STATUS} value={i.status} /></View>
            <Text style={st.reason}>{labelOf(INCIDENT_TYPE, i.type)}{i.injury ? <Text style={st.reasonMore}>{` — ${i.injury}`}</Text> : null}</Text>
            <Line>{[i.number, fmtStamp(i.occurredAt), i.location].filter(Boolean).join(' · ')}</Line>
          </Card>
        )) : <Muted>Nothing reported yet.</Muted>}
      </Panel>
    </>
  );
}

/* ── The screen ───────────────────────────────────────────────────────────── */

const TEACHER_TABS = ['send', 'requests', 'alerts', 'incident', 'health', 'safeguarding'];
/* ── Safeguarding: raise a concern; see that it is being dealt with ─────────── */

const SG_TONE: Record<string, any> = { open: 'red', monitoring: 'amber', referred: 'blue', closed: 'slate' };

function SafeguardingTab() {
  const [me, setMe] = useState<any>(null);
  const [mine, setMine] = useState<any[]>([]);
  const [fail, setFail] = useState('');
  const [raising, setRaising] = useState(false);
  const [flash, setFlash] = useState('');
  const load = useCallback(async () => {
    try { const [m, c] = await Promise.all([safeguardingMe(), myConcerns()]); setMe(unwrap(m)); setMine(unwrap(c) || []); setFail(''); }
    catch (err: any) { setFail(err?.message || 'Safeguarding could not be loaded'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (fail && !me) return <Blank icon="cloud-offline-outline" title="Safeguarding could not be loaded" body={fail} />;
  if (!me) return <LoaderView />;
  return (
    <>
      {flash ? <Note tone="green" icon="checkmark-circle-outline">{flash}</Note> : null}
      <Panel icon="shield-checkmark-outline" tone="red" title="Safeguarding" subtitle={`Concerns about a child's welfare go to ${me.leads.length === 1 ? 'the safeguarding lead' : 'the safeguarding leads'}: ${me.leads.join(', ') || 'the school admins'}.`}>
        <View style={{ alignSelf: 'flex-start', marginBottom: 10 }}><Btn kind="stop" icon="add" onPress={() => setRaising(true)}>Raise a concern</Btn></View>
        <Sub icon="list-outline">Concerns you raised</Sub>
        {mine.length ? mine.map((c: any) => (
          <Card key={c._id}>
            <Line strong>{`${c.number} · ${c.studentName}`}</Line>
            <Line>{`${c.categoryLabel} · ${fmtStamp(c.raisedAt)}`}</Line>
            <View style={{ alignSelf: 'flex-start' }}><Pill tone={SG_TONE[c.status]}>{c.statusLabel}</Pill></View>
          </Card>
        )) : <Muted>None.</Muted>}
        {me.isLead ? <Note tone="indigo" icon="desktop-outline">You are a safeguarding lead: read the log on the web portal.</Note> : null}
      </Panel>
      <RaiseConcernSheet open={raising} me={me} onClose={() => setRaising(false)} onDone={(m) => { setRaising(false); setFlash(m); load(); }} />
    </>
  );
}

function RaiseConcernSheet({ open, me, onClose, onDone }: { open: boolean; me: any; onClose: () => void; onDone: (msg: string) => void }) {
  const [v, setV] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  useEffect(() => { if (open) { setV({ student: null, category: 'disclosure', urgent: false, description: '', location: '', actionTaken: '' }); setFail(''); setBusy(false); } }, [open]);
  const send = async () => {
    if (!v.student?._id) { setFail('Choose the student'); return; }
    if (String(v.description || '').trim().length < 15) { setFail('Write down what you saw or were told, in the words used'); return; }
    setBusy(true); setFail('');
    try { const r = unwrap(await raiseConcern({ ...v, student: v.student._id })); onDone(`${r.number} raised — the safeguarding lead has been told`); }
    catch (err: any) { setFail(err?.message || 'It could not be raised'); setBusy(false); }
  };
  const find = async (q: string) => unwrap(await teacherMedStudents(q, false)) || [];
  return (
    <Sheet visible={open} icon="shield-checkmark-outline" tone="red" title="Raise a safeguarding concern" onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Cancel</Btn><Btn kind="stop" onPress={send} disabled={busy} block>{busy ? 'Sending…' : 'Raise the concern'}</Btn></>}>
      <Note tone="indigo" icon="lock-closed-outline">Only the safeguarding leads read this. Write what you saw or were told in the words used; do not investigate. If the child is in danger now, call 112 — or Childline on 1098.</Note>
      <Field label="The student" required><StudentPick value={v.student} onChange={(x) => setV({ ...v, student: x })} search={find} /></Field>
      <Field label="What kind of concern">
        <Chips options={Object.entries(me?.categories || {}).map(([value, label]) => ({ value, label: String(label) }))} value={v.category} onChange={(x) => setV({ ...v, category: x })} />
      </Field>
      <SwitchRow label="The child may be in danger now" sub="The leads are told at once, as urgent." value={!!v.urgent} onChange={(x) => setV({ ...v, urgent: x })} />
      <Field label="What you saw or were told" required hint="In the words used. Facts, not opinions."><Box value={v.description || ''} onChange={(x) => setV({ ...v, description: x })} multiline maxLength={4000} /></Field>
      <Field label="Where"><Box value={v.location || ''} onChange={(x) => setV({ ...v, location: x })} placeholder="e.g. Art room" maxLength={200} /></Field>
      <Field label="What you did"><Box value={v.actionTaken || ''} onChange={(x) => setV({ ...v, actionTaken: x })} multiline maxLength={1500} placeholder="e.g. Listened, told the child I must pass it on" /></Field>
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

/* ── My health: the teacher's own record ──────────────────────────────────── */

const SEVERITY: Record<string, string> = { mild: 'Mild', moderate: 'Moderate', severe: 'Severe', life_threatening: 'Life-threatening' };
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function MyHealthTab() {
  const [d, setD] = useState<any>(null);
  const [fail, setFail] = useState('');
  const [edit, setEdit] = useState(false);
  const [flash, setFlash] = useState('');
  const load = useCallback(async () => {
    try { setD(unwrap(await myStaffHealth())); setFail(''); } catch (err: any) { setFail(err?.message || 'Your record could not be loaded'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (fail && !d) return <Blank icon="cloud-offline-outline" title="Your record could not be loaded" body={fail} />;
  if (!d) return <LoaderView />;
  const h = d.health || {};
  const ec = h.emergencyContact || {};
  return (
    <>
      {flash ? <Note tone="green" icon="checkmark-circle-outline">{flash}</Note> : null}
      <Panel icon="heart-outline" tone="red" title="My health record" subtitle="Seen only by the Medical Room's staff and you">
        {(h.allergies || []).length ? (
          <View style={st.wrapRow}>{h.allergies.map((a: any, i: number) => <Text key={i} style={st.allergy}>{`${a.allergen} · ${SEVERITY[a.severity] || a.severity}${a.reaction ? ` — ${a.reaction}` : ''}`}</Text>)}</View>
        ) : <Muted>No allergies recorded.</Muted>}
        <Line>{`Blood group: ${h.bloodGroup || '—'}`}</Line>
        <Line>{`Conditions: ${(h.conditions || []).map((c: any) => c.condition).join(', ') || '—'}`}</Line>
        <Line>{`Medicines: ${h.medications || '—'}`}</Line>
        <Line>{`Person to call: ${ec.name ? `${ec.name}${ec.relation ? ` (${ec.relation})` : ''}${ec.phone ? ` · ${ec.phone}` : ''}` : '—'}`}</Line>
        <View style={{ alignSelf: 'flex-start', marginTop: 8 }}><Btn kind="primary" icon="create-outline" onPress={() => setEdit(true)}>Update</Btn></View>
      </Panel>
      <Panel icon="medkit-outline" tone="blue" title="My visits to the Medical Room">
        {(d.visits || []).length ? d.visits.map((x: any) => (
          <Card key={x._id}>
            <Text style={st.visitTitle}>{x.reason}</Text>
            <Line>{`${fmtStamp(x.arrivedAt)} · ${x.outcomeLabel}`}</Line>
            {(x.medicines || []).length ? <Line>{x.medicines.map((m: any) => `${m.name} ${m.dosage}`).join(', ')}</Line> : null}
          </Card>
        )) : <Muted>None.</Muted>}
      </Panel>
      <MyHealthSheet open={edit} health={h} onClose={() => setEdit(false)} onSaved={(next) => { setEdit(false); setD(next); setFlash('Saved'); }} />
    </>
  );
}

function MyHealthSheet({ open, health, onClose, onSaved }: { open: boolean; health: any; onClose: () => void; onSaved: (d: any) => void }) {
  const [v, setV] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  useEffect(() => {
    if (!open) return;
    setV({
      bloodGroup: health?.bloodGroup || '', allergies: (health?.allergies || []).map((a: any) => ({ ...a })), conditions: (health?.conditions || []).map((c: any) => ({ ...c })),
      medications: health?.medications || '', emergencyContact: { ...(health?.emergencyContact || {}) }, notes: health?.notes || '',
    });
    setFail(''); setBusy(false);
  }, [open, health]);
  const save = async () => {
    setBusy(true); setFail('');
    try { onSaved(unwrap(await saveMyStaffHealth(v))); } catch (err: any) { setFail(err?.message || 'It could not be saved'); setBusy(false); }
  };
  const setRow = (k: 'allergies' | 'conditions', i: number, p: any) => setV((x: any) => ({ ...x, [k]: x[k].map((r: any, j: number) => (j === i ? { ...r, ...p } : r)) }));
  const dropRow = (k: 'allergies' | 'conditions', i: number) => setV((x: any) => ({ ...x, [k]: x[k].filter((_: any, j: number) => j !== i) }));
  return (
    <Sheet visible={open} icon="heart-outline" tone="red" title="My health record" subtitle="Only the Medical Room's staff and you can see this" onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Cancel</Btn><Btn kind="primary" onPress={save} disabled={busy} block>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <Field label="Blood group">
        <Chips clearable options={BLOOD.map((b) => ({ value: b, label: b }))} value={v.bloodGroup} onChange={(x) => setV({ ...v, bloodGroup: x })} />
      </Field>
      <Field label="Allergies">
        {(v.allergies || []).map((a: any, i: number) => (
          <View key={i} style={st.editRow}>
            <Box value={a.allergen} onChange={(x) => setRow('allergies', i, { allergen: x })} placeholder="e.g. Penicillin" maxLength={80} />
            <Seg value={a.severity} onChange={(x) => setRow('allergies', i, { severity: x })} options={[{ value: 'mild', label: 'Mild' }, { value: 'moderate', label: 'Moderate' }, { value: 'severe', label: 'Severe', tone: 'red' }]} />
            <Box value={a.reaction} onChange={(x) => setRow('allergies', i, { reaction: x })} placeholder="Reaction" maxLength={200} />
            <Text style={st.link} onPress={() => dropRow('allergies', i)}>Remove</Text>
          </View>
        ))}
        <View style={{ alignSelf: 'flex-start' }}><Btn icon="add" onPress={() => setV((x: any) => ({ ...x, allergies: [...(x.allergies || []), { allergen: '', severity: 'moderate', reaction: '' }] }))}>Add an allergy</Btn></View>
      </Field>
      <Field label="Conditions">
        {(v.conditions || []).map((c: any, i: number) => (
          <View key={i} style={st.editRow}>
            <Box value={c.condition} onChange={(x) => setRow('conditions', i, { condition: x })} placeholder="e.g. Asthma" maxLength={120} />
            <Box value={c.notes} onChange={(x) => setRow('conditions', i, { notes: x })} placeholder="What helps, what to do" maxLength={300} />
            <Text style={st.link} onPress={() => dropRow('conditions', i)}>Remove</Text>
          </View>
        ))}
        <View style={{ alignSelf: 'flex-start' }}><Btn icon="add" onPress={() => setV((x: any) => ({ ...x, conditions: [...(x.conditions || []), { condition: '', notes: '' }] }))}>Add a condition</Btn></View>
      </Field>
      <Field label="Medicines taken regularly"><Box value={v.medications || ''} onChange={(x) => setV({ ...v, medications: x })} maxLength={600} /></Field>
      <Field label="Person to call"><Box value={v.emergencyContact?.name || ''} onChange={(x) => setV({ ...v, emergencyContact: { ...v.emergencyContact, name: x } })} placeholder="Name" maxLength={120} /></Field>
      <Field label="Relation"><Box value={v.emergencyContact?.relation || ''} onChange={(x) => setV({ ...v, emergencyContact: { ...v.emergencyContact, relation: x } })} maxLength={60} /></Field>
      <Field label="Their phone"><Box value={v.emergencyContact?.phone || ''} onChange={(x) => setV({ ...v, emergencyContact: { ...v.emergencyContact, phone: x } })} keyboardType="phone-pad" maxLength={30} /></Field>
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

const teacherTab = (t?: string) => (t && TEACHER_TABS.includes(t) ? t : 'send');

export default function TeacherMedical({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState(teacherTab(initialTab));
  // Another notification opened onto the screen that is already showing.
  const firstTab = React.useRef(true);
  useEffect(() => {
    if (firstTab.current) { firstTab.current = false; return; }
    if (initialTab) setTab(teacherTab(initialTab));
  }, [initialTab]);
  const [meta, setMeta] = useState<any>(null);
  const [ov, setOv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [m, o] = await Promise.all([teacherMedMeta(), teacherMedOverview()]);
      setMeta(unwrap(m)); setOv(unwrap(o)); setError('');
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else setError(err?.message || 'The Medical Room could not be loaded');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // The room accepting, receiving or sending home the student this teacher sent — at once.
  useMedLive(load, { event: 'medical:request' });
  // …and any notice from the Medical Room (an emergency card changed, a child off sick).
  useMedLive(load, { event: 'notification:new', when: medicalNotice });

  // While a request is open the teacher is waiting to hear: look again every 20 seconds.
  const openCount = ov?.open?.length || 0;
  useEffect(() => {
    if (!openCount) return undefined;
    const t = setInterval(async () => {
      try { setOv(unwrap(await teacherMedOverview())); } catch { /* the next tick tries again */ }
    }, 20000);
    return () => clearInterval(t);
  }, [openCount]);

  if (disabled) return <ModuleDisabled />;
  if (loading && !ov) return <LoaderView />;
  if (!ov) return <Blank icon="cloud-offline-outline" title="The Medical Room could not be loaded" body={error} action={<Btn icon="refresh" onPress={() => { setLoading(true); load(); }}>Try again</Btn>} />;

  const inRoom = ov.inRoom || [];
  return (
    <ScrollView style={st.screen} contentContainerStyle={st.body} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={BRAND} />}>
      <Head title={meta?.roomName || 'Medical Room'}
        subtitle="Send a student to the Medical Room and follow how they are, see the medical alerts of the students you teach, and report an injury or accident." />
      {meta?.roomPhone ? (
        <View style={{ alignSelf: 'flex-start', marginBottom: 12 }}>
          <Btn icon="call-outline" onPress={() => call(meta.roomPhone)}>{`Call ${meta.roomPhone}`}</Btn>
        </View>
      ) : null}
      <Tiles>
        <Tile icon="file-tray-outline" tone="amber" value={ov.open?.length || 0} label="My open requests" caption="Students on their way or being seen" onPress={() => setTab('requests')} />
        <Tile icon="bed-outline" tone="blue" value={inRoom.length} label="My students in the room" caption={inRoom.map((v: any) => v.studentName).join(', ') || 'Nobody right now'} />
        <Tile icon="shield-checkmark-outline" tone="red" value={ov.criticalCount || 0} label="With critical alerts" caption={plural(ov.sections?.length || 0, 'section')} onPress={() => setTab('alerts')} />
        <Tile icon="people-outline" tone="slate" value={ov.studentCount || 0} label="Students you teach"
          caption={(ov.sections || []).map((x: any) => [x.className, x.sectionName].filter(Boolean).join(' ')).join(', ') || 'No section this year'} />
      </Tiles>
      <View style={{ marginBottom: 12 }}>
        <Tabs value={tab} onChange={setTab} items={[
          { key: 'send', label: 'Send to Medical Room' },
          { key: 'requests', label: 'My Requests', count: ov.open?.length || undefined },
          { key: 'alerts', label: 'Medical Alerts' },
          { key: 'incident', label: 'Report Incident' },
          { key: 'health', label: 'My Health' },
          { key: 'safeguarding', label: 'Safeguarding' },
        ]} />
      </View>
      {tab === 'send' ? <SendTab meta={meta} onSent={load} /> : null}
      {tab === 'requests' ? <RequestsTab ov={ov} reload={load} /> : null}
      {tab === 'alerts' ? <AlertsTab breakGlass={!!meta?.breakGlass} /> : null}
      {tab === 'incident' ? <IncidentTab meta={meta} /> : null}
      {tab === 'health' ? <MyHealthTab /> : null}
      {tab === 'safeguarding' ? <SafeguardingTab /> : null}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  allergy: { fontSize: 12.5, fontWeight: '700', color: '#B91C1C', backgroundColor: '#FEF2F2', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, overflow: 'hidden' },
  visitTitle: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  editRow: { gap: 6, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 8 },
  link: { fontSize: 12.5, fontWeight: '700', color: '#DC2626', alignSelf: 'flex-end' },
  screen: { flex: 1, backgroundColor: Colors.background },
  body: { padding: 16, paddingBottom: 48 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reason: { fontSize: 13.5, fontWeight: '700', color: Colors.text, lineHeight: 19 },
  reasonMore: { fontWeight: '400', color: Colors.textSecondary },
  toggle: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary },
  noteText: { fontSize: 12, color: Colors.text, lineHeight: 17 },
});
