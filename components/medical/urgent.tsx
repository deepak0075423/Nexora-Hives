/**
 * Urgent news to families, on the phone (Oct 2026).
 *
 *   • the desk's "Families to reach": who is being tried now and when the
 *     call list moves on (the parents are reminded in the app each time — the
 *     school sends no text messages), Call / WhatsApp for every contact, the
 *     call log, "Log a call" and "Close";
 *   • the parent's banner: "I have seen this", with when they will arrive.
 *
 * The web has the same screens (pages/medical/admin/UrgentPanel.jsx and the
 * family page's banner).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { logUrgentAttempt, closeUrgentNotice, answerUrgentNotice } from '@/api/medical.api';
import {
  Panel, Note, Btn, Sheet, Field, Box, Pill, Person, Card, Line, Chips,
  studentLine, fmtTime, since, telOf, call, TINT, type Tone,
} from '@/components/medical/parts';

const RESULT: Record<string, { label: string; tone: Tone }> = {
  answered: { label: 'Answered', tone: 'green' }, no_answer: { label: 'No answer', tone: 'amber' }, busy: { label: 'Busy', tone: 'amber' },
  left_message: { label: 'Left a message', tone: 'blue' }, wrong_number: { label: 'Wrong number', tone: 'red' },
  sent: { label: 'Sent', tone: 'blue' },
};
const CHANNEL: Record<string, string> = { app: 'App', whatsapp: 'WhatsApp', call: 'Call' };
const CALL_RESULTS = ['answered', 'no_answer', 'busy', 'left_message', 'wrong_number'];

/** The number WhatsApp wants: country code and digits, no plus (a 10-digit number is Indian). */
export const waOf = (p?: string) => {
  const t = telOf(p);
  let d = t.replace(/\D/g, '');
  if (!d) return '';
  if (t.startsWith('+')) return d;
  if (d.startsWith('00')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length === 10 ? `91${d}` : d;
};
const whatsapp = (phone: string, text: string) => {
  const n = waOf(phone);
  if (n) Linking.openURL(`https://wa.me/${n}?text=${encodeURIComponent(text)}`).catch(() => {});
};
const minutesTo = (d: any) => Math.max(0, Math.round((new Date(d).getTime() - Date.now()) / 60000));
const who = (c: any) => `${c?.name || 'Contact'}${c?.relation ? ` (${c.relation})` : ''}`;

/* ── The desk ─────────────────────────────────────────────────────────────── */

function NoticeCard({ n, onLog, onClose }: { n: any; onLog: (n: any) => void; onClose: (n: any) => void }) {
  const [all, setAll] = useState(false);
  const attempts = [...(n.attempts || [])].reverse();
  const shown = all ? attempts : attempts.slice(0, 3);
  const trying = n.contacts?.[n.step || 0];
  const tone: Tone = n.status === 'escalated' ? 'red' : n.status === 'acknowledged' ? 'green' : 'amber';
  return (
    <Card critical={n.status === 'escalated'}>
      <Person name={n.studentName} photo={n.studentPhoto} sub={studentLine(n)} />
      <View style={st.pills}>
        <Pill tone={tone}>{n.status === 'escalated' ? 'Nobody reached' : n.status === 'acknowledged' ? 'Answered' : `Waiting ${since(n.createdAt)}`}</Pill>
        <Pill tone="slate">{n.kindLabel}</Pill>
      </View>
      {n.body ? <Text style={st.title}>{n.body}</Text> : null}
      {n.status === 'acknowledged' ? (
        <View style={[st.answer, { backgroundColor: TINT.green.soft }]}>
          <Ionicons name="checkmark-circle" size={16} color={TINT.green.fg} />
          <Text style={[st.answerText, { color: TINT.green.fg }]}>
            {`${n.ackByName} answered at ${fmtTime(n.ackAt)}${n.ackEtaMinutes != null ? ` · arriving in about ${n.ackEtaMinutes} min` : ''}${n.ackNote ? ` — “${n.ackNote}”` : ''}`}
          </Text>
        </View>
      ) : n.status === 'open' && trying ? (
        <Line tone="amber">{`Trying ${who(trying)} — ${(n.step || 0) + 1 < (n.contacts || []).length ? `the next contact in ${minutesTo(n.nextEscalationAt)} min` : 'the last contact on the list'}`}</Line>
      ) : n.status === 'escalated' ? (
        <Line tone="red" strong>Every contact on record has been tried. Decide what happens next.</Line>
      ) : !(n.contacts || []).length ? (
        <Line tone="red" strong>There is no phone number on the student’s record.</Line>
      ) : null}
      {(n.contacts || []).map((c: any, i: number) => (
        <View key={c.key} style={[st.contact, n.status === 'open' && i === (n.step || 0) && st.contactNow]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.contactName}>{who(c)}</Text>
            <Text style={st.contactPhone}>{c.phone}</Text>
          </View>
          <View style={st.contactActs}>
            <Btn icon="call-outline" onPress={() => call(c.phone)}>Call</Btn>
            {waOf(c.phone) ? <Btn icon="logo-whatsapp" onPress={() => whatsapp(c.phone, `${n.title}. Please call the school.`)}>WhatsApp</Btn> : null}
          </View>
        </View>
      ))}
      <View style={st.log}>
        {shown.map((a: any, i: number) => (
          <View key={`${a.at}-${i}`} style={st.logRow}>
            <Text style={st.logWhen}>{fmtTime(a.at)}</Text>
            <Text style={st.logWhat}>{`${CHANNEL[a.channel] || a.channel} · ${a.to}${a.note ? ` — ${a.note}` : ''}`}</Text>
            <Pill tone={RESULT[a.result]?.tone || 'slate'}>{RESULT[a.result]?.label || a.result}</Pill>
          </View>
        ))}
        {attempts.length > 3 ? <Text style={st.more} onPress={() => setAll((v) => !v)} accessibilityRole="button">{all ? 'Show fewer' : `Show all ${attempts.length}`}</Text> : null}
      </View>
      <View style={st.btns}>
        <Btn kind="primary" icon="call-outline" onPress={() => onLog(n)} block>Log a call</Btn>
        <Btn icon="checkmark-done-outline" onPress={() => onClose(n)} block>Close</Btn>
      </View>
    </Card>
  );
}

function LogCallSheet({ notice, onClose, onDone }: { notice: any; onClose: () => void; onDone: (msg: string) => void }) {
  const [contact, setContact] = useState('');
  const [other, setOther] = useState('');
  const [result, setResult] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  useEffect(() => {
    if (!notice) return;
    setContact(notice.contacts?.[notice.step || 0]?.key || notice.contacts?.[0]?.key || 'other');
    setOther(''); setResult(''); setNote(''); setFail(''); setBusy(false);
  }, [notice]);
  const save = async () => {
    if (!result) { setFail('Say how the call went'); return; }
    if (contact === 'other' && !other.trim()) { setFail('Who did you call?'); return; }
    setBusy(true); setFail('');
    try {
      await logUrgentAttempt(notice._id, { contact: contact === 'other' ? undefined : contact, to: other, result, note, channel: 'call' });
      onDone(result === 'answered' ? 'Family reached — the call list has stopped' : 'Call logged');
    } catch (err: any) { setFail(err?.message || 'It could not be saved'); setBusy(false); }
  };
  return (
    <Sheet visible={!!notice} icon="call-outline" tone="indigo" title="Log a call" subtitle={notice?.studentName} onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Cancel</Btn><Btn kind="primary" onPress={save} disabled={busy} block>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <Field label="Who did you call?" required>
        <Chips options={[...(notice?.contacts || []).map((c: any) => ({ value: c.key, label: who(c) })), { value: 'other', label: 'Someone else' }]} value={contact} onChange={setContact} />
      </Field>
      {contact === 'other' ? <Field label="Name and relation" required><Box value={other} onChange={setOther} placeholder="e.g. Grandmother" maxLength={120} /></Field> : null}
      <Field label="How did it go?" required>
        <Chips options={CALL_RESULTS.map((k) => ({ value: k, label: RESULT[k].label }))} value={result} onChange={setResult} />
      </Field>
      <Field label="Note" hint={result === 'answered' ? 'What they said — e.g. “Father coming, 20 minutes”.' : undefined}>
        <Box value={note} onChange={setNote} multiline maxLength={300} />
      </Field>
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

function CloseSheet({ notice, onClose, onDone }: { notice: any; onClose: () => void; onDone: (msg: string) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  useEffect(() => { setNote(''); setFail(''); setBusy(false); }, [notice]);
  const save = async () => {
    if (!note.trim()) { setFail('Say what happened'); return; }
    setBusy(true); setFail('');
    try { await closeUrgentNotice(notice._id, { note }); onDone('Closed'); } catch (err: any) { setFail(err?.message || 'It could not be closed'); setBusy(false); }
  };
  return (
    <Sheet visible={!!notice} icon="checkmark-done-outline" tone="indigo" title="Close" subtitle={notice?.studentName} onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Cancel</Btn><Btn kind="primary" onPress={save} disabled={busy} block>{busy ? 'Closing…' : 'Close it'}</Btn></>}>
      <Note tone="blue" icon="information-circle-outline">Nobody will be chased any more about this. The call log stays on the record.</Note>
      <Field label="What happened" required><Box value={note} onChange={setNote} multiline maxLength={300} placeholder="e.g. Spoke to the father, he is collecting at 1 pm" /></Field>
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

/** The desk's panel; nothing when there is nobody to reach. */
export function FamiliesToReach({ data, onChanged }: { data: any; onChanged: (msg?: string) => void }) {
  const [logging, setLogging] = useState<any>(null);
  const [closing, setClosing] = useState<any>(null);
  const items = data?.items || [];
  const waiting = items.filter((n: any) => n.status !== 'acknowledged').length;
  return (
    <>
      {items.length ? (
        <Panel icon="call-outline" tone={items.some((n: any) => n.status === 'escalated') ? 'red' : 'orange'} title="Families to reach"
          subtitle={waiting ? `${waiting} waiting for an answer — the call list moves on by itself` : 'Everyone has answered'}>
          {items.map((n: any) => <NoticeCard key={n._id} n={n} onLog={setLogging} onClose={setClosing} />)}
        </Panel>
      ) : null}
      <LogCallSheet notice={logging} onClose={() => setLogging(null)} onDone={(m) => { setLogging(null); onChanged(m); }} />
      <CloseSheet notice={closing} onClose={() => setClosing(null)} onDone={(m) => { setClosing(null); onChanged(m); }} />
    </>
  );
}

/* ── The parent ───────────────────────────────────────────────────────────── */

const URGENT_ASK: Record<string, string> = {
  emergency: 'Your child is receiving urgent care in the Medical Room. Please call the school.',
  sent_home: 'Your child is unwell and is being sent home. Please collect them from the school, or tell the school who will.',
  referred: 'Your child has been referred to hospital. Please call the school at once.',
  incident: 'Your child had a serious incident at school. Please call the school.',
};
const ETA = [10, 20, 30, 45, 60, 90];

export function UrgentBanner({ u, room, onAnswer }: { u: any; room?: any; onAnswer: (u: any) => void }) {
  const answered = u.status === 'acknowledged';
  const t = TINT[answered ? 'green' : 'red'];
  return (
    <View style={[st.banner, { borderColor: t.fg, backgroundColor: t.soft }]} accessibilityRole={answered ? 'summary' : 'alert'}>
      <View style={st.bannerHead}>
        <Ionicons name={answered ? 'checkmark-circle' : 'warning'} size={22} color={t.fg} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[st.bannerTitle, { color: t.fg }]}>{u.title}</Text>
          <Text style={st.bannerBody}>
            {answered
              ? `You answered at ${fmtTime(u.ackAt)}${u.ackEtaMinutes != null ? ` — arriving in about ${u.ackEtaMinutes} min` : ''}${u.ackNote ? ` — “${u.ackNote}”` : ''}. The school has been told.`
              : `${URGENT_ASK[u.kind] || 'Please call the school.'} Sent ${fmtTime(u.createdAt)}.`}
          </Text>
        </View>
      </View>
      {!answered ? (
        <View style={st.btns}>
          <Btn kind="stop" icon="checkmark-circle-outline" onPress={() => onAnswer(u)} block>I have seen this</Btn>
          {room?.phone ? <Btn icon="call-outline" onPress={() => call(room.phone)} block>Call the school</Btn> : null}
        </View>
      ) : null}
    </View>
  );
}

export function AnswerSheet({ u, onClose, onDone }: { u: any; onClose: () => void; onDone: (msg: string) => void }) {
  const [eta, setEta] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  useEffect(() => { setEta(''); setNote(''); setFail(''); setBusy(false); }, [u]);
  const send = async () => {
    setBusy(true); setFail('');
    try { await answerUrgentNotice(u._id, { etaMinutes: eta === '' ? undefined : Number(eta), note }); onDone('The school has been told'); }
    catch (err: any) { setFail(err?.message || 'It could not be sent'); setBusy(false); }
  };
  return (
    <Sheet visible={!!u} icon="checkmark-circle-outline" tone="red" title="Tell the school you have seen this" onClose={onClose} busy={busy}
      footer={<><Btn onPress={onClose} block>Cancel</Btn><Btn kind="primary" onPress={send} disabled={busy} block>{busy ? 'Sending…' : 'Send'}</Btn></>}>
      <Field label="If you are coming, when will you be there?">
        <Chips clearable options={ETA.map((m) => ({ value: String(m), label: m < 60 ? `${m} min` : m === 60 ? '1 hour' : `${m / 60} hours` }))} value={eta} onChange={setEta} />
      </Field>
      <Field label="Anything the school should know"><Box value={note} onChange={setNote} multiline maxLength={300} placeholder="e.g. My brother Raj will collect her" /></Field>
      {fail ? <Note tone="red" icon="alert-circle-outline">{fail}</Note> : null}
    </Sheet>
  );
}

const st = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  answer: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 8, borderRadius: 10 },
  answerText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  contactNow: { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' },
  contactName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  contactPhone: { fontSize: 12, color: Colors.textSecondary },
  contactActs: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  log: { gap: 4 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logWhen: { fontSize: 11.5, color: Colors.textSecondary, width: 62 },
  logWhat: { flex: 1, minWidth: 0, fontSize: 12, color: Colors.text },
  more: { fontSize: 12.5, fontWeight: '700', color: '#2F6BF0', paddingVertical: 4 },
  btns: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  banner: { borderWidth: 1, borderLeftWidth: 4, borderRadius: 14, padding: 12, gap: 10, marginBottom: 12 },
  bannerHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bannerTitle: { fontSize: 14.5, fontWeight: '800' },
  bannerBody: { fontSize: 13, color: Colors.text, lineHeight: 19, marginTop: 2 },
});
