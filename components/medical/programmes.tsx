/**
 * Health programmes on the phone (Oct 2026) — the web's growth, vaccination
 * schedule, referrals, campaigns and outbreak watch, cut to what is done away
 * from a desk:
 *
 *   the family   their child's growth against the WHO charts, the school's
 *                vaccination schedule, a referral to answer ("we have an
 *                appointment", "we saw the doctor" with the report, "we will
 *                not go"), a campaign's yes or no, "my child is unwell", the
 *                health notices that reached the class
 *   the desk     a campaign's roster marked at the camp, an outbreak looked
 *                into (and its notice sent), families' "off sick" reports
 *
 * The numbers and the rules are the server's (services/medicalGrowth,
 * medicalSchedule, medicalReferrals, medicalCampaigns, medicalOutbreak).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import {
  answerCampaign, answerReferral, answerReferralWithReport, reportIllness, withdrawIllness,
  deskCampaigns, deskCampaign, recordCampaign, markCampaignRest, deskOutbreak, outbreakAct, outbreakNoticeDraft, sendOutbreakNotice,
  deskIllnessReports, markIllnessSeen,
} from '@/api/medical.api';
import { unwrap, confirmAsync } from '@/components/ui/kit';
import {
  Note, Muted, Btn, Sheet, Field, Box, Pill, Card, Line, Sub, Seg, Avatar, Spinner,
  fmtDay, fmtStamp, todayStr, plural, BRAND, TINT, type Tone,
} from '@/components/medical/parts';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const tone = (t?: string): Tone => (['green', 'amber', 'red', 'slate', 'indigo', 'blue', 'sky', 'violet', 'orange', 'rose', 'teal'].includes(String(t)) ? (t as Tone) : 'slate');
// "The school suggests Gita sees an eye specialist".
const WHOM: Record<string, string> = {
  eye: 'an eye specialist', ent: 'an ear, nose and throat (ENT) specialist', dental: 'a dentist', paediatric: 'a paediatrician',
  nutrition: 'a dietitian', skin: 'a skin specialist', mental_health: 'a counsellor', orthopaedic: 'a bone and joint specialist', other: 'a specialist',
};
export const whom = (k: string) => WHOM[k] || 'a specialist';

/* ── Growth ───────────────────────────────────────────────────────────────── */

/** Where a percentile sits: the 15th–85th band shaded, the 3rd and 97th marked. */
function CentileBar({ centile, t }: { centile: number; t: Tone }) {
  const at = Math.max(0, Math.min(100, centile));
  return (
    <View style={st.bar} accessibilityLabel={`${Math.round(at)}th percentile`}>
      <View style={[st.barBand, { left: '15%', width: '70%' }]} />
      <View style={[st.barTick, { left: '3%' }]} />
      <View style={[st.barTick, { left: '50%', backgroundColor: '#16A34A' }]} />
      <View style={[st.barTick, { left: '97%' }]} />
      <View style={[st.barDot, { left: `${at}%`, backgroundColor: TINT[t]?.fg || BRAND }]} />
    </View>
  );
}

export function GrowthCard({ growth }: { growth: any }) {
  if (!growth) return null;
  const pts = growth.points || [];
  if (!pts.length) return <Muted>The school records height and weight at its health checkups; the chart starts after the first.</Muted>;
  const latest = growth.latest || {};
  const ind = latest.indicators || {};
  return (
    <>
      {growth.note ? <Note tone="amber" icon="information-circle-outline">{growth.note}</Note> : null}
      <Card>
        <Line strong>{`${fmtDay(latest.on)} · ${latest.ageLabel || ''}`}</Line>
        <Line>{[latest.heightCm ? `${latest.heightCm} cm` : '', latest.weightKg ? `${latest.weightKg} kg` : '', latest.bmi ? `BMI ${latest.bmi}` : ''].filter(Boolean).join(' · ')}</Line>
        {['bmi', 'height', 'weight'].map((k) => ind[k]).filter(Boolean).map((x: any) => (
          <View key={x.key} style={{ marginTop: 10 }}>
            <View style={st.top}><Text style={st.title}>{x.label}</Text><Pill tone={tone(x.tone)}>{x.implausible ? 'Check the measurement' : x.bandLabel}</Pill></View>
            {!x.implausible ? <><CentileBar centile={x.centile} t={tone(x.tone)} /><Muted>{x.centileLabel}</Muted></> : null}
          </View>
        ))}
        {Object.values(ind).some((x: any) => x.concern) ? <Note tone="red" icon="alert-circle-outline">The school nurse may suggest seeing your doctor — growth outside the usual range is worth a check, and is often nothing serious.</Note> : null}
      </Card>
      {pts.length > 1 ? (
        <>
          <Sub icon="trending-up-outline">Measurements</Sub>
          {[...pts].reverse().map((p: any) => (
            <Card key={p.on}>
              <View style={st.top}><Text style={st.title}>{fmtDay(p.on)}</Text><Muted>{p.ageLabel}</Muted></View>
              <Line>{[p.heightCm ? `${p.heightCm} cm` : '', p.weightKg ? `${p.weightKg} kg` : '', p.bmi ? `BMI ${p.bmi}` : ''].filter(Boolean).join(' · ')}</Line>
              {p.indicators?.bmi && !p.indicators.bmi.implausible ? <Line>{`BMI-for-age: ${p.indicators.bmi.centileLabel} — ${p.indicators.bmi.bandLabel}`}</Line> : null}
            </Card>
          ))}
        </>
      ) : null}
      <Muted>{`${growth.source}. A percentile compares a child with others of the same age and sex: the 50th is the middle.`}</Muted>
    </>
  );
}

/* ── The vaccination schedule ─────────────────────────────────────────────── */

export function ScheduleCards({ schedule }: { schedule: any }) {
  if (!schedule?.on || !(schedule.entries || []).length) return null;
  return (
    <>
      <Sub icon="calendar-outline">The school’s vaccination schedule</Sub>
      <Muted>{schedule.programmeLabel}</Muted>
      {schedule.entries.map((e: any) => (
        <Card key={e.key} critical={e.status === 'overdue'}>
          <View style={st.top}><Text style={st.title}>{e.label}</Text><Pill tone={tone(e.tone)}>{e.statusLabel}</Pill></View>
          <Line>{`${e.window}${e.givenOn ? ` · given ${fmtDay(e.givenOn)}` : e.dueOn && !['exempt', 'no_record'].includes(e.status) ? ` · due ${fmtDay(e.dueOn)}` : ''}`}</Line>
        </Card>
      ))}
      <View style={{ height: 14 }} />
    </>
  );
}

/* ── Referrals ────────────────────────────────────────────────────────────── */

export function ReferralCards({ rows, isParent, onAnswer }: { rows: any[]; isParent: boolean; onAnswer: (r: any, mode: string) => void }) {
  if (!(rows || []).length) return null;
  return (
    <>
      <Sub icon="paper-plane-outline">Referrals to a specialist</Sub>
      {rows.map((r: any) => {
        const open = ['waiting', 'booked'].includes(r.status);
        return (
          <Card key={r._id} critical={r.overdue}>
            <View style={st.top}><Text style={st.title}>{r.specialtyLabel}</Text><Pill tone={tone(r.tone)}>{r.statusLabel}</Pill></View>
            <Line>{r.reason}</Line>
            {open && r.dueBy ? <Line strong>{`To be seen by ${fmtDay(r.dueBy)}`}</Line> : null}
            {r.status === 'booked' && r.appointmentOn ? <Line>{`Appointment ${fmtDay(r.appointmentOn)}${r.appointmentWith ? ` with ${r.appointmentWith}` : ''}`}</Line> : null}
            {r.outcome?.diagnosis ? <Line>{`The doctor: ${r.outcome.diagnosis}${r.outcome.advice ? ` — ${r.outcome.advice}` : ''}`}</Line> : null}
            {isParent && open ? (
              <View style={st.btnRow}>
                <Btn kind="primary" onPress={() => onAnswer(r, 'seen')}>We saw the doctor</Btn>
                <Btn onPress={() => onAnswer(r, 'booked')}>Appointment</Btn>
                <Btn onPress={() => onAnswer(r, 'declined')}>We will not go</Btn>
              </View>
            ) : null}
          </Card>
        );
      })}
      <View style={{ height: 14 }} />
    </>
  );
}

export function ReferralSheet({ ask, onClose, onDone }: { ask: { referral: any; mode: string } | null; onClose: () => void; onDone: (msg: string) => void }) {
  const [v, setV] = useState<any>({});
  const [file, setFile] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  useEffect(() => { if (ask) { setV({ seenOn: todayStr(), glasses: '' }); setFile(null); setFail(''); setBusy(false); } }, [ask]);
  if (!ask) return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>;
  const { referral: r, mode } = ask;
  const pick = async () => {
    const res: any = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
    if (!res?.canceled && res?.assets?.length) setFile(res.assets[0]);
  };
  const send = async () => {
    setFail('');
    if (mode === 'booked' && !DAY_RE.test(v.appointmentOn || '')) { setFail('Type the date as YYYY-MM-DD'); return; }
    if (mode === 'seen' && !String(v.diagnosis || '').trim()) { setFail('Write what the doctor found'); return; }
    if (mode === 'declined' && String(v.reason || '').trim().length < 3) { setFail('Please say why'); return; }
    setBusy(true);
    try {
      const body = mode === 'booked' ? { action: 'booked', appointmentOn: v.appointmentOn, appointmentWith: v.appointmentWith || '' }
        : mode === 'declined' ? { action: 'declined', reason: v.reason }
          : { action: 'seen', seenOn: DAY_RE.test(v.seenOn || '') ? v.seenOn : todayStr(), seenBy: v.seenBy || '', diagnosis: v.diagnosis, advice: v.advice || '', ...(v.glasses ? { glasses: v.glasses === 'yes' } : {}) };
      if (mode === 'seen' && file) {
        const fd = new FormData();
        for (const [k, x] of Object.entries(body)) fd.append(k, String(x));
        if (file.file) fd.append('file', file.file);
        else fd.append('file', { uri: file.uri, name: file.name || 'report.pdf', type: file.mimeType || 'application/octet-stream' } as any);
        await answerReferralWithReport(r._id, fd);
      } else await answerReferral(r._id, body);
      onDone('Sent to the school');
    } catch (err: any) { setFail(err?.message || 'It could not be sent'); setBusy(false); }
  };
  const title = mode === 'booked' ? 'We have an appointment' : mode === 'declined' ? 'We will not go' : 'What the doctor said';
  return (
    <Sheet visible icon="paper-plane-outline" tone="indigo" title={title} subtitle={r.specialtyLabel} onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Cancel</Btn><Btn kind="primary" onPress={send} disabled={busy} block>{busy ? 'Sending…' : 'Send to the school'}</Btn></>}>
      {mode === 'booked' ? (
        <>
          <Field label="Date of the appointment" required hint="YYYY-MM-DD"><Box value={v.appointmentOn || ''} onChange={(x) => setV({ ...v, appointmentOn: x })} placeholder={todayStr()} maxLength={10} /></Field>
          <Field label="With"><Box value={v.appointmentWith || ''} onChange={(x) => setV({ ...v, appointmentWith: x })} placeholder="Doctor or clinic" maxLength={160} /></Field>
        </>
      ) : null}
      {mode === 'seen' ? (
        <>
          <Field label="Seen on" hint="YYYY-MM-DD"><Box value={v.seenOn || ''} onChange={(x) => setV({ ...v, seenOn: x })} maxLength={10} /></Field>
          <Field label="Doctor / clinic"><Box value={v.seenBy || ''} onChange={(x) => setV({ ...v, seenBy: x })} maxLength={160} /></Field>
          <Field label="What the doctor found" required><Box value={v.diagnosis || ''} onChange={(x) => setV({ ...v, diagnosis: x })} multiline maxLength={600} /></Field>
          <Field label="Advice or treatment"><Box value={v.advice || ''} onChange={(x) => setV({ ...v, advice: x })} multiline maxLength={1500} /></Field>
          {r.specialty === 'eye' ? <Field label="Glasses"><Seg value={v.glasses} onChange={(x) => setV({ ...v, glasses: x })} options={[{ value: 'yes', label: 'Needed' }, { value: 'no', label: 'Not needed' }, { value: '', label: 'Not said' }]} /></Field> : null}
          <Field label="The doctor's report" hint="A photo or PDF — only the medical staff and your family see it.">
            <TouchableOpacity style={st.file} onPress={pick} accessibilityRole="button" accessibilityLabel={file ? `Report: ${file.name}. Change` : 'Choose the report'}>
              <Ionicons name="cloud-upload-outline" size={18} color={BRAND} />
              <Text style={[st.fileText, !file && { color: Colors.textLight }]} numberOfLines={1}>{file ? file.name : 'Choose a file'}</Text>
            </TouchableOpacity>
          </Field>
        </>
      ) : null}
      {mode === 'declined' ? <Field label="Please tell the school why" required><Box value={v.reason || ''} onChange={(x) => setV({ ...v, reason: x })} multiline maxLength={600} /></Field> : null}
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

/* ── Campaigns, for the family ────────────────────────────────────────────── */

export function CampaignCards({ rows, child, canAnswer, onChanged }: { rows: any[]; child: string; canAnswer: boolean; onChanged: (msg: string) => void }) {
  const [busy, setBusy] = useState('');
  if (!(rows || []).length) return null;
  const answer = async (c: any, a: 'yes' | 'no') => {
    if (a === 'no' && !(await confirmAsync(`No to ${c.title}?`, `${c.what || 'It'} will not be given to your child at school. You can change your mind until the day.`, 'Say no'))) return;
    setBusy(`${c._id}:${a}`);
    try { await answerCampaign({ campaign: c._id, child, answer: a }); onChanged(a === 'yes' ? 'Thank you — the school has your yes' : 'The school has your answer'); } catch (err: any) { onChanged(err?.message || 'It could not be sent'); } finally { setBusy(''); }
  };
  return (
    <>
      <Sub icon="megaphone-outline">Health campaigns</Sub>
      {rows.map((c: any) => (
        <Card key={c._id}>
          <View style={st.top}><Text style={st.title}>{c.title}</Text>{c.outcome ? <Pill tone={c.outcome === 'given' ? 'green' : 'slate'}>{c.outcomeLabel}</Pill> : <Pill tone={tone(c.tone)}>{c.phaseLabel}</Pill>}</View>
          <Line>{`${c.kindLabel} · ${fmtDay(c.startOn)}${c.endOn && c.endOn !== c.startOn ? ` to ${fmtDay(c.endOn)}` : ''}${c.what && c.what !== c.kindLabel ? ` · ${c.what}` : ''}`}</Line>
          {c.about ? <Line>{c.about}</Line> : null}
          {c.consent !== 'none' && !c.outcome ? (
            <Line strong>{c.answer === 'yes' ? 'You said yes' : c.answer === 'no' ? 'You said no' : c.consent === 'opt_in' ? 'Your child takes part only if you say yes' : 'Your child takes part unless you say no'}</Line>
          ) : null}
          {canAnswer && c.canAnswer ? (
            <View style={st.btnRow}>
              {c.answer !== 'yes' ? <Btn kind="primary" disabled={!!busy} onPress={() => answer(c, 'yes')}>{busy === `${c._id}:yes` ? 'Sending…' : 'Yes'}</Btn> : null}
              {c.answer !== 'no' ? <Btn disabled={!!busy} onPress={() => answer(c, 'no')}>{busy === `${c._id}:no` ? 'Sending…' : 'No'}</Btn> : null}
            </View>
          ) : null}
        </Card>
      ))}
      <View style={{ height: 14 }} />
    </>
  );
}

/* ── Unwell at home ───────────────────────────────────────────────────────── */

export function IllnessSheet({ open, child, name, symptoms, onClose, onDone }: { open: boolean; child: string; name: string; symptoms: Record<string, string>; onClose: () => void; onDone: (msg: string) => void }) {
  const [v, setV] = useState<any>({ from: todayStr(), to: '', symptoms: [] as string[], note: '' });
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  useEffect(() => { if (open) { setV({ from: todayStr(), to: '', symptoms: [], note: '' }); setFail(''); setBusy(false); } }, [open]);
  const toggle = (k: string) => setV((x: any) => ({ ...x, symptoms: x.symptoms.includes(k) ? x.symptoms.filter((y: string) => y !== k) : [...x.symptoms, k] }));
  const send = async () => {
    setFail('');
    if (!DAY_RE.test(v.from)) { setFail('Type the day as YYYY-MM-DD'); return; }
    if (v.to && !DAY_RE.test(v.to)) { setFail('Type the day back as YYYY-MM-DD'); return; }
    if (!v.symptoms.length) { setFail('Tick at least one sign'); return; }
    setBusy(true);
    try { await reportIllness({ child, from: v.from, to: v.to || null, symptoms: v.symptoms, note: v.note }); onDone('The school has been told'); } catch (err: any) { setFail(err?.message || 'It could not be sent'); setBusy(false); }
  };
  return (
    <Sheet visible={open} icon="thermometer-outline" tone="amber" title={`${name} is unwell`} subtitle="The school nurse reads this" onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Cancel</Btn><Btn kind="primary" onPress={send} disabled={busy} block>{busy ? 'Sending…' : 'Tell the school'}</Btn></>}>
      <Muted>It helps the school notice when an illness is going round a class. No child is ever named to other families.</Muted>
      <Field label="Unwell since" required hint="YYYY-MM-DD"><Box value={v.from} onChange={(x) => setV({ ...v, from: x })} maxLength={10} /></Field>
      <Field label="Expected back" hint="YYYY-MM-DD — leave empty if you do not know"><Box value={v.to} onChange={(x) => setV({ ...v, to: x })} maxLength={10} /></Field>
      <Field label="Signs" required>
        <View style={st.chips}>
          {Object.entries(symptoms || {}).map(([k, label]) => {
            const on = v.symptoms.includes(k);
            return (
              <TouchableOpacity key={k} style={[st.chip, on && st.chipOn]} onPress={() => toggle(k)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <Text style={[st.chipText, on && { color: '#fff' }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Field>
      <Field label="Anything else"><Box value={v.note} onChange={(x) => setV({ ...v, note: x })} multiline maxLength={600} placeholder="e.g. the doctor said it is chickenpox" /></Field>
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

export function IllnessCards({ rows, onChanged }: { rows: any[]; onChanged: (msg: string) => void }) {
  if (!(rows || []).length) return null;
  return (
    <>
      <Sub icon="thermometer-outline">Off sick</Sub>
      {rows.map((r: any) => (
        <Card key={r._id}>
          <View style={st.top}><Text style={st.title}>{(r.symptomLabels || []).join(', ')}</Text><Pill tone={r.status === 'seen' ? 'green' : r.status === 'withdrawn' ? 'slate' : 'amber'}>{r.status === 'seen' ? 'Read by the nurse' : r.status === 'withdrawn' ? 'Withdrawn' : 'Sent'}</Pill></View>
          <Line>{`From ${fmtDay(r.from)}${r.to ? ` to ${fmtDay(r.to)}` : ''}${r.note ? ` · “${r.note}”` : ''}`}</Line>
          {r.status === 'new' ? (
            <View style={st.btnRow}><Btn onPress={async () => { try { await withdrawIllness(r._id); onChanged('Withdrawn'); } catch (err: any) { onChanged(err?.message || 'It could not be withdrawn'); } }}>Withdraw</Btn></View>
          ) : null}
        </Card>
      ))}
      <View style={{ height: 14 }} />
    </>
  );
}

export function NoticeCards({ rows }: { rows: any[] }) {
  if (!(rows || []).length) return null;
  return (
    <>
      <Sub icon="information-circle-outline">Health notices</Sub>
      {rows.map((n: any) => (
        <Card key={`${n.at}${n.title}`}>
          <Text style={st.title}>{n.title}</Text>
          <Muted>{fmtStamp(n.at)}</Muted>
          <Line>{n.text}</Line>
        </Card>
      ))}
      <View style={{ height: 14 }} />
    </>
  );
}

/* ── The desk ─────────────────────────────────────────────────────────────── */

/** What the programmes ask of the room today — shown under the desk's tiles. */
export function DeskProgrammeNotes({ p, onCampaigns, onOutbreak, onIllness }: { p: any; onCampaigns: () => void; onOutbreak: (id: string) => void; onIllness: () => void }) {
  if (!p) return null;
  return (
    <>
      {(p.outbreaks || []).map((o: any) => (
        <Note key={o._id} tone="red" icon="warning-outline" title={`${o.status === 'confirmed' ? 'Outbreak' : 'Possible outbreak'}: ${o.label}`}>
          <Text style={st.noteText}>{`${plural(o.caseCount, 'child', 'children')} in ${o.scope?.label || 'the school'}.`}</Text>
          <View style={st.noteBtn}><Btn kind="primary" onPress={() => onOutbreak(o._id)}>Look into it</Btn></View>
        </Note>
      ))}
      {p.campaignsToday ? (
        <Note tone="teal" icon="megaphone-outline" title={`${plural(p.campaignsToday, 'health campaign')} on today`}>
          <Text style={st.noteText}>Mark the roster as you go.</Text>
          <View style={st.noteBtn}><Btn kind="primary" onPress={onCampaigns}>Open the roster</Btn></View>
        </Note>
      ) : null}
      {p.hostelWaiting ? (
        <Note tone="violet" icon="bed-outline" title={`${plural(p.hostelWaiting, 'resident was', 'residents were')} unwell in the hostel`}>
          <Text style={st.noteText}>The warden’s reports are waiting in Requests.</Text>
        </Note>
      ) : null}
      {p.newIllness ? (
        <Note tone="amber" icon="thermometer-outline" title={`${plural(p.newIllness, 'family has', 'families have')} said their child is off sick`}>
          <View style={st.noteBtn}><Btn onPress={onIllness}>Read</Btn></View>
        </Note>
      ) : null}
    </>
  );
}

/** A campaign's roster at the camp: section by section, given or absent. */
export function CampaignRosterSheet({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: (msg?: string) => void }) {
  const [list, setList] = useState<any[] | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [section, setSection] = useState('');
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!open) return;
    setId(null); setD(null); setMsg(''); setSection('');
    deskCampaigns({ tab: 'active' }).then((r) => {
      const rows = (unwrap(r)?.rows || []).filter((c: any) => c.phase === 'running');
      setList(rows);
      if (rows.length === 1) setId(rows[0]._id);
    }).catch(() => setList([]));
  }, [open]);
  const load = useCallback(async () => {
    if (!id) return;
    try { setD(unwrap(await deskCampaign(id, section ? { sectionId: section } : {}))); } catch (err: any) { setMsg(err?.message || 'The roster could not be loaded'); }
  }, [id, section]);
  useEffect(() => { load(); }, [load]);
  const report = (res: any, label: string) => {
    const x = unwrap(res) || {};
    const failed = x.failed || [];
    setMsg([x.saved ? `${x.saved} ${label}` : '', ...failed.slice(0, 3).map((f: any) => f.message), x.left ? `${x.left} left for a decision (the family's answer)` : ''].filter(Boolean).join(' · '));
    load(); onChanged();
  };
  const mark = async (row: any, outcome: string) => {
    setBusy(`${row.studentId}:${outcome}`);
    try { report(await recordCampaign(id as string, { entries: [{ student: row.studentId, outcome }] }), 'saved'); } catch (err: any) { setMsg(err?.message || 'It could not be saved'); } finally { setBusy(''); }
  };
  const rest = async (outcome: string) => {
    if (!(await confirmAsync(outcome === 'given' ? 'Mark the rest given?' : 'Mark the rest absent?', 'Every child not yet marked in this section — a family that said no is left for you to decide.', 'Mark them'))) return;
    setBusy(`rest:${outcome}`);
    try { report(await markCampaignRest(id as string, { sectionId: section || 'all', outcome }), outcome === 'given' ? 'marked given' : 'marked absent'); } catch (err: any) { setMsg(err?.message || 'It could not be saved'); } finally { setBusy(''); }
  };
  const c = d?.campaign;
  return (
    <Sheet visible={open} icon="megaphone-outline" tone="teal" title={c ? c.title : 'Health campaigns today'} subtitle={c ? `${c.kindLabel}${c.what && c.what !== c.kindLabel ? ` · ${c.what}` : ''}` : undefined} onClose={onClose}>
      {!list ? <Spinner /> : !list.length ? <Muted>No health campaign is on today.</Muted> : null}
      {list && list.length > 1 && !id ? list.map((x: any) => (
        <Card key={x._id} onPress={() => setId(x._id)}>
          <Text style={st.title}>{x.title}</Text>
          <Line>{`${x.kindLabel} · ${x.given} of ${x.students} ${String(x.doneLabel).toLowerCase()}`}</Line>
        </Card>
      )) : null}
      {c ? (
        <>
          <Line strong>{`${d.total?.given || 0} of ${d.total?.eligible || 0} ${String(c.doneLabel).toLowerCase()} · coverage ${d.total?.coverage ?? 0}%`}</Line>
          <View style={st.chips}>
            {[{ sectionId: '', label: 'All' }, ...d.sections.filter((x: any) => x.sectionId)].map((x: any) => {
              const on = (x.sectionId || '') === section;
              return (
                <TouchableOpacity key={x.sectionId || 'all'} style={[st.chip, on && st.chipOn]} onPress={() => setSection(x.sectionId || '')} accessibilityRole="button" accessibilityState={{ selected: on }}>
                  <Text style={[st.chipText, on && { color: '#fff' }]}>{x.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={st.btnRow}>
            <Btn kind="primary" disabled={!!busy} onPress={() => rest('given')}>{`Rest ${String(c.doneLabel).toLowerCase()}`}</Btn>
            <Btn disabled={!!busy} onPress={() => rest('absent')}>Rest absent</Btn>
          </View>
          {msg ? <Note tone="blue" icon="information-circle-outline">{msg}</Note> : null}
          {d.roster.map((x: any) => (
            <View key={x._id} style={[st.row, x.outcome === 'given' && { backgroundColor: '#F0FDF4' }, x.outcome === 'absent' && { backgroundColor: '#FFFBEB' }]}>
              <Avatar name={x.studentName} photo={x.studentPhoto} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.title} numberOfLines={1}>{x.studentName}</Text>
                <Text style={st.sub} numberOfLines={2}>{[x.rollNumber ? `Roll ${x.rollNumber}` : '', x.consent === 'no' ? 'Family said no' : x.consent === 'yes' ? 'Family said yes' : '', x.allergies ? `Allergy: ${x.allergies}` : '', x.outcome ? (x.outcome === 'given' ? c.doneLabel : x.outcomeLabel) : ''].filter(Boolean).join(' · ')}</Text>
              </View>
              {x.outcome !== 'given' ? <Btn kind="primary" disabled={!!busy || (c.gives && !x.allowed)} onPress={() => mark(x, 'given')}>{c.doneLabel}</Btn> : null}
              {x.outcome !== 'absent' ? <Btn disabled={!!busy} onPress={() => mark(x, 'absent')}>Absent</Btn> : null}
            </View>
          ))}
        </>
      ) : null}
    </Sheet>
  );
}

/** An outbreak on the phone: who, and a notice to the families that names no child. */
export function OutbreakSheet({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: (msg?: string) => void }) {
  const [o, setO] = useState<any>(null);
  const [audience, setAudience] = useState('section');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!id) { setO(null); return; }
    setMsg(''); setText('');
    deskOutbreak(id).then((r) => {
      const x = unwrap(r);
      setO(x);
      const a = x?.scope?.kind === 'section' ? 'section' : x?.scope?.kind === 'class' ? 'class' : 'school';
      setAudience(a);
    }).catch((err: any) => setMsg(err?.message || 'It could not be opened'));
  }, [id]);
  useEffect(() => {
    if (!id || !o) return;
    outbreakNoticeDraft(id, audience).then((r) => setText(unwrap(r)?.text || '')).catch(() => {});
  }, [id, o, audience]);
  const send = async () => {
    setBusy(true); setMsg('');
    try { const r = unwrap(await sendOutbreakNotice(id as string, { audience, text })); setMsg(`Sent to ${plural(r?.sent?.families || 0, 'parent')} and ${plural(r?.sent?.teachers || 0, 'teacher')}`); onChanged(); } catch (err: any) { setMsg(err?.message || 'It could not be sent'); } finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true);
    try { await outbreakAct(id as string, { action: 'confirm' }); setO((x: any) => ({ ...x, status: 'confirmed', statusLabel: 'Outbreak confirmed' })); onChanged('Confirmed as an outbreak'); } catch (err: any) { setMsg(err?.message || 'It could not be confirmed'); } finally { setBusy(false); }
  };
  const audiences = [
    ...(o?.scope?.kind === 'section' ? [{ value: 'section', label: o.scope.label }] : []),
    ...(['section', 'class'].includes(o?.scope?.kind) ? [{ value: 'class', label: 'The class' }] : []),
    { value: 'school', label: 'The school' },
  ];
  return (
    <Sheet visible={!!id} icon="warning-outline" tone="red" title={o ? o.label : 'Outbreak'} subtitle={o ? `${o.number} · ${o.scope?.label || ''} · ${o.statusLabel}` : undefined} onClose={onClose} busy={busy}>
      {!o ? (msg ? <Note tone="red" icon="alert-circle-outline">{msg}</Note> : <Spinner />) : (
        <>
          <Muted>Who the children are is for the medical staff only.</Muted>
          {o.cases.map((c: any) => (
            <View key={`${c.student}:${c.sourceId}`} style={st.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.title}>{c.name}</Text>
                <Text style={st.sub}>{`${c.classLabel} · ${c.sourceLabel} · ${c.onLabel || fmtStamp(c.on)}`}</Text>
              </View>
            </View>
          ))}
          {o.status === 'watching' ? <View style={st.btnRow}><Btn kind="primary" disabled={busy} onPress={confirm}>Confirm outbreak</Btn></View> : null}
          {o.status !== 'closed' ? (
            <>
              <Sub icon="megaphone-outline">Notice to families</Sub>
              <Seg value={audience} onChange={setAudience} options={audiences} />
              <Field label="The notice" hint="What to watch for and what to do — never a child's name."><Box value={text} onChange={setText} multiline maxLength={1500} /></Field>
              <Btn kind="primary" disabled={busy || text.trim().length < 20} onPress={send} block>{busy ? 'Sending…' : 'Send the notice'}</Btn>
            </>
          ) : null}
          {msg ? <Note tone="blue" icon="information-circle-outline">{msg}</Note> : null}
        </>
      )}
    </Sheet>
  );
}

/** Families' "off sick" reports, to read. */
export function IllnessReportsSheet({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: (msg?: string) => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const load = useCallback(() => { deskIllnessReports({ tab: 'new' }).then((r) => setRows(unwrap(r)?.rows || [])).catch(() => setRows([])); }, []);
  useEffect(() => { if (open) { setRows(null); load(); } }, [open, load]);
  return (
    <Sheet visible={open} icon="thermometer-outline" tone="amber" title="Off sick" subtitle="Families’ reports, not yet read" onClose={onClose}>
      {!rows ? <Spinner /> : !rows.length ? <Muted>Nothing new.</Muted> : rows.map((r: any) => (
        <Card key={r._id}>
          <View style={st.top}><Text style={st.title}>{r.studentName}</Text><Muted>{r.classLabel}</Muted></View>
          <Line strong>{(r.symptomLabels || []).join(', ')}</Line>
          <Line>{`From ${fmtDay(r.from)}${r.to ? ` to ${fmtDay(r.to)}` : ''} · ${r.reportedByName}${r.note ? ` · “${r.note}”` : ''}`}</Line>
          <View style={st.btnRow}><Btn onPress={async () => { try { await markIllnessSeen(r._id); load(); onChanged(); } catch { /* shown on reload */ } }}>Mark read</Btn></View>
        </Card>
      ))}
    </Sheet>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  noteText: { fontSize: 12, color: Colors.text, lineHeight: 17 },
  noteBtn: { marginTop: 8, alignSelf: 'flex-start' },
  bar: { height: 12, borderRadius: 6, backgroundColor: '#F1F5F9', marginTop: 6, marginBottom: 2, position: 'relative', overflow: 'visible' },
  barBand: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#BBF7D0', borderRadius: 6 },
  barTick: { position: 'absolute', top: -2, bottom: -2, width: 2, marginLeft: -1, backgroundColor: '#F59E0B' },
  barDot: { position: 'absolute', top: -3, width: 18, height: 18, marginLeft: -9, borderRadius: 9, borderWidth: 3, borderColor: '#fff' },
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C7C2E0', borderRadius: 10, backgroundColor: '#fff' },
  fileText: { flex: 1, fontSize: 13.5, color: Colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#fff' },
  chipOn: { backgroundColor: BRAND, borderColor: BRAND },
  chipText: { fontSize: 13, color: Colors.text, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 6, backgroundColor: '#fff' },
});
