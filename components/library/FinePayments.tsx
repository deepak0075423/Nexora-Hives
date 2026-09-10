/**
 * Library fines for whoever owes them, and for a parent paying for a child.
 *
 * One component for both — the server decides whose fines the caller may touch,
 * so `forUserId` is a request, not a claim. Receipts show up here whether the
 * fine was settled at the counter or on a phone, so a parent who paid cash has
 * the same document as one who tapped a card.
 *
 * The rail on the web becomes two cards at the bottom here: what you can do,
 * and the school's actual fine rules — stated rather than linked, because a
 * member has no policy page of their own to open.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '@/constants/theme';
import * as libApi from '@/api/library.api';
import { unwrap, LoaderView, KV, SectionTitle, FormModal, fmtDate } from '@/components/ui/kit';
import { Figures, Panel, Pill, Blank, BookRow, TONES, money, shortDate, type Tone } from './parts';

const TYPE_LABEL: Record<string, string> = {
  late_return: 'Late return', lost: 'Lost book', damaged: 'Damaged book',
};
const PAID_LABEL: Record<string, string> = { paid: 'Paid', waived: 'Waived', cancelled: 'Cancelled' };
const PAID_TONE:  Record<string, Tone>   = { paid: 'green', waived: 'slate', cancelled: 'slate' };

/** The Razorpay checkout sheet needs a browser; RN has no window.Razorpay. */
const CHECKOUT_UNAVAILABLE =
  'Paying by card needs the school web portal. Open it in a browser, or pay at the library counter — you get a receipt either way.';

export default function FinePayments({ forUserId, title = 'Outstanding fines' }: {
  forUserId?: string; title?: string;
}) {
  const [data, setData] = useState<any>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summary, rcpts] = await Promise.all([
        libApi.getFineSummary(forUserId),
        libApi.listMyReceipts(forUserId).catch(() => ({ data: [] } as any)),
      ]);
      setData(unwrap(summary));
      setReceipts(((rcpts as any)?.data) ?? []);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not load fines');
      setData(null);
    } finally { setLoading(false); }
  }, [forUserId]);

  useEffect(() => { load(); }, [load]);

  /**
   * Fetched as data and drawn natively. Handing the URL to the browser would
   * mean putting the auth token in the query string — the API only reads the
   * Authorization header, and a token in a URL ends up in history and logs.
   */
  const openReceipt = async (receiptNumber: string) => {
    try { setReceipt(unwrap(await libApi.getFineReceipt(receiptNumber))); }
    catch (err: any) { Alert.alert('Error', err?.message ?? 'Could not open the receipt'); }
  };

  const pending: any[] = useMemo(() => data?.pending ?? [], [data]);
  const settled: any[] = useMemo(() => data?.settled ?? [], [data]);

  const paidThisYear = useMemo(() => {
    const start = data?.academicYear?.startDate ? new Date(data.academicYear.startDate).getTime() : 0;
    return settled.filter((f) => f.status === 'paid'
      && (!start || new Date(f.paidAt ?? f.createdAt).getTime() >= start)).length;
  }, [settled, data]);

  if (loading) return <LoaderView />;
  if (!data) return null;

  const outstanding  = data.outstanding ?? 0;
  const canPayOnline = !!data.gateway?.enabled && outstanding > 0;
  const p            = data.policy ?? {};

  return (
    <>
      <Figures items={[
        { icon: 'alert-circle-outline', tone: 'red', label: 'Total Outstanding', value: money(outstanding),
          caption: pending.length ? `${pending.length} item${pending.length === 1 ? '' : 's'}` : 'Nothing to pay' },
        { icon: 'documents-outline', tone: 'blue', label: 'Total Fines',
          value: pending.length + settled.length, caption: 'All time' },
        { icon: 'checkmark-circle-outline', tone: 'green', label: 'Paid Fines', value: paidThisYear,
          caption: data.academicYear?.yearName ? `In ${data.academicYear.yearName}` : 'All time' },
        { icon: 'time-outline', tone: 'violet', label: 'Pending Payments', value: data.pendingPayments ?? 0,
          caption: data.pendingPayments ? 'Started but not confirmed' : 'No pending actions' },
      ]} />

      <Panel icon="alert-circle" tone="red" title={`${title} (${pending.length})`}>
        {pending.length === 0 ? (
          <Blank icon="checkmark-circle-outline" title="Nothing outstanding"
            body="There are no library fines to pay." />
        ) : pending.map((f: any) => (
          <BookRow key={f._id} book={f.book} onPress={() => setDetail(f)}
            meta={[
              TYPE_LABEL[f.fineType] ?? f.fineType,
              f.daysOverdue > 0 ? `${f.daysOverdue} day${f.daysOverdue === 1 ? '' : 's'} late` : '',
              `Raised ${shortDate(f.createdAt)}`,
            ].filter(Boolean).join(' · ')}
            right={
              <>
                <Text style={s.amount}>{money(f.outstanding ?? f.amount)}</Text>
                <Pill label="Unpaid" tone="red" />
                {f.waivedAmount > 0 ? <Text style={s.waived}>{money(f.waivedAmount)} waived</Text> : null}
              </>
            } />
        ))}

        {outstanding > 0 && (
          <View style={{ marginTop: 4 }}>
            {canPayOnline ? (
              <TouchableOpacity style={s.pay} onPress={() => Alert.alert('Pay online', CHECKOUT_UNAVAILABLE)}>
                <Ionicons name="card-outline" size={17} color="#fff" />
                <Text style={s.payText}>Pay {money(outstanding)}</Text>
              </TouchableOpacity>
            ) : (
              <View style={s.notice}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.warning} />
                <Text style={s.noticeText}>
                  Online payment is not available for library fines at this school. Please pay at the
                  library counter — a receipt is issued either way.
                </Text>
              </View>
            )}
          </View>
        )}
      </Panel>

      <Panel icon="checkmark-circle" tone="green" title="Payment History">
        {settled.length === 0 ? (
          <Blank icon="document-text-outline" title="No payments yet"
            body="Your fine payment history will appear here once you make a payment." />
        ) : settled.map((f: any) => (
          <BookRow key={f._id} book={f.book}
            onPress={f.receiptNumber ? () => openReceipt(f.receiptNumber) : undefined}
            meta={[
              TYPE_LABEL[f.fineType] ?? f.fineType,
              f.status === 'paid' ? (f.paymentMode === 'online' ? 'Paid online' : 'Cash at the library') : '',
              `${shortDate(f.paidAt ?? f.waivedAt)}`,
              f.receiptNumber ? `Receipt ${f.receiptNumber}` : '',
            ].filter(Boolean).join(' · ')}
            right={
              <>
                <Text style={s.amountPaid}>
                  {money(f.paidAmount || Math.max(0, (f.amount || 0) - (f.waivedAmount || 0)))}
                </Text>
                <Pill label={PAID_LABEL[f.status] ?? f.status} tone={PAID_TONE[f.status] ?? 'slate'} />
              </>
            } />
        ))}
        {receipts.length > 0 && (
          <Text style={s.hint}>Tap a paid fine to see its receipt.</Text>
        )}
      </Panel>

      {/* The rules the charges came from, stated rather than linked. */}
      <Panel icon="information-circle" tone="blue" title="Fine Policy">
        <PolicyLine icon="time-outline">
          Late returns cost <Text style={s.strong}>{money(p.finePerDay)} per day</Text>
          {p.gracePeriodDays > 0 ? ` after a ${p.gracePeriodDays}-day grace period` : ''}.
        </PolicyLine>
        <PolicyLine icon="alert-circle-outline">
          A lost book is charged <Text style={s.strong}>{p.lostBookFineDays ?? '—'} days</Text> of fine,
          a damaged one <Text style={s.strong}>{p.damagedBookFineDays ?? '—'} days</Text>.
        </PolicyLine>
        <PolicyLine icon="receipt-outline">
          Every payment gets a receipt, whether it is made online or at the counter.
        </PolicyLine>
        {p.teacherFinesEnabled === false && (
          <PolicyLine icon="checkmark-circle-outline">
            Staff loans are not fined by default — a charge already raised still stands.
          </PolicyLine>
        )}
      </Panel>

      {/* Why a charge exists */}
      <FormModal visible={!!detail} title={detail ? (TYPE_LABEL[detail.fineType] ?? 'Fine') : 'Fine'}
        onClose={() => setDetail(null)} submitLabel="Close">
        {detail?.book?.title ? <KV label="Book" value={detail.book.title} /> : null}
        <KV label="Raised on" value={fmtDate(detail?.createdAt)} />
        {detail?.daysOverdue ? <KV label="Days late" value={String(detail.daysOverdue)} /> : null}
        <KV label="Charged" value={money(detail?.amount)} />
        {detail?.waivedAmount ? <KV label="Waived" value={money(detail.waivedAmount)} /> : null}
        <KV label="Still to pay" value={money(detail?.outstanding ?? detail?.amount)} />
        {detail?.loan?.issueDate ? <KV label="Borrowed" value={fmtDate(detail.loan.issueDate)} /> : null}
        {detail?.loan?.dueDate ? <KV label="Was due" value={fmtDate(detail.loan.dueDate)} /> : null}
        {detail?.loan?.returnDate ? <KV label="Returned" value={fmtDate(detail.loan.returnDate)} /> : null}
        <Text style={s.rule}>
          The school&apos;s rule: {detail?.fineType === 'late_return'
            ? `${p.finePerDay ? `${money(p.finePerDay)} per day late` : 'a daily rate set by the school'}${p.gracePeriodDays ? `, after ${p.gracePeriodDays} grace day(s)` : ''}`
            : detail?.fineType === 'lost'
              ? `${p.lostBookFineDays} days of fine for a lost book`
              : `${p.damagedBookFineDays} days of fine for a damaged book`}.
        </Text>
      </FormModal>

      {/* The receipt itself */}
      <FormModal visible={!!receipt} title={receipt?.number ?? 'Receipt'}
        onClose={() => setReceipt(null)} submitLabel="Close">
        <KV label="School" value={receipt?.school?.name} />
        <KV label="Receipt no." value={receipt?.number} />
        <KV label="Date" value={fmtDate(receipt?.date)} />
        <KV label="Paid by" value={receipt?.paidBy} />
        {receipt?.paidByDetail ? <KV label="Class" value={receipt.paidByDetail} /> : null}
        <KV label="Payment mode" value={receipt?.paymentMode === 'online' ? 'Online' : 'Cash at the library'} />
        {receipt?.reference ? <KV label="Reference" value={receipt.reference} /> : null}

        <SectionTitle>What this covered</SectionTitle>
        {(receipt?.lines ?? []).map((l: any, i: number) => (
          <KV key={i} label={l.label} value={money(l.amount)} />
        ))}
        <View style={s.total}><KV label="Total paid" value={money(receipt?.total)} /></View>
      </FormModal>
    </>
  );
}

function PolicyLine({ icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <View style={s.policy}>
      <Ionicons name={icon} size={15} color={TONES.indigo.fg} style={{ marginTop: 1 }} />
      <Text style={s.policyText}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  amount:     { fontSize: 14, fontWeight: '800', color: Colors.danger },
  amountPaid: { fontSize: 14, fontWeight: '800', color: Colors.text },
  waived:     { fontSize: 10, color: Colors.success, fontWeight: '600' },

  pay: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.primary, marginTop: 6,
  },
  payText: { fontSize: 13.5, fontWeight: '700', color: '#fff' },

  notice: {
    flexDirection: 'row', gap: 8, padding: 11, borderRadius: Radius.md,
    backgroundColor: Colors.warningLight, marginTop: 6,
  },
  noticeText: { flex: 1, fontSize: 11.5, color: Colors.text, lineHeight: 16 },

  hint: { fontSize: 11, color: Colors.textLight, textAlign: 'center', marginTop: 6 },

  policy: { flexDirection: 'row', gap: 8, paddingVertical: 6 },
  policyText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  strong: { color: Colors.text, fontWeight: '700' },

  rule: {
    marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border,
    fontSize: 11.5, color: Colors.textSecondary, lineHeight: 16,
  },
  total: { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 8, paddingTop: 8 },
});
