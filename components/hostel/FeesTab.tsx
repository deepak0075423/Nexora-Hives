import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import * as hostelApi from '@/api/hostel.api';
import { BASE_URL } from '@/api/axios';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import {
  unwrap, Empty, Badge, Card, KV, SectionTitle, RowItem, StatRow, StatTile, FormModal, fmtDate, fmtDateTime, fmtMoney,
} from '@/components/ui/kit';

const label = (v?: string) => String(v ?? '').replace(/_/g, ' ');
const MODE: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', bank_transfer: 'Bank transfer', cheque: 'Cheque', online: 'Online' };

/**
 * A resident's hostel bills on the phone — for a student, a parent looking at
 * a child (`student`), or a teacher who lives in.
 *
 * Paying online: the gateway's checkout needs a browser, which the app does
 * not have inside it. So the app opens an order, hands the order's own hosted
 * page to the system browser, and — when that closes — asks the server what
 * became of the order. The server asks the gateway if nobody told it, so a
 * payment is recorded even when the page never got to say so.
 */
export function FeesBody({ data, paying, onPay, onReceipt, onVoucher }: {
  data: any; paying: boolean; onPay: (invoiceIds?: string[]) => void;
  onReceipt: (r: any) => void; onVoucher: (r: any) => void;
}) {
  const pending: any[] = data?.pending || [];
  const receipts: any[] = data?.receipts || [];
  const refunds: any[] = data?.refunds || [];
  const online = !!data?.gateway?.enabled && data?.gateway?.provider === 'razorpay';

  return (
    <>
      <StatRow>
        <StatTile label="Billed" value={fmtMoney(data?.billed)} icon="receipt" tone="info" />
        <StatTile label="Paid" value={fmtMoney(data?.paid)} icon="checkmark-circle" tone="success" />
        <StatTile label="Due" value={fmtMoney(data?.outstanding)} icon="alert-circle"
          tone={data?.outstanding ? 'danger' : 'neutral'} />
      </StatRow>

      {data?.freeForStaff && (
        <Card style={{ backgroundColor: Colors.successLight }}>
          <Text style={s.note}>The hostel is free for teachers at this school, so no hostel fee is billed to you.</Text>
        </Card>
      )}
      {data?.pendingOrders > 0 && (
        <Card style={{ backgroundColor: Colors.warningLight }}>
          <Text style={s.note}>
            An online payment was started and is not confirmed yet. It is checked with the bank automatically — if money
            left your account, the receipt appears here within half an hour. Please do not pay again in the meantime.
          </Text>
        </Card>
      )}

      <SectionTitle>To pay ({pending.length})</SectionTitle>
      {pending.length === 0 ? <Empty icon="checkmark-done-outline" text="Nothing to pay" /> : (
        <>
          {pending.map((i: any) => (
            <Card key={i._id}>
              <View style={s.head}>
                <Text style={s.title}>{i.invoiceNumber}</Text>
                <Badge label={label(i.status)} tone={i.status === 'overdue' ? 'danger' : 'warning'} />
              </View>
              <KV label="For" value={i.label} />
              <KV label="Outstanding" value={fmtMoney(i.outstanding)} />
              {i.lateFee > 0 && <KV label="Includes late fee" value={fmtMoney(i.lateFee)} />}
              {i.dueDate && <KV label="Due" value={fmtDate(i.dueDate)} />}
            </Card>
          ))}
          {online ? (
            <TouchableOpacity style={[s.payBtn, paying && { opacity: 0.6 }]} disabled={paying} onPress={() => onPay()}
              accessibilityRole="button" accessibilityLabel={`Pay ${fmtMoney(data.outstanding)} online`}>
              {paying ? <ActivityIndicator size="small" color="#fff" /> : (
                <>
                  <Ionicons name="card" size={18} color="#fff" />
                  <Text style={s.payText}>  Pay {fmtMoney(data.outstanding)} online</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
          <Text style={s.hint}>
            {online ? 'Or pay at the hostel office' : 'Online payment is not switched on for hostel fees. Pay at the hostel office'}
            {(data?.offlineModes || []).length ? ` (${data.offlineModes.join(', ')})` : ''} — the receipt appears here either way.
          </Text>
        </>
      )}

      <SectionTitle>Receipts ({receipts.length})</SectionTitle>
      {receipts.length === 0 ? <Empty icon="receipt-outline" text="No payments yet" />
        : receipts.map((r: any) => (
          <RowItem key={r.receiptNumber} icon="receipt" title={`${r.receiptNumber} · ${fmtMoney(r.amount)}`}
            sub={`${fmtDate(r.paidAt)} · ${r.mode === 'online' ? 'Online' : `${MODE[r.mode] || label(r.mode)} at the office`}`}
            right={<Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />}
            onPress={() => onReceipt(r)} />
        ))}

      {refunds.length > 0 && (
        <>
          <SectionTitle>Refunds ({refunds.length})</SectionTitle>
          {refunds.map((r: any, i: number) => (
            <RowItem key={r.voucherNumber || i} icon="return-up-back" title={`${r.voucherNumber || 'Refund'} · ${fmtMoney(r.amount)}`}
              sub={`${fmtDate(r.refundedAt)} · ${r.mode === 'gateway' ? 'Back to the online payment' : 'Cash / transfer from the office'}`}
              right={r.voucherNumber ? <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} /> : undefined}
              onPress={r.voucherNumber ? () => onVoucher(r) : undefined} />
          ))}
        </>
      )}

      {(data?.settled || []).length > 0 && (
        <>
          <SectionTitle>Settled invoices</SectionTitle>
          {data.settled.map((i: any) => (
            <RowItem key={i._id} icon="card" title={`${i.invoiceNumber} · ${fmtMoney(i.netAmount)}`}
              sub={`${i.label}${i.refundedAmount > 0 ? ` · ${fmtMoney(i.refundedAmount)} refunded` : ''}`}
              right={<Badge label={label(i.status)} />} />
          ))}
        </>
      )}
    </>
  );
}

/** A receipt or a refund voucher, drawn from the data the server renders its own page from. */
export function DocumentSheet({ doc, onClose }: { doc: any; onClose: () => void }) {
  const L = doc?.labels || {};
  return (
    <FormModal visible={!!doc} title={L.doc || 'Receipt'} onClose={onClose}>
      {doc?.loading ? <ActivityIndicator style={{ marginVertical: Spacing.xl }} color={Colors.primary} /> : doc ? (
        <View>
          {doc.school?.name ? <Text style={s.docSchool}>{doc.school.name}</Text> : null}
          <Text style={s.docTitle}>{doc.title}</Text>
          <Card>
            <KV label={L.number || 'Receipt no.'} value={doc.number} />
            <KV label="Date" value={fmtDateTime(doc.date)} />
            <KV label={L.paidBy || 'Paid by'} value={doc.paidBy} />
            {doc.paidByDetail ? <KV label={doc.paidByDetailLabel || 'Details'} value={doc.paidByDetail} /> : null}
            <KV label={L.mode || 'Payment mode'} value={doc.paymentMode === 'online' ? 'Online' : doc.offlineModeLabel} />
            {doc.reference ? <KV label="Reference" value={doc.reference} /> : null}
          </Card>
          <Card>
            {(doc.lines || []).map((l: any, i: number) => <KV key={i} label={l.label} value={fmtMoney(l.amount)} />)}
            <View style={s.total}>
              <Text style={s.totalLabel}>{L.total || 'Total paid'}</Text>
              <Text style={s.totalValue}>{fmtMoney(doc.total)}</Text>
            </View>
          </Card>
        </View>
      ) : null}
    </FormModal>
  );
}

export default function HostelFeesTab({ student, onChanged }: { student?: string; onChanged?: () => void }) {
  const [data, setData] = useState<any>(undefined);
  const [paying, setPaying] = useState(false);
  const [doc, setDoc] = useState<any>(null);

  const load = useCallback(async () => {
    try { setData(unwrap(await hostelApi.getMyFeeSummary(student))); }
    catch { setData(null); }
  }, [student]);
  useEffect(() => { load(); }, [load]);

  const pay = async (invoiceIds?: string[]) => {
    setPaying(true);
    try {
      const order = unwrap(await hostelApi.createFeeOrder({ student, invoiceIds }));
      // The gateway's checkout runs in the system browser; this resolves when it is closed.
      await WebBrowser.openBrowserAsync(`${BASE_URL}${order.checkoutPath}`);
      const r = unwrap(await hostelApi.checkFeePayment({ orderId: order.orderId, student }));
      if (r.status === 'paid') {
        alert(`Paid — receipt ${r.receiptNumber}${r.unapplied > 0 ? `. ${fmtMoney(r.unapplied)} could not be applied; the hostel office has been told and will refund or adjust it.` : ''}`);
      } else if (r.unknown) {
        alert('We could not reach the bank to confirm this payment. If money left your account it will appear here shortly — please do not pay again.');
      } else {
        alert('No payment was received. If money did leave your account, it will appear here within half an hour — please do not pay again.');
      }
      await load();
      onChanged?.();
    } catch (err: any) { alert(err?.message ?? 'Could not start the payment'); }
    finally { setPaying(false); }
  };

  const open = async (fetcher: () => Promise<any>) => {
    setDoc({ loading: true });
    try { setDoc(unwrap(await fetcher())); }
    catch (err: any) { setDoc(null); alert(err?.message ?? 'Could not open the document'); }
  };

  if (data === undefined) return <ActivityIndicator style={{ marginVertical: Spacing.xl }} color={Colors.primary} />;
  if (!data) return <Empty icon="card-outline" text="The hostel fees could not be loaded" />;

  return (
    <>
      <FeesBody data={data} paying={paying} onPay={pay}
        onReceipt={(r) => open(() => hostelApi.getFeeReceipt(r.receiptNumber, r.invoice))}
        onVoucher={(r) => open(() => hostelApi.getRefundVoucher(r.voucherNumber))} />
      <DocumentSheet doc={doc} onClose={() => setDoc(null)} />
    </>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { ...Typography.h4, color: Colors.text },
  note: { ...Typography.body, color: Colors.text, lineHeight: 20 },
  hint: { ...Typography.caption, color: Colors.textSecondary, marginTop: 4, marginBottom: Spacing.sm, lineHeight: 18 },
  payBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 13, marginVertical: Spacing.sm,
  },
  payText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  docSchool: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center' },
  docTitle: { ...Typography.h3, color: Colors.text, textAlign: 'center', marginBottom: Spacing.sm },
  total: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  totalLabel: { ...Typography.h4, color: Colors.text },
  totalValue: { ...Typography.h4, color: Colors.text },
});
