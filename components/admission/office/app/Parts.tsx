/**
 * Parts of an application's office page (phone): the family's answers (a
 * masked Aadhaar number shown only on request — the server records each
 * reveal), documents (review, open, add one handed in at the office), exams
 * and lists, the offer (make, record an answer, extend, withdraw), and the
 * history with staff notes.
 *
 * Correcting the family's answers stays on the web — it needs the full form.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { admin } from '@/api/admission.api';
import { openAdmissionFile, pickFile, partOf } from '../../files';
import { ReviewSheet, AskSheet } from '../office';
import {
  Panel, Facts, Fact, Btn, Row, Note, Tag, Pill, Muted, Sheet, Field, Box, Pick, Line, Tabs, Blank,
  DOC_STATUS, OFFER_STATUS, DECISION, RESULTS_STATUS, EXAM_MODE, fmtDate, fmtDateTime, money, size, errMsg, say, unwrapList,
} from '../../parts';

// ── Answers ───────────────────────────────────────────────────────────────────

export function Answers({ d }: { d: any }) {
  const app = d.application;
  const [shown, setShown] = useState<Record<string, string>>({});
  const reveal = async (key: string) => {
    try { const r: any = await admin.reveal(app._id, key); setShown((x) => ({ ...x, [key]: r?.data?.value })); } catch (e) { say('Not shown', errMsg(e)); }
  };
  const sections = unwrapList(d.answers);
  if (!sections.length) return <Blank icon="document-outline" title="No answers yet" body="The family has not filled in the form yet." />;
  return (
    <>
      {app.retiredData && Object.keys(app.retiredData).length ? <Note tone="slate" icon="time-outline">{`Answers to questions the school has since removed are kept with the application (${Object.keys(app.retiredData).length}).`}</Note> : null}
      {sections.map((sec) => (
        <Panel key={sec.section} icon="list-outline" tone="slate" title={sec.title}>
          <Facts>
            {unwrapList(sec.fields).map((f) => (
              <Fact key={f.key} k={f.label} v={f.hidden ? 'Hidden' : (
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={st.value}>{f.masked && shown[f.key] ? shown[f.key] : (String(f.value ?? '') || '—')}</Text>
                  {f.sensitive ? <Pill tone="amber">Sensitive</Pill> : null}
                  {f.masked && !shown[f.key] && d.permissions?.canReveal ? <Btn icon="eye-outline" onPress={() => reveal(f.key)}>Show (recorded)</Btn> : null}
                </View>
              )} />
            ))}
          </Facts>
        </Panel>
      ))}
      <Muted>Correcting an answer is done on the web — it needs the whole form, and the change is recorded with a reason.</Muted>
    </>
  );
}

// ── Documents ─────────────────────────────────────────────────────────────────

export function Documents({ d, reload }: { d: any; reload: () => void }) {
  const app = d.application;
  const files = unwrapList(d.documents?.files);
  const reqs = unwrapList(d.documents?.requirements);
  const byKey = new Map(files.map((f) => [f.docKey, f]));
  const extra = files.filter((f) => !reqs.some((r) => r.key === f.docKey));
  const [review, setReview] = useState<any>(null);
  const [upKey, setUpKey] = useState('');
  const [busy, setBusy] = useState(false);
  const open = (doc: any) => openAdmissionFile(admin.docUrl(doc._id), doc.originalName || `${doc.docKey}.pdf`).catch((e) => say('Could not open it', errMsg(e)));
  const upload = async (from: 'files' | 'camera') => {
    try {
      const p = await pickFile(from);
      if (!p) return;
      setBusy(true);
      const fd = new FormData();
      fd.append('docType', upKey);
      fd.append('file', partOf(p));
      await admin.uploadDoc(app._id, fd);
      setUpKey(''); say('Document added'); reload();
    } catch (e) { say('Not added', errMsg(e)); } finally { setBusy(false); }
  };
  const row = (r: any, doc: any, i: number, last: boolean) => (
    <View key={r.key} style={[st.doc, last && { borderBottomWidth: 0 }]}>
      <View style={st.docTop}>
        <Text style={st.docName}>{r.name}{r.required ? ' *' : ''}</Text>
        {doc ? <Tag map={DOC_STATUS} value={doc.status} /> : r.required ? <Pill tone="amber">Missing</Pill> : <Pill tone="slate">Optional</Pill>}
      </View>
      <Muted>{doc ? `${doc.originalName || 'File'} · ${size(doc.size || 0)} · version ${doc.version} · ${fmtDateTime(doc.createdAt)}${doc.rejectionReason ? ` — ${doc.rejectionReason}` : ''}` : 'Not uploaded'}</Muted>
      <Row>
        {r.sensitive ? <Pill tone="amber">Sensitive</Pill> : null}
        {doc?.origin === 'digilocker' ? <Pill tone="teal" icon="shield-checkmark-outline">{`DigiLocker${doc.originMeta?.issuer ? ` · ${doc.originMeta.issuer}` : ''}`}</Pill> : null}
        {doc?.origin === 'digilocker' && doc.originMeta?.account && !doc.originMeta.account.dobMatchesStudent ? <Pill tone="slate">Locker DOB differs</Pill> : null}
        {doc?.scanStatus === 'unavailable' ? <Pill tone="amber">Not virus-scanned</Pill> : doc?.scanStatus === 'clean' ? <Pill tone="green">Scanned</Pill> : null}
      </Row>
      {doc ? (
        <Row>
          <Btn icon="eye-outline" onPress={() => open(doc)}>Open</Btn>
          {doc.status !== 'verified' ? <Btn kind="primary" onPress={() => setReview({ doc: { ...doc, name: r.name }, decision: 'verify', reasons: r.rejectionReasons || [] })}>Verify</Btn> : null}
          <Btn onPress={() => setReview({ doc: { ...doc, name: r.name }, decision: 'resubmit', reasons: r.rejectionReasons || [] })}>{doc.status === 'verified' ? 'Re-check' : 'Problem'}</Btn>
        </Row>
      ) : null}
    </View>
  );
  const all = [...reqs.map((r) => [r, byKey.get(r.key)]), ...extra.map((doc) => [{ key: doc.docKey, name: String(doc.docKey).replace(/_/g, ' '), required: false, rejectionReasons: [] }, doc])];
  return (
    <>
      <Panel icon="document-text-outline" tone="teal" title="Documents" subtitle={`${d.documents?.summary?.uploaded ?? 0} uploaded · ${d.documents?.summary?.verified ?? 0} verified`}>
        {all.length ? all.map(([r, doc], i) => row(r, doc, i, i === all.length - 1)) : <Muted>No documents are asked for.</Muted>}
      </Panel>
      {app.status !== 'draft' && app.status !== 'enrolled' && reqs.length ? (
        <Panel icon="cloud-upload-outline" tone="slate" title="Add a document handed in at the office">
          <Pick label="Which document" value={upKey} placeholder="Choose the document…" onChange={setUpKey} options={reqs.map((r) => ({ value: r.key, label: r.name }))} />
          {upKey ? <Row><Btn kind="primary" icon="document-attach-outline" disabled={busy} onPress={() => upload('files')}>{busy ? 'Adding…' : 'Choose a file'}</Btn><Btn icon="camera-outline" disabled={busy} onPress={() => upload('camera')}>Take a photo</Btn></Row> : null}
        </Panel>
      ) : null}
      {unwrapList(d.documents?.history).length ? (
        <Panel icon="time-outline" tone="slate" title="Earlier copies">
          {unwrapList(d.documents.history).map((h, i, list) => (
            <Line key={h._id} last={i === list.length - 1} onPress={() => open(h)} title={`${String(h.docKey).replace(/_/g, ' ')} · version ${h.version}`}
              sub={`${fmtDate(h.createdAt)}${h.rejectionReason ? ` — ${h.rejectionReason}` : ''}`} right={<Tag map={DOC_STATUS} value={h.status} />} />
          ))}
        </Panel>
      ) : null}
      {review ? <ReviewSheet doc={review.doc} initial={review.decision} reasons={review.reasons} fileUrl={admin.docUrl(review.doc._id)} onClose={() => setReview(null)} onDone={reload} /> : null}
    </>
  );
}

// ── Exams and lists ───────────────────────────────────────────────────────────

export function Assessment({ d }: { d: any }) {
  const router = useRouter();
  const exams = unwrapList(d.exams);
  const lists = unwrapList(d.lists);
  return (
    <>
      <Panel icon="school-outline" tone="violet" title="Exams and interviews">
        {exams.length ? exams.map((r, i) => (
          <Line key={r.examId} last={i === exams.length - 1} onPress={() => router.push({ pathname: '/modules/admin/admission-exam' as any, params: { id: r.examId } })}
            title={r.name} sub={`${EXAM_MODE[r.mode] || r.mode} · ${fmtDateTime(r.slot || r.startsAt)}${r.rollNumber ? ` · roll ${r.rollNumber}` : ''}\n${r.absent ? 'Absent' : r.total != null ? `${r.total}${r.percentage != null ? ` (${r.percentage}%)` : ''}${r.grade ? ` · ${r.grade}` : ''}${r.passed == null ? '' : r.passed ? ' · qualified' : ' · not qualified'}` : `Attendance: ${r.status}`}`}
            right={<Tag map={RESULTS_STATUS} value={r.resultStatus === 'published' ? 'published' : r.resultsStatus} />} />
        )) : <Muted>Not scheduled for any exam.</Muted>}
      </Panel>
      <Panel icon="trophy-outline" tone="amber" title="Selection lists">
        {lists.length ? lists.map((r, i) => (
          <Line key={`${r._id || r.name}-${i}`} last={i === lists.length - 1} title={r.name}
            sub={`Rank ${r.rank ?? '—'}${r.score != null ? ` · score ${r.score}` : ''}${r.waitPosition ? ` · waiting #${r.waitPosition}` : ''}${r.manual ? ` · by hand${r.reason ? ` (${r.reason})` : ''}` : ''} · list ${String(r.status).replace(/_/g, ' ')}`}
            right={<Tag map={DECISION} value={r.decision} />} />
        )) : <Muted>Not on any list.</Muted>}
      </Panel>
    </>
  );
}

// ── Offer ─────────────────────────────────────────────────────────────────────

const CAN_OFFER = ['verified', 'eligible', 'exam_completed', 'interview_completed', 'evaluated', 'selected', 'waitlisted', 'offer_expired'];

export function Offer({ d, reload }: { d: any; reload: () => void }) {
  const app = d.application;
  const offers = unwrapList(d.offers);
  const live = offers.find((o) => ['issued', 'accepted'].includes(o.status));
  const [dlg, setDlg] = useState<'' | 'offer' | 'extend' | 'withdraw' | 'accept' | 'decline'>('');
  const canOffer = !live && CAN_OFFER.includes(app.status);
  return (
    <>
      <Panel icon="mail-outline" tone="teal" title="Offer" right={canOffer ? <Btn kind="primary" icon="send-outline" onPress={() => setDlg('offer')}>Make an offer</Btn> : undefined}>
        {live ? (
          <>
            <Facts>
              <Fact k="Offer" v={live.offerNumber} />
              <Fact k="Status" v={<Tag map={OFFER_STATUS} value={live.status} />} />
              <Fact k="Issued" v={fmtDateTime(live.issuedAt)} />
              <Fact k="Respond by" v={fmtDateTime(live.respondBy)} />
              <Fact k="Admission fee" v={money(live.feeAmount)} />
              <Fact k="Fee due" v={fmtDate(live.feeDueAt)} />
            </Facts>
            <Row>
              {live.status === 'issued' ? <><Btn kind="primary" onPress={() => setDlg('accept')}>Record acceptance</Btn><Btn onPress={() => setDlg('decline')}>Record decline</Btn></> : null}
              <Btn icon="calendar-outline" onPress={() => setDlg('extend')}>Extend</Btn>
              <Btn kind="danger" icon="close-circle-outline" onPress={() => setDlg('withdraw')}>Withdraw offer</Btn>
            </Row>
          </>
        ) : <Muted>{canOffer ? 'No offer yet. Offers are usually made by publishing a merit list; you can also make one here.' : 'No open offer.'}</Muted>}
      </Panel>
      {offers.length ? (
        <Panel icon="time-outline" tone="slate" title="All offers">
          {offers.map((o, i) => (
            <Line key={o._id} last={i === offers.length - 1} title={o.offerNumber} right={<Tag map={OFFER_STATUS} value={o.status} />}
              sub={`Issued ${fmtDate(o.issuedAt)}${o.respondedAt ? ` · answered ${fmtDate(o.respondedAt)}${o.responseNote ? ` — ${o.responseNote}` : ''}` : ''}${o.reason ? `\n${o.reason}` : ''}`} />
          ))}
        </Panel>
      ) : null}
      {dlg === 'offer' ? <MakeOffer app={app} onClose={() => setDlg('')} onDone={reload} /> : null}
      {dlg === 'extend' ? <ExtendOffer app={app} offer={live} onClose={() => setDlg('')} onDone={reload} /> : null}
      {dlg === 'withdraw' ? (
        <AskSheet title="Withdraw this offer?" message="The seat goes back to the class and may be offered to the waiting list." label="Reason (the family is told)" confirm="Withdraw offer" danger
          onClose={() => setDlg('')} onConfirm={async (why) => { await admin.withdrawOffer(app._id, why); reload(); }} />
      ) : null}
      {dlg === 'accept' || dlg === 'decline' ? (
        <AskSheet title={dlg === 'accept' ? 'Record that the family accepted' : 'Record that the family declined'} label="How they answered (a call, a letter)"
          confirm={dlg === 'accept' ? 'Record acceptance' : 'Record decline'} danger={dlg === 'decline'}
          onClose={() => setDlg('')} onConfirm={async (note) => { await admin.respondOffer(app._id, dlg === 'accept', note); reload(); }} />
      ) : null}
    </>
  );
}

/** A local date + time (the phone's own zone) as an ISO instant, or undefined. */
const at = (date: string, time = '23:59') => (/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T${/^\d{2}:\d{2}$/.test(time) ? time : '23:59'}:00`).toISOString() : undefined);

function MakeOffer({ app, onClose, onDone }: { app: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ respondDate: '', respondTime: '', feeAmount: '', feeDueAt: '', note: '' });
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await admin.offer(app._id, { respondBy: at(f.respondDate, f.respondTime), feeAmount: f.feeAmount === '' ? undefined : Number(f.feeAmount), feeDueAt: at(f.feeDueAt), note: f.note.trim() });
      say('Offer made', 'The family has been told.'); onClose(); onDone();
    } catch (e) { say('Not made', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible icon="send-outline" tone="teal" title="Make an offer" subtitle="A seat is held once the offer is made. Leave a box empty to use the round's terms." onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="primary" disabled={busy} onPress={go}>Make offer</Btn></>}>
      <Field label="Respond by (date)" hint="YYYY-MM-DD"><Box value={f.respondDate} onChange={(v) => setF({ ...f, respondDate: v })} text="date" placeholder="2026-11-05" /></Field>
      <Field label="Respond by (time)" hint="HH:MM, 24-hour"><Box value={f.respondTime} onChange={(v) => setF({ ...f, respondTime: v })} text="time" placeholder="17:00" /></Field>
      <Field label="Admission fee (₹)"><Box value={f.feeAmount} onChange={(v) => setF({ ...f, feeAmount: v })} text="decimal" keyboardType="decimal-pad" /></Field>
      <Field label="Fee due by" hint="YYYY-MM-DD"><Box value={f.feeDueAt} onChange={(v) => setF({ ...f, feeDueAt: v })} text="date" placeholder="2026-11-15" /></Field>
      <Field label="Internal note"><Box value={f.note} onChange={(v) => setF({ ...f, note: v })} multiline maxLength={300} /></Field>
    </Sheet>
  );
}

function ExtendOffer({ app, offer, onClose, onDone }: { app: any; offer: any; onClose: () => void; onDone: () => void }) {
  const cur = offer?.respondBy ? new Date(offer.respondBy) : null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const [date, setDate] = useState(cur ? `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}` : '');
  const [time, setTime] = useState(cur ? `${pad(cur.getHours())}:${pad(cur.getMinutes())}` : '17:00');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const iso = at(date, time);
    if (!iso) return;
    setBusy(true);
    try { await admin.extendOffer(app._id, iso); onClose(); onDone(); } catch (e) { say('Not extended', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible icon="calendar-outline" tone="teal" title="Extend the offer" onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="primary" disabled={busy || !at(date, time)} onPress={go}>Extend</Btn></>}>
      <Field label="New date to respond by" hint="YYYY-MM-DD"><Box value={date} onChange={setDate} text="date" /></Field>
      <Field label="Time" hint="HH:MM, 24-hour"><Box value={time} onChange={setTime} text="time" /></Field>
    </Sheet>
  );
}

// ── History ───────────────────────────────────────────────────────────────────

export function History({ d, reload }: { d: any; reload: () => void }) {
  const app = d.application;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [only, setOnly] = useState('all');
  const add = async () => {
    setBusy(true);
    try { await admin.note(app._id, text.trim()); setText(''); reload(); } catch (e) { say('Not added', errMsg(e)); } finally { setBusy(false); }
  };
  const items = unwrapList(d.timeline).filter((t) => only === 'all' || (only === 'notes' ? t.type === 'note' : t.visibility === 'applicant'));
  return (
    <Panel icon="time-outline" tone="slate" title="History">
      <Field label="Add an internal note" hint="Staff only">
        <Box value={text} onChange={setText} multiline maxLength={2000} />
      </Field>
      <Btn kind="primary" disabled={busy || !text.trim()} onPress={add}>Add note</Btn>
      <View style={{ height: 12 }} />
      <Tabs value={only} onChange={setOnly} items={[{ key: 'all', label: 'Everything' }, { key: 'applicant', label: 'What the family sees' }, { key: 'notes', label: 'Notes' }]} />
      <View style={{ height: 8 }} />
      {items.map((t, i) => (
        <Line key={t._id || i} last={i === items.length - 1} title={t.message} sub={`${fmtDateTime(t.createdAt)}${t.byName ? ` · ${t.byName}` : ''}${t.visibility === 'applicant' ? ' · family sees it' : ''}`} />
      ))}
      {!items.length ? <Muted>Nothing here.</Muted> : null}
    </Panel>
  );
}

const st = StyleSheet.create({
  value: { fontSize: 12.5, fontWeight: '600', color: Colors.text, textAlign: 'right' },
  doc: { gap: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  docTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  docName: { flex: 1, fontSize: 13.5, fontWeight: '700', color: Colors.text },
});
