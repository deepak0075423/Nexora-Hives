import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as feesApi from '@/api/fees.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, ActionBtn, SegTabs, Select,
  FormModal, Input, fmtMoney, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import MonthPicker, { payableMonths, amountFor, keysFor, dueCount } from '@/components/fees/MonthPicker';

/**
 * A month's state, said the way a family would say it. `awaiting` means the
 * money is with the office and not yet approved; `cancelled` means the school
 * withdrew the charge. Neither is owed, and neither existed when this screen
 * was first written.
 */
const MONTH_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  paid:      { label: 'Paid', tone: 'success' },
  partial:   { label: 'Part paid', tone: 'warning' },
  due:       { label: 'Due', tone: 'danger' },
  upcoming:  { label: 'Upcoming', tone: 'neutral' },
  awaiting:  { label: 'Awaiting approval', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/** What is left to pay on a month — net of anything awaiting approval. */
const owing = (m: any) => Number(m?.payable != null ? m.payable : m?.amountDue) || 0;

/** A downloaded PDF, as base64 the filesystem can write. */
const blobToBase64 = (blob: any): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Could not read the receipt'));
  reader.onloadend = () => resolve(String(reader.result).split(',')[1] ?? '');
  reader.readAsDataURL(blob);
});

const MODE_OPTIONS = [
  { label: 'Cash', value: 'cash' },
  { label: 'UPI', value: 'upi' },
  { label: 'Bank Transfer', value: 'bank_transfer' },
  { label: 'Cheque', value: 'cheque' },
];

/**
 * Student & parent fee book — mirrors the website: overview, monthly schedule,
 * payment history, and a "Pay Now" flow (manual payment, admin verifies).
 */
export default function FeesScreen() {
  const { user } = useAuth();
  const isParent = user?.role === 'parent';

  const [children, setChildren] = useState<any[]>([]);
  const [childId, setChildId] = useState('');
  const [book, setBook] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [tab, setTab] = useState('overview');

  const [showPay, setShowPay] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', paymentMode: 'upi', transactionRef: '', remarks: '' });
  // Paying by months (the default whenever months are unpaid) or a free
  // amount. `count` = how many unpaid months are ticked, oldest first.
  const [byMonths, setByMonths] = useState(true);
  const [count, setCount] = useState(0);
  const [savingId, setSavingId] = useState('');

  // What the picker currently comes to. Declared here because the submit
  // handler below needs it, and it is only ever derived from `book`.
  const unpaidMonths = payableMonths(book?.monthlySchedule ?? []);
  const otherDue = Number(book?.otherDue ?? 0);
  const monthsMode = byMonths && (unpaidMonths.length > 0 || otherDue > 0);
  const payAmount = amountFor(book?.monthlySchedule ?? [], otherDue, count);

  const load = useCallback(async (cid = childId) => {
    try {
      if (isParent) {
        let kids = children;
        if (!kids.length) {
          kids = unwrap(await feesApi.getMyChildren()) ?? [];
          setChildren(kids);
        }
        const target = cid || kids[0]?._id;
        if (!target) { setBook(null); return; }
        if (!cid) setChildId(target);
        setBook(unwrap(await feesApi.getChildFees(target)));
      } else {
        setBook(unwrap(await feesApi.getMyFees()));
      }
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  }, [user?.role, childId, children.length]);

  useEffect(() => { if (user?.role) load(); }, [user?.role]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const changeChild = (id: string) => { setChildId(id); setLoading(true); load(id); };

  /**
   * Fetch the receipt PDF and hand it to the phone to open or share. The
   * server renders it — the phone never redraws a receipt of its own, so what
   * a family shows the office is always what the office issued.
   */
  const openReceipt = async (pmt: any) => {
    setSavingId(pmt._id);
    try {
      const blob: any = isParent
        ? await feesApi.downloadChildReceipt(childId, pmt._id)
        : await feesApi.downloadMyReceipt(pmt._id);
      const base64 = await blobToBase64(blob);
      const uri = `${FileSystem.cacheDirectory}receipt-${pmt.receiptNumber || pmt._id}.pdf`;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
      else Alert.alert('Saved', 'The receipt was saved to this device.');
    } catch (err: any) {
      Alert.alert('Could not open the receipt', err?.message ?? 'Please try again.');
    } finally { setSavingId(''); }
  };

  const openPay = () => {
    const unpaid = payableMonths(book?.monthlySchedule ?? []);
    setByMonths(unpaid.length > 0 || (book?.otherDue ?? 0) > 0);
    // Start on what is due now; with nothing due, on the next month.
    setCount(dueCount(book?.monthlySchedule ?? []) || (unpaid.length ? 1 : 0));
    // Money already sent and not yet approved is not owed again: suggesting
    // the gross figure is how a family pays the same month twice.
    const owed = Number(book?.dueTotal ?? book?.balance ?? 0);
    const waiting = Number(book?.pendingTotal ?? 0);
    const left = Math.max(0, Math.round((owed - waiting) * 100) / 100);
    setPayForm(f => ({ ...f, amount: left > 0 ? String(left) : '' }));
    setShowPay(true);
  };

  const submitPay = async () => {
    const amt = monthsMode ? payAmount : Number(payForm.amount);
    if (!amt || amt <= 0) {
      return Alert.alert('Nothing to pay', monthsMode ? 'Tick at least one month.' : 'Enter a valid amount.');
    }
    setPaying(true);
    try {
      const payload: any = {
        amount: amt, paymentMode: payForm.paymentMode,
        transactionRef: payForm.transactionRef, remarks: payForm.remarks,
      };
      // The server prices the months itself; sending them is what makes the
      // receipt name the months rather than a bare amount.
      if (monthsMode) payload.months = keysFor(book?.monthlySchedule ?? [], count);
      if (isParent) await feesApi.parentPayNow(childId, payload);
      else await feesApi.payNow(payload);
      setShowPay(false);
      setPayForm({ amount: '', paymentMode: 'upi', transactionRef: '', remarks: '' });
      load();
      Alert.alert('Submitted', 'Payment submitted for verification. The school admin will confirm it shortly.');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setPaying(false); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Fees' }} />
      <ModuleDisabled />
    </>
  );

  const sym = book?.currencySymbol ?? '₹';
  const money = (n?: number | null) => n != null ? `${sym}${Number(n).toLocaleString('en-IN')}` : '--';
  const schedule: any[] = book?.monthlySchedule ?? [];
  const payments: any[] = book?.payments ?? [];
  // A receipt exists only for an approved payment.
  const receipts: any[] = payments.filter((p: any) => p.paymentStatus === 'completed');
  const items: any[] = book?.resolved?.items ?? [];
  const concessions: any[] = book?.concessions ?? [];

  return (
    <>
      <Stack.Screen options={{ title: isParent ? "Child's Fees" : 'My Fees' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {isParent && children.length > 1 && (
          <Select label="Child" value={childId} onChange={changeChild}
            options={children.map((c: any) => ({ label: c.name, value: c._id }))} />
        )}

        {loading ? <LoaderView /> : !book ? (
          <Empty icon="card-outline" text="No fee records available yet" />
        ) : (
          <>
            {/* Banner */}
            <View style={s.banner}>
              <View style={{ flex: 1 }}>
                <Text style={s.bannerLabel}>Outstanding {book.activeYear?.yearName ? `· ${book.activeYear.yearName}` : ''}</Text>
                <Text style={s.bannerAmount}>{money(book.dueTotal ?? book.balance)}</Text>
                <Text style={s.bannerSub}>
                  Charged {money(book.totalCharged)} · Paid {money(book.totalPaid)}
                  {book.totalConcession > 0 ? ` · Concession ${money(book.totalConcession)}` : ''}
                </Text>
              </View>
              <View style={s.bannerIcon}>
                <Ionicons name="card" size={28} color={Colors.textInverse} />
              </View>
            </View>

            {/* Money sent but not yet approved — say so, or the family pays twice. */}
            {book.pendingTotal > 0 ? (
              <View style={s.waiting}>
                <Ionicons name="time-outline" size={18} color={Colors.warning} />
                <Text style={s.waitingText}>
                  {money(book.pendingTotal)} is with the school office and waiting to be approved.
                  The months it covers are not owed again.
                </Text>
              </View>
            ) : null}

            {(book.dueTotal > 0 || book.balance > 0) && (
              <View style={{ marginBottom: Spacing.md }}>
                <ActionBtn label={`Pay Now (${money(book.suggestedAmount || book.dueTotal)})`} tone="success" onPress={openPay} />
              </View>
            )}
            {book.fineAmt > 0 && (
              <Card>
                <KV label="Late fine accruing" value={<Text style={{ color: Colors.danger, fontWeight: '700' }}>{money(book.fineAmt)}</Text>} />
              </Card>
            )}

            <SegTabs
              tabs={[
                { key: 'overview', label: 'Fee Structure' },
                { key: 'schedule', label: 'Monthly Schedule' },
                { key: 'payments', label: `Payments (${payments.length})` },
                { key: 'receipts', label: `Receipts (${receipts.length})` },
              ]}
              active={tab} onChange={setTab}
            />

            {tab === 'overview' && (
              <>
                {items.length === 0 ? (
                  <Empty icon="pricetag-outline" text="No fee structure assigned yet" />
                ) : (
                  <Card>
                    {items.map((it: any, i: number) => (
                      <KV key={i} label={it.feeHead?.name ?? it.name ?? `Item ${i + 1}`} value={money(it.amount)} />
                    ))}
                    <KV label="Total" value={<Text style={{ fontWeight: '800', color: Colors.text }}>{money(book.resolved?.totalAmount)}</Text>} />
                    {book.resolved?.dueDay ? <KV label="Due day" value={`${book.resolved.dueDay} of every month`} /> : null}
                  </Card>
                )}
                {concessions.length > 0 && (
                  <>
                    <Text style={s.groupLabel}>Concessions</Text>
                    {concessions.map((c: any, i: number) => (
                      <Card key={i}>
                        <KV label={c.concession?.name ?? 'Concession'}
                          value={c.concession?.concessionType === 'percentage' ? `${c.concession.value}%` : money(c.concession?.value)} />
                      </Card>
                    ))}
                  </>
                )}
              </>
            )}

            {tab === 'schedule' && (
              schedule.length === 0 ? <Empty icon="calendar-outline" text="No monthly schedule" /> :
              schedule.map((m: any, i: number) => (
                <View key={i} style={s.monthRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.monthName}>{m.monthLabel ?? m.monthKey ?? `Month ${i + 1}`}</Text>
                    <Text style={s.monthSub}>
                      {money(m.totalAmount)}
                      {m.amountPaid > 0 ? ` · paid ${money(m.amountPaid)}` : ''}
                      {owing(m) > 0 ? ` · due ${money(owing(m))}` : ''}
                      {m.dueDate ? ` · by ${fmtDate(m.dueDate)}` : ''}
                    </Text>
                  </View>
                  <Badge label={MONTH_STATUS[m.payStatus]?.label ?? m.payStatus ?? '--'}
                    tone={MONTH_STATUS[m.payStatus]?.tone ?? 'neutral'} />
                </View>
              ))
            )}

            {tab === 'receipts' && (
              receipts.length === 0 ? <Empty icon="document-text-outline" text="A receipt is issued for every approved payment" /> :
              receipts.map((pmt: any) => (
                <Card key={pmt._id}>
                  <KV label="Receipt" value={pmt.receiptNumber ?? '--'} />
                  <KV label="For" value={pmt.months?.length ? pmt.months.join(', ') : 'Fee payment'} />
                  <KV label="Amount" value={money(pmt.amount)} />
                  <KV label="Paid on" value={fmtDate(pmt.paymentDate)} />
                  <View style={{ marginTop: Spacing.sm }}>
                    <ActionBtn small label={savingId === pmt._id ? 'Opening…' : 'Download receipt'}
                      tone="info" disabled={!!savingId} onPress={() => openReceipt(pmt)} />
                  </View>
                </Card>
              ))
            )}

            {tab === 'payments' && (
              payments.length === 0 ? <Empty icon="receipt-outline" text="No payments yet" /> :
              payments.map((pmt: any) => (
                <Card key={pmt._id}>
                  <KV label="Amount" value={money(pmt.amount)} />
                  {pmt.months?.length ? <KV label="Months" value={pmt.months.join(', ')} /> : null}
                  <KV label="Date" value={fmtDate(pmt.paymentDate)} />
                  <KV label="Mode" value={pmt.paymentMode ?? '--'} />
                  {pmt.receiptNumber ? <KV label="Receipt" value={pmt.receiptNumber} /> : null}
                  {pmt.transactionRef ? <KV label="Reference" value={pmt.transactionRef} /> : null}
                  <KV label="Status" value={<Badge label={pmt.paymentStatus} />} />
                </Card>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Pay-now (manual — admin verifies) */}
      <FormModal visible={showPay} title="Pay Fees" onClose={() => setShowPay(false)} onSubmit={submitPay} submitting={paying} submitLabel="Submit Payment">
        <Text style={s.payNote}>
          Record a payment you have made (cash/UPI/bank). The school admin verifies it before it reflects in the ledger.
        </Text>

        {monthsMode ? (
          <>
            <Text style={s.payLabel}>Months to pay</Text>
            <MonthPicker months={book?.monthlySchedule ?? []} otherDue={otherDue}
              count={count} onCount={setCount} sym={sym} />
            <View style={s.payTotal}>
              <Text style={s.payTotalLabel}>
                {count} month{count === 1 ? '' : 's'}{otherDue > 0 ? ' + other charges' : ''}
              </Text>
              <Text style={s.payTotalAmount}>{money(payAmount)}</Text>
            </View>
            <Text style={s.payHint}>
              Ticking a month includes every unpaid month before it — fees are paid in order.
            </Text>
            <ActionBtn small label="Pay a different amount instead" onPress={() => setByMonths(false)} />
          </>
        ) : (
          <>
            <Input label="Amount *" value={payForm.amount} onChange={v => setPayForm(f => ({ ...f, amount: v }))} keyboardType="numeric" />
            {unpaidMonths.length > 0 ? (
              <ActionBtn small label="Pay by months instead" onPress={() => setByMonths(true)} />
            ) : null}
          </>
        )}
        <Select label="Payment Mode" value={payForm.paymentMode} onChange={v => setPayForm(f => ({ ...f, paymentMode: v }))} options={MODE_OPTIONS} />
        <Input label="Transaction Reference" value={payForm.transactionRef} onChange={v => setPayForm(f => ({ ...f, transactionRef: v }))} placeholder="UPI ref / cheque no. (optional)" />
        <Input label="Remarks" value={payForm.remarks} onChange={v => setPayForm(f => ({ ...f, remarks: v }))} placeholder="Optional" multiline />
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.primary, borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.md,
  },
  bannerLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  bannerAmount: { fontSize: 28, fontWeight: '700', color: '#fff' },
  bannerSub: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  bannerIcon: { opacity: 0.5 },
  groupLabel: { ...Typography.h4, color: Colors.text, marginBottom: 8, marginTop: 4 },
  waiting: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a',
    borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md,
  },
  waitingText: { flex: 1, ...Typography.caption, color: '#92400e', lineHeight: 18 },
  monthRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 8,
  },
  monthName: { ...Typography.label, color: Colors.text },
  monthSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  payNote: { fontSize: 12, color: Colors.textSecondary, marginBottom: 12, lineHeight: 17 },
  payLabel: { ...Typography.label, color: Colors.text, marginBottom: 6 },
  payTotal: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md,
    padding: Spacing.md, marginTop: Spacing.sm,
  },
  payTotalLabel: { ...Typography.caption, color: Colors.textSecondary },
  payTotalAmount: { ...Typography.h4, color: Colors.text },
  payHint: { fontSize: 11, color: Colors.textLight, marginTop: 6, marginBottom: 8, lineHeight: 16 },
});
