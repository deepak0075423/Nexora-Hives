/**
 * Fees on a family's application (phone): each fee, its instalments, paying
 * online, refunds and receipts.
 *
 * The phone has no card checkout of its own: "Pay" asks the server for a
 * one-hour link to this fee's pay page on the school's portal and opens it in
 * the in-app browser — the gateway's own checkout, the same page a link from
 * the office opens. When the family comes back, the application is read again;
 * the server records a payment only once the gateway has confirmed it.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { portal } from '@/api/admission.api';
import { openAdmissionFile, openWeb } from '../files';
import { Panel, Pill, Btn, Row, Note, Line, Tag, Muted, FEE_STATUS, INSTALMENT_STATUS, money, fmtDate, errMsg, say, unwrapList } from '../parts';

const FEES: [string, string, string][] = [['application_fee', 'Application fee', 'application'], ['admission_fee', 'Admission fee', 'admission']];
const AFTER_OFFER = ['offer_issued', 'accepted', 'payment_pending', 'confirmed', 'enrolled'];

export default function FeesPanel({ appId, status, fees, onChanged }: { appId: string; status: string; fees: any; onChanged: () => void }) {
  const [busy, setBusy] = useState('');
  if (!fees) return null;
  const shown = FEES.filter(([, , k]) => Number(fees[k]?.fee) > 0);
  const pay = async (kind: string) => {
    setBusy(kind);
    try {
      const r: any = await portal.payLink(appId, kind);
      await openWeb(r?.data?.url);
      onChanged();
    } catch (e) { say('Could not open the payment', errMsg(e)); } finally { setBusy(''); }
  };
  const receipt = (p: any) => openAdmissionFile(portal.receiptUrl(appId, p._id), `receipt-${p.receiptNumber || p._id}.pdf`).catch((e) => say('Could not open the receipt', errMsg(e)));
  const paid = unwrapList(fees.payments).filter((p) => p.status === 'paid');
  const refunds = unwrapList(fees.refunds);
  const owing = shown.some(([, , k]) => Number(fees[k]?.due) > 0);

  return (
    <Panel icon="wallet-outline" tone="green" title="Fees">
      {!shown.length ? <Muted>No fees are due.</Muted> : null}
      {shown.map(([kind, label, k]) => {
        const b = fees[k];
        const payable = Number(b.due) > 0 && fees.online && (kind === 'application_fee' || AFTER_OFFER.includes(status));
        const next = unwrapList(b.schedule).find((x) => x.owing > 0);
        return (
          <View key={kind} style={st.fee}>
            <View style={st.top}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.name}>{label}</Text>
                <Muted>{[money(b.fee), b.waived ? `${money(b.waived)} waived` : '', b.paid ? `${money(b.paid)} paid` : '', b.refunded ? `${money(b.refunded)} refunded` : ''].filter(Boolean).join(' · ')}</Muted>
              </View>
              <Tag map={FEE_STATUS} value={b.status} />
            </View>
            {unwrapList(b.schedule).map((x) => (
              <View key={x.index} style={st.inst}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.instName}>{x.label}</Text>
                  <Muted>{money(x.amount)} · by {fmtDate(x.dueAt)}</Muted>
                </View>
                {x.status === 'part' ? <Pill tone="amber">{money(x.owing)} left</Pill> : <Tag map={INSTALMENT_STATUS} value={x.status} />}
              </View>
            ))}
            {payable ? (
              <Row>
                <Btn kind="primary" icon="card-outline" disabled={!!busy} onPress={() => pay(kind)}>
                  {busy === kind ? 'Opening…' : next && Number(b.due) > Number(next.owing) ? `Pay online — ${next.label.toLowerCase()} or all` : `Pay ${money(b.due)} online`}
                </Btn>
              </Row>
            ) : null}
          </View>
        );
      })}
      {!fees.online && owing ? <Note tone="slate">Pay at the school office; the receipt appears here once it is recorded.</Note> : null}
      {fees.online && owing ? <Muted>Paying opens the school’s secure payment page. Come back here when it is done — the receipt appears once the bank confirms.</Muted> : null}
      {refunds.map((r, i) => (
        <Line key={r._id} icon="return-down-back-outline" tone="slate" last={i === refunds.length - 1 && !paid.length}
          title={`${money(r.amount)} ${r.status === 'pending' ? 'being refunded' : 'refunded'}`}
          sub={`Receipt ${r.receiptNumber} · ${fmtDate(r.processedAt || r.createdAt)}`} />
      ))}
      {paid.map((p, i) => (
        <Line key={p._id} icon="receipt-outline" tone="green" last={i === paid.length - 1} onPress={() => receipt(p)}
          title={`Receipt ${p.receiptNumber}`} sub={`${money(p.amount)} · ${fmtDate(p.paidAt)}`} />
      ))}
    </Panel>
  );
}

const st = StyleSheet.create({
  fee: { gap: 8, paddingBottom: 12, marginBottom: 4 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 14, fontWeight: '700', color: Colors.text },
  inst: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 9, backgroundColor: '#F8FAFC' },
  instName: { fontSize: 12.5, fontWeight: '600', color: Colors.text },
});
