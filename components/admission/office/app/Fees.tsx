/**
 * An application's fees for the office (phone): each fee with its instalments,
 * recording money taken at the school, waivers, a payment link to send the
 * family (share it, or have it emailed), receipts, refunds — through the
 * gateway for an online payment, its answer shown as it comes — and cancelling
 * a counter receipt. Online payments are recorded by the gateway, never here.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Colors } from '@/constants/theme';
import { admin } from '@/api/admission.api';
import { openAdmissionFile } from '../../files';
import { AskSheet } from '../office';
import {
  Panel, Facts, Fact, Btn, Row, Note, Tag, Pill, Muted, Sheet, Field, Box, Pick, Line,
  FEE_STATUS, INSTALMENT_STATUS, REFUND_STATUS, PAY_MODES, REFUND_MODES, money, fmtDate, fmtDateTime, errMsg, say, unwrapList,
} from '../../parts';

const KIND_LABEL: Record<string, string> = { application_fee: 'Application fee', admission_fee: 'Admission fee' };
const AFTER_OFFER = ['offer_issued', 'accepted', 'payment_pending', 'confirmed', 'enrolled'];
const todayIso = () => { const x = new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

export default function Fees({ d, closed, reload }: { d: any; closed: boolean; reload: () => void }) {
  const app = d.application;
  const [pay, setPay] = useState('');
  const [waive, setWaive] = useState('');
  const [link, setLink] = useState('');
  const [refunding, setRefunding] = useState<any>(null);
  const [voiding, setVoiding] = useState<any>(null);
  const [unwaive, setUnwaive] = useState<any>(null);
  const refunds = unwrapList(d.fees?.refunds);
  const refundedOn = (p: any) => refunds.filter((r) => r.payment === p._id && r.status !== 'failed').reduce((s, r) => s + Number(r.amount), 0);
  const payments = unwrapList(d.fees?.payments);
  const waiversOn = unwrapList(d.fees?.waivers);
  const card = (kind: string, b: any) => (
    <Panel key={kind} icon="wallet-outline" tone="green" title={KIND_LABEL[kind]} right={<Tag map={FEE_STATUS} value={b.status} />}>
      <Facts>
        <Fact k="Fee" v={money(b.fee)} />
        <Fact k="Waived" v={money(b.waived)} />
        <Fact k="Paid" v={money(b.paid)} />
        {b.refunded > 0 ? <Fact k="Refunded" v={money(b.refunded)} /> : null}
        <Fact k="Due" v={<Text style={{ fontWeight: '800', color: Colors.text }}>{money(b.due)}</Text>} />
      </Facts>
      {b.excess > 0 ? <Note tone="amber" icon="alert-circle-outline">{`${money(b.excess)} more than the fee was received — refund it from the payments below.`}</Note> : null}
      {unwrapList(b.schedule).length ? (
        <View style={{ gap: 6, marginTop: 8 }}>
          <Muted>{`In ${b.schedule.length} instalments`}</Muted>
          {b.schedule.map((x: any) => (
            <View key={x.index} style={st.inst}>
              <View style={{ flex: 1 }}><Text style={st.instName}>{x.label}</Text><Muted>{`${money(x.amount)} · by ${fmtDate(x.dueAt)}`}</Muted></View>
              {x.status === 'part' ? <Pill tone="amber">{`${money(x.owing)} owing`}</Pill> : <Tag map={INSTALMENT_STATUS} value={x.status} />}
            </View>
          ))}
        </View>
      ) : null}
      {b.due > 0 && !closed && app.status !== 'draft' ? (
        <Row>
          {app.status !== 'enrolled' || kind === 'admission_fee' ? <Btn kind="primary" icon="cash-outline" onPress={() => setPay(kind)}>Record payment</Btn> : null}
          {unwrapList(d.waivers).length && app.status !== 'enrolled' ? <Btn icon="pricetag-outline" onPress={() => setWaive(kind)}>Waiver</Btn> : null}
          {kind === 'application_fee' || AFTER_OFFER.includes(app.status) ? <Btn icon="link-outline" onPress={() => setLink(kind)}>Payment link</Btn> : null}
        </Row>
      ) : null}
    </Panel>
  );
  return (
    <>
      {/* A fee the school does not charge for this application gets no card of zeros. */}
      {[['application_fee', d.fees.application], ['admission_fee', d.fees.admission]].filter(([, b]: any) => Number(b?.fee) > 0 || Number(b?.paid) > 0).map(([k, b]: any) => card(k, b))}
      {d.fees.openOrder ? <Note tone="indigo">{`An online payment was started on ${fmtDateTime(d.fees.openOrder.createdAt)} and has not come back from the gateway. It is never marked paid without the gateway's confirmation.`}</Note> : null}
      {waiversOn.length ? (
        <Panel icon="pricetag-outline" tone="teal" title="Waivers">
          {waiversOn.map((w, i) => (
            <Line key={`${w.key}-${i}`} last={i === waiversOn.length - 1} title={`${w.name} — ${money(w.amount)}`} sub={`${KIND_LABEL[w.kind]} · ${w.reason}\n${w.byName || ''} · ${fmtDate(w.at)}`}
              right={app.status !== 'enrolled' ? <Btn kind="danger" onPress={() => setUnwaive(w)}>Remove</Btn> : undefined} />
          ))}
        </Panel>
      ) : null}
      <Panel icon="receipt-outline" tone="green" title="Payments">
        {payments.length ? payments.map((p, i) => {
          const back = refundedOn(p);
          const left = Math.round((Number(p.amount) - back) * 100) / 100;
          return (
            <View key={p._id} style={[st.pay, i === payments.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={st.payTop}>
                <Text style={st.payName}>{`${p.receiptNumber || '—'} · ${money(p.amount)}`}</Text>
                <Pill tone={p.status === 'paid' ? 'green' : p.status === 'void' ? 'slate' : 'amber'}>{p.status === 'void' ? 'Cancelled' : p.status}</Pill>
              </View>
              <Muted>{`${KIND_LABEL[p.kind]} · ${PAY_MODES.find((m) => m.value === p.mode)?.label || (p.mode === 'online' ? 'Online' : p.mode)}${p.reference ? ` · ${p.reference}` : ''} · ${fmtDate(p.paidAt || p.createdAt)}${back > 0 ? ` · ${money(back)} refunded` : ''}`}</Muted>
              <Row>
                {['paid', 'void'].includes(p.status) ? <Btn icon="document-outline" onPress={() => openAdmissionFile(admin.receiptUrl(app._id, p._id), `receipt-${p.receiptNumber || p._id}.pdf`).catch((e) => say('Could not open it', errMsg(e)))}>Receipt</Btn> : null}
                {p.status === 'paid' && left > 0.001 ? <Btn icon="return-down-back-outline" onPress={() => setRefunding({ ...p, left })}>Refund</Btn> : null}
                {p.status === 'paid' && p.mode !== 'online' && app.status !== 'enrolled' && !back ? <Btn kind="danger" onPress={() => setVoiding(p)}>Cancel receipt</Btn> : null}
              </Row>
            </View>
          );
        }) : <Muted>No payments yet.</Muted>}
      </Panel>
      {refunds.length ? (
        <Panel icon="return-down-back-outline" tone="slate" title="Refunds">
          {refunds.map((r, i) => (
            <Line key={r._id} last={i === refunds.length - 1} title={`${money(r.amount)} on ${r.receiptNumber || '—'}`}
              sub={`${r.mode === 'gateway' ? 'Through the gateway' : (REFUND_MODES.find((m) => m.value === r.mode)?.label || r.mode)}${r.reference ? ` · ${r.reference}` : ''} · ${r.reason}\n${fmtDateTime(r.createdAt)}${r.error ? `\n${r.error}` : ''}`}
              right={<Tag map={REFUND_STATUS} value={r.status} />} />
          ))}
        </Panel>
      ) : null}

      {pay ? <RecordPayment app={app} kind={pay} due={d.fees[pay === 'application_fee' ? 'application' : 'admission'].due} onClose={() => setPay('')} onDone={reload} /> : null}
      {waive ? <ApplyWaiver app={app} kind={waive} waivers={unwrapList(d.waivers)} onClose={() => setWaive('')} onDone={reload} /> : null}
      {link ? <PayLink app={app} kind={link} due={d.fees[link === 'application_fee' ? 'application' : 'admission'].due} onClose={() => setLink('')} onDone={reload} /> : null}
      {refunding ? <Refund payment={refunding} app={app} onClose={() => setRefunding(null)} onDone={reload} /> : null}
      {voiding ? (
        <AskSheet title={`Cancel receipt ${voiding.receiptNumber || ''}?`} message="The receipt stays on record, marked cancelled, and the amount is due again." confirm="Cancel receipt" danger
          onClose={() => setVoiding(null)} onConfirm={async (why) => { await admin.voidPayment(app._id, voiding._id, why); reload(); }} />
      ) : null}
      {unwaive ? (
        <AskSheet title={`Remove ${unwaive.name}?`} confirm="Remove waiver" danger onClose={() => setUnwaive(null)}
          onConfirm={async (why) => { await admin.removeWaiver(app._id, { kind: unwaive.kind, waiverKey: unwaive.key, reason: why }); reload(); }} />
      ) : null}
    </>
  );
}

function RecordPayment({ app, kind, due, onClose, onDone }: { app: any; kind: string; due: number; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ amount: String(due || ''), mode: 'cash', reference: '', paidAt: todayIso(), notes: '' });
  const [busy, setBusy] = useState(false);
  const needRef = f.mode !== 'cash';
  const go = async () => {
    setBusy(true);
    try {
      await admin.recordPayment(app._id, { kind, amount: Number(f.amount), mode: f.mode, reference: f.reference.trim(), paidAt: /^\d{4}-\d{2}-\d{2}$/.test(f.paidAt) ? new Date(`${f.paidAt}T12:00:00`).toISOString() : undefined, notes: f.notes.trim() });
      say('Payment recorded', 'A receipt has been issued.'); onClose(); onDone();
    } catch (e) { say('Not recorded', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible icon="cash-outline" tone="green" title={`Record ${KIND_LABEL[kind].toLowerCase()}`} subtitle={`For money taken at the school. ${money(due)} is due.`} onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="primary" disabled={busy || !Number(f.amount) || (needRef && !f.reference.trim())} onPress={go}>Record payment</Btn></>}>
      <Field label="Amount (₹)" required><Box value={f.amount} onChange={(v) => setF({ ...f, amount: v })} text="decimal" keyboardType="decimal-pad" /></Field>
      <Field label="Paid by" required><Pick label="Paid by" value={f.mode} onChange={(v) => setF({ ...f, mode: v })} options={PAY_MODES} /></Field>
      <Field label="Reference" required={needRef} hint={needRef ? 'Cheque, DD or transaction number' : ''}><Box value={f.reference} onChange={(v) => setF({ ...f, reference: v })} maxLength={80} text="code" /></Field>
      <Field label="Date paid" hint="YYYY-MM-DD"><Box value={f.paidAt} onChange={(v) => setF({ ...f, paidAt: v })} text="date" /></Field>
      <Field label="Notes"><Box value={f.notes} onChange={(v) => setF({ ...f, notes: v })} multiline maxLength={300} /></Field>
    </Sheet>
  );
}

function ApplyWaiver({ app, kind, waivers, onClose, onDone }: { app: any; kind: string; waivers: any[]; onClose: () => void; onDone: () => void }) {
  const [key, setKey] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const list = waivers.filter((w) => w.appliesTo === 'both' || `${w.appliesTo}_fee` === kind);
  const go = async () => {
    setBusy(true);
    try { await admin.addWaiver(app._id, { kind, waiverKey: key, reason: reason.trim() }); onClose(); onDone(); } catch (e) { say('Not applied', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible icon="pricetag-outline" tone="teal" title={`Waiver on the ${KIND_LABEL[kind].toLowerCase()}`} onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="primary" disabled={busy || !key || !reason.trim()} onPress={go}>Apply waiver</Btn></>}>
      {list.length ? (
        <>
          <Field label="Waiver" required>
            <Pick label="Waiver" value={key} placeholder="Choose a waiver" onChange={setKey}
              options={list.map((w) => ({ value: w.key, label: `${w.name} — ${w.type === 'percent' ? `${w.value}%` : money(w.value)}`, sub: w.requiresApproval ? 'Administrators only' : undefined }))} />
          </Field>
          <Field label="Reason" required><Box value={reason} onChange={setReason} multiline maxLength={300} /></Field>
        </>
      ) : <Muted>No waiver applies to this fee. Waivers are set up on the web, under Settings → Fees.</Muted>}
    </Sheet>
  );
}

function PayLink({ app, kind, due, onClose, onDone }: { app: any; kind: string; due: number; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState('');
  const [made, setMade] = useState<any>(null);
  const make = async (send: boolean) => {
    setBusy(send ? 'send' : 'make');
    try { const r: any = await admin.payLink(app._id, { kind, send }); setMade({ ...(r?.data || {}), sent: send }); onDone(); }
    catch (e) { say('No link made', errMsg(e)); } finally { setBusy(''); }
  };
  return (
    <Sheet visible icon="link-outline" tone="indigo" title={`Payment link — ${KIND_LABEL[kind].toLowerCase()}`} onClose={onClose} busy={!!busy}
      footer={made ? <Btn block onPress={onClose}>Done</Btn> : <><Btn block disabled={!!busy} onPress={() => make(false)}>Make the link</Btn><Btn block kind="primary" disabled={!!busy} onPress={() => make(true)}>Make and email it</Btn></>}>
      {made ? (
        <>
          <Note tone="green" icon="checkmark-circle-outline">{`${made.sent ? 'Emailed to the family. ' : ''}It works until ${fmtDateTime(made.expiresAt)}.`}</Note>
          <Text selectable style={st.url}>{made.url}</Text>
          <Row>
            <Btn icon="share-outline" onPress={() => Share.share({ message: `Pay the ${KIND_LABEL[kind].toLowerCase()} for ${app.applicationNumber || app.studentName}: ${made.url}` }).catch(() => {})}>Share</Btn>
            <Btn icon="copy-outline" onPress={async () => { await Clipboard.setStringAsync(made.url); say('Link copied'); }}>Copy</Btn>
          </Row>
        </>
      ) : (
        <Note tone="indigo">{`Anyone with the link can pay ${money(due)} towards this ${KIND_LABEL[kind].toLowerCase()} for the next seven days — a relative, or a family that cannot sign in. It shows only the application number, the child's first name and the amount, and it can only pay. Online payment must be switched on for admissions.`}</Note>
      )}
    </Sheet>
  );
}

function Refund({ payment, app, onClose, onDone }: { payment: any; app: any; onClose: () => void; onDone: () => void }) {
  const online = payment.mode === 'online';
  const [f, setF] = useState({ amount: String(payment.left), mode: online ? 'gateway' : 'cash', reference: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const needRef = !online && f.mode !== 'cash';
  const go = async () => {
    setBusy(true);
    try {
      const r: any = await admin.refund(app._id, payment._id, { amount: Number(f.amount), mode: online ? undefined : f.mode, reference: f.reference.trim(), reason: f.reason.trim() });
      say(r?.data?.status === 'pending' ? 'Sent to the gateway' : 'Refund recorded', r?.data?.status === 'pending' ? 'It shows as refunded once the gateway completes it.' : '');
      onClose(); onDone();
    } catch (e: any) { say('Refund not made', errMsg(e)); if (e?.data?.code === 'REFUND_FAILED') { onClose(); onDone(); } } finally { setBusy(false); }
  };
  const amount = Number(f.amount);
  return (
    <Sheet visible icon="return-down-back-outline" tone="red" title={`Refund on receipt ${payment.receiptNumber || ''}`} onClose={onClose} busy={busy}
      footer={<><Btn block onPress={onClose}>Cancel</Btn><Btn block kind="stop" disabled={busy || !(amount > 0) || amount > payment.left || !f.reason.trim() || (needRef && !f.reference.trim())} onPress={go}>{online ? 'Refund through the gateway' : 'Record the refund'}</Btn></>}>
      <Note tone={online ? 'indigo' : 'slate'}>{`${online ? 'The gateway sends the money back to the card, account or UPI it came from. Its answer is recorded as it comes.' : 'For money given back at the school. The family is told, and the amount counts as due again.'} At most ${money(payment.left)} of this payment can be refunded.`}</Note>
      <Field label="Amount (₹)" required><Box value={f.amount} onChange={(v) => setF({ ...f, amount: v })} text="decimal" keyboardType="decimal-pad" /></Field>
      {online ? null : <Field label="Given back by" required><Pick label="Given back by" value={f.mode} onChange={(v) => setF({ ...f, mode: v })} options={REFUND_MODES} /></Field>}
      {needRef ? <Field label="Reference" required hint="Cheque or transaction number"><Box value={f.reference} onChange={(v) => setF({ ...f, reference: v })} maxLength={80} text="code" /></Field> : null}
      <Field label="Reason" required hint="The family sees it in the email about the refund"><Box value={f.reason} onChange={(v) => setF({ ...f, reason: v })} multiline maxLength={300} /></Field>
    </Sheet>
  );
}

const st = StyleSheet.create({
  inst: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 9, backgroundColor: '#F8FAFC' },
  instName: { fontSize: 12.5, fontWeight: '600', color: Colors.text },
  pay: { gap: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  payTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  payName: { flex: 1, fontSize: 13.5, fontWeight: '700', color: Colors.text },
  url: { fontSize: 12, color: Colors.text, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#fff', marginBottom: 10 },
});
