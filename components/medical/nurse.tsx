/**
 * The nurse's phone (Oct 2026) — what the web's desk cannot do on the move:
 *
 *   ScanSheet        the camera reads a student's ID card (its QR) or a
 *                    medicine pack's barcode; a typed number does the same
 *                    when there is no camera (a browser, an older app build)
 *   AddRecordSheet   an allergy, a condition or a vaccination, there and then
 *   CheckupSheet     a class's scheduled checkup marked on a tablet: one row
 *                    per child, the WHO reading as the numbers go in
 *   OfflineSheet     emergency cards kept on the phone for when there is no
 *                    network (utils/medicalOffline — encrypted, expiring)
 *
 * expo-camera is loaded defensively: an app built before it was added keeps
 * working and offers the typed number instead.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { Colors } from '@/constants/theme';
import {
  resolveStudent, itemByCode, addStudentAllergy, addStudentCondition, addStudentVaccination,
  checkupSession, saveCheckupSheet, assessGrowth, offlineCards,
} from '@/api/medical.api';
import { unwrap } from '@/components/ui/kit';
import { saveOffline, loadOffline, clearOffline, offlineStatus, offlineSupported, type OfflineSet } from '@/utils/medicalOffline';
import {
  Note, Muted, Btn, Sheet, Field, Box, Pill, Card, Line, Sub, Seg, Avatar, Spinner,
  ALLERGY_CATEGORY, ALLERGY_SEVERITY, CONDITION_TYPE, CONDITION_SEVERITY, optionsOf, fmtDay, fmtStamp, todayStr, plural, BRAND,
} from '@/components/medical/parts';

let Cam: any = null;
try { Cam = require('expo-camera'); } catch { Cam = null; }  // eslint-disable-line @typescript-eslint/no-require-imports

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const sev = (v?: string) => String(v || '').replace(/_/g, '-');

/* ── Scan ─────────────────────────────────────────────────────────────────── */

function CameraBox({ onCode }: { onCode: (code: string) => void }) {
  const [perm, ask] = Cam.useCameraPermissions();
  const [busy, setBusy] = useState(false);
  if (!perm) return <Spinner />;
  if (!perm.granted) {
    return (
      <View style={{ gap: 8 }}>
        <Muted>The camera reads the card&apos;s QR code or the pack&apos;s barcode.</Muted>
        <Btn kind="primary" icon="camera-outline" onPress={() => ask()}>Allow the camera</Btn>
      </View>
    );
  }
  return (
    <View style={st.camera}>
      <Cam.CameraView style={{ flex: 1 }} facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }}
        onBarcodeScanned={busy ? undefined : ({ data }: { data: string }) => { setBusy(true); onCode(String(data || '')); setTimeout(() => setBusy(false), 2500); }} />
    </View>
  );
}

export function ScanSheet({ open, onClose, onStudent, onCard, onVisit, onAdd }: {
  open: boolean; onClose: () => void; onStudent?: (s: any) => void; onCard: (id: string) => void; onVisit: (s: any) => void; onAdd?: (s: any) => void;
}) {
  const [mode, setMode] = useState<'student' | 'medicine'>('student');
  const [typed, setTyped] = useState('');
  const [found, setFound] = useState<any>(null);
  const [item, setItem] = useState<any>(null);
  const [fail, setFail] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTyped(''); setFound(null); setItem(null); setFail(''); } }, [open]);
  const look = async (code: string) => {
    if (!code.trim()) return;
    setBusy(true); setFail(''); setFound(null); setItem(null);
    try {
      if (mode === 'student') { const r = unwrap(await resolveStudent(code.trim())); setFound(r); onStudent?.(r.student); }
      else setItem(unwrap(await itemByCode(code.trim())));
    } catch (err: any) { setFail(err?.message || 'Not found'); } finally { setBusy(false); }
  };
  const s = found?.student;
  return (
    <Sheet visible={open} icon="scan-outline" tone="indigo" title="Scan" subtitle={mode === 'student' ? 'A student’s ID card' : 'A medicine or supply pack'} onClose={onClose}>
      <Seg value={mode} onChange={(v) => { setMode(v as any); setFound(null); setItem(null); setFail(''); }} options={[{ value: 'student', label: 'ID card' }, { value: 'medicine', label: 'Medicine pack' }]} />
      {!s && !item ? (
        <>
          {Cam ? <CameraBox onCode={look} /> : <Note tone="slate" icon="information-circle-outline">This build of the app has no camera scanner — type the number instead.</Note>}
          <Field label={mode === 'student' ? 'Or type the card or admission number' : 'Or type the barcode'}>
            <Box value={typed} onChange={setTyped} placeholder={mode === 'student' ? 'e.g. STU-2026-0042' : 'e.g. 8901234567890'} maxLength={300} />
          </Field>
          <Btn kind="primary" disabled={busy || !typed.trim()} onPress={() => look(typed)} block>{busy ? 'Looking…' : 'Find'}</Btn>
        </>
      ) : null}
      {s ? (
        <Card>
          <View style={st.row}>
            <Avatar name={s.name} photo={s.photo} size={46} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.title}>{s.name}</Text>
              <Text style={st.sub}>{[s.classLabel, s.admissionNumber].filter(Boolean).join(' · ')}</Text>
            </View>
          </View>
          {found.cardWarning ? <Note tone="amber" icon="warning-outline">{`${found.cardWarning}.`}</Note> : null}
          <View style={st.btns}>
            <Btn kind="danger" icon="medkit-outline" onPress={() => onCard(s._id)}>Emergency card</Btn>
            {s.isActive ? <Btn kind="primary" icon="add" onPress={() => onVisit(s)}>Add visit</Btn> : null}
            {s.isActive && onAdd ? <Btn icon="create-outline" onPress={() => onAdd(s)}>Add to record</Btn> : null}
            <Btn onPress={() => { setFound(null); setTyped(''); }}>Scan another</Btn>
          </View>
        </Card>
      ) : null}
      {item ? (
        <Card>
          <View style={st.top}><Text style={st.title}>{`${item.name}${item.strength ? ` ${item.strength}` : ''}`}</Text><Pill tone={item.usable > 0 ? 'green' : 'red'}>{item.usable > 0 ? `${item.usable} ${item.unit} usable` : 'None usable'}</Pill></View>
          <Line>{[item.form, item.kind === 'supply' ? 'First-aid supply' : 'Medicine', item.controlled ? 'Controlled' : '', item.prescriptionOnly ? 'Against a plan only' : ''].filter(Boolean).join(' · ')}</Line>
          {item.nextExpiry ? <Line>{`Next to expire: ${fmtDay(item.nextExpiry)}`}</Line> : null}
          {item.storageLocation ? <Line>{`Kept: ${item.storageLocation}`}</Line> : null}
          <View style={st.btns}><Btn onPress={() => { setItem(null); setTyped(''); }}>Scan another</Btn></View>
        </Card>
      ) : null}
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

/* ── Add to a record ──────────────────────────────────────────────────────── */

export function AddRecordSheet({ student, onClose, onDone }: { student: any | null; onClose: () => void; onDone: (msg: string) => void }) {
  const [kind, setKind] = useState<'allergy' | 'condition' | 'vaccination'>('allergy');
  const [v, setV] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  useEffect(() => { if (student) { setKind('allergy'); setV({ category: 'food', severity: 'moderate', type: 'other', csev: 'mild', givenOn: todayStr() }); setFail(''); setBusy(false); } }, [student]);
  const send = async () => {
    setBusy(true); setFail('');
    try {
      if (kind === 'allergy') await addStudentAllergy(student._id, { allergen: v.allergen, category: v.category, severity: v.severity, reaction: v.reaction, emergencyInstructions: v.instructions });
      else if (kind === 'condition') await addStudentCondition(student._id, { condition: v.condition, type: v.type, severity: v.csev, medication: v.medication, emergencyInstructions: v.instructions });
      else {
        if (!DAY_RE.test(v.givenOn || '')) throw new Error('Type the date as YYYY-MM-DD');
        await addStudentVaccination(student._id, { vaccine: v.vaccine, dose: v.dose, givenOn: v.givenOn, provider: v.provider });
      }
      onDone(`${kind === 'allergy' ? 'Allergy' : kind === 'condition' ? 'Condition' : 'Vaccination'} added to ${student.name}'s record`);
    } catch (err: any) { setFail(err?.message || 'It could not be saved'); setBusy(false); }
  };
  return (
    <Sheet visible={!!student} icon="add-circle-outline" tone="violet" title="Add to the record" subtitle={student?.name} onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Cancel</Btn><Btn kind="primary" onPress={send} disabled={busy} block>{busy ? 'Saving…' : 'Add'}</Btn></>}>
      <Seg value={kind} onChange={(x) => setKind(x as any)} options={[{ value: 'allergy', label: 'Allergy' }, { value: 'condition', label: 'Condition' }, { value: 'vaccination', label: 'Vaccination' }]} />
      {kind === 'allergy' ? (
        <>
          <Field label="Allergic to" required><Box value={v.allergen || ''} onChange={(x) => setV({ ...v, allergen: x })} placeholder="e.g. Peanuts" maxLength={120} /></Field>
          <Field label="Kind"><Seg value={v.category} onChange={(x) => setV({ ...v, category: x })} options={optionsOf(ALLERGY_CATEGORY)} /></Field>
          <Field label="How severe"><Seg value={v.severity} onChange={(x) => setV({ ...v, severity: x })} options={optionsOf(ALLERGY_SEVERITY)} /></Field>
          <Field label="What happens"><Box value={v.reaction || ''} onChange={(x) => setV({ ...v, reaction: x })} multiline maxLength={400} /></Field>
        </>
      ) : null}
      {kind === 'condition' ? (
        <>
          <Field label="Condition" required><Box value={v.condition || ''} onChange={(x) => setV({ ...v, condition: x })} placeholder="e.g. Asthma" maxLength={120} /></Field>
          <Field label="Type"><Seg value={v.type} onChange={(x) => setV({ ...v, type: x })} options={optionsOf(CONDITION_TYPE).slice(0, 5)} /></Field>
          <Field label="Severity"><Seg value={v.csev} onChange={(x) => setV({ ...v, csev: x })} options={optionsOf(CONDITION_SEVERITY)} /></Field>
          <Field label="Medicine"><Box value={v.medication || ''} onChange={(x) => setV({ ...v, medication: x })} maxLength={400} /></Field>
        </>
      ) : null}
      {kind !== 'vaccination' ? <Field label="If it happens at school"><Box value={v.instructions || ''} onChange={(x) => setV({ ...v, instructions: x })} multiline maxLength={400} /></Field> : null}
      {kind === 'vaccination' ? (
        <>
          <Field label="Vaccine" required><Box value={v.vaccine || ''} onChange={(x) => setV({ ...v, vaccine: x })} placeholder="e.g. MMR" maxLength={120} /></Field>
          <Field label="Dose"><Box value={v.dose || ''} onChange={(x) => setV({ ...v, dose: x })} placeholder="e.g. Dose 2" maxLength={60} /></Field>
          <Field label="Given on" required hint="YYYY-MM-DD"><Box value={v.givenOn || ''} onChange={(x) => setV({ ...v, givenOn: x })} maxLength={10} /></Field>
          <Field label="Where"><Box value={v.provider || ''} onChange={(x) => setV({ ...v, provider: x })} maxLength={160} /></Field>
        </>
      ) : null}
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

/* ── A class's checkup on a tablet ────────────────────────────────────────── */

// What each kind of checkup records — the web's RESULT_FIELDS (pages/medical/admin/mdForms).
const FIELDS: Record<string, [string, string][]> = {
  general: [['heightCm', 'Height cm'], ['weightKg', 'Weight kg'], ['visionLeft', 'Vision L'], ['visionRight', 'Vision R']],
  vision: [['visionLeft', 'Left eye'], ['visionRight', 'Right eye']],
  dental: [['dental', 'Dental findings']],
  hearing: [['hearingLeft', 'Left ear'], ['hearingRight', 'Right ear']],
  height: [['heightCm', 'Height cm']], weight: [['weightKg', 'Weight kg']], bmi: [['heightCm', 'Height cm'], ['weightKg', 'Weight kg']],
  bp: [['bpSystolic', 'Systolic'], ['bpDiastolic', 'Diastolic']], physical: [['heightCm', 'Height cm'], ['weightKg', 'Weight kg']],
};
const NUMERIC = ['heightCm', 'weightKg', 'bpSystolic', 'bpDiastolic'];

function SheetRow({ row, fields, value, onChange, absent, onAbsent }: { row: any; fields: [string, string][]; value: any; onChange: (v: any) => void; absent: boolean; onAbsent: (v: boolean) => void }) {
  const [who, setWho] = useState<any>(null);
  const h = Number(value.heightCm); const w = Number(value.weightKg);
  useEffect(() => {
    if (!(h > 30 || w > 2)) { setWho(null); return undefined; }
    const t = setTimeout(() => { assessGrowth({ student: row.student, heightCm: h || undefined, weightKg: w || undefined }).then((r) => setWho(unwrap(r))).catch(() => setWho(null)); }, 500);
    return () => clearTimeout(t);
  }, [h, w, row.student]);
  const bmi = who?.indicators?.bmi;
  return (
    <View style={[st.sheetRow, absent && { opacity: 0.5 }]}>
      <View style={st.top}>
        <Text style={st.title} numberOfLines={1}>{`${row.rollNumber ? `${row.rollNumber}. ` : ''}${row.studentName}`}</Text>
        {row.status === 'completed' ? <Pill tone="green">Saved</Pill> : <Btn onPress={() => onAbsent(!absent)}>{absent ? 'Here' : 'Absent'}</Btn>}
      </View>
      {!absent && row.status !== 'completed' ? (
        <View style={st.inputs}>
          {fields.map(([k, label]) => (
            <TextInput key={k} style={st.input} value={String(value[k] ?? '')} placeholder={label} placeholderTextColor={Colors.textLight}
              keyboardType={NUMERIC.includes(k) ? 'decimal-pad' : 'default'} onChangeText={(x) => onChange({ ...value, [k]: x })} accessibilityLabel={`${row.studentName}: ${label}`} />
          ))}
        </View>
      ) : null}
      {bmi && !bmi.implausible ? <Text style={[st.sub, { color: bmi.tone === 'red' ? Colors.danger : Colors.textSecondary }]}>{`BMI ${who.bmi} · ${bmi.centileLabel} — ${bmi.bandLabel}`}</Text> : null}
      {bmi?.implausible ? <Text style={[st.sub, { color: Colors.danger }]}>Check this measurement</Text> : null}
    </View>
  );
}

export function CheckupSheet({ sessions, open, onClose, onSaved }: { sessions: any[]; open: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  const [id, setId] = useState<string | null>(null);
  const [d, setD] = useState<any>(null);
  const [vals, setVals] = useState<Record<string, any>>({});
  const [absent, setAbsent] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (open) { setId(sessions.length === 1 ? sessions[0].sessionId : null); setD(null); setVals({}); setAbsent({}); setMsg(''); } }, [open, sessions]);
  useEffect(() => { if (id) checkupSession(id).then((r) => setD(unwrap(r))).catch((err) => setMsg(err?.message || 'It could not be opened')); }, [id]);
  const fields = FIELDS[d?.type] || FIELDS.general;
  const filled = useMemo(() => (d?.rows || []).filter((r: any) => r.status !== 'completed' && Object.values(vals[r._id] || {}).some((x) => String(x ?? '').trim() !== '')), [d, vals]);
  const save = async () => {
    setBusy(true); setMsg('');
    try {
      const rows = (d.rows || []).filter((r: any) => r.status !== 'completed').map((r: any) => {
        const raw = vals[r._id] || {};
        const results: any = {};
        for (const [k] of fields) if (String(raw[k] ?? '').trim() !== '') results[k] = NUMERIC.includes(k) ? Number(raw[k]) : String(raw[k]).trim();
        return { id: r._id, results, absent: !!absent[r._id] };
      });
      const out = unwrap(await saveCheckupSheet({ rows, checkedOn: todayStr() }));
      onSaved(`${out.saved} result${out.saved === 1 ? '' : 's'} saved${out.failed?.length ? ` · ${out.failed.length} not saved` : ''}`);
      setVals({}); setD(unwrap(await checkupSession(id as string)));
    } catch (err: any) { setMsg(err?.message || 'They could not be saved'); } finally { setBusy(false); }
  };
  return (
    <Sheet visible={open} icon="clipboard-outline" tone="teal" title={d ? d.sessionName : 'Today’s checkups'} subtitle={d ? `${d.rows.length} students · ${fields.map((f) => f[1]).join(', ')}` : undefined} onClose={onClose} busy={busy}
      footer={d ? <><Btn onPress={onClose} block>Close</Btn><Btn kind="primary" onPress={save} disabled={busy || !filled.length} block>{busy ? 'Saving…' : `Save ${filled.length}`}</Btn></> : undefined}>
      {!id ? (sessions.length ? sessions.map((s: any) => (
        <Card key={s.sessionId} onPress={() => setId(s.sessionId)}>
          <Text style={st.title}>{s.sessionName}</Text>
          <Line>{`${fmtDay(s.scheduledOn)} · ${plural(s.students, 'student')}`}</Line>
        </Card>
      )) : <Muted>No checkup is scheduled.</Muted>) : null}
      {id && !d ? <Spinner /> : null}
      {d ? d.rows.map((r: any) => (
        <SheetRow key={r._id} row={r} fields={fields} value={vals[r._id] || {}} onChange={(v) => setVals((x) => ({ ...x, [r._id]: v }))} absent={!!absent[r._id]} onAbsent={(a) => setAbsent((x) => ({ ...x, [r._id]: a }))} />
      )) : null}
      {msg ? <Note tone="red" icon="alert-circle-outline">{msg}</Note> : null}
    </Sheet>
  );
}

/* ── Offline emergency cards ──────────────────────────────────────────────── */

function OfflineCard({ c }: { c: any }) {
  return (
    <Card critical={(c.allergies || []).some((a: any) => a.critical) || (c.carePlans || []).length > 0}>
      <Text style={st.title}>{c.student.name}</Text>
      <Text style={st.sub}>{[c.student.classLabel, c.student.dob ? `born ${fmtDay(c.student.dob)}` : '', `blood group ${c.bloodGroup || '—'}`].filter(Boolean).join(' · ')}</Text>
      {(c.allergies || []).map((a: any) => <Line key={a.allergen} tone={a.critical ? 'red' : undefined} strong={a.critical}>{`Allergy: ${a.allergen} — ${sev(a.severity)}${a.emergencyInstructions ? `. ${a.emergencyInstructions}` : ''}`}</Line>)}
      {(c.conditions || []).map((x: any) => <Line key={x.condition} tone={x.critical ? 'red' : undefined}>{`${x.condition} — ${sev(x.severity)}${x.emergencyInstructions ? `. ${x.emergencyInstructions}` : ''}`}</Line>)}
      {(c.carePlans || []).map((p: any) => <Line key={p.title} tone="red" strong>{`Care plan — ${p.title}: ${(p.steps || []).filter((s: any) => s.critical).map((s: any) => s.text).slice(0, 3).join(' > ') || (p.steps || []).slice(0, 2).map((s: any) => s.text).join(' > ')}`}</Line>)}
      {(c.rescueMeds || []).map((m: any) => <Line key={m.name}>{`Rescue medicine: ${m.name}${m.dose ? ` (${m.dose})` : ''}${m.selfCarry ? ' — carried by the child' : ''}${m.expired ? ' — EXPIRED' : ''}`}</Line>)}
      {(c.contacts || []).map((p: any) => <Line key={p.phone} strong>{`${p.name || p.relation || 'Contact'}: ${p.phone}`}</Line>)}
      {c.doctor ? <Line>{`Doctor: ${c.doctor.name}${c.doctor.phone ? ` — ${c.doctor.phone}` : ''}`}</Line> : null}
    </Card>
  );
}

export function OfflineSheet({ open, userId, onClose, startLoaded = false }: { open: boolean; userId: string; onClose: () => void; startLoaded?: boolean }) {
  const [status, setStatus] = useState<any>(null);
  const [set, setSet] = useState<OfflineSet | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const refreshStatus = async () => setStatus(await offlineStatus(userId));
  useEffect(() => {
    if (!open) return;
    setMsg(''); setQ('');
    refreshStatus();
    if (startLoaded) loadOffline(userId).then((x) => setSet(x?.set || null));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const download = async () => {
    setBusy(true); setMsg('');
    try { const data = unwrap(await offlineCards()); await saveOffline(data, userId); setMsg(`Saved ${data.count} cards — they delete themselves ${fmtStamp(data.expiresAt)}`); await refreshStatus(); setSet(data); }
    catch (err: any) { setMsg(err?.message || 'They could not be saved'); } finally { setBusy(false); }
  };
  const show = async () => { const x = await loadOffline(userId); setSet(x?.set || null); if (!x) setMsg('Nothing saved — or it has expired'); };
  const list = (set?.cards || []).filter((c: any) => !q.trim() || `${c.student.name} ${c.student.classLabel} ${c.student.admissionNumber}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet visible={open} icon="cloud-offline-outline" tone="slate" title="Offline emergency cards" subtitle="For a trip or when the network is down" onClose={onClose} busy={busy}>
      {!offlineSupported() ? <Note tone="slate" icon="information-circle-outline">Offline cards are kept on the phone app — a browser keeps nothing.</Note> : (
        <>
          <Muted>{status ? `${status.count} cards saved ${fmtStamp(status.savedAt)} — they delete themselves ${fmtStamp(status.expiresAt)}, or when you sign out.` : 'Nothing saved on this phone. Save the cards of every child with an allergy, a condition or a care plan — kept encrypted, for 72 hours.'}</Muted>
          <View style={st.btns}>
            <Btn kind="primary" icon="download-outline" disabled={busy} onPress={download}>{status ? 'Refresh' : 'Save for offline'}</Btn>
            {status && !set ? <Btn onPress={show}>Show them</Btn> : null}
            {status ? <Btn onPress={async () => { await clearOffline(); setSet(null); await refreshStatus(); setMsg('Deleted from this phone'); }}>Delete now</Btn> : null}
          </View>
        </>
      )}
      {msg ? <Note tone="blue" icon="information-circle-outline">{msg}</Note> : null}
      {set ? (
        <>
          <Sub icon="medkit-outline">{`${set.count} children · ${set.room?.name || 'Medical Room'}${set.room?.phone ? ` ${set.room.phone}` : ''}`}</Sub>
          <Field label="Find"><Box value={q} onChange={setQ} placeholder="Name, class or admission no." /></Field>
          {list.map((c: any) => <OfflineCard key={c.student._id} c={c} />)}
        </>
      ) : null}
    </Sheet>
  );
}

const st = StyleSheet.create({
  camera: { height: 260, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000', marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  title: { fontSize: 14, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  btns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  sheetRow: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 10, marginBottom: 8, backgroundColor: '#fff', gap: 6 },
  inputs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { flexGrow: 1, flexBasis: '45%', minHeight: 42, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 10, fontSize: 15, color: Colors.text, backgroundColor: '#fff' },
});

export const NURSE_BRAND = BRAND;
