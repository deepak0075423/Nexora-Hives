/**
 * The Medical Room desk on the phone (Oct 2026) — for the school admin and for
 * a teacher the school made its nurse (admin access on `medical`). What the
 * nurse needs away from the desk: who is on the way, who is in the room and
 * what happens next, today's medication round, open incidents, the alerts,
 * and any student's emergency card. Stock, reports, settings and the long
 * record forms stay on the web portal.
 *
 * Notifications land here as ?tab=requests | room | incidents | alerts
 * (school-backend services/notificationLinks.js).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Colors } from '@/constants/theme';
import {
  deskOverview, deskMeta, deskRoom, deskAlerts, deskBoard, deskAdministration, deskStudents, deskEmergency,
  acceptMedRequest, cancelMedRequest, createMedVisit, getMedVisit, updateMedVisit, setMedVisitStatus,
  createMedIncident, treatMedIncident, recordMedDose, giveMedDose, checkDoseSafety, visitCollectors, recordVisitCollection, deskUrgent, exclusionRules, searchStaff, logFridge,
  sendStepUpCode, verifyStepUpCode,
} from '@/api/medical.api';
import { FamiliesToReach } from '@/components/medical/urgent';
import { useMedLive, buzz } from '@/components/medical/live';
import ModuleDisabled from '@/components/ModuleDisabled';
import storage from '@/utils/storage';
import { LoaderView, unwrap, MODULE_BLOCKED_CODES, confirmAsync } from '@/components/ui/kit';
import { ReadingSheet, CareSheet, TriagePill } from '@/components/medical/care';
import { DeskProgrammeNotes, CampaignRosterSheet, OutbreakSheet, IllnessReportsSheet } from '@/components/medical/programmes';
import { ScanSheet, AddRecordSheet, CheckupSheet, OfflineSheet } from '@/components/medical/nurse';
import { useAuth } from '@/contexts/AuthContext';
import { phoneError } from '@/utils/validators';
import {
  Head, Tiles, Tile, Tabs, Panel, Note, Blank, Muted, Btn, Sheet, Field, Box, Pick, Pill,
  VISIT_STATUS, VISIT_NEXT, IN_ROOM, REQUEST_STATUS, URGENCY, INCIDENT_TYPE, INCIDENT_SEVERITY, INCIDENT_STATUS, DOSE_STATUS,
  Status, Person, Card, Line, Chips, Seg, SwitchRow, AlertCards, EmergencyCard, StudentPick,
  studentLine, labelOf, optionsOf, fmtTime, fmtStamp, since, ago, count, plural, BRAND, type Tone,
} from '@/components/medical/parts';

const findStudents = async (q: string) => unwrap(await deskStudents(q)) || [];
const num = (v: string) => (String(v ?? '').trim() === '' ? undefined : Number(v));
const LEVEL_TONE: Record<string, Tone> = { critical: 'red', warning: 'amber', info: 'blue' };

/* ── Vitals ───────────────────────────────────────────────────────────────── */

type Vit = { temperature: string; bpSystolic: string; bpDiastolic: string; pulse: string; spo2: string; weightKg: string };
const noVitals = (): Vit => ({ temperature: '', bpSystolic: '', bpDiastolic: '', pulse: '', spo2: '', weightKg: '' });
const vitalsFrom = (v: any): Vit => ({
  temperature: v?.temperature != null ? String(v.temperature) : '', bpSystolic: v?.bpSystolic != null ? String(v.bpSystolic) : '',
  bpDiastolic: v?.bpDiastolic != null ? String(v.bpDiastolic) : '', pulse: v?.pulse != null ? String(v.pulse) : '',
  spo2: v?.spo2 != null ? String(v.spo2) : '', weightKg: v?.weightKg != null ? String(v.weightKg) : '',
});
/** Only a reading that was taken is sent — an empty set would wipe the visit's readings. */
const vitalsBody = (v: Vit, unit: string) => {
  const out: any = { tempUnit: unit };
  let any = false;
  for (const k of Object.keys(v) as (keyof Vit)[]) { const n = num(v[k]); if (n !== undefined && !Number.isNaN(n)) { out[k] = n; any = true; } }
  return any ? out : undefined;
};
export const vitalsLine = (v: any) => [
  v?.temperature != null && `${v.temperature}°${v.tempUnit || 'F'}`,
  v?.bpSystolic != null && `BP ${v.bpSystolic}/${v.bpDiastolic ?? '—'}`,
  v?.pulse != null && `Pulse ${v.pulse}`,
  v?.spo2 != null && `SpO₂ ${v.spo2}%`,
  v?.weightKg != null && `${v.weightKg} kg`,
].filter(Boolean).join(' · ');

/** Readings start empty — a sample value in grey can pass for a reading at a glance. */
function VitalsFields({ v, onChange, unit }: { v: Vit; onChange: (v: Vit) => void; unit: string }) {
  const one = (k: keyof Vit, label: string) => (
    <View style={st.vital}>
      <Field label={label}><Box value={v[k]} onChange={(x) => onChange({ ...v, [k]: x })} placeholder="—" keyboardType="decimal-pad" /></Field>
    </View>
  );
  return (
    <View style={st.vitals}>
      {one('temperature', `Temperature °${unit}`)}
      {one('pulse', 'Pulse / min')}
      {one('bpSystolic', 'BP systolic')}
      {one('bpDiastolic', 'BP diastolic')}
      {one('spo2', 'SpO₂ %')}
      {one('weightKg', 'Weight kg')}
    </View>
  );
}

/* ── A medicine given in the room ─────────────────────────────────────────── */

type MedLine = { on: boolean; source: 'school' | 'parent'; item: string; medicineName: string; dosage: string; quantity: string };
const noMed = (): MedLine => ({ on: false, source: 'school', item: '', medicineName: '', dosage: '', quantity: '1' });
const medBody = (m: MedLine) => {
  if (!m.on) return undefined;
  return [m.source === 'parent'
    ? { source: 'parent', medicineName: m.medicineName.trim(), dosage: m.dosage.trim() }
    : { source: 'school', item: m.item, dosage: m.dosage.trim(), quantity: num(m.quantity) ?? 1 }];
};
const medProblem = (m: MedLine) => {
  if (!m.on) return '';
  if (m.source === 'school' && !m.item) return 'Choose the medicine from stock';
  if (m.source === 'parent' && !m.medicineName.trim()) return 'Name the family’s medicine';
  if (!m.dosage.trim()) return 'Give the dosage';
  return '';
};

/* ── The dose safety stop (server services/medicalSafety) ──────────────────── */

/**
 * A sheet that gives a medicine keeps the server's stop here — an allergy on
 * the record, too soon after the last dose, the most in 24 hours — and shows
 * it in the sheet itself (a second modal over a sheet is unreliable on a
 * phone). The next press sends the reason typed for going ahead.
 */
const findStaff = async (q: string) => ((unwrap(await searchStaff(q)) || []) as any[]).map((x) => ({ ...x, classLabel: x.designation || (x.role === 'school_admin' ? 'School admin' : 'Teacher') }));

function useStop() {
  const [stop, setStop] = useState<any>(null);
  const [why, setWhy] = useState('');
  // A controlled medicine: the second member of staff watching the dose.
  const [needWitness, setNeedWitness] = useState('');
  const [witness, setWitness] = useState<any>(null);
  const reset = useCallback(() => { setStop(null); setWhy(''); setNeedWitness(''); setWitness(null); }, []);
  /** Sends; a MEDICAL_SAFETY or MEDICAL_WITNESS_REQUIRED answer is kept for the sheet. True when it went through. */
  const send = async (fn: (override?: { reason?: string; witness?: string }) => Promise<any>) => {
    const override: { reason?: string; witness?: string } = {};
    if (stop && why.trim().length >= 5) override.reason = why.trim();
    if (needWitness && witness?._id) override.witness = String(witness._id);
    try {
      await fn(Object.keys(override).length ? override : undefined);
      return true;
    } catch (err: any) {
      if (err?.data?.code === 'MEDICAL_SAFETY') { setStop(err.data); return false; }
      if (err?.data?.code === 'MEDICAL_WITNESS_REQUIRED') { setNeedWitness(err.data.message || 'A second member of staff must witness the dose'); return false; }
      throw err;
    }
  };
  const view = stop || needWitness ? (
    <View style={{ marginBottom: 8 }}>
      {stop ? (
        <>
          {(stop.problems || []).map((p: any, i: number) => <Note key={i} tone="red" icon="alert-circle-outline">{`Stop: ${p.message}`}</Note>)}
          {(stop.warnings || []).map((w: any, i: number) => <Note key={`w${i}`} tone="amber" icon="information-circle-outline">{w.message}</Note>)}
          <Field label="Why it is safe to give it now" required hint="Kept with the dose and in the audit log; an allergy is reported to the medical staff.">
            <Box value={why} onChange={setWhy} multiline placeholder='e.g. "Dr Rao checked: the allergy entry was a rash in infancy"' />
          </Field>
        </>
      ) : null}
      {needWitness ? (
        <>
          <Note tone="amber" icon="people-outline">{`${needWitness}.`}</Note>
          <Field label="Who is watching?" required>
            <StudentPick value={witness} onChange={setWitness} search={findStaff} placeholder="Search staff by name" />
          </Field>
        </>
      ) : null}
    </View>
  ) : null;
  const ready = (!stop || why.trim().length >= 5) && (!needWitness || !!witness?._id);
  return { stop: !!stop || !!needWitness, reset, send, view, label: stop ? 'Give anyway' : needWitness ? 'Witnessed — give it' : '', ready };
}

/** What the check says before anything is pressed: the stop, the caution, the last dose. */
function DoseCheckLines({ student, plan, item, medicineName }: { student?: string; plan?: string; item?: string; medicineName?: string }) {
  const [res, setRes] = useState<any>(null);
  useEffect(() => {
    let live = true;
    setRes(null);
    if (!student || (!plan && !item && !medicineName)) return undefined;
    checkDoseSafety({ student, plan: plan || undefined, item: item || undefined, medicineName: medicineName || undefined })
      .then((r) => { if (live) setRes(unwrap(r)); }).catch(() => {});
    return () => { live = false; };
  }, [student, plan, item, medicineName]);
  if (!res) return null;
  const recent = res.recent || [];
  return (
    <View style={{ marginBottom: 6 }}>
      {(res.blocks || []).map((b: any, i: number) => <Note key={i} tone="red" icon="alert-circle-outline">{`Stop: ${b.message}`}</Note>)}
      {(res.warnings || []).map((w: any, i: number) => <Note key={`w${i}`} tone="amber" icon="information-circle-outline">{w.message}</Note>)}
      {recent.length && !(res.blocks || []).length ? <Line>{`Last given ${ago(recent[0].at)} (${fmtTime(recent[0].at)})${recent.length > 1 ? ` · ${recent.length} times in 24 h` : ''}`}</Line> : null}
    </View>
  );
}

/** The round's stop, when no sheet is open: the problems, and a reason to go ahead. */
function StopSheet({ ask, onClose }: { ask: { title: string; sub?: string; problems: any[]; warnings: any[]; go: (reason: string) => Promise<void> } | null; onClose: () => void }) {
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  useEffect(() => { setWhy(''); setFail(''); setBusy(false); }, [ask]);
  return (
    <Sheet visible={!!ask} icon="warning-outline" tone="red" title={ask?.title || ''} subtitle={ask?.sub} onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Don’t give it</Btn><Btn kind="stop" disabled={busy || why.trim().length < 5} block onPress={async () => {
        setBusy(true); setFail('');
        try { await ask?.go(why.trim()); } catch (err: any) { setFail(err?.message || 'It could not be recorded'); } finally { setBusy(false); }
      }}>{busy ? 'Saving…' : 'Give anyway'}</Btn></>}>
      {(ask?.problems || []).map((p: any, i: number) => <Note key={i} tone="red" icon="alert-circle-outline">{p.message}</Note>)}
      {(ask?.warnings || []).map((w: any, i: number) => <Note key={`w${i}`} tone="amber" icon="information-circle-outline">{w.message}</Note>)}
      <Field label="Why it is safe to give it now" required hint="Kept with the dose and in the audit log.">
        <Box value={why} onChange={setWhy} multiline />
      </Field>
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

function MedicineField({ m, onChange, medicines }: { m: MedLine; onChange: (m: MedLine) => void; medicines: any[] }) {
  // A prescription-only medicine is given only against a medication plan (the round).
  const stock = medicines.filter((x) => !x.prescriptionOnly);
  const it = stock.find((x) => x._id === m.item);
  return (
    <>
      <SwitchRow label="A medicine was given" sub="Taken from the stock, or the family’s own" value={m.on} onChange={(on) => onChange({ ...m, on })} />
      {m.on ? (
        <>
          <Field label="Supplied by"><Seg options={[{ value: 'school', label: 'School stock' }, { value: 'parent', label: 'Family’s own' }]} value={m.source} onChange={(v: any) => onChange({ ...m, source: v })} /></Field>
          {m.source === 'school' ? (
            <Field label="Medicine" required hint={it ? `${count(it.usable)} ${it.unit} in date` : undefined}>
              <Pick label="Medicine" value={m.item} onChange={(v) => onChange({ ...m, item: v })}
                options={stock.map((x) => ({ value: x._id, label: `${x.name}${x.strength ? ` ${x.strength}` : ''}`, sub: `${count(x.usable)} ${x.unit} in date` }))} />
            </Field>
          ) : (
            <Field label="Medicine" required><Box value={m.medicineName} onChange={(v) => onChange({ ...m, medicineName: v })} placeholder="Name of the family’s medicine" /></Field>
          )}
          <View style={st.pair}>
            <View style={{ flex: 2 }}><Field label="Dosage" required><Box value={m.dosage} onChange={(v) => onChange({ ...m, dosage: v })} placeholder="e.g. 1 tablet" /></Field></View>
            {m.source === 'school' ? <View style={{ flex: 1 }}><Field label="From stock"><Box value={m.quantity} onChange={(v) => onChange({ ...m, quantity: v })} keyboardType="decimal-pad" /></Field></View> : null}
          </View>
        </>
      ) : null}
    </>
  );
}

/** The chosen student's alerts, before anything is given to them. */
function StudentAlerts({ id }: { id?: string }) {
  const [a, setA] = useState<any>(null);
  useEffect(() => {
    let live = true;
    setA(null);
    if (id) deskEmergency(id).then((r) => { if (live) setA(unwrap(r)); }).catch(() => {});
    return () => { live = false; };
  }, [id]);
  if (!id || !a) return null;
  if (!(a.alerts || []).length) return <Note tone="green" icon="checkmark-circle-outline">No allergies, conditions or emergency medicine on record.</Note>;
  return <AlertCards alerts={a.alerts} instructions={a.instructions} />;
}

/* ── Sheets ───────────────────────────────────────────────────────────────── */

/** A new visit — walked in, or arrived on a teacher's request (`seed.request`). */
function VisitSheet({ seed, meta, onClose, onDone }: { seed: any; meta: any; onClose: () => void; onDone: (msg: string) => void }) {
  const unit = meta?.settings?.temperatureUnit || 'F';
  const [student, setStudent] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [vitals, setVitals] = useState<Vit>(noVitals());
  const [treatment, setTreatment] = useState('');
  const [firstAid, setFirstAid] = useState('');
  const [status, setStatus] = useState('in_room');
  const [bed, setBed] = useState('');
  const [hospital, setHospital] = useState('');
  const [parentContacted, setParentContacted] = useState(false);
  const [outcomeNote, setOutcomeNote] = useState('');
  const [med, setMed] = useState<MedLine>(noMed());
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  const guard = useStop();
  const resetStop = guard.reset;

  useEffect(() => {
    if (!seed) return;
    resetStop();
    setStudent(seed.student || null); setReason(seed.reason || ''); setSymptoms(seed.symptoms || '');
    setVitals(noVitals()); setTreatment(''); setFirstAid(''); setStatus('in_room'); setBed(''); setHospital('');
    setParentContacted(false); setOutcomeNote(''); setMed(noMed()); setFail(''); setBusy(false);
  }, [seed, resetStop]);

  const freeBeds = (meta?.beds || []).filter((b: any) => b.status === 'available');
  const departed = ['returned', 'sent_home', 'referred'].includes(status);
  const save = async () => {
    if (!student) { setFail('Choose the student'); return; }
    if (!reason.trim()) { setFail('Give the reason for the visit'); return; }
    if (status === 'referred' && !hospital.trim()) { setFail('Name the hospital the student is referred to'); return; }
    const mp = medProblem(med);
    if (mp) { setFail(mp); return; }
    setBusy(true); setFail('');
    try {
      let r: any = null;
      const ok = await guard.send(async (override) => {
        r = unwrap(await createMedVisit({
          student: student._id, request: seed?.request || undefined, reason: reason.trim(), symptoms, treatment, firstAid,
          vitals: vitalsBody(vitals, unit), status, bed: bed && IN_ROOM.includes(status) ? bed : undefined,
          referral: status === 'referred' ? { hospital: hospital.trim() } : undefined, parentContacted,
          outcomeNote: departed ? outcomeNote : undefined, medicines: medBody(med), override,
        }));
      });
      if (ok) onDone(`${r?.number || 'The visit'} recorded`);
    } catch (err: any) {
      setFail(err?.message || 'The visit could not be saved');
    } finally { setBusy(false); }
  };

  return (
    <Sheet visible={!!seed} icon="medkit-outline" tone="blue" title={seed?.request ? 'The student has arrived' : 'Add Medical Visit'}
      subtitle={seed?.request ? 'Opens their visit and tells the teacher.' : 'A student in the Medical Room.'} onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Cancel</Btn><Btn kind={guard.stop ? 'stop' : 'primary'} onPress={save} disabled={busy || !guard.ready} block>{busy ? 'Saving…' : guard.label || 'Save visit'}</Btn></>}>
      <Field label="Student" required>
        {seed?.request ? <Person name={student?.name} photo={student?.photo} sub={studentLine(student || {})} /> : (
          <StudentPick value={student} onChange={setStudent} search={findStudents} />
        )}
      </Field>
      <StudentAlerts id={student?._id} />
      <Field label="Reason" required>
        <Box value={reason} onChange={setReason} placeholder="e.g. Headache" />
        <View style={{ marginTop: 8 }}><Chips options={(meta?.settings?.visitReasons || []).map((r: string) => ({ value: r, label: r }))} value={reason} onChange={setReason} /></View>
      </Field>
      <Field label="Symptoms"><Box value={symptoms} onChange={setSymptoms} multiline /></Field>
      <VitalsFields v={vitals} onChange={setVitals} unit={unit} />
      <Field label="Treatment"><Box value={treatment} onChange={setTreatment} multiline /></Field>
      <Field label="First aid"><Box value={firstAid} onChange={setFirstAid} placeholder="e.g. Wound cleaned and dressed" /></Field>
      <MedicineField m={med} onChange={setMed} medicines={meta?.medicines || []} />
      {med.on && student?._id ? <DoseCheckLines student={student._id} item={med.source === 'school' ? med.item : ''} medicineName={med.source === 'parent' ? med.medicineName : ''} /> : null}
      {guard.view}
      <Field label="Status">
        <Chips options={['in_room', 'observation', 'emergency', 'returned', 'sent_home', 'referred'].map((k) => ({ value: k, label: VISIT_STATUS[k].label }))} value={status} onChange={setStatus} />
      </Field>
      {meta?.settings?.hasBeds && IN_ROOM.includes(status) ? (
        <Field label="Bed or rest area (optional)" hint={freeBeds.length ? undefined : 'Every bed is taken'}>
          <Pick label="Bed" value={bed} onChange={setBed} placeholder="No bed" options={[{ value: '', label: 'No bed' }, ...freeBeds.map((b: any) => ({ value: b._id, label: b.label }))]} />
        </Field>
      ) : null}
      {status === 'referred' ? <Field label="Hospital" required><Box value={hospital} onChange={setHospital} placeholder="e.g. City Hospital" /></Field> : null}
      {departed ? <Field label="Note for the teacher" hint="Shown on the teacher's request"><Box value={outcomeNote} onChange={setOutcomeNote} multiline /></Field> : null}
      <SwitchRow label="Parent contacted" value={parentContacted} onChange={setParentContacted} />
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

/** Treatment and readings for a visit in progress — from the full visit, so nothing on it is lost. */
function TreatSheet({ visitId, meta, onClose, onDone }: { visitId: string | null; meta: any; onClose: () => void; onDone: (msg: string) => void }) {
  const unit = meta?.settings?.temperatureUnit || 'F';
  const [v, setV] = useState<any>(null);
  const [vitals, setVitals] = useState<Vit>(noVitals());
  const [treatment, setTreatment] = useState('');
  const [observation, setObservation] = useState('');
  const [firstAid, setFirstAid] = useState('');
  const [rest, setRest] = useState(false);
  const [restMinutes, setRestMinutes] = useState('');
  const [parentContacted, setParentContacted] = useState(false);
  const [med, setMed] = useState<MedLine>(noMed());
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  const guard = useStop();
  const resetStop = guard.reset;

  useEffect(() => {
    let live = true;
    setV(null); setFail(''); setBusy(false); setMed(noMed()); resetStop();
    if (!visitId) return undefined;
    getMedVisit(visitId).then((r) => {
      if (!live) return;
      const x = unwrap(r);
      setV(x); setVitals(vitalsFrom(x.vitals)); setTreatment(x.treatment || ''); setObservation(x.observation || ''); setFirstAid(x.firstAid || '');
      setRest(!!x.restAdvised); setRestMinutes(x.restMinutes != null ? String(x.restMinutes) : ''); setParentContacted(!!x.parentContacted);
    }).catch((err) => { if (live) setFail(err?.message || 'The visit could not be loaded'); });
    return () => { live = false; };
  }, [visitId, resetStop]);

  const save = async () => {
    const mp = medProblem(med);
    if (mp) { setFail(mp); return; }
    setBusy(true); setFail('');
    try {
      const body: any = { treatment, observation, firstAid, restAdvised: rest, restMinutes: rest ? num(restMinutes) ?? null : null, parentContacted, medicines: medBody(med) };
      const vb = vitalsBody(vitals, unit);
      if (vb) body.vitals = vb;
      const ok = await guard.send((override) => updateMedVisit(String(visitId), { ...body, override }));
      if (ok) onDone('Visit updated');
    } catch (err: any) {
      setFail(err?.message || 'The visit could not be saved');
    } finally { setBusy(false); }
  };

  const st0 = v?.student || {};
  return (
    <Sheet visible={!!visitId} icon="pulse-outline" tone="blue" title="Treatment and readings" subtitle={v ? `${st0.name} · ${v.number}` : ''} onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Cancel</Btn><Btn kind={guard.stop ? 'stop' : 'primary'} onPress={save} disabled={busy || !v || !guard.ready} block>{busy ? 'Saving…' : guard.label || 'Save'}</Btn></>}>
      {!v && !fail ? <LoaderView /> : null}
      {v ? (
        <>
          <StudentAlerts id={st0._id} />
          <VitalsFields v={vitals} onChange={setVitals} unit={unit} />
          <Field label="Observation"><Box value={observation} onChange={setObservation} multiline /></Field>
          <Field label="Treatment"><Box value={treatment} onChange={setTreatment} multiline /></Field>
          <Field label="First aid"><Box value={firstAid} onChange={setFirstAid} /></Field>
          {(v.medicines || []).length ? <Line>{`Already given: ${v.medicines.map((m: any) => `${m.name} (${m.dosage})`).join(', ')}`}</Line> : null}
          <MedicineField m={med} onChange={setMed} medicines={meta?.medicines || []} />
          {med.on ? <DoseCheckLines student={st0._id} item={med.source === 'school' ? med.item : ''} medicineName={med.source === 'parent' ? med.medicineName : ''} /> : null}
          {guard.view}
          <SwitchRow label="Rest advised" value={rest} onChange={setRest} />
          {rest ? <Field label="Minutes"><Box value={restMinutes} onChange={setRestMinutes} keyboardType="number-pad" placeholder="15" /></Field> : null}
          <SwitchRow label="Parent contacted" value={parentContacted} onChange={setParentContacted} />
        </>
      ) : null}
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

/** What happens next: the status moves, the request follows, and the teacher and parents are told. */
function StatusSheet({ visit, meta, onClose, onDone }: { visit: any; meta: any; onClose: () => void; onDone: (msg: string) => void }) {
  const next = visit ? (VISIT_NEXT[visit.status] || []) : [];
  const [status, setStatus] = useState('');
  const [hospital, setHospital] = useState('');
  const [why, setWhy] = useState('');
  const [bed, setBed] = useState('');
  const [outcomeNote, setOutcomeNote] = useState('');
  const [notifyParents, setNotifyParents] = useState(true);
  const [collectNow, setCollectNow] = useState(false);
  const [collection, setCollection] = useState<any>({ idChecked: true });
  const [offRule, setOffRule] = useState('');
  const [offUntil, setOffUntil] = useState('');
  const [rules, setRules] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  useEffect(() => {
    if (!visit) return;
    setStatus(''); setHospital(visit.referral?.hospital || ''); setWhy(''); setBed(''); setOutcomeNote(''); setNotifyParents(true); setFail(''); setBusy(false);
    setCollectNow(false); setCollection({ idChecked: true }); setOffRule(''); setOffUntil('');
  }, [visit]);
  // The school's return-to-school rules, read when "Sent Home" is chosen.
  useEffect(() => {
    if (status !== 'sent_home' || rules) return;
    exclusionRules().then((r) => setRules(unwrap(r))).catch(() => setRules({ rules: {} }));
  }, [status, rules]);

  const departed = ['returned', 'sent_home', 'referred'].includes(status);
  const freeBeds = (meta?.beds || []).filter((b: any) => b.status === 'available');
  const save = async () => {
    if (!status) { setFail('Choose what happens next'); return; }
    if (status === 'referred' && !hospital.trim()) { setFail('Name the hospital'); return; }
    const handover = status === 'sent_home' && collectNow;
    const cp = handover ? collectionProblem(collection) : '';
    if (cp) { setFail(cp); return; }
    if (status === 'sent_home' && offRule === 'other' && !/^\d{4}-\d{2}-\d{2}$/.test(offUntil)) { setFail('Give the date the student can come back (YYYY-MM-DD)'); return; }
    setBusy(true); setFail('');
    try {
      await setMedVisitStatus(visit._id, {
        status, referral: status === 'referred' ? { hospital: hospital.trim(), reason: why } : undefined,
        bed: status === 'observation' && bed ? bed : undefined, outcomeNote: departed ? outcomeNote : undefined, notifyParents,
        collection: handover ? collectionToSend(collection) : undefined,
        exclusion: status === 'sent_home' && offRule ? { rule: offRule, until: offRule === 'other' ? offUntil : undefined } : undefined,
      });
      onDone(`${visit.studentName || 'The student'}: ${labelOf(VISIT_STATUS, status)}`);
    } catch (err: any) {
      setFail(err?.message || 'The visit could not be moved');
    } finally { setBusy(false); }
  };

  return (
    <Sheet visible={!!visit} icon="swap-horizontal-outline" tone="indigo" title="What happens next" subtitle={visit ? `${visit.studentName} · ${visit.number}` : ''} onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Cancel</Btn><Btn kind="primary" onPress={save} disabled={busy} block>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      {visit ? <View style={{ marginBottom: 10 }}><Line>Now: <Text style={st.strong}>{labelOf(VISIT_STATUS, visit.status)}</Text></Line></View> : null}
      <Field label="Next"><Chips options={next.map((k) => ({ value: k, label: VISIT_STATUS[k].label }))} value={status} onChange={setStatus} /></Field>
      {status === 'observation' && meta?.settings?.hasBeds && !visit?.bed ? (
        <Field label="Bed or rest area (optional)">
          <Pick label="Bed" value={bed} onChange={setBed} placeholder="No bed" options={[{ value: '', label: 'No bed' }, ...freeBeds.map((b: any) => ({ value: b._id, label: b.label }))]} />
        </Field>
      ) : null}
      {status === 'referred' ? (
        <>
          <Field label="Hospital" required><Box value={hospital} onChange={setHospital} /></Field>
          <Field label="Why"><Box value={why} onChange={setWhy} multiline /></Field>
        </>
      ) : null}
      {departed ? <Field label="Note for the teacher" hint="Shown on the teacher's request; a sensible one is written if you leave it empty"><Box value={outcomeNote} onChange={setOutcomeNote} multiline /></Field> : null}
      {status === 'sent_home' ? (
        <>
          <SwitchRow label="Collected now — the person is here" sub="Otherwise the student waits in the room and is listed as waiting to be collected" value={collectNow} onChange={setCollectNow} />
          {collectNow && visit ? <CollectorPicker visitId={visit._id} value={collection} onChange={setCollection} /> : null}
          <Field label="Must stay off school" hint="The family is told when the student can come back; class teachers only that they are away">
            <Pick label="Must stay off school" value={offRule} onChange={setOffRule} placeholder="No — back when well"
              options={[{ value: '', label: 'No — back when well' }, ...Object.entries(rules?.rules || {}).map(([value, r]: [string, any]) => ({ value, label: r.label }))]} />
          </Field>
          {offRule === 'other' ? <Field label="Can come back on" required><Box value={offUntil} onChange={setOffUntil} placeholder="YYYY-MM-DD" /></Field> : null}
          {offRule && rules?.rules?.[offRule] ? <Note tone="indigo" icon="calendar-outline">{`${rules.rules[offRule].text}${rules.rules[offRule].needsCertificate ? ' A doctor’s fitness certificate is needed.' : ''}`}</Note> : null}
        </>
      ) : null}
      {status && status !== 'closed' ? <SwitchRow label="Tell the parents" sub="They get a notification about the visit" value={notifyParents} onChange={setNotifyParents} /> : null}
      {status === 'emergency' ? <Note tone="red" icon="warning-outline">Every member of the medical staff is told at once, and the parents if you leave that on.</Note> : null}
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

/** A reason typed before something is undone. */
function ReasonSheet({ ask, onClose }: { ask: { title: string; sub?: string; label: string; go: (reason: string) => Promise<void> } | null; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  useEffect(() => { setReason(''); setFail(''); setBusy(false); }, [ask]);
  return (
    <Sheet visible={!!ask} icon="create-outline" tone="amber" title={ask?.title || ''} subtitle={ask?.sub} onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Back</Btn><Btn kind="primary" disabled={busy} block onPress={async () => {
        if (!reason.trim()) { setFail('Write a reason'); return; }
        setBusy(true); setFail('');
        try { await ask!.go(reason.trim()); } catch (err: any) { setFail(err?.message || 'That did not work'); setBusy(false); }
      }}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <Field label={ask?.label || 'Reason'} required><Box value={reason} onChange={setReason} multiline /></Field>
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

function IncidentSheet({ open, meta, onClose, onDone }: { open: boolean; meta: any; onClose: () => void; onDone: (msg: string) => void }) {
  const [student, setStudent] = useState<any>(null);
  const [type, setType] = useState('playground');
  const [severity, setSeverity] = useState('minor');
  const [when, setWhen] = useState('0');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [injury, setInjury] = useState('');
  const [firstAid, setFirstAid] = useState('');
  const [witnesses, setWitnesses] = useState('');
  const [notifyParents, setNotifyParents] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  // Only the kinds the school records — the server refuses any other.
  const allowed: string[] = meta?.settings?.incidentTypes?.length ? meta.settings.incidentTypes : Object.keys(INCIDENT_TYPE);
  const types = allowed.map((k: string) => ({ value: k, label: labelOf(INCIDENT_TYPE, k) }));
  const firstType = allowed.includes('playground') ? 'playground' : allowed[0] || 'other';
  useEffect(() => {
    if (!open) return;
    setStudent(null); setType(firstType); setSeverity('minor'); setWhen('0'); setLocation(''); setDescription(''); setInjury(''); setFirstAid(''); setWitnesses('');
    setNotifyParents(true); setFail(''); setBusy(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    if (!student) { setFail('Choose the student'); return; }
    if (!description.trim()) { setFail('Describe what happened'); return; }
    setBusy(true); setFail('');
    try {
      const r = unwrap(await createMedIncident({
        student: student._id, type: allowed.includes(type) ? type : firstType, severity, occurredAt: new Date(Date.now() - Number(when) * 60000).toISOString(),
        location, description: description.trim(), injury, firstAid, witnesses, notifyParents,
      }));
      onDone(`${r?.number || 'The incident'} recorded`);
    } catch (err: any) { setFail(err?.message || 'The incident could not be saved'); } finally { setBusy(false); }
  };
  return (
    <Sheet visible={open} icon="warning-outline" tone="orange" title="Report Medical Incident" onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Cancel</Btn><Btn kind="primary" onPress={save} disabled={busy} block>{busy ? 'Saving…' : 'Save incident'}</Btn></>}>
      <Field label="Student" required><StudentPick value={student} onChange={setStudent} search={findStudents} /></Field>
      <StudentAlerts id={student?._id} />
      <Field label="What kind"><Pick label="What kind" value={type} onChange={setType} options={types} /></Field>
      <Field label="How serious"><Seg options={optionsOf(INCIDENT_SEVERITY).map((o) => ({ ...o, tone: INCIDENT_SEVERITY[o.value].tone }))} value={severity} onChange={setSeverity} /></Field>
      <Field label="When"><Seg options={[{ value: '0', label: 'Just now' }, { value: '15', label: '15 min ago' }, { value: '30', label: '30 min ago' }, { value: '60', label: '1 hour ago' }]} value={when} onChange={setWhen} /></Field>
      <Field label="Where">
        <Box value={location} onChange={setLocation} placeholder="e.g. Playground" />
        <View style={{ marginTop: 8 }}><Chips options={(meta?.settings?.locations || []).map((r: string) => ({ value: r, label: r }))} value={location} onChange={setLocation} clearable /></View>
      </Field>
      <Field label="What happened" required><Box value={description} onChange={setDescription} multiline /></Field>
      <Field label="Injury"><Box value={injury} onChange={setInjury} /></Field>
      <Field label="First aid given"><Box value={firstAid} onChange={setFirstAid} /></Field>
      <Field label="Witnesses"><Box value={witnesses} onChange={setWitnesses} /></Field>
      <SwitchRow label="Tell the parents now" value={notifyParents} onChange={setNotifyParents} />
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

/** A dose given now: an as-needed medicine on the student's plan. */
function GiveSheet({ plan, onClose, onDone }: { plan: any; onClose: () => void; onDone: (msg: string) => void }) {
  const [dosage, setDosage] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  const guard = useStop();
  const resetStop = guard.reset;
  useEffect(() => {
    if (!plan) return;
    resetStop();
    // 0 per dose is deliberate (puffs from an inhaler do not use one up).
    setDosage(plan.dosage || ''); setQuantity(String(plan.quantityPerDose ?? 1)); setNote(''); setFail(''); setBusy(false);
  }, [plan, resetStop]);
  const save = async () => {
    if (!dosage.trim()) { setFail('Give the dosage'); return; }
    setBusy(true); setFail('');
    try {
      // A cleared box is the plan's own figure, not 0 — 0 took nothing from stock.
      const ok = await guard.send((override) => giveMedDose({ student: plan.studentId || plan.student, plan: plan._id, dosage: dosage.trim(), quantity: plan.source === 'school' ? (num(quantity) ?? undefined) : undefined, note, override }));
      if (ok) onDone(`${plan.medicineName} recorded as given`);
    } catch (err: any) { setFail(err?.message || 'The dose could not be recorded'); } finally { setBusy(false); }
  };
  return (
    <Sheet visible={!!plan} icon="medical-outline" tone="violet" title={plan ? `Give ${plan.medicineName}` : ''} subtitle={plan ? `${plan.studentName} · ${plan.classLabel || ''}` : ''} onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Cancel</Btn><Btn kind={guard.stop ? 'stop' : 'primary'} onPress={save} disabled={busy || !guard.ready} block>{busy ? 'Saving…' : guard.label || 'Record as given'}</Btn></>}>
      {plan ? <StudentAlerts id={plan.studentId || plan.student} /> : null}
      {plan && !guard.stop ? <DoseCheckLines student={plan.studentId || plan.student} plan={plan._id} /> : null}
      {guard.view}
      {plan?.instructions ? <Note tone="indigo" icon="information-circle-outline">{plan.instructions}</Note> : null}
      <Field label="Dosage" required><Box value={dosage} onChange={setDosage} /></Field>
      {plan?.source === 'school' ? <Field label="Units from stock" hint="0 when a dose does not use a unit up, such as puffs from an inhaler"><Box value={quantity} onChange={setQuantity} keyboardType="decimal-pad" /></Field> : null}
      <Field label="Note"><Box value={note} onChange={setNote} /></Field>
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

/* ── Sent home: who collected the student ──────────────────────────────────── */

// The phone typed under "Someone else" stays in the form when a known contact
// is picked instead; it is not theirs, so it is not sent.
const collectionToSend = (c: any) => (c?.contact === 'other' ? c : { ...c, phone: undefined });

const collectionProblem = (c: any) => {
  if (!c?.contact) return 'Choose who collected the student';
  if (c.contact === 'other' && !String(c.name || '').trim()) return 'Who collected the student?';
  if (c.contact === 'other' && !String(c.note || '').trim()) return 'Someone not on the record: say who allowed it';
  if (c.contact === 'other' && phoneError(c.phone, 'Their phone')) return phoneError(c.phone, 'Their phone') as string;
  return '';
};

/** The people on the student's record, or someone else with who allowed it. */
function CollectorPicker({ visitId, value, onChange }: { visitId: string; value: any; onChange: (v: any) => void }) {
  const [list, setList] = useState<any[] | null>(null);
  useEffect(() => {
    let live = true;
    visitCollectors(visitId).then((r) => { if (live) setList(unwrap(r) || []); }).catch(() => { if (live) setList([]); });
    return () => { live = false; };
  }, [visitId]);
  const set = (patch: any) => onChange({ ...value, ...patch });
  if (!list) return <LoaderView />;
  const options = [...list.map((c: any) => ({ value: c.key, label: `${c.name || '—'}${c.relation ? ` (${c.relation})` : ''}` })), { value: 'other', label: 'Someone else' }];
  return (
    <View>
      <Field label="Collected by" required><Chips options={options} value={value.contact || ''} onChange={(v) => set({ contact: v })} /></Field>
      {value.contact === 'other' ? (
        <>
          <Note tone="amber" icon="warning-outline">Only with a parent’s permission — say who gave it. The parents are told at once.</Note>
          <Field label="Name" required><Box value={value.name || ''} onChange={(v) => set({ name: v })} /></Field>
          <Field label="Relation"><Box value={value.relation || ''} onChange={(v) => set({ relation: v })} placeholder="e.g. Neighbour, driver" /></Field>
          <Field label="Phone"><Box value={value.phone || ''} onChange={(v) => set({ phone: v })} phone /></Field>
          <Field label="Who allowed it" required><Box value={value.note || ''} onChange={(v) => set({ note: v })} placeholder="e.g. Mother, by phone at 11:40" /></Field>
        </>
      ) : null}
      <SwitchRow label="ID checked" sub="A photo ID, or the school’s pick-up card" value={value.idChecked !== false} onChange={(v) => set({ idChecked: v })} />
      {value.idChecked !== false ? <Field label="Which ID (optional)"><Box value={value.idNote || ''} onChange={(v) => set({ idNote: v })} placeholder="e.g. Aadhaar, driving licence" /></Field> : null}
    </View>
  );
}

function CollectionSheet({ visit, onClose, onDone }: { visit: any; onClose: () => void; onDone: (msg: string) => void }) {
  const [c, setC] = useState<any>({ idChecked: true });
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  useEffect(() => { setC({ idChecked: true }); setFail(''); setBusy(false); }, [visit]);
  const save = async () => {
    const p = collectionProblem(c);
    if (p) { setFail(p); return; }
    setBusy(true); setFail('');
    try { await recordVisitCollection(visit._id, collectionToSend(c)); onDone(`${visit.studentName || 'The student'}: collection recorded`); }
    catch (err: any) { setFail(err?.message || 'It could not be recorded'); } finally { setBusy(false); }
  };
  return (
    <Sheet visible={!!visit} icon="people-outline" tone="orange" title="Who collected the student" subtitle={visit ? `${visit.studentName} · ${visit.number}` : ''} onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Cancel</Btn><Btn kind="primary" onPress={save} disabled={busy} block>{busy ? 'Saving…' : 'Record collection'}</Btn></>}>
      {visit ? <CollectorPicker visitId={visit._id} value={c} onChange={setC} /> : null}
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

/* ── Tabs ─────────────────────────────────────────────────────────────────── */

function RoomTab({ meta, onVisit, onStatus, onTreat, onCollect, onChanged, onReading, onCare, stamp }: {
  meta: any; onVisit: () => void; onStatus: (v: any) => void; onTreat: (id: string) => void; onCollect: (v: any) => void; onChanged: (msg?: string) => void;
  onReading: (v: any) => void; onCare: (id: string) => void; stamp: number;
}) {
  const [d, setD] = useState<any>(null);
  const [urgent, setUrgent] = useState<any>(null);
  const [fail, setFail] = useState('');
  const load = useCallback(async () => {
    try {
      const [room, u] = await Promise.all([deskRoom(), deskUrgent().catch(() => null)]);
      setD(unwrap(room)); if (u) setUrgent(unwrap(u)); setFail('');
    } catch (err: any) { setFail(err?.message || 'The room could not be loaded'); }
  }, []);
  useEffect(() => { load(); }, [load, stamp]);
  // A room changes by the minute: look again every 30 seconds.
  useEffect(() => { const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  if (fail && !d) return <Blank icon="cloud-offline-outline" title="The room could not be loaded" body={fail} />;
  if (!d) return <LoaderView />;
  const t = d.today || {};
  return (
    <>
      <FamiliesToReach data={urgent} onChanged={(m) => { load(); onChanged(m); }} />
      <Panel icon="bed-outline" tone="indigo" title="In the Medical Room now" subtitle={d.active.length ? plural(d.active.length, 'student') : 'Nobody is in the room'}>
        {d.active.length ? d.active.map((v: any) => (
          <Card key={v._id} critical={v.status === 'emergency'}>
            <Person name={v.studentName} photo={v.studentPhoto} sub={studentLine(v)} />
            <View style={st.pills}>
              <Status map={VISIT_STATUS} value={v.status} />
              <TriagePill level={v.triage?.level} />
              {(v.flags || []).map((f: any) => <Pill key={f.label} tone={f.level === 'critical' ? 'red' : 'amber'}>{f.label}</Pill>)}
            </View>
            {v.recheckDue ? <Line tone="red" strong>{`Recheck due${v.protocolKey === 'head_injury' ? ' — head injury' : ''}`}</Line>
              : v.nextCheckAt ? <Line>{`Next check ${fmtTime(v.nextCheckAt)}`}</Line> : null}
            <Text style={st.reason}>{v.reason}{v.symptoms ? <Text style={st.reasonMore}>{` — ${v.symptoms}`}</Text> : null}</Text>
            <Line>{[`arrived ${fmtTime(v.arrivedAt)} (${since(v.arrivedAt)})`, v.bedLabel, v.handledByName].filter(Boolean).join(' · ')}</Line>
            {vitalsLine(v.vitals) ? <Line>{vitalsLine(v.vitals)}</Line> : null}
            {v.treatment ? <Line>{`Treatment: ${v.treatment}`}</Line> : null}
            <View style={st.btns}>
              <Btn kind="primary" icon="swap-horizontal-outline" onPress={() => onStatus(v)} block>Next step</Btn>
              <Btn icon="pulse-outline" onPress={() => onTreat(v._id)} block>Treatment</Btn>
            </View>
            <View style={st.btns}>
              <Btn kind={v.recheckDue ? 'stop' : 'ghost'} icon="thermometer-outline" onPress={() => onReading(v)} block>Reading</Btn>
              <Btn icon="medkit-outline" onPress={() => onCare(v._id)} block>Triage</Btn>
            </View>
          </Card>
        )) : (
          <Blank icon="bed-outline" title="The room is empty" body="Students sent by teachers, and anyone who walks in, appear here while they are being seen."
            action={<Btn kind="primary" icon="add" onPress={onVisit}>Add Medical Visit</Btn>} />
        )}
      </Panel>
      {(d.awaiting || []).length ? (
        <Panel icon="home-outline" tone="orange" title="Waiting to be collected" subtitle="Sent home — still at school until someone is recorded as taking them">
          {d.awaiting.map((v: any) => (
            <Card key={v._id}>
              <Person name={v.studentName} photo={v.studentPhoto} sub={studentLine(v)} />
              <Text style={st.reason}>{v.reason}</Text>
              <Line>{[`sent home ${fmtTime(v.departedAt)} (${since(v.departedAt)} ago)`, v.parentContacted ? 'parent contacted' : 'parent not reached yet'].join(' · ')}</Line>
              <View style={{ alignSelf: 'flex-start', marginTop: 6 }}><Btn kind="primary" icon="people-outline" onPress={() => onCollect(v)}>Record collection</Btn></View>
            </Card>
          ))}
        </Panel>
      ) : null}
      {meta?.settings?.hasBeds && (d.beds || []).length ? (
        <Panel icon="bed-outline" tone="slate" title="Beds and rest areas">
          {(d.beds || []).map((b: any) => (
            <View key={b._id} style={st.bed}>
              <Text style={st.bedName}>{b.label}</Text>
              <Text style={st.bedWho} numberOfLines={1}>{b.studentName ? `${b.studentName} · ${since(b.bedIn)}` : ''}</Text>
              <Pill tone={b.status === 'available' ? 'green' : b.status === 'occupied' ? 'red' : b.status === 'cleaning' ? 'amber' : 'slate'}>
                {b.status === 'available' ? 'Available' : b.status === 'occupied' ? 'Occupied' : b.status === 'cleaning' ? 'Being cleaned' : 'Out of service'}
              </Pill>
            </View>
          ))}
        </Panel>
      ) : null}
      <Panel icon="today-outline" tone="slate" title="Today">
        <Line>{`${plural(t.total || 0, 'visit')} · ${count(t.returned || 0)} back to class · ${count(t.sentHome || 0)} sent home · ${count(t.referred || 0)} referred`}</Line>
      </Panel>
    </>
  );
}

function RequestsTab({ onArrived, stamp, reloadAll }: { onArrived: (r: any) => void; stamp: number; reloadAll: () => void }) {
  const [d, setD] = useState<any>(null);
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState('');
  const [ask, setAsk] = useState<any>(null);
  const load = useCallback(async () => {
    try { setD(unwrap(await deskBoard('requests', { tab: 'open', limit: 50 }))); setFail(''); } catch (err: any) { setFail(err?.message || 'Requests could not be loaded'); }
  }, []);
  useEffect(() => { load(); }, [load, stamp]);
  useEffect(() => { const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  if (fail && !d) return <Blank icon="cloud-offline-outline" title="Requests could not be loaded" body={fail} />;
  if (!d) return <LoaderView />;
  const rows = d.rows || [];
  return (
    <>
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
      {rows.length ? rows.map((r: any) => (
        <Card key={r._id} critical={r.urgency === 'emergency'}>
          <Person name={r.studentName} photo={r.studentPhoto} sub={studentLine(r)} />
          <View style={st.pills}><Status map={REQUEST_STATUS} value={r.status} /><Status map={URGENCY} value={r.urgency} /></View>
          <Text style={st.reason}>{r.reason}{r.symptoms ? <Text style={st.reasonMore}>{` — ${r.symptoms}`}</Text> : null}</Text>
          <Line>{[r.number, r.requestedByName, r.location, ago(r.createdAt)].filter(Boolean).join(' · ')}</Line>
          {r.escortedBy ? <Line>{`Coming with: ${r.escortedBy}`}</Line> : null}
          {r.remarks ? <Line>{r.remarks}</Line> : null}
          {['requested', 'accepted'].includes(r.status) ? (
            <View style={st.btns}>
              {r.status === 'requested' ? (
                <Btn disabled={busy === r._id} block onPress={async () => {
                  setBusy(r._id);
                  try { await acceptMedRequest(r._id); await load(); } catch (err: any) { setFail(err?.message || 'It could not be accepted'); } finally { setBusy(''); }
                }}>{busy === r._id ? 'Accepting…' : 'Accept'}</Btn>
              ) : null}
              <Btn kind="primary" block onPress={() => onArrived(r)}>Arrived</Btn>
              <Btn kind="danger" block onPress={() => setAsk({
                title: 'Close the request', sub: `${r.studentName} · ${r.number}`, label: 'Why — the teacher sees this',
                go: async (reason: string) => { await cancelMedRequest(r._id, reason); setAsk(null); load(); reloadAll(); },
              })}>Close</Btn>
            </View>
          ) : <Line tone="blue">{r.visitNumber ? `In the room — ${r.visitNumber}` : 'In the room'}</Line>}
        </Card>
      )) : <Blank icon="file-tray-outline" title="No requests waiting" body="When a teacher sends a student to the Medical Room it appears here at once." />}
      <ReasonSheet ask={ask} onClose={() => setAsk(null)} />
    </>
  );
}

/** "Confirm it is you": a code emailed to the nurse, kept for 12 hours on this phone. */
function StepUpSheet({ open, onDone }: { open: boolean; onDone: () => void }) {
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  useEffect(() => { if (open) { setSentTo(''); setCode(''); setFail(''); setBusy(false); } }, [open]);
  const send = async () => {
    setBusy(true); setFail('');
    try { setSentTo(unwrap(await sendStepUpCode())?.sentTo || 'your email'); } catch (err: any) { setFail(err?.message || 'The code could not be sent'); } finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setFail('');
    try {
      const r = unwrap(await verifyStepUpCode(code));
      await storage.setItem('medicalStepUp', r.token);
      onDone();
    } catch (err: any) { setFail(err?.message || 'That code did not work'); } finally { setBusy(false); }
  };
  return (
    <Sheet visible={open} icon="lock-closed-outline" tone="indigo" title="Confirm it is you" subtitle="Your school asks for a code every 12 hours" onClose={() => {}} busy={busy}
      footer={sentTo ? <Btn kind="primary" onPress={verify} disabled={busy || code.replace(/\D/g, '').length !== 6} block>{busy ? 'Checking…' : 'Confirm'}</Btn>
        : <Btn kind="primary" onPress={send} disabled={busy} block>{busy ? 'Sending…' : 'Email me a code'}</Btn>}>
      <Note tone="indigo" icon="information-circle-outline">Before the Medical Room&rsquo;s records open, a code is emailed to you.</Note>
      {sentTo ? <Field label={`The code sent to ${sentTo}`} required><Box value={code} onChange={setCode} keyboardType="number-pad" placeholder="6 digits" maxLength={7} /></Field> : null}
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

/** The medicine fridge's reading (2–8 °C), at the fridge. */
function FridgeSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const [v, setV] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  useEffect(() => { if (open) { setV({ current: '', min: '', max: '', reset: true, action: '' }); setFail(''); setBusy(false); } }, [open]);
  const off = ['current', 'min', 'max'].some((k) => String(v[k] ?? '').trim() !== '' && (Number(v[k]) < 2 || Number(v[k]) > 8));
  const save = async () => {
    if (String(v.current ?? '').trim() === '') { setFail('Give the temperature now'); return; }
    if (off && !String(v.action || '').trim()) { setFail('Out of range: say what you did'); return; }
    setBusy(true); setFail('');
    try {
      const r = unwrap(await logFridge({ current: Number(v.current), min: v.min === '' ? undefined : Number(v.min), max: v.max === '' ? undefined : Number(v.max), reset: v.reset, action: v.action }));
      onDone(r?.outOfRange ? 'Logged — out of range, the medical staff have been told' : 'Fridge logged');
    } catch (err: any) { setFail(err?.message || 'It could not be logged'); setBusy(false); }
  };
  return (
    <Sheet visible={open} icon="thermometer-outline" tone="blue" title="Fridge temperature" subtitle="Vaccines and insulin keep at 2–8 °C" onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Cancel</Btn><Btn kind="primary" onPress={save} disabled={busy} block>{busy ? 'Saving…' : 'Log it'}</Btn></>}>
      <View style={st.pair}>
        <View style={{ flex: 1 }}><Field label="Now °C" required><Box value={v.current} onChange={(x) => setV({ ...v, current: x })} keyboardType="decimal-pad" placeholder="—" /></Field></View>
        <View style={{ flex: 1 }}><Field label="Lowest"><Box value={v.min} onChange={(x) => setV({ ...v, min: x })} keyboardType="decimal-pad" placeholder="—" /></Field></View>
        <View style={{ flex: 1 }}><Field label="Highest"><Box value={v.max} onChange={(x) => setV({ ...v, max: x })} keyboardType="decimal-pad" placeholder="—" /></Field></View>
      </View>
      <SwitchRow label="Reset the min/max after reading" value={!!v.reset} onChange={(x) => setV({ ...v, reset: x })} />
      {off ? (
        <>
          <Note tone="red" icon="warning-outline">Out of range — check the vaccines and insulin before they are used.</Note>
          <Field label="What you did" required><Box value={v.action} onChange={(x) => setV({ ...v, action: x })} multiline placeholder="e.g. Door was open; closed it, moved insulin to the spare fridge" /></Field>
        </>
      ) : null}
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

/** A controlled medicine: who watched the dose. */
function WitnessSheet({ ask, onClose }: { ask: { sub: string; message: string; go: (witness: string) => Promise<void> } | null; onClose: () => void }) {
  const [who, setWho] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setWho(null); setBusy(false); }, [ask]);
  return (
    <Sheet visible={!!ask} icon="people-outline" tone="amber" title="A witness is needed" subtitle={ask?.sub} onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Not given</Btn><Btn kind="primary" disabled={!who?._id || busy} block onPress={async () => { setBusy(true); try { await ask?.go(String(who._id)); } finally { setBusy(false); } }}>{busy ? 'Saving…' : 'Witnessed — give it'}</Btn></>}>
      {ask ? <Note tone="amber" icon="information-circle-outline">{`${ask.message}.`}</Note> : null}
      <Field label="Who is watching?" required><StudentPick value={who} onChange={setWho} search={findStaff} placeholder="Search staff by name" /></Field>
    </Sheet>
  );
}

function RoundTab({ onGive, stamp, flash }: { onGive: (plan: any) => void; stamp: number; flash: (m: string) => void }) {
  const [d, setD] = useState<any>(null);
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState('');
  const [ask, setAsk] = useState<any>(null);
  const [stopAsk, setStopAsk] = useState<any>(null);
  const [witnessAsk, setWitnessAsk] = useState<any>(null);
  const load = useCallback(async () => {
    try { setD(unwrap(await deskAdministration())); setFail(''); } catch (err: any) { setFail(err?.message || 'The round could not be loaded'); }
  }, []);
  useEffect(() => { load(); }, [load, stamp]);
  const record = async (dose: any, status: string, note?: string, override?: { reason?: string; witness?: string }) => {
    setBusy(dose._id);
    try {
      await recordMedDose(dose._id, { status, note, override });
      flash(`${dose.medicineName}: ${labelOf(DOSE_STATUS, status).toLowerCase()}`);
      setStopAsk(null); setWitnessAsk(null);
      await load();
    } catch (err: any) {
      // The safety check stopped it: ask why it should go ahead (StopSheet), then record again.
      if (err?.data?.code === 'MEDICAL_SAFETY') {
        setStopAsk({ title: 'Stop — check before giving this', sub: `${dose.studentName} · ${dose.medicineName}`, problems: err.data.problems || [], warnings: err.data.warnings || [],
          go: async (reason: string) => { await record(dose, status, note, { ...(override || {}), reason }); } });
      } else if (err?.data?.code === 'MEDICAL_WITNESS_REQUIRED') {
        // A controlled medicine: a second member of staff watches it given.
        setStopAsk(null);
        setWitnessAsk({ sub: `${dose.studentName} · ${dose.medicineName}`, message: err.data.message, go: async (witness: string) => { await record(dose, status, note, { ...(override || {}), witness }); } });
      } else setFail(err?.message || 'The dose could not be recorded');
    } finally { setBusy(''); }
  };
  if (fail && !d) return <Blank icon="cloud-offline-outline" title="The round could not be loaded" body={fail} />;
  if (!d) return <LoaderView />;
  const doses = [...(d.doses || [])].sort((a, b) => Number(a.status !== 'scheduled') - Number(b.status !== 'scheduled') || new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
  const c = d.counts || {};
  return (
    <>
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
      <Panel icon="alarm-outline" tone="violet" title="Today’s medication round" subtitle={`${count(c.scheduled || 0)} due · ${count(c.given || 0)} given${c.overdue ? ` · ${count(c.overdue)} overdue` : ''}`}>
        {doses.length ? doses.map((x: any) => {
          const overdue = x.status === 'scheduled' && new Date(x.scheduledFor).getTime() < Date.now();
          return (
            <Card key={x._id} critical={overdue}>
              <Person name={x.studentName} photo={x.studentPhoto} sub={studentLine(x)} right={<Text style={[st.time, overdue && { color: Colors.danger }]}>{fmtTime(x.scheduledFor)}</Text>} />
              <View style={st.pills}><Status map={DOSE_STATUS} value={x.status} />{overdue ? <Pill tone="red">Overdue</Pill> : null}</View>
              <Text style={st.reason}>{`${x.medicineName} — ${x.dosage}`}</Text>
              <Line>{[x.route, x.source === 'parent' ? 'Family’s own' : x.itemStock != null ? `${count(x.itemStock)} ${x.itemUnit || ''} in stock` : 'From stock'].filter(Boolean).join(' · ')}</Line>
              {x.instructions ? <Line>{x.instructions}</Line> : null}
              {x.status === 'given' ? <Line tone="green">{`Given ${fmtTime(x.givenAt)}${x.givenByName ? ` by ${x.givenByName}` : ''}`}</Line> : null}
              {x.note ? <Line>{x.note}</Line> : null}
              {x.status === 'scheduled' || x.status === 'missed' ? (
                <View style={st.btns}>
                  <Btn kind="primary" disabled={busy === x._id} block onPress={() => record(x, 'given')}>{busy === x._id ? 'Saving…' : 'Given'}</Btn>
                  {x.status === 'scheduled' ? <Btn disabled={busy === x._id} block onPress={() => record(x, 'missed')}>Missed</Btn> : null}
                  {x.status === 'scheduled' ? (
                    <Btn kind="danger" disabled={busy === x._id} block onPress={() => setAsk({
                      title: 'Refused', sub: `${x.studentName} · ${x.medicineName}`, label: 'Why — the parents are told',
                      go: async (note: string) => { setAsk(null); await record(x, 'refused', note); },
                    })}>Refused</Btn>
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        }) : <Blank icon="checkmark-done-outline" title="Nothing due today" body="Scheduled doses from medication plans appear here." />}
      </Panel>
      {(d.asNeeded || []).length ? (
        <Panel icon="medical-outline" tone="indigo" title="As needed" subtitle="Plans given when the student needs them">
          {d.asNeeded.map((p: any) => (
            <Card key={p._id}>
              <Person name={p.studentName} photo={p.studentPhoto} sub={studentLine(p)} />
              <Text style={st.reason}>{`${p.medicineName} — ${p.dosage}`}</Text>
              {p.instructions ? <Line>{p.instructions}</Line> : null}
              <View style={{ alignSelf: 'flex-start' }}><Btn kind="primary" icon="medical-outline" onPress={() => onGive(p)}>Give now</Btn></View>
            </Card>
          ))}
        </Panel>
      ) : null}
      <Muted>Medication plans are set up on the web portal; a parent authorises each one in the app.</Muted>
      <ReasonSheet ask={ask} onClose={() => setAsk(null)} />
      <StopSheet ask={stopAsk} onClose={() => setStopAsk(null)} />
      <WitnessSheet ask={witnessAsk} onClose={() => setWitnessAsk(null)} />
    </>
  );
}

function IncidentsTab({ onReport, stamp, flash }: { onReport: () => void; stamp: number; flash: (m: string) => void }) {
  const [d, setD] = useState<any>(null);
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    try { setD(unwrap(await deskBoard('incidents', { tab: 'open', limit: 50 }))); setFail(''); } catch (err: any) { setFail(err?.message || 'Incidents could not be loaded'); }
  }, []);
  useEffect(() => { load(); }, [load, stamp]);
  if (fail && !d) return <Blank icon="cloud-offline-outline" title="Incidents could not be loaded" body={fail} />;
  if (!d) return <LoaderView />;
  return (
    <>
      <View style={{ alignSelf: 'flex-start', marginBottom: 12 }}><Btn kind="primary" icon="add" onPress={onReport}>Report Medical Incident</Btn></View>
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
      {(d.rows || []).length ? d.rows.map((i: any) => (
        <Card key={i._id} critical={['serious', 'critical'].includes(i.severity)}>
          <Person name={i.studentName} photo={i.studentPhoto} sub={studentLine(i)} />
          <View style={st.pills}><Status map={INCIDENT_SEVERITY} value={i.severity} /><Status map={INCIDENT_STATUS} value={i.status} /></View>
          <Text style={st.reason}>{labelOf(INCIDENT_TYPE, i.type)}{i.location ? <Text style={st.reasonMore}>{` — ${i.location}`}</Text> : null}</Text>
          <Line>{i.description}</Line>
          {i.injury ? <Line>{`Injury: ${i.injury}`}</Line> : null}
          <Line>{[i.number, fmtStamp(i.occurredAt), i.reportedByName ? `reported by ${i.reportedByName}` : ''].filter(Boolean).join(' · ')}</Line>
          {!i.visit ? (
            <View style={{ alignSelf: 'flex-start' }}>
              <Btn disabled={busy === i._id} onPress={async () => {
                setBusy(i._id);
                try { await treatMedIncident(i._id); flash('Brought into the room as a visit'); await load(); } catch (err: any) { setFail(err?.message || 'That did not work'); } finally { setBusy(''); }
              }}>{busy === i._id ? 'Opening…' : 'Treat in the Medical Room'}</Btn>
            </View>
          ) : <Line tone="blue">Being treated — it has a visit</Line>}
        </Card>
      )) : <Blank icon="shield-checkmark-outline" title="No open incidents" body="Injuries and accidents reported by teachers and the medical staff appear here." />}
    </>
  );
}

function AlertsTab({ onCard, stamp }: { onCard: (id: string) => void; stamp: number }) {
  const [d, setD] = useState<any>(null);
  const [fail, setFail] = useState('');
  const [level, setLevel] = useState('critical');
  useEffect(() => {
    (async () => { try { setD(unwrap(await deskAlerts())); setFail(''); } catch (err: any) { setFail(err?.message || 'Alerts could not be loaded'); } })();
  }, [stamp]);
  if (fail && !d) return <Blank icon="cloud-offline-outline" title="Alerts could not be loaded" body={fail} />;
  if (!d) return <LoaderView />;
  const critical = [...(d.critical || []), ...(d.warning || []).filter((w: any) => w.level === 'critical')];
  const lists: Record<string, any[]> = { critical, warning: (d.warning || []).filter((w: any) => w.level === 'warning'), info: d.info || [] };
  const rows = lists[level] || [];
  return (
    <>
      <View style={{ marginBottom: 12 }}>
        <Tabs value={level} onChange={setLevel} items={[
          { key: 'critical', label: 'Critical', count: lists.critical.length },
          { key: 'warning', label: 'Warnings', count: lists.warning.length },
          { key: 'info', label: 'Information', count: lists.info.length },
        ]} />
      </View>
      {rows.length ? rows.map((a: any) => {
        const tone = LEVEL_TONE[a.level] || 'slate';
        const sid = a.student?.studentId;
        return (
          <Card key={a.id} critical={a.level === 'critical'}>
            <View style={st.alertTop}>
              <Text style={[st.reason, { flex: 1 }]}>{a.title}</Text>
              <Pill tone={tone}>{a.level === 'critical' ? 'Critical' : a.level === 'warning' ? 'Warning' : 'Information'}</Pill>
            </View>
            {a.detail ? <Line>{a.detail}</Line> : null}
            {a.student ? <Person name={a.student.studentName} photo={a.student.studentPhoto} sub={a.student.classLabel} size={30} /> : null}
            {a.at ? <Line>{ago(a.at)}</Line> : null}
            {sid && ['allergy', 'condition', 'emergency_medication'].includes(a.kind) ? (
              <View style={{ alignSelf: 'flex-start' }}><Btn icon="medkit-outline" onPress={() => onCard(sid)}>Emergency card</Btn></View>
            ) : null}
          </Card>
        );
      }) : <Blank icon="checkmark-done-outline" title="Nothing here" body="Alerts are worked out from the records, so each one clears the moment it is dealt with." />}
    </>
  );
}

function LookupTab({ onCard, onVisit }: { onCard: (id: string) => void; onVisit: (student: any) => void }) {
  const [student, setStudent] = useState<any>(null);
  return (
    <Panel icon="search-outline" tone="red" title="Emergency information" subtitle="Find a student and see at once what anyone looking after them must know.">
      <StudentPick value={student} onChange={(s) => { setStudent(s); onCard(s._id); }} search={findStudents} />
      {student ? (
        <View style={[st.btns, { marginTop: 10 }]}>
          <Btn kind="danger" icon="medkit-outline" onPress={() => onCard(student._id)} block>Emergency card</Btn>
          <Btn icon="add" onPress={() => onVisit(student)} block>Add visit</Btn>
        </View>
      ) : null}
    </Panel>
  );
}

/* ── The screen ───────────────────────────────────────────────────────────── */

const TAB_KEYS = ['room', 'requests', 'round', 'incidents', 'alerts', 'lookup'];
/**
 * The tab a notification names. Stock, expiry, maintenance and document
 * notices carry the web page's own tab (low, expired, expiring, due) — on the
 * phone all of those are Alerts.
 */
const deskTab = (t?: string) => (!t ? 'room' : TAB_KEYS.includes(t) ? t : 'alerts');

export default function MedicalDesk({ initialTab, focus }: { initialTab?: string; focus?: string }) {
  const [tab, setTab] = useState(deskTab(initialTab));
  // A campaign's notice opens its roster ("Today: the deworming day"); an outbreak's, the outbreak;
  // a family's "off sick", the list of them; a new student's health details, their card (below).
  const [roster, setRoster] = useState(initialTab === 'campaigns');
  const { user } = useAuth();
  const [scan, setScan] = useState(false);
  const [addFor, setAddFor] = useState<any>(null);
  const [checkups, setCheckups] = useState(false);
  const [offline, setOffline] = useState(false);
  const [outbreak, setOutbreak] = useState<string | null>(initialTab === 'outbreaks' && focus ? focus : null);
  const [illness, setIllness] = useState(initialTab === 'illness');
  // Another notification opened onto the desk that is already showing.
  const firstTab = React.useRef(true);
  useEffect(() => {
    if (firstTab.current) { firstTab.current = false; return; }
    if (initialTab === 'campaigns') setRoster(true);
    else if (initialTab === 'outbreaks') { if (focus) setOutbreak(focus); }
    else if (initialTab === 'illness') setIllness(true);
    else if (initialTab) setTab(deskTab(initialTab));
  }, [initialTab, focus]);
  const [ov, setOv] = useState<any>(null);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');
  const [stamp, setStamp] = useState(0);
  const [flash, setFlash] = useState('');
  const [visitSeed, setVisitSeed] = useState<any>(null);
  const [treat, setTreat] = useState<string | null>(null);
  const [moving, setMoving] = useState<any>(null);
  const [incident, setIncident] = useState(false);
  const [give, setGive] = useState<any>(null);
  const [collecting, setCollecting] = useState<any>(null);
  const [readingFor, setReadingFor] = useState<any>(null);
  const [careFor, setCareFor] = useState<string | null>(null);
  const [fridge, setFridge] = useState(false);
  const [stepUp, setStepUp] = useState(false);
  const [card, setCard] = useState<any>(null);
  const [cardFail, setCardFail] = useState('');

  const load = useCallback(async () => {
    try {
      const [o, m] = await Promise.all([deskOverview(), deskMeta()]);
      setOv(unwrap(o)); setMeta(unwrap(m)); setError('');
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else if (err?.data?.code === 'MEDICAL_STEP_UP') setStepUp(true);
      else setError(err?.message || 'The Medical Room could not be loaded');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  /** After any change: the figures, meta (beds) and the open tab all reload. */
  const changed = useCallback((msg?: string) => { if (msg) setFlash(msg); setStamp((n) => n + 1); load(); }, [load]);
  // Someone else's change, from the server: the same reload, without a message; an emergency buzzes.
  const nudged = useCallback(() => { setStamp((n) => n + 1); load(); }, [load]);
  useMedLive(nudged, { onUrgent: buzz });
  const openCard = useCallback(async (id: string) => {
    setCardFail('');
    try { setCard(unwrap(await deskEmergency(id))); } catch (err: any) { setCardFail(err?.message || 'The emergency card could not be opened'); }
  }, []);
  // A notice about one student (a new student's health details) opens their card once the desk is up.
  const cardShown = React.useRef('');
  useEffect(() => {
    if (initialTab !== 'lookup' || !focus || !ov || cardShown.current === focus) return;
    cardShown.current = focus;
    openCard(focus);
  }, [initialTab, focus, ov, openCard]);

  /** The server says this is now an emergency: one tap makes it one. */
  const offerEmergency = useCallback(async (visitId: string, reasons: string[]) => {
    if (!(await confirmAsync('Treat this as an emergency?', `${reasons.length ? `${reasons.join(' · ')}. ` : ''}The medical staff and the parents are told at once.`, 'Make it an emergency'))) return;
    try { await setMedVisitStatus(visitId, { status: 'emergency' }); changed('Treated as an emergency'); } catch (err: any) { setFlash(err?.message || 'It could not be changed'); }
  }, [changed]);

  const f = ov?.figures || {};
  const tabs = useMemo(() => [
    { key: 'room', label: 'In the Room', count: f.inRoom || undefined },
    { key: 'requests', label: 'Requests', count: f.pendingRequests || undefined },
    // dosesDue already counts the overdue ones.
    { key: 'round', label: 'Medicine Round', count: f.dosesDue || undefined },
    { key: 'incidents', label: 'Incidents' },
    { key: 'alerts', label: 'Alerts' },
    { key: 'lookup', label: 'Emergency Info' },
  ], [f.inRoom, f.pendingRequests, f.dosesDue]);

  if (disabled) return <ModuleDisabled />;
  if (stepUp) return <StepUpSheet open onDone={() => { setStepUp(false); setLoading(true); load(); }} />;
  if (loading && !ov) return <LoaderView />;
  if (!ov) {
    return (
      <View style={{ flex: 1 }}>
        <Blank icon="cloud-offline-outline" title="The Medical Room could not be loaded" body={error}
          action={<View style={{ gap: 8 }}><Btn icon="refresh" onPress={() => { setLoading(true); load(); }}>Try again</Btn><Btn icon="cloud-offline-outline" onPress={() => setOffline(true)}>Offline emergency cards</Btn></View>} />
        <OfflineSheet open={offline} userId={String(user?._id || '')} onClose={() => setOffline(false)} startLoaded />
      </View>
    );
  }

  const stockWords = [f.lowStock ? `${f.lowStock} low` : '', f.outOfStock ? `${f.outOfStock} out of stock` : '', f.expiringItems ? `${f.expiringItems} expiring` : '', f.expiredItems ? `${f.expiredItems} expired on the shelf` : ''].filter(Boolean);
  return (
    <ScrollView style={st.screen} contentContainerStyle={st.body} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); changed(); }} tintColor={BRAND} />}>
      <Head title={ov.settings?.roomName || 'Medical Room'} subtitle="Who is on the way, who is in the room, today’s medicines and every alert. Stock, reports and the full records are on the web portal." />
      <View style={st.actions}>
        <Btn kind="primary" icon="add" onPress={() => setVisitSeed({})} block>Add Medical Visit</Btn>
        <Btn icon="warning-outline" onPress={() => setIncident(true)} block>Report Incident</Btn>
      </View>
      <View style={[st.actions, { marginTop: -4 }]}>
        <Btn icon="scan-outline" onPress={() => setScan(true)} block>Scan</Btn>
        <Btn icon="thermometer-outline" onPress={() => setFridge(true)} block>Log the fridge</Btn>
      </View>
      <View style={[st.actions, { marginTop: -4 }]}>
        <Btn icon="cloud-offline-outline" onPress={() => setOffline(true)} block>Offline cards</Btn>
        {(ov.sessions || []).length ? <Btn icon="clipboard-outline" onPress={() => setCheckups(true)} block>Checkups</Btn> : null}
      </View>
      {flash ? <Note tone="green" icon="checkmark-circle-outline">{flash}</Note> : null}
      {cardFail ? <Note tone="red" icon="alert-circle-outline">{cardFail}</Note> : null}
      <Tiles>
        <Tile icon="medkit-outline" tone="blue" value={f.todayVisits || 0} label="Today’s visits" caption={plural(f.todayIncidents || 0, 'incident') + ' today'} onPress={() => setTab('room')} />
        <Tile icon="bed-outline" tone="indigo" value={f.inRoom || 0} label="In the room now" caption={ov.settings?.hasBeds ? `${f.bedsOccupied || 0} of ${f.beds || 0} beds in use` : undefined} onPress={() => setTab('room')} />
        <Tile icon="paper-plane-outline" tone="amber" value={f.pendingRequests || 0} label="Waiting requests" caption="Sent by teachers" onPress={() => setTab('requests')} />
        <Tile icon="warning-outline" tone="red" value={f.emergencies || 0} label="Emergencies today" caption={`${count(f.withAlerts || 0)} students with critical alerts`} onPress={() => setTab('alerts')} />
      </Tiles>
      {f.familiesWaiting ? (
        <Note tone={f.familiesNotReached ? 'red' : 'amber'} icon="call-outline" title={f.familiesNotReached ? `${plural(f.familiesNotReached, 'family')} not reached` : `${plural(f.familiesWaiting, 'family')} not answered yet`}>
          <Text style={st.noteText}>{f.familiesNotReached ? 'Every contact on record was tried.' : 'The call list moves on by itself.'}</Text>
          <View style={{ marginTop: 8, alignSelf: 'flex-start' }}><Btn kind="primary" icon="call-outline" onPress={() => setTab('room')}>See who to call</Btn></View>
        </Note>
      ) : null}
      {stockWords.length ? <Note tone="amber" icon="cube-outline" title="Stock to watch">{`${stockWords.join(' · ')} — manage stock on the web portal.`}</Note> : null}
      <DeskProgrammeNotes p={ov.programmes} onCampaigns={() => setRoster(true)} onOutbreak={setOutbreak} onIllness={() => setIllness(true)} />
      <View style={{ marginBottom: 12 }}><Tabs value={tab} onChange={setTab} items={tabs} /></View>

      {tab === 'room' ? <RoomTab meta={meta} stamp={stamp} onVisit={() => setVisitSeed({})} onStatus={setMoving} onTreat={setTreat} onCollect={setCollecting} onChanged={(m) => { if (m) setFlash(m); load(); }}
        onReading={(v) => setReadingFor({ _id: v._id, name: v.studentName, protocolKey: v.protocolKey })} onCare={setCareFor} /> : null}
      {tab === 'requests' ? (
        <RequestsTab stamp={stamp} reloadAll={() => changed()} onArrived={(r) => setVisitSeed({
          request: r._id, reason: r.reason, symptoms: r.symptoms,
          student: { _id: r.studentId, name: r.studentName, photo: r.studentPhoto, classLabel: r.classLabel, admissionNumber: r.admissionNumber },
        })} />
      ) : null}
      {tab === 'round' ? <RoundTab stamp={stamp} onGive={setGive} flash={(m) => changed(m)} /> : null}
      {tab === 'incidents' ? <IncidentsTab stamp={stamp} onReport={() => setIncident(true)} flash={(m) => changed(m)} /> : null}
      {tab === 'alerts' ? <AlertsTab stamp={stamp} onCard={openCard} /> : null}
      {tab === 'lookup' ? <LookupTab onCard={openCard} onVisit={(s) => setVisitSeed({ student: s })} /> : null}

      <VisitSheet seed={visitSeed} meta={meta} onClose={() => setVisitSeed(null)} onDone={(m) => { setVisitSeed(null); setTab('room'); changed(m); }} />
      <TreatSheet visitId={treat} meta={meta} onClose={() => setTreat(null)} onDone={(m) => { setTreat(null); changed(m); }} />
      <StatusSheet visit={moving} meta={meta} onClose={() => setMoving(null)} onDone={(m) => { setMoving(null); changed(m); }} />
      <IncidentSheet open={incident} meta={meta} onClose={() => setIncident(false)} onDone={(m) => { setIncident(false); setTab('incidents'); changed(m); }} />
      <GiveSheet plan={give} onClose={() => setGive(null)} onDone={(m) => { setGive(null); changed(m); }} />
      <CollectionSheet visit={collecting} onClose={() => setCollecting(null)} onDone={(m) => { setCollecting(null); changed(m); }} />
      <ReadingSheet visit={readingFor} unit={meta?.settings?.temperatureUnit || 'F'} onClose={() => setReadingFor(null)}
        onDone={(out) => { const id = readingFor?._id; setReadingFor(null); changed('Reading saved'); if (out?.suggestEmergency && id) offerEmergency(id, out?.visit?.triage?.reasons || []); }} />
      <CareSheet visitId={careFor} onClose={() => setCareFor(null)} onChanged={() => changed()} onEmergency={offerEmergency} />
      <FridgeSheet open={fridge} onClose={() => setFridge(false)} onDone={(m) => { setFridge(false); changed(m); }} />
      <CampaignRosterSheet open={roster} onClose={() => setRoster(false)} onChanged={() => load()} />
      <ScanSheet open={scan} onClose={() => setScan(false)} onCard={(id) => { setScan(false); openCard(id); }} onVisit={(s) => { setScan(false); setVisitSeed({ student: s }); }} onAdd={(s) => { setScan(false); setAddFor(s); }} />
      <AddRecordSheet student={addFor} onClose={() => setAddFor(null)} onDone={(m) => { setAddFor(null); changed(m); }} />
      <CheckupSheet open={checkups} sessions={ov.sessions || []} onClose={() => setCheckups(false)} onSaved={(m) => changed(m)} />
      <OfflineSheet open={offline} userId={String(user?._id || '')} onClose={() => setOffline(false)} />
      <OutbreakSheet id={outbreak} onClose={() => setOutbreak(null)} onChanged={(m) => { if (m) setFlash(m); load(); }} />
      <IllnessReportsSheet open={illness} onClose={() => setIllness(false)} onChanged={() => load()} />
      <Sheet visible={!!card} icon="medkit-outline" tone="red" title="Emergency card" subtitle="Opening it is recorded." onClose={() => setCard(null)}>
        <EmergencyCard e={card} />
      </Sheet>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  body: { padding: 16, paddingBottom: 48 },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reason: { fontSize: 13.5, fontWeight: '700', color: Colors.text, lineHeight: 19 },
  reasonMore: { fontWeight: '400', color: Colors.textSecondary },
  strong: { fontWeight: '700', color: Colors.text },
  btns: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  time: { fontSize: 13, fontWeight: '800', color: Colors.text },
  vitals: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 },
  vital: { flexBasis: '46%', flexGrow: 1 },
  pair: { flexDirection: 'row', gap: 10 },
  bed: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  bedName: { fontSize: 13.5, fontWeight: '700', color: Colors.text, width: 92 },
  bedWho: { flex: 1, minWidth: 0, fontSize: 12, color: Colors.textSecondary },
  alertTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  noteText: { fontSize: 13, color: Colors.text, lineHeight: 19 },
});
