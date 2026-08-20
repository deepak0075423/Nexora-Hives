import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { Colors, Spacing } from '@/constants/theme';
import * as libApi from '@/api/library.api';
import {
  unwrap, LoaderView, Empty, RowItem, Badge, Card, KV, SectionTitle, ActionBtn,
  StatRow, StatTile, FormModal, fmtMoney, fmtDate,
} from '@/components/ui/kit';

// Library fines for whoever owes them, and for a parent paying for a child.
// One component for both — the server decides whose fines the caller may touch,
// so `forUserId` is a request, not a claim.
//
// Receipts show up here whether the fine was settled at the counter or on a
// phone, so a parent who paid cash has the same document as one who tapped card.

const TYPE_LABEL: Record<string, string> = {
  late_return: 'Late return', lost: 'Lost book', damaged: 'Damaged book',
};

/** The Razorpay checkout sheet needs a browser; RN has no window.Razorpay. */
const CHECKOUT_UNAVAILABLE =
  'Paying by card needs the school web portal. Open it on a browser, or pay at the library counter.';

export default function FinePayments({ forUserId, title = 'Library fines' }: {
  forUserId?: string; title?: string;
}) {
  const [data, setData] = useState<any>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
      Alert.alert('Error', err.message);
      setData(null);
    } finally { setLoading(false); }
  }, [forUserId]);

  useEffect(() => { load(); }, [load]);

  /**
   * Fetched as data and drawn natively. Handing the URL to the browser would
   * mean putting the auth token in the query string — the API only reads the
   * Authorization header, and a token in a URL ends up in history and logs.
   */
  const [receipt, setReceipt] = useState<any>(null);

  const openReceipt = async (receiptNumber: string) => {
    try {
      setReceipt(unwrap(await libApi.getFineReceipt(receiptNumber)));
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  if (loading) return <LoaderView />;
  if (!data) return null;

  const outstanding = data.outstanding ?? 0;
  const canPayOnline = !!data.gateway?.enabled && outstanding > 0;

  return (
    <>
      <StatRow>
        <StatTile label="Outstanding" value={fmtMoney(outstanding)} icon="alert-circle"
          tone={outstanding > 0 ? 'danger' : 'success'} />
        <StatTile label="Receipts" value={String(receipts.length)} icon="receipt" tone="info" />
      </StatRow>

      <SectionTitle>{title}</SectionTitle>
      {(data.pending ?? []).length === 0 ? (
        <Empty icon="checkmark-circle-outline" text="Nothing outstanding" />
      ) : (
        (data.pending ?? []).map((f: any) => (
          <RowItem
            key={f._id}
            icon="cash" iconColor={Colors.warning} iconBg={Colors.warningLight}
            title={`${fmtMoney(f.outstanding ?? f.amount)} · ${TYPE_LABEL[f.fineType] ?? f.fineType}`}
            sub={[
              f.description || '',
              (f.waivedAmount || 0) > 0 ? `${fmtMoney(f.waivedAmount)} waived` : '',
              fmtDate(f.createdAt),
            ].filter(Boolean).join(' · ')}
            right={<Badge label="Unpaid" tone="warning" />}
          />
        ))
      )}

      {outstanding > 0 && (
        <View style={{ marginTop: Spacing.sm }}>
          {canPayOnline ? (
            <>
              <ActionBtn label={`Pay ${fmtMoney(outstanding)} online`} tone="success"
                onPress={() => Alert.alert('Pay online', CHECKOUT_UNAVAILABLE)} />
              <Text style={{ fontSize: 11, color: Colors.textLight, marginTop: 6, lineHeight: 16 }}>
                Card payment opens in the school web portal. You can also pay at the library counter —
                you get a receipt either way.
              </Text>
            </>
          ) : (
            <Card>
              <Text style={{ fontSize: 12, color: Colors.textSecondary, lineHeight: 18 }}>
                Online payment is not available for library fines at this school. Please pay at the
                library counter — a receipt is issued either way.
              </Text>
            </Card>
          )}
        </View>
      )}

      <SectionTitle>Receipts</SectionTitle>
      {receipts.length === 0 ? (
        <Empty icon="receipt-outline" text="Receipts appear here once a fine is paid" />
      ) : (
        receipts.map((r: any) => (
          <View key={r.receiptNumber} style={{ marginBottom: 4 }}>
            <RowItem
              icon="receipt" iconColor="#4F46E5" iconBg="#EDE9FE"
              title={`${r.receiptNumber} · ${fmtMoney(r.amount)}`}
              sub={`${fmtDate(r.paidAt)} · ${r.paymentMode === 'online' ? 'Paid online' : 'Cash at the library'}`}
              right={<Badge label={r.paymentMode === 'online' ? 'Online' : 'Cash'}
                tone={r.paymentMode === 'online' ? 'info' : 'neutral'} />}
              onPress={() => openReceipt(r.receiptNumber)}
            />
          </View>
        ))
      )}
      {receipts.length > 0 && (
        <Text style={{ fontSize: 11, color: Colors.textLight, marginTop: 4, textAlign: 'center' }}>
          Tap a receipt to see it. To print or save a PDF, open the school web portal.
        </Text>
      )}

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
          <KV key={i} label={l.label} value={fmtMoney(l.amount)} />
        ))}
        <View style={{ borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 8, paddingTop: 8 }}>
          <KV label="Total paid" value={fmtMoney(receipt?.total)} />
        </View>
      </FormModal>
    </>
  );
}
