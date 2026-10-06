/**
 * Medical information on the phone (Oct 2026) — the student's own "My Health"
 * and the parent's "My Child's Medical Information": the web's
 * /student/medical and /parent/medical, one screen with two readers.
 *
 * A parent picks the child (the switch every parent screen uses), sees the
 * emergency card, authorises a medicine the Medical Room has set up, and sends
 * updates — an allergy, a condition, a contact, the doctor, a vaccination, a
 * document — that wait for the room's review. A student sees as much of their
 * own record as the school allows (`show`). Neither ever gets the staff's
 * private notes or staff-only files: the server leaves them out.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '@/constants/theme';
import {
  myMedRecord, myMedHistory, medChildren, childMedRecord, childMedHistory, childEmergency,
  sendMedUpdate, withdrawMedUpdate, authorizeMedPlan, confirmMedCarePlan, medFileLink, apiUrl, uploadChildCertificate, giveFamilyConsent, withdrawFamilyConsent,
  setFamilyLanguage,
} from '@/api/medical.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { LoaderView, unwrap, MODULE_BLOCKED_CODES, confirmAsync } from '@/components/ui/kit';
import { KidSwitch } from '@/components/results/parts';
import {
  Head, Tabs, Note, Blank, Muted, Btn, Sheet, Field, Box, Pick, Pill,
  VISIT_STATUS, INCIDENT_SEVERITY, INCIDENT_TYPE, ALLERGY_CATEGORY, ALLERGY_SEVERITY, CONDITION_TYPE, CONDITION_SEVERITY, CONDITION_STATUS,
  DOSE_STATUS, PLAN_FREQUENCY, PLAN_STATUS, VACCINATION_STATUS, CHECKUP_TYPE, CHECKUP_OUTCOME, DOC_TYPE, CHANGE_KIND, CHANGE_STATUS, BLOOD_GROUPS,
  HISTORY_KINDS, Status, Avatar, Card, Line, KV, Sub, Seg, SwitchRow, Phone, AlertCards, EmergencyCard, Timeline, Chips,
  labelOf, optionsOf, fmtDay, fmtDate, fmtTime, fmtStamp, ago, todayStr, dayInput, BRAND, TINT, placesOf, rescueState,
} from '@/components/medical/parts';
import { UrgentBanner, AnswerSheet } from '@/components/medical/urgent';
import { useMedLive, medicalNotice } from '@/components/medical/live';
import { GrowthCard, ScheduleCards, ReferralCards, ReferralSheet, CampaignCards, IllnessSheet, IllnessCards, NoticeCards, whom } from '@/components/medical/programmes';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ── Opening a file ───────────────────────────────────────────────────────── */

/** A medical file opens through a ten-minute signed link — never a public address. */
async function openFile(id: string) {
  const r = unwrap(await medFileLink(id));
  if (!r?.url) throw new Error('The file could not be opened');
  await WebBrowser.openBrowserAsync(apiUrl(r.url));
}

function FileBtn({ id, label = 'View' }: { id: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  return (
    <View style={{ alignSelf: 'flex-start' }}>
      <Btn icon="open-outline" disabled={busy} onPress={async () => {
        setBusy(true); setFail('');
        try { await openFile(id); } catch (err: any) { setFail(err?.message || 'The file could not be opened'); } finally { setBusy(false); }
      }}>{busy ? 'Opening…' : label}</Btn>
      {fail ? <Text style={st.fail}>{fail}</Text> : null}
    </View>
  );
}

/* ── Sending an update ────────────────────────────────────────────────────── */

type Picked = { uri: string; name: string; mimeType?: string; size?: number; file?: any } | null;

function FileField({ value, onChange, required }: { value: Picked; onChange: (f: Picked) => void; required?: boolean }) {
  const choose = async () => {
    const res: any = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      copyToCacheDirectory: true, multiple: false,
    });
    if (res?.canceled || !res?.assets?.length) return;
    const a = res.assets[0];
    onChange({ uri: a.uri, name: a.name || 'file', mimeType: a.mimeType, size: a.size, file: a.file });
  };
  return (
    <Field label={required ? 'File' : 'Certificate (optional)'} required={required} hint="PDF or a photo, up to 10 MB">
      <TouchableOpacity style={st.file} onPress={choose} accessibilityRole="button" accessibilityLabel={value ? `File: ${value.name}. Change` : 'Choose a file'}>
        <Ionicons name="cloud-upload-outline" size={18} color={BRAND} />
        <Text style={[st.fileText, !value && { color: Colors.textLight }]} numberOfLines={1}>{value ? value.name : 'Choose a file'}</Text>
        {value ? <Text style={st.fileChange}>Change</Text> : null}
      </TouchableOpacity>
    </Field>
  );
}

const ACTIONS = [{ value: 'add', label: 'Something new' }, { value: 'update', label: 'Change one' }, { value: 'remove', label: 'No longer applies' }];
// The fields of an allergy or a condition a parent can change.
const RECORD_FIELDS: Record<string, string[]> = {
  allergy: ['allergen', 'category', 'severity', 'reaction', 'emergencyInstructions', 'medication', 'doctor'],
  condition: ['type', 'condition', 'severity', 'diagnosedOn', 'medication', 'treatment', 'emergencyInstructions', 'doctor'],
};
const HEALTH = ['allergy', 'condition'];

/**
 * What the form starts with. Something new starts from sensible defaults; a
 * change to something on record — an allergy, a condition, a contact, the
 * doctor, the profile — starts from the record as it stands, so a field the
 * parent leaves alone is not sent as a change. (A "Moderate" default used to
 * downgrade a life-threatening allergy, and an untouched switch turned off a
 * child's emergency medication.) The web's form does the same.
 */
function startPayload(record: any, kind: string, action: string, target: string, slot?: string): any {
  const p = record?.profile || {};
  if (HEALTH.includes(kind)) {
    if (action === 'remove') return { reason: '' };
    if (action === 'update') {
      const row = ((kind === 'allergy' ? record?.allergies : record?.conditions) || []).find((x: any) => x._id === target);
      return row ? Object.fromEntries(RECORD_FIELDS[kind].map((k) => [k, k === 'diagnosedOn' ? dayInput(row[k]) : row[k] ?? ''])) : {};
    }
    return kind === 'allergy' ? { category: 'food', severity: 'moderate' } : { type: 'asthma', severity: 'moderate' };
  }
  switch (kind) {
  case 'contact': {
    const c = (slot === 'alternate' ? p.alternateContact : record?.emergencyContact) || {};
    return { slot: slot === 'alternate' ? 'alternate' : 'emergency', name: c.name || '', phone: c.phone || '', relation: c.relation || '' };
  }
  case 'doctor': return { name: p.doctor?.name || '', phone: p.doctor?.phone || '', clinic: p.doctor?.clinic || '' };
  case 'hospital': return { name: p.hospital?.name || '', phone: p.hospital?.phone || '', address: p.hospital?.address || '' };
  case 'profile': {
    const em = p.emergencyMedication || {};
    return { bloodGroup: record?.bloodGroup || '', dietaryRestrictions: p.dietaryRestrictions || '',
      emergencyMedication: { required: !!em.required, name: em.name || '', location: em.location || '', instructions: em.instructions || '' } };
  }
  case 'vaccination': return { givenOn: todayStr() };
  case 'document': return { type: 'other' };
  default: return {};
  }
}

// Compared as the server compares them: text trimmed, a switch as true/false.
const norm = (v: any): any => (v && typeof v === 'object' ? JSON.stringify(Object.keys(v).sort().map((k) => [k, norm(v[k])])) : typeof v === 'boolean' ? v : String(v ?? '').trim());
const changedFrom = (now: any, was: any) => Object.fromEntries(Object.entries(now || {}).filter(([k, v]) => norm(v) !== norm((was || {})[k])));

function UpdateSheet({ preset, record, onClose, onDone }: { preset: any; record: any; onClose: () => void; onDone: (msg: string) => void }) {
  const [kind, setKind] = useState('allergy');
  const [action, setAction] = useState('add');
  const [target, setTarget] = useState('');
  const [p, setP] = useState<any>({});
  // The record as the form loaded it, to send only what differs.
  const [was, setWas] = useState<any>({});
  const [note, setNote] = useState('');
  const [file, setFile] = useState<Picked>(null);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');

  const load = (k: string, a: string, t: string, slot?: string) => {
    const start = startPayload(record, k, a, t, slot);
    setKind(k); setAction(a); setTarget(t); setP(start); setWas(start);
  };
  useEffect(() => {
    if (!preset) return;
    load(preset.kind || 'allergy', preset.action || 'add', preset.target || '');
    setNote(''); setFile(null); setFail(''); setBusy(false);
  }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: any) => setP((cur: any) => ({ ...cur, [k]: v }));
  const setMed = (k: string, v: any) => setP((cur: any) => ({ ...cur, emergencyMedication: { ...(cur.emergencyMedication || {}), [k]: v } }));
  const allergies = (record?.allergies || []).filter((a: any) => a.status !== 'resolved');
  const conditions = (record?.conditions || []).filter((c: any) => c.status !== 'resolved');
  const twoWay = ['allergy', 'condition'].includes(kind);
  const act = twoWay ? action : 'add';
  const text = (k: string, label: string, opts: { required?: boolean; placeholder?: string; multiline?: boolean; phone?: boolean; hint?: string } = {}) => (
    <Field label={label} required={opts.required} hint={opts.hint}>
      <Box value={String(p[k] ?? '')} onChange={(v) => set(k, v)} placeholder={opts.placeholder} multiline={opts.multiline} keyboardType={opts.phone ? 'phone-pad' : undefined} />
    </Field>
  );

  const check = () => {
    if (twoWay && act !== 'add' && !target) return 'Choose which one';
    if (kind === 'allergy' && act === 'add' && !String(p.allergen || '').trim()) return 'Say what your child is allergic to';
    if (kind === 'condition' && act === 'add' && !String(p.condition || '').trim() && !p.type) return 'Name the condition';
    if (kind === 'contact' && (!String(p.name || '').trim() || !String(p.phone || '').trim())) return 'Give the contact’s name and phone';
    if ((kind === 'doctor' || kind === 'hospital') && !String(p.name || '').trim()) return kind === 'doctor' ? 'Name the doctor' : 'Name the hospital';
    if (kind === 'vaccination' && !String(p.vaccine || '').trim()) return 'Name the vaccine';
    if (kind === 'vaccination' && !DAY_RE.test(String(p.givenOn || ''))) return 'Write the date it was given as YYYY-MM-DD';
    if (kind === 'document' && !file) return 'Choose the file to send';
    for (const k of ['diagnosedOn', 'documentDate', 'expiresOn']) if (p[k] && !DAY_RE.test(String(p[k]))) return 'Write dates as YYYY-MM-DD';
    return '';
  };

  const submit = async () => {
    const bad = check();
    if (bad) { setFail(bad); return; }
    // A change, or the profile: only what differs from the record. A contact,
    // the doctor or the hospital is replaced whole, so all of it goes.
    let payload = p;
    if (act === 'update' || kind === 'profile') payload = changedFrom(p, was);
    else if (['contact', 'doctor', 'hospital'].includes(kind) && !Object.keys(changedFrom(p, was)).length) payload = {};
    if (act !== 'remove' && !['vaccination', 'document'].includes(kind) && !Object.keys(payload).length) {
      setFail('Nothing has changed — change what is different on the record, then send it');
      return;
    }
    setBusy(true); setFail('');
    try {
      const fd = new FormData();
      fd.append('student', String(record.student._id));
      fd.append('kind', kind);
      fd.append('action', act);
      if (twoWay && act !== 'add') fd.append('target', target);
      fd.append('payload', JSON.stringify(payload));
      if (note.trim()) fd.append('note', note.trim());
      if (file && (kind === 'vaccination' || kind === 'document')) {
        if (file.file) fd.append('file', file.file);
        else fd.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as any);
      }
      // What happened is the server's answer: with approval off an update is
      // applied at once, unless the record changed meanwhile and it waits.
      const res = unwrap(await sendMedUpdate(fd));
      onDone(res?.status === 'approved' ? 'Added to the record' : 'Sent — the Medical Room will review it');
    } catch (err: any) {
      setFail(err?.message || 'The update could not be sent');
    } finally { setBusy(false); }
  };

  return (
    <Sheet visible={!!preset} icon="send-outline" tone="indigo" title="Send an update to the Medical Room"
      subtitle={record ? record.student?.name : ''} onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Cancel</Btn><Btn kind="primary" onPress={submit} disabled={busy} block>{busy ? 'Sending…' : 'Send update'}</Btn></>}>
      {record?.needsApproval ? (
        <Note tone="indigo" icon="information-circle-outline">{`The Medical Room checks every update before it is added to ${record.student?.name}’s record. You will be told when it is.`}</Note>
      ) : null}
      <Field label="What is it about?">
        <Pick label="What is it about?" value={kind} options={optionsOf(CHANGE_KIND)} onChange={(v) => { if (v !== kind) load(v, 'add', ''); }} />
      </Field>
      {twoWay ? <Field label="Update"><Seg options={ACTIONS} value={action} onChange={(v) => { if (v !== action) load(kind, v, ''); }} /></Field> : null}
      {twoWay && act !== 'add' ? (
        <Field label="Which one" required>
          <Pick label="Which one" value={target} onChange={(v) => { if (v !== target) load(kind, action, v); }} placeholder={(kind === 'allergy' ? allergies : conditions).length ? 'Choose…' : 'None on record'}
            options={kind === 'allergy' ? allergies.map((a: any) => ({ value: a._id, label: a.allergen })) : conditions.map((c: any) => ({ value: c._id, label: c.condition || labelOf(CONDITION_TYPE, c.type) }))} />
        </Field>
      ) : null}

      {kind === 'allergy' && act !== 'remove' ? (
        <>
          {text('allergen', 'Allergic to', { required: act === 'add', placeholder: 'e.g. Peanuts' })}
          <Field label="Type"><Pick label="Type" value={p.category} onChange={(v) => set('category', v)} options={optionsOf(ALLERGY_CATEGORY)} /></Field>
          <Field label="How serious"><Seg options={optionsOf(ALLERGY_SEVERITY).map((o) => ({ ...o, tone: ALLERGY_SEVERITY[o.value].tone }))} value={p.severity} onChange={(v) => set('severity', v)} /></Field>
          {text('reaction', 'What happens')}
          {text('emergencyInstructions', 'What to do if exposed', { multiline: true })}
          {text('medication', 'Medicine', { placeholder: 'e.g. Auto-injector in the school bag' })}
          {text('doctor', 'Doctor')}
        </>
      ) : null}
      {kind === 'condition' && act !== 'remove' ? (
        <>
          <Field label="Type"><Pick label="Type" value={p.type} onChange={(v) => set('type', v)} options={optionsOf(CONDITION_TYPE)} /></Field>
          {text('condition', 'Condition', { placeholder: 'e.g. Asthma' })}
          <Field label="How serious"><Seg options={optionsOf(CONDITION_SEVERITY).map((o) => ({ ...o, tone: CONDITION_SEVERITY[o.value].tone }))} value={p.severity} onChange={(v) => set('severity', v)} /></Field>
          {text('diagnosedOn', 'Diagnosed on (optional)', { placeholder: 'YYYY-MM-DD' })}
          {text('medication', 'Medicine')}
          {text('treatment', 'Treatment')}
          {text('emergencyInstructions', 'What to do in an emergency', { multiline: true })}
          {text('doctor', 'Doctor')}
        </>
      ) : null}
      {twoWay && act === 'remove' ? text('reason', 'What changed', { placeholder: 'e.g. Outgrown — confirmed by our doctor' }) : null}
      {kind === 'contact' ? (
        <>
          <Field label="Which contact"><Seg options={[{ value: 'emergency', label: 'Emergency contact' }, { value: 'alternate', label: 'Alternate contact' }]} value={p.slot} onChange={(v) => { if (v !== p.slot) load('contact', 'add', '', v); }} /></Field>
          {text('name', 'Name', { required: true })}
          {text('phone', 'Phone', { required: true, phone: true })}
          {text('relation', 'Relation to the child', { placeholder: 'e.g. Uncle' })}
        </>
      ) : null}
      {kind === 'doctor' ? (<>{text('name', 'Doctor', { required: true })}{text('phone', 'Phone', { phone: true })}{text('clinic', 'Clinic')}</>) : null}
      {kind === 'hospital' ? (<>{text('name', 'Hospital', { required: true })}{text('phone', 'Phone', { phone: true })}{text('address', 'Address')}</>) : null}
      {kind === 'profile' ? (
        <>
          <Field label="Blood group"><Chips options={BLOOD_GROUPS.map((g) => ({ value: g, label: g }))} value={p.bloodGroup} onChange={(v) => set('bloodGroup', v)} clearable /></Field>
          {text('dietaryRestrictions', 'Dietary restrictions', { multiline: true })}
          <SwitchRow label="Needs an emergency medication at school" sub="e.g. an adrenaline auto-injector or an inhaler"
            value={!!p.emergencyMedication?.required} onChange={(v) => setMed('required', v)} />
          {p.emergencyMedication?.required ? (
            <>
              <Field label="Medicine"><Box value={p.emergencyMedication.name || ''} onChange={(v) => setMed('name', v)} /></Field>
              <Field label="Kept where"><Box value={p.emergencyMedication.location || ''} onChange={(v) => setMed('location', v)} /></Field>
              <Field label="How to give it"><Box value={p.emergencyMedication.instructions || ''} onChange={(v) => setMed('instructions', v)} multiline /></Field>
            </>
          ) : null}
        </>
      ) : null}
      {kind === 'vaccination' ? (
        <>
          {text('vaccine', 'Vaccine', { required: true })}
          {text('dose', 'Dose', { placeholder: 'e.g. Dose 2' })}
          {text('givenOn', 'Given on', { required: true, placeholder: 'YYYY-MM-DD' })}
          {text('provider', 'Hospital / clinic')}
          <FileField value={file} onChange={setFile} />
        </>
      ) : null}
      {kind === 'document' ? (
        <>
          <FileField value={file} onChange={setFile} required />
          <Field label="Type"><Pick label="Type" value={p.type} onChange={(v) => set('type', v)}
            options={optionsOf(DOC_TYPE).filter((o) => o.value !== 'incident_photo')} /></Field>
          {text('title', 'Name', { placeholder: 'e.g. Fitness certificate 2026' })}
          {text('documentDate', 'Date (optional)', { placeholder: 'YYYY-MM-DD' })}
          {text('expiresOn', 'Valid until (optional)', { placeholder: 'YYYY-MM-DD' })}
        </>
      ) : null}
      <Field label="Anything else the Medical Room should know"><Box value={note} onChange={setNote} multiline /></Field>
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

/* ── Tabs ─────────────────────────────────────────────────────────────────── */

/** This year's consent, as it reads. */
function ConsentLines({ c, year }: { c: any; year: any }) {
  if (!c || c.status !== 'given') return <Muted>{c?.status === 'withdrawn' ? 'Withdrawn.' : `No consent for ${year?.yearName || 'this year'} yet.`}</Muted>;
  const line = (ok: boolean, text: string) => <Line tone={ok ? 'green' : undefined}>{`${ok ? '✓' : '✕'} ${text}`}</Line>;
  return (
    <>
      {line(!!c.emergencyTreatment, c.emergencyTreatment ? 'Emergency treatment when you cannot be reached' : 'No emergency treatment without you')}
      {line(!!(c.otc || []).length, (c.otc || []).length ? `Everyday medicines: ${c.otc.join(', ')}` : 'No everyday medicines from the school')}
      {line(c.shareWithTeachers !== false, c.shareWithTeachers !== false ? 'Medical alerts shared with teachers' : 'Teachers see only the critical alerts')}
      {line(!!c.injuryPhotos, c.injuryPhotos ? 'Injury photos may be taken' : 'No injury photos')}
      {c.selfCarry ? line(true, 'May carry their own rescue medicine') : null}
      <Muted>{`Signed by ${c.signedName || c.givenByName}${c.givenAt ? `, ${fmtStamp(c.givenAt)}` : ''}`}</Muted>
    </>
  );
}

function ConsentSheet({ open, r, onClose, onDone }: { open: boolean; r: any; onClose: () => void; onDone: (msg: string) => void }) {
  const [v, setV] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  useEffect(() => {
    if (!open) return;
    const c = r?.consent?.status === 'given' ? r.consent : null;
    setV({
      emergencyTreatment: c ? !!c.emergencyTreatment : true, otc: c ? [...(c.otc || [])] : [...(r?.otcCategories || [])],
      shareWithTeachers: c ? c.shareWithTeachers !== false : true, injuryPhotos: c ? !!c.injuryPhotos : false, selfCarry: c ? !!c.selfCarry : false, signedName: '',
    });
    setFail(''); setBusy(false);
  }, [open, r]);
  const send = async () => {
    if (!v || v.signedName.trim().length < 3) { setFail('Type your full name to sign'); return; }
    setBusy(true); setFail('');
    try { await giveFamilyConsent({ ...v, child: r.student?._id }); onDone('Thank you — the Medical Room has your answer'); } catch (err: any) { setFail(err?.message || 'It could not be sent'); setBusy(false); }
  };
  return (
    <Sheet visible={open} icon="shield-checkmark-outline" tone="indigo" title={`Medical consent${r?.consentYear ? ` for ${r.consentYear.yearName}` : ''}`} subtitle={r?.student?.name} onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Cancel</Btn><Btn kind="primary" onPress={send} disabled={busy} block>{busy ? 'Sending…' : 'Sign and send'}</Btn></>}>
      {v ? (
        <>
          <SwitchRow label="Emergency treatment" sub="If my child needs urgent care and I cannot be reached, the school may take them to hospital and doctors may treat them." value={v.emergencyTreatment} onChange={(x) => setV({ ...v, emergencyTreatment: x })} />
          <Field label="Everyday medicines the Medical Room may give" hint="From the school's stock, at the dose on the pack for the child's age — you are told each time.">
            {(r?.otcCategories || []).map((cat: string) => (
              <SwitchRow key={cat} label={cat} value={v.otc.includes(cat)} onChange={(x) => setV({ ...v, otc: x ? [...v.otc, cat] : v.otc.filter((y: string) => y !== cat) })} />
            ))}
          </Field>
          <SwitchRow label="Share medical alerts with teachers" sub="Off: teachers see only the critical alerts they need to keep your child safe." value={v.shareWithTeachers} onChange={(x) => setV({ ...v, shareWithTeachers: x })} />
          <SwitchRow label="Injury photos" sub="Only the medical staff see them." value={v.injuryPhotos} onChange={(x) => setV({ ...v, injuryPhotos: x })} />
          <SwitchRow label="May carry their own rescue medicine" sub="A reliever inhaler or an auto-injector, in their bag." value={v.selfCarry} onChange={(x) => setV({ ...v, selfCarry: x })} />
          <Field label="Type your full name to sign" required><Box value={v.signedName} onChange={(x) => setV({ ...v, signedName: x })} placeholder="e.g. Rahul Sharma" maxLength={120} /></Field>
        </>
      ) : null}
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

/** Off school until it is safe to come back — and the certificate a parent uploads. */
function OffSchool({ x, isParent, onChanged }: { x: any; isParent: boolean; onChanged: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  const open = x.status === 'excluded';
  const upload = async () => {
    setFail('');
    const res: any = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
    if (res?.canceled || !res?.assets?.length) return;
    const a = res.assets[0];
    const fd = new FormData();
    if (a.file) fd.append('file', a.file);
    else fd.append('file', { uri: a.uri, name: a.name || 'certificate.pdf', type: a.mimeType || 'application/octet-stream' } as any);
    setBusy(true);
    try { await uploadChildCertificate(x._id, fd); onChanged('Certificate sent to the Medical Room'); } catch (err: any) { setFail(err?.message || 'It could not be sent'); } finally { setBusy(false); }
  };
  return (
    <Card critical={open} style={!open ? { opacity: 0.7 } : undefined}>
      <View style={st.top}>
        <Text style={st.title}>{open ? `Off school — ${x.label}` : `Cleared to return — ${x.label}`}</Text>
        {x.needsCertificate ? <Pill tone={x.certificateDoc ? 'green' : 'amber'}>{x.certificateDoc ? 'Certificate sent' : 'Certificate needed'}</Pill> : null}
      </View>
      {open ? <Line strong>{x.earliestReturn ? `Back no earlier than ${fmtStamp(x.earliestReturn)}` : 'Back when a doctor certifies fit for school'}</Line> : <Line>{`Cleared ${fmtStamp(x.clearedAt)}`}</Line>}
      {open ? <Line>{x.text}</Line> : null}
      {open && x.needsCertificate && !x.certificateDoc ? (
        isParent
          ? <View style={{ alignSelf: 'flex-start', marginTop: 6 }}><Btn kind="primary" icon="cloud-upload-outline" onPress={upload} disabled={busy}>{busy ? 'Sending…' : 'Upload certificate'}</Btn></View>
          : <Muted>Your parent needs to send a doctor’s fitness certificate.</Muted>
      ) : null}
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Card>
  );
}

function Overview({ r, canUpdate, sendUpdate, isParent, onConfirm, onChanged, onConsent }: { r: any; canUpdate: boolean; sendUpdate: (preset?: any) => void; isParent: boolean; onConfirm: (plan: any) => void; onChanged: (msg: string) => void; onConsent: () => void }) {
  const p = r.profile || {};
  const show = r.show || {};
  const withdraw = async () => {
    if (!(await confirmAsync('Withdraw your consent?', 'The Medical Room will give no everyday medicine and arrange no treatment without asking you first. The medical staff are told at once.', 'Withdraw'))) return;
    try { await withdrawFamilyConsent(r.consent._id, ''); onChanged('Consent withdrawn'); } catch (err: any) { onChanged(err?.message || 'It could not be withdrawn'); }
  };
  return (
    <>
      <Sub icon="shield-checkmark-outline">{`Consent${r.consentYear ? ` for ${r.consentYear.yearName}` : ''}`}</Sub>
      <Card>
        <ConsentLines c={r.consent} year={r.consentYear} />
        {isParent ? (
          <View style={[st.addRow, { flexDirection: 'row', gap: 8 }]}>
            <Btn icon="create-outline" onPress={onConsent}>{r.consent?.status === 'given' ? 'Change' : 'Give consent'}</Btn>
            {r.consent?.status === 'given' ? <Btn onPress={withdraw}>Withdraw</Btn> : null}
          </View>
        ) : null}
      </Card>
      <View style={st.gap} />
      <Sub icon="warning-outline">Allergies</Sub>
      {r.allergies.length ? r.allergies.map((a: any) => {
        const critical = ['severe', 'life_threatening'].includes(a.severity) && a.status !== 'resolved';
        return (
          <Card key={a._id} critical={critical} style={a.status === 'resolved' ? { opacity: 0.66 } : undefined}>
            <View style={st.top}>
              <Text style={st.title}>{a.allergen}</Text>
              <Status map={ALLERGY_SEVERITY} value={a.severity} />
              <Pill tone="slate">{labelOf(ALLERGY_CATEGORY, a.category)}</Pill>
              {a.status === 'resolved' ? <Pill tone="slate">No longer applies</Pill> : null}
            </View>
            {a.reaction ? <Line>{a.reaction}</Line> : null}
            {a.emergencyInstructions ? <Line><Text style={st.strong}>If exposed: </Text>{a.emergencyInstructions}</Line> : null}
            {canUpdate && a.status !== 'resolved' ? (
              <View style={{ alignSelf: 'flex-end' }}><Btn onPress={() => sendUpdate({ kind: 'allergy', action: 'remove', target: a._id })}>No longer applies</Btn></View>
            ) : null}
          </Card>
        );
      }) : <Muted>No allergies on record.</Muted>}
      {canUpdate ? <View style={st.addRow}><Btn icon="add" onPress={() => sendUpdate({ kind: 'allergy' })}>Tell us about an allergy</Btn></View> : null}

      <View style={st.gap} />
      <Sub icon="heart-outline">Medical conditions</Sub>
      {r.conditions.length ? r.conditions.map((c: any) => (
        <Card key={c._id} critical={['severe', 'critical'].includes(c.severity) && c.status !== 'resolved'} style={c.status === 'resolved' ? { opacity: 0.66 } : undefined}>
          <View style={st.top}>
            <Text style={st.title}>{c.condition || labelOf(CONDITION_TYPE, c.type)}</Text>
            <Status map={CONDITION_SEVERITY} value={c.severity} />
            <Status map={CONDITION_STATUS} value={c.status} />
          </View>
          {c.treatment ? <Line>{c.treatment}</Line> : null}
          {c.medication ? <Line><Text style={st.strong}>Medicine: </Text>{c.medication}</Line> : null}
          {c.emergencyInstructions ? <Line tone="red">{`In an emergency: ${c.emergencyInstructions}`}</Line> : null}
        </Card>
      )) : <Muted>No conditions on record.</Muted>}
      {canUpdate ? <View style={st.addRow}><Btn icon="add" onPress={() => sendUpdate({ kind: 'condition' })}>Tell us about a condition</Btn></View> : null}

      {(r.restrictions || []).length || (r.exclusions || []).length ? (
        <>
          <View style={st.gap} />
          <Sub icon="school-outline">At school</Sub>
          {(r.exclusions || []).map((x: any) => <OffSchool key={x._id} x={x} isParent={isParent} onChanged={onChanged} />)}
          {(r.restrictions || []).map((x: any) => (
            <Card key={x._id}>
              <View style={st.top}>
                <Text style={st.title}>{x.teacherText}</Text>
                <Pill tone={x.state === 'active' ? 'green' : 'blue'}>{x.state === 'active' ? 'In force' : 'Starts soon'}</Pill>
              </View>
              <Line>{`${fmtDay(x.startsOn)} → ${x.endsOn ? fmtDay(x.endsOn) : 'until further notice'}`}</Line>
              {x.reason ? <Line>{x.reason}</Line> : null}
              <Muted>{isParent ? 'Teachers see what to do, not the reason.' : 'Your teachers know what to do.'}</Muted>
            </Card>
          ))}
        </>
      ) : null}

      {(r.carePlans || []).length || (r.rescueMeds || []).length ? (
        <>
          <View style={st.gap} />
          <Sub icon="heart-outline">Emergency care at school</Sub>
          {(r.carePlans || []).map((c: any) => (
            <Card key={c._id} critical>
              <View style={st.top}>
                <Text style={st.title}>{c.title}</Text>
                {c.parentConfirmedAt ? <Pill tone="green">{`Confirmed ${fmtDate(c.parentConfirmedAt)}`}</Pill> : <Pill tone="amber">{isParent ? 'Please read and confirm' : 'Waiting for your parent'}</Pill>}
              </View>
              {(c.signs || []).length ? <Line>{`Signs: ${c.signs.join('; ')}`}</Line> : null}
              {(c.steps || []).map((x: any, i: number) => <Line key={i} tone={x.critical ? 'red' : undefined} strong={!!x.critical}>{`${i + 1}. ${x.text}`}</Line>)}
              {c.ambulanceWhen ? <Line tone="red" strong>{`Ambulance: ${c.ambulanceWhen}`}</Line> : null}
              {c.doctorName ? <Line>{`Signed off by ${c.doctorName}${c.doctorSignedOn ? ` on ${fmtDay(c.doctorSignedOn)}` : ''}`}</Line> : null}
              {isParent && !c.parentConfirmedAt ? <View style={{ alignSelf: 'flex-start', marginTop: 6 }}><Btn kind="primary" icon="checkmark-circle-outline" onPress={() => onConfirm(c)}>Confirm</Btn></View> : null}
            </Card>
          ))}
          {(r.rescueMeds || []).map((m: any) => {
            const ms = rescueState(m);
            return (
              <Card key={m._id} critical={ms === 'expired'}>
                <View style={st.top}>
                  <Text style={st.title}>{m.name}</Text>
                  {ms === 'expired' ? <Pill tone="red">Expired</Pill> : ms === 'expiring' ? <Pill tone="amber">Expiring soon</Pill> : null}
                  {m.selfCarry ? <Pill tone="indigo">{isParent ? 'Carried by your child' : 'You carry it'}</Pill> : null}
                </View>
                {placesOf(m) ? <Line>{`Kept: ${placesOf(m)}`}</Line> : null}
                {m.expiresOn ? <Line tone={ms === 'expired' ? 'red' : undefined} strong={ms === 'expired'}>{ms === 'expired' ? `Expired on ${fmtDay(m.expiresOn)} — please send a replacement` : `Expires ${fmtDay(m.expiresOn)}`}</Line> : null}
              </Card>
            );
          })}
        </>
      ) : null}

      {p.dietaryRestrictions || p.emergencyMedication?.required ? (
        <>
          <View style={st.gap} />
          <Sub icon="clipboard-outline">Diet and emergency medicine</Sub>
          <KV k="Dietary restrictions" v={p.dietaryRestrictions} />
          <KV k="Emergency medication" v={p.emergencyMedication?.required ? `${p.emergencyMedication.name}${p.emergencyMedication.location ? ` — kept ${p.emergencyMedication.location}` : ''}` : ''} />
        </>
      ) : null}

      <View style={st.gap} />
      <Sub icon="call-outline">Who the school calls</Sub>
      {r.contacts.length ? r.contacts.map((c: any, i: number) => (
        <Card key={`${c.phone}:${i}`}>
          <View style={st.contact}>
            <View style={[st.contactIcon, { backgroundColor: TINT.indigo.soft }]}><Ionicons name={c.kind === 'parent' ? 'people-outline' : 'call-outline'} size={16} color={BRAND} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.title}>{c.name || '—'}</Text>
              {c.relation ? <Text style={st.muted}>{c.relation}</Text> : null}
              <Phone value={c.phone} label={c.name} />
            </View>
          </View>
        </Card>
      )) : <Muted>No contacts on record.</Muted>}
      {canUpdate ? <View style={st.addRow}><Btn icon="create-outline" onPress={() => sendUpdate({ kind: 'contact' })}>Update a contact</Btn></View> : null}

      <View style={st.gap} />
      <Sub icon="medical-outline">Doctor and hospital</Sub>
      <KV k="Family doctor" v={p.doctor?.name ? [p.doctor.name, p.doctor.clinic].filter(Boolean).join(' · ') : '—'} />
      {p.doctor?.phone ? <View style={{ marginTop: -6, marginBottom: 8 }}><Phone value={p.doctor.phone} label={p.doctor.name} /></View> : null}
      <KV k="Preferred hospital" v={p.hospital?.name ? [p.hospital.name, p.hospital.address].filter(Boolean).join(' · ') : '—'} />
      {p.hospital?.phone ? <View style={{ marginTop: -6, marginBottom: 8 }}><Phone value={p.hospital.phone} label={p.hospital.name} /></View> : null}
      {canUpdate ? (
        <View style={[st.addRow, { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }]}>
          <Btn onPress={() => sendUpdate({ kind: 'doctor' })}>Update doctor</Btn>
          <Btn onPress={() => sendUpdate({ kind: 'hospital' })}>Update hospital</Btn>
        </View>
      ) : null}

      {show.visits && r.visits.length ? (
        <>
          <View style={st.gap} />
          <Sub icon="medkit-outline">Latest Medical Room visit</Sub>
          <Card>
            <View style={st.top}><Text style={st.title}>{r.visits[0].reason}</Text><Status map={VISIT_STATUS} value={r.visits[0].status} /></View>
            <Line>{fmtStamp(r.visits[0].arrivedAt)}</Line>
            {r.visits[0].treatment ? <Line>{r.visits[0].treatment}</Line> : null}
          </Card>
        </>
      ) : null}
    </>
  );
}

// The history's filters, each behind the part of the record it belongs to: a
// school may keep visits or documents from students (the server leaves them out too).
const HISTORY_SHOWN_BY: Record<string, string> = {
  visit: 'visits', incident: 'incidents', first_aid: 'visits', medicine: 'medicines', referral: 'visits',
  checkup: 'checkups', vaccination: 'vaccinations', document: 'documents', follow_up: 'visits',
};

function History({ fetcher, show }: { fetcher: (params: any) => Promise<any>; show: any }) {
  const [kind, setKind] = useState('');
  const [items, setItems] = useState<any[] | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');

  const load = useCallback(async (k: string, pg: number) => {
    setBusy(true); setFail('');
    try {
      const r = unwrap(await fetcher({ kind: k || undefined, page: pg, limit: 25 }));
      setItems((cur) => (pg === 1 ? (r?.items || []) : [...(cur || []), ...(r?.items || [])]));
      setPage(r?.page || pg); setPages(r?.pages || 1);
    } catch (err: any) { setFail(err?.message || 'The history could not be loaded'); } finally { setBusy(false); }
  }, [fetcher]);
  useEffect(() => { load(kind, 1); }, [kind, load]);

  return (
    <>
      <Field label="Type of record">
        <Pick label="Type of record" value={kind} onChange={setKind}
          options={[{ value: '', label: 'All records' }, ...HISTORY_KINDS.filter((k) => HISTORY_SHOWN_BY[k.value] && show?.[HISTORY_SHOWN_BY[k.value]])]} />
      </Field>
      {fail ? <Blank icon="cloud-offline-outline" title="The history could not be loaded" body={fail} /> : null}
      {items === null ? <LoaderView /> : items.length ? <Timeline items={items} /> : (
        <Blank icon="time-outline" title="Nothing here yet" body="Medical Room visits, incidents, medicines, checkups and vaccinations appear here as they happen." />
      )}
      {items && page < pages ? <View style={{ marginTop: 8 }}><Btn onPress={() => load(kind, page + 1)} disabled={busy}>{busy ? 'Loading…' : 'Show older'}</Btn></View> : null}
    </>
  );
}

function Visits({ r }: { r: any }) {
  return (
    <>
      <Sub icon="medkit-outline">Medical Room visits</Sub>
      {r.visits.length ? r.visits.map((v: any) => (
        <Card key={v._id}>
          <View style={st.top}><Text style={st.title}>{v.reason}</Text><Status map={VISIT_STATUS} value={v.status} /></View>
          <Line>{`${fmtDay(v.arrivedAt)} at ${fmtTime(v.arrivedAt)}${v.departedAt ? ` — left ${fmtTime(v.departedAt)}` : ''}`}</Line>
          <KV k="Symptoms" v={v.symptoms} />
          <KV k="Treatment" v={v.treatment} />
          <KV k="First aid" v={v.firstAid} />
          <KV k="Medicine given" v={(v.medicines || []).map((m: any) => `${m.name} (${m.dosage})`).join(', ')} />
          <KV k="Rest" v={v.restAdvised ? `${v.restMinutes || ''} min`.trim() : ''} />
          <KV k="Hospital" v={v.referral?.referred ? [v.referral.hospital, v.referral.reason].filter(Boolean).join(' — ') : ''} />
          <KV k="Follow-up" v={v.followUp?.required ? [v.followUp.on ? fmtDay(v.followUp.on) : '', v.followUp.note].filter(Boolean).join(' — ') : ''} />
        </Card>
      )) : <Muted>No visits to the Medical Room.</Muted>}
      {r.show?.incidents !== false ? (
        <>
          <View style={st.gap} />
          <Sub icon="warning-outline">Incidents</Sub>
          {r.incidents.length ? r.incidents.map((i: any) => (
            <Card key={i._id}>
              <View style={st.top}><Text style={st.title}>{labelOf(INCIDENT_TYPE, i.type)}{i.location ? ` — ${i.location}` : ''}</Text><Status map={INCIDENT_SEVERITY} value={i.severity} /></View>
              <Line>{fmtStamp(i.occurredAt)}</Line>
              <KV k="What happened" v={i.description} />
              <KV k="Injury" v={i.injury} />
              <KV k="First aid" v={i.firstAid} />
            </Card>
          )) : <Muted>No incidents.</Muted>}
        </>
      ) : null}
    </>
  );
}

function Medicines({ r, isParent, onAuthorize }: { r: any; isParent: boolean; onAuthorize: (plan: any) => void }) {
  return (
    <>
      <Sub icon="medical-outline">Medicines at school</Sub>
      {r.plans.length ? r.plans.map((x: any) => (
        <Card key={x._id} critical={!x.authorized}>
          <Text style={st.title}>{`${x.medicineName} — ${x.dosage}`}</Text>
          <View style={st.top}>
            <Status map={PLAN_STATUS} value={x.status} />
            {x.authorized ? <Pill tone="green">You authorised it</Pill> : <Pill tone="amber">Waiting for your permission</Pill>}
          </View>
          <Line>{`${labelOf(PLAN_FREQUENCY, x.frequency)}${(x.times || []).length ? ` at ${x.times.join(', ')}` : ''} · from ${fmtDay(x.startDate)}${x.endDate ? ` to ${fmtDay(x.endDate)}` : ''}`}</Line>
          {x.instructions ? <Line>{x.instructions}</Line> : null}
          <Line>{x.source === 'parent' ? 'You send the medicine' : 'From the school’s stock'}</Line>
          {!x.authorized && isParent ? <View style={{ alignSelf: 'flex-start' }}><Btn kind="primary" icon="shield-checkmark-outline" onPress={() => onAuthorize(x)}>Authorise</Btn></View> : null}
        </Card>
      )) : <Muted>No medicine is given at school on a schedule.</Muted>}
      <View style={st.gap} />
      <Sub icon="time-outline">Medicines given</Sub>
      {r.doses.length ? r.doses.map((d: any) => (
        <Card key={d._id}>
          <View style={st.top}><Text style={st.title}>{d.medicineName}</Text><Status map={DOSE_STATUS} value={d.status} /></View>
          <Line>{[d.dosage, fmtStamp(d.givenAt || d.scheduledFor), d.givenByName].filter(Boolean).join(' · ')}</Line>
          {d.note ? <Line>{d.note}</Line> : null}
        </Card>
      )) : <Muted>Medicines given at school appear here.</Muted>}
    </>
  );
}

function Vaccinations({ r, canUpdate, sendUpdate }: { r: any; canUpdate: boolean; sendUpdate: (p?: any) => void }) {
  return (
    <>
      {canUpdate ? <View style={st.headBtn}><Btn kind="primary" icon="add" onPress={() => sendUpdate({ kind: 'vaccination' })}>Add a vaccination</Btn></View> : null}
      {r.vaccinations.length ? r.vaccinations.map((v: any) => (
        <Card key={v._id} critical={v.state === 'overdue'}>
          <View style={st.top}><Text style={st.title}>{v.vaccine}{v.dose ? ` · ${v.dose}` : ''}</Text><Status map={VACCINATION_STATUS} value={v.state} /></View>
          <Line>{v.givenOn ? `Given ${fmtDay(v.givenOn)}` : v.dueOn ? `Due ${fmtDay(v.dueOn)}` : '—'}{v.provider ? ` · ${v.provider}` : ''}</Line>
          {v.nextDueOn && v.givenOn ? <Line>{`Next dose due ${fmtDay(v.nextDueOn)}`}</Line> : null}
          {v.certificate ? <FileBtn id={v.certificate} label="Certificate" /> : null}
        </Card>
      )) : <Blank icon="eyedrop-outline" title="No vaccinations on record" body={canUpdate ? 'Add your child’s vaccinations with their certificates.' : undefined} />}
    </>
  );
}

function Checkups({ r }: { r: any }) {
  if (!r.checkups.length) return <Blank icon="clipboard-outline" title="No checkups yet" body="School health checkups appear here with their results." />;
  return (
    <>
      {r.checkups.map((k: any) => {
        const res = k.results || {};
        return (
          <Card key={k._id}>
            <View style={st.top}>
              <Text style={st.title}>{labelOf(CHECKUP_TYPE, k.type)} checkup{k.sessionName ? ` — ${k.sessionName}` : ''}</Text>
              {k.status === 'scheduled' ? <Pill tone="indigo">{`On ${fmtDay(k.scheduledOn)}`}</Pill> : k.outcome ? <Status map={CHECKUP_OUTCOME} value={k.outcome} /> : <Pill tone="green">Done</Pill>}
            </View>
            {k.status === 'completed' ? (
              <>
                <Line>{fmtDay(k.checkedOn)}</Line>
                <KV k="Height and weight" v={[res.heightCm && `${res.heightCm} cm`, res.weightKg && `${res.weightKg} kg`, res.bmi && `BMI ${res.bmi}`].filter(Boolean).join(' · ')} />
                <KV k="Vision" v={res.visionLeft || res.visionRight ? `Left ${res.visionLeft || '—'} · Right ${res.visionRight || '—'}` : ''} />
                <KV k="Blood pressure" v={res.bpSystolic ? `${res.bpSystolic}/${res.bpDiastolic || '—'}` : ''} />
                <KV k="Findings" v={k.findings} />
                <KV k="Recommendation" v={k.recommendations} />
              </>
            ) : <Line>Scheduled — results will appear here.</Line>}
          </Card>
        );
      })}
    </>
  );
}

function Documents({ r, canUpdate, sendUpdate }: { r: any; canUpdate: boolean; sendUpdate: (p?: any) => void }) {
  const DOC_STATUS: Record<string, any> = { verified: { label: 'On file', tone: 'slate' }, pending: { label: 'Waiting for review', tone: 'amber' }, rejected: { label: 'Not accepted', tone: 'red' } };
  return (
    <>
      {canUpdate ? <View style={st.headBtn}><Btn kind="primary" icon="cloud-upload-outline" onPress={() => sendUpdate({ kind: 'document' })}>Send a document</Btn></View> : null}
      {r.documents.length ? r.documents.map((d: any) => (
        <Card key={d._id}>
          <View style={st.top}><Text style={st.title}>{d.title}</Text><Status map={DOC_STATUS} value={d.status} /></View>
          <Line>{[labelOf(DOC_TYPE, d.type), d.documentDate ? fmtDay(d.documentDate) : fmtStamp(d.createdAt)].filter(Boolean).join(' · ')}</Line>
          <FileBtn id={d._id} />
        </Card>
      )) : <Blank icon="document-text-outline" title="No documents" body="Certificates and reports the school shares with you appear here." />}
    </>
  );
}

function Updates({ r, sendUpdate, onChanged }: { r: any; sendUpdate: (p?: any) => void; onChanged: (msg: string) => void }) {
  const [busy, setBusy] = useState('');
  const [fail, setFail] = useState('');
  const title = (c: any) => `${CHANGE_KIND[c.kind] || c.kind}${c.payload?.allergen ? ` — ${c.payload.allergen}` : c.payload?.condition ? ` — ${c.payload.condition}` : c.payload?.vaccine ? ` — ${c.payload.vaccine}` : c.payload?.name ? ` — ${c.payload.name}` : ''}`;
  return (
    <>
      <View style={st.headBtn}><Btn kind="primary" icon="send-outline" onPress={() => sendUpdate()}>Send an update</Btn></View>
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
      {r.changes.length ? r.changes.map((c: any) => (
        <Card key={c._id}>
          <View style={st.top}><Text style={st.title}>{title(c)}</Text><Status map={CHANGE_STATUS} value={c.status} /></View>
          <Line>{`Sent ${ago(c.createdAt)}${c.reviewedAt ? ` · answered ${ago(c.reviewedAt)}` : ''}`}</Line>
          {c.reviewNote ? <Line><Text style={st.strong}>Medical Room: </Text>{c.reviewNote}</Line> : null}
          {c.status === 'pending' ? (
            <View style={{ alignSelf: 'flex-start' }}>
              <Btn disabled={busy === c._id} onPress={async () => {
                if (!(await confirmAsync('Withdraw this update?', 'The Medical Room will no longer review it.', 'Withdraw'))) return;
                setBusy(c._id); setFail('');
                try { await withdrawMedUpdate(c._id); onChanged('Withdrawn'); } catch (err: any) { setFail(err?.message || 'It could not be withdrawn'); } finally { setBusy(''); }
              }}>{busy === c._id ? 'Withdrawing…' : 'Withdraw'}</Btn>
            </View>
          ) : null}
        </Card>
      )) : <Blank icon="send-outline" title="No updates sent" body="Tell the Medical Room about a new allergy, a condition, a contact or your doctor — it is added once they have checked it." />}
    </>
  );
}

/* ── The screen ───────────────────────────────────────────────────────────── */

const TABS = ['overview', 'history', 'visits', 'medicines', 'vaccinations', 'checkups', 'growth', 'documents', 'updates', 'campaigns'];
// Incident notices sent before Oct 5 2026 name an 'incidents' tab; they live under Visits & Incidents.
// A campaign's notice names its own tab; the campaigns live on the overview.
const tabOf = (t?: string) => { const k = t === 'incidents' ? 'visits' : t === 'campaigns' ? 'overview' : t; return k && TABS.includes(k) ? k : 'overview'; };

/**
 * `initialChild` and `initialTab` come from a notification's link — "a
 * vaccination is due" opens that child's Vaccinations. They are followed again
 * when another notification is opened onto the screen that is already showing.
 */
export default function FamilyMedical({ role, initialChild, initialTab }: { role: 'student' | 'parent'; initialChild?: string; initialTab?: string }) {
  const isParent = role === 'parent';
  const [kids, setKids] = useState<any[] | null>(isParent ? null : []);
  const [child, setChild] = useState<string | null>(isParent && initialChild ? initialChild : null);
  const [r, setR] = useState<any>(null);
  const [tab, setTab] = useState(tabOf(initialTab));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<any>(null);
  const [update, setUpdate] = useState<any>(null);
  const [flash, setFlash] = useState('');
  const [card, setCard] = useState<any>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [ask, setAsk] = useState<any>(null);
  const [asking, setAsking] = useState(false);
  const [askFail, setAskFail] = useState('');
  const [answering, setAnswering] = useState<any>(null);
  const [consenting, setConsenting] = useState(false);
  const [refAsk, setRefAsk] = useState<{ referral: any; mode: string } | null>(null);
  const [ill, setIll] = useState(false);

  const load = useCallback(async (want?: string | null) => {
    try {
      let id = want ?? child;
      if (isParent) {
        const list = unwrap(await medChildren()) || [];
        setKids(list);
        if (!list.length) { setR(null); return; }
        if (!id || !list.some((k: any) => String(k._id) === String(id))) id = String(list[0]._id);
        setChild(id);
        setR(unwrap(await childMedRecord(id)));
      } else {
        setR(unwrap(await myMedRecord()));
      }
      setError(null);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else setError(err);
    } finally { setLoading(false); setRefreshing(false); }
  }, [isParent, child]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // A notice from the Medical Room arrived: the screen reads again — urgent news shows its answer at once.
  useMedLive(() => { load(); }, { event: 'notification:new', when: medicalNotice });

  const pickChild = (id: string) => { setChild(id); setTab('overview'); setR(null); setLoading(true); load(id); };
  // A later notification for another child, or another tab, while this screen is open.
  const first = React.useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (initialTab) setTab(tabOf(initialTab));
    if (isParent && initialChild && String(initialChild) !== String(child)) { setChild(initialChild); setR(null); setLoading(true); load(initialChild); }
  }, [initialChild, initialTab]); // eslint-disable-line react-hooks/exhaustive-deps
  const historyFetcher = useCallback((q: any) => (isParent ? childMedHistory(String(child), q) : myMedHistory(q)), [isParent, child]);
  const openCard = async () => {
    if (!child) return;
    setCardBusy(true);
    try { setCard(unwrap(await childEmergency(child))); } catch (err: any) { setFlash(err?.message || 'The emergency card could not be opened'); } finally { setCardBusy(false); }
  };

  if (disabled) return <ModuleDisabled />;
  if (loading && !r) return <LoaderView />;
  if (isParent && kids && !kids.length) {
    return <Blank icon="people-outline" title="No child is linked to your account" body="Ask the school office to link your child to your account." />;
  }
  if (!r) {
    const off = error?.data?.code === 'MEDICAL_STUDENT_OFF';
    return (
      <Blank icon={off ? 'lock-closed-outline' : 'cloud-offline-outline'}
        title={off ? 'Medical information is shared with parents' : 'Medical information could not be loaded'}
        body={error?.message} action={<Btn icon="refresh" onPress={() => { setLoading(true); load(); }}>Try again</Btn>} />
    );
  }

  const s = r.student || {};
  const p = r.profile || {};
  const show = r.show || {};
  const canUpdate = isParent && !!r.canUpdate;
  const waiting = (r.plans || []).filter((x: any) => !x.authorized && x.status === 'paused');
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'history', label: 'Medical History' },
    ...(show.visits ? [{ key: 'visits', label: 'Visits & Incidents' }] : []),
    ...(show.medicines ? [{ key: 'medicines', label: 'Medicines', count: waiting.length || undefined }] : []),
    ...(show.vaccinations ? [{ key: 'vaccinations', label: 'Vaccinations', count: (r.vaccinations || []).filter((v: any) => ['overdue', 'due_soon'].includes(v.state)).length || undefined }] : []),
    ...(show.checkups ? [{ key: 'checkups', label: 'Health Checkups', count: (r.referrals || []).filter((x: any) => ['waiting', 'booked'].includes(x.status)).length || undefined }] : []),
    ...(show.checkups ? [{ key: 'growth', label: 'Growth' }] : []),
    ...(show.documents ? [{ key: 'documents', label: 'Documents' }] : []),
    ...(canUpdate ? [{ key: 'updates', label: 'Updates', count: (r.changes || []).filter((c: any) => c.status === 'pending').length || undefined }] : []),
  ];
  // A tab this reader is not shown (an old link, a student's tab=updates) opens the overview.
  const view = tabs.some((t) => t.key === tab) ? tab : 'overview';
  const sendUpdate = (preset?: any) => setUpdate(preset || {});
  const reloadAfter = (msg: string) => { setFlash(msg); load(); };

  return (
    <ScrollView style={st.screen} contentContainerStyle={st.body} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={BRAND} />}>
      <Head title={isParent ? 'My Child’s Medical Information' : 'My Health'}
        subtitle={isParent ? 'Your child’s medical record at school — allergies, conditions, visits to the Medical Room, medicines, checkups and vaccinations.' : 'Your medical information at school.'} />
      {isParent ? <KidSwitch kids={kids || []} value={child} onPick={pickChild} caption="WHOSE MEDICAL INFORMATION" /> : null}
      {isParent ? (
        <View style={st.actions}>
          {canUpdate ? <Btn kind="primary" icon="send" onPress={() => sendUpdate()} block>Send an update</Btn> : null}
          <Btn kind="danger" icon="medkit-outline" onPress={openCard} disabled={cardBusy} block>{cardBusy ? 'Opening…' : 'Emergency card'}</Btn>
        </View>
      ) : null}
      {isParent ? <View style={[st.actions, { marginTop: -4 }]}><Btn icon="thermometer-outline" onPress={() => setIll(true)} block>{`${String(s.name || 'My child').split(' ')[0]} is unwell`}</Btn></View> : null}
      {isParent ? (r.referrals || []).filter((x: any) => x.status === 'waiting').map((x: any) => (
        <Note key={x._id} tone={x.overdue ? 'red' : 'amber'} icon="paper-plane-outline" title={`Please see ${whom(x.specialty)}`}>
          <Text style={st.noteText}>{`The school suggests ${s.name} sees ${whom(x.specialty)}${x.dueBy ? ` by ${fmtDay(x.dueBy)}` : ''}: ${x.reason}`}</Text>
          <View style={{ marginTop: 8, alignSelf: 'flex-start' }}><Btn kind="primary" onPress={() => setTab('checkups')}>Open</Btn></View>
        </Note>
      )) : null}
      {flash ? <Note tone="green" icon="checkmark-circle-outline">{flash}</Note> : null}
      {isParent ? (r.urgent || []).map((u: any) => <UrgentBanner key={u._id} u={u} room={r.room} onAnswer={setAnswering} />) : null}
      {isParent && r.consent?.status !== 'given' ? (
        <Note tone="amber" icon="shield-checkmark-outline" title={`Medical consent${r.consentYear ? ` for ${r.consentYear.yearName}` : ''}`}>
          <Text style={st.noteText}>{`Tell the Medical Room what it may do for ${s.name} — emergency treatment, everyday medicines, who may see their alerts.`}</Text>
          <View style={{ marginTop: 8, alignSelf: 'flex-start' }}><Btn kind="primary" onPress={() => setConsenting(true)}>Answer now</Btn></View>
        </Note>
      ) : null}
      <ConsentSheet open={consenting} r={r} onClose={() => setConsenting(false)} onDone={(m) => { setConsenting(false); reloadAfter(m); }} />
      <AnswerSheet u={answering} onClose={() => setAnswering(null)} onDone={(m) => { setAnswering(null); reloadAfter(m); }} />

      <View style={st.hero}>
        <View style={st.heroTop}>
          <Avatar name={s.name} photo={s.photo} size={58} tone="red" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.heroName}>{s.name}</Text>
            <Text style={st.heroLine}>{[s.classLabel || 'No class yet', s.admissionNumber ? `Adm. ${s.admissionNumber}` : ''].filter(Boolean).join(' · ')}</Text>
            {s.dob ? <Text style={st.heroLine}>{`Born ${fmtDay(s.dob)}${s.age != null ? ` (${s.age})` : ''}`}</Text> : null}
          </View>
        </View>
        <View style={st.facts}>
          <View style={[st.fact, st.factBlood]}><Text style={[st.factK, { color: '#BE123C' }]}>BLOOD GROUP</Text><Text style={[st.factV, { color: '#BE123C' }]}>{r.bloodGroup || '—'}</Text></View>
          <View style={st.fact}><Text style={st.factK}>HEIGHT</Text><Text style={st.factV}>{p.heightCm ? `${p.heightCm} cm` : '—'}</Text></View>
          <View style={st.fact}><Text style={st.factK}>WEIGHT</Text><Text style={st.factV}>{p.weightKg ? `${p.weightKg} kg` : '—'}</Text></View>
          <View style={st.fact}><Text style={st.factK}>BMI</Text><Text style={st.factV}>{p.bmi ?? '—'}</Text></View>
        </View>
        {r.room?.phone ? (
          <View style={st.room}>
            <Text style={st.heroLine}>{`${r.room.name || 'Medical Room'}${r.room.hours ? ` · ${r.room.hours}` : ''}`}</Text>
            <Phone value={r.room.phone} label={r.room.name} />
          </View>
        ) : null}
      </View>

      <AlertCards alerts={r.alerts} instructions={p.instructions} />

      {isParent && waiting.length ? (
        <Note tone="amber" icon="shield-checkmark-outline" title="Your permission is needed">
          <Text style={st.noteText}>{`The Medical Room is waiting for your permission to give ${s.name} a medicine at school.`}</Text>
          <View style={{ marginTop: 8, alignSelf: 'flex-start' }}><Btn kind="primary" onPress={() => setTab('medicines')}>Review</Btn></View>
        </Note>
      ) : null}

      <View style={{ marginBottom: 12 }}><Tabs value={view} onChange={setTab} items={tabs} /></View>
      <View style={st.tabBody}>
        {view === 'overview' ? (
          <>
            <CampaignCards rows={r.campaigns || []} child={String(s._id)} canAnswer={isParent} onChanged={reloadAfter} />
            <NoticeCards rows={r.notices || []} />
            {isParent ? <IllnessCards rows={r.illnessReports || []} onChanged={reloadAfter} /> : null}
            {isParent && r.noticeLanguage ? (
              <>
                <Sub icon="chatbubble-ellipses-outline">Medical Room messages</Sub>
                <Seg value={r.noticeLanguage.mine || ''} onChange={async (v) => { try { await setFamilyLanguage(v); reloadAfter(v === 'hi' ? 'मेडिकल रूम के संदेश अब हिन्दी में आएँगे' : 'Saved'); } catch (err: any) { setFlash(err?.message || 'It could not be saved'); } }}
                  options={[{ value: '', label: 'School’s choice' }, { value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }]} />
                <View style={{ height: 14 }} />
              </>
            ) : null}
          </>
        ) : null}
        {view === 'overview' ? <Overview r={r} canUpdate={canUpdate} sendUpdate={sendUpdate} isParent={isParent} onChanged={reloadAfter} onConsent={() => setConsenting(true)} onConfirm={async (c) => {
          if (!(await confirmAsync('Confirm this care plan?', `You confirm that the steps in “${c.title}” are what the school should do for ${s.name} in an emergency. If anything is wrong, send the Medical Room an update instead.`, 'I agree'))) return;
          try { await confirmMedCarePlan(c._id); reloadAfter('Thank you — the care plan is confirmed'); } catch (err: any) { setFlash(err?.message || 'It could not be confirmed'); }
        }} /> : null}
        {view === 'history' ? <History key={child || 'me'} fetcher={historyFetcher} show={show} /> : null}
        {view === 'visits' ? <Visits r={r} /> : null}
        {view === 'medicines' ? <Medicines r={r} isParent={isParent} onAuthorize={(x) => { setAskFail(''); setAsk(x); }} /> : null}
        {view === 'vaccinations' ? <><ScheduleCards schedule={r.schedule} /><Vaccinations r={r} canUpdate={canUpdate} sendUpdate={sendUpdate} /></> : null}
        {view === 'checkups' ? <><ReferralCards rows={r.referrals || []} isParent={isParent} onAnswer={(referral, mode) => setRefAsk({ referral, mode })} /><Checkups r={r} /></> : null}
        {view === 'growth' ? <GrowthCard growth={r.growth} /> : null}
        {view === 'documents' ? <Documents r={r} canUpdate={canUpdate} sendUpdate={sendUpdate} /> : null}
        {view === 'updates' ? <Updates r={r} sendUpdate={sendUpdate} onChanged={reloadAfter} /> : null}
      </View>

      {canUpdate ? (
        <UpdateSheet preset={update} record={r} onClose={() => setUpdate(null)}
          onDone={(msg) => { setUpdate(null); setTab('updates'); reloadAfter(msg); }} />
      ) : null}

      <Sheet visible={!!ask} icon="shield-checkmark-outline" tone="indigo" title="Authorise this medicine?" onClose={() => setAsk(null)} busy={asking}
        footer={<><Btn onPress={() => setAsk(null)} block>Not now</Btn><Btn kind="primary" disabled={asking} block onPress={async () => {
          setAsking(true); setAskFail('');
          try { await authorizeMedPlan(ask._id); setAsk(null); reloadAfter('Thank you — the medicine is authorised'); } catch (err: any) { setAskFail(err?.message || 'It could not be authorised'); } finally { setAsking(false); }
        }}>{asking ? 'Saving…' : 'I authorise it'}</Btn></>}>
        {ask ? (
          <Text style={st.ask}>
            {`You give the school permission to give ${s.name} ${ask.medicineName} (${ask.dosage}), ${labelOf(PLAN_FREQUENCY, ask.frequency).toLowerCase()}${(ask.times || []).length ? ` at ${ask.times.join(', ')}` : ''}, as set up by the Medical Room. You will be told each time a dose is given.`}
          </Text>
        ) : null}
        {askFail ? <Note tone="red" icon="alert-circle-outline">{askFail}</Note> : null}
      </Sheet>

      <ReferralSheet ask={refAsk} onClose={() => setRefAsk(null)} onDone={(m) => { setRefAsk(null); reloadAfter(m); }} />
      {isParent ? <IllnessSheet open={ill} child={String(s._id)} name={s.name || 'Your child'} symptoms={r.symptoms || {}} onClose={() => setIll(false)} onDone={(m) => { setIll(false); reloadAfter(m); }} /> : null}
      <Sheet visible={!!card} icon="medkit-outline" tone="red" title="Emergency card" subtitle="Show this to a doctor or a paramedic." onClose={() => setCard(null)}>
        <EmergencyCard e={card} />
      </Sheet>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  body: { padding: 16, paddingBottom: 48 },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tabBody: { backgroundColor: '#fff', borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 12 },
  hero: { backgroundColor: '#fff', borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 12, gap: 12 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroName: { fontSize: 19, fontWeight: '800', color: Colors.text },
  heroLine: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 2 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fact: { flexBasis: '47%', flexGrow: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  factBlood: { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' },
  factK: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7, color: Colors.textLight },
  factV: { fontSize: 18, fontWeight: '800', color: Colors.text, marginTop: 2 },
  room: { borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: 10 },
  top: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: '700', color: Colors.text },
  strong: { fontWeight: '700', color: Colors.text },
  muted: { fontSize: 12, color: Colors.textSecondary },
  gap: { height: 14 },
  addRow: { marginTop: 2, alignSelf: 'flex-start' },
  headBtn: { alignSelf: 'flex-start', marginBottom: 12 },
  contact: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  contactIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  noteText: { fontSize: 12, color: Colors.text, lineHeight: 17 },
  ask: { fontSize: 14, color: Colors.text, lineHeight: 21, marginBottom: 12 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C7C2E0', borderRadius: 10, backgroundColor: '#fff' },
  fileText: { flex: 1, fontSize: 13.5, color: Colors.text },
  fileChange: { fontSize: 12.5, fontWeight: '700', color: BRAND },
  fail: { fontSize: 11.5, color: Colors.danger, marginTop: 4 },
});
