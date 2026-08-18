import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as feesApi from '@/api/fees.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, ActionBtn, SegTabs, Select,
  FormModal, Input, fmtMoney, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

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

  const openPay = () => {
    setPayForm(f => ({ ...f, amount: String(book?.suggestedAmount || book?.dueTotal || '') }));
    setShowPay(true);
  };

  const submitPay = async () => {
    const amt = Number(payForm.amount);
    if (!amt || amt <= 0) return Alert.alert('Invalid', 'Enter a valid amount');
    setPaying(true);
    try {
      const payload = {
        amount: amt, paymentMode: payForm.paymentMode,
        transactionRef: payForm.transactionRef, remarks: payForm.remarks,
      };
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
                    <Text style={s.monthName}>{m.monthName ?? m.month ?? `Month ${i + 1}`}</Text>
                    <Text style={s.monthSub}>
                      {money(m.amount)}{m.amountPaid ? ` · paid ${money(m.amountPaid)}` : ''}
                      {m.amountDue ? ` · due ${money(m.amountDue)}` : ''}
                    </Text>
                  </View>
                  <Badge label={m.payStatus ?? '--'}
                    tone={m.payStatus === 'paid' ? 'success' : m.payStatus === 'due' ? 'danger' : m.payStatus === 'partial' ? 'warning' : 'neutral'} />
                </View>
              ))
            )}

            {tab === 'payments' && (
              payments.length === 0 ? <Empty icon="receipt-outline" text="No payments yet" /> :
              payments.map((pmt: any) => (
                <Card key={pmt._id}>
                  <KV label="Amount" value={money(pmt.amount)} />
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
        <Input label="Amount *" value={payForm.amount} onChange={v => setPayForm(f => ({ ...f, amount: v }))} keyboardType="numeric" />
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
  monthRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 8,
  },
  monthName: { ...Typography.label, color: Colors.text },
  monthSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  payNote: { fontSize: 12, color: Colors.textSecondary, marginBottom: 12, lineHeight: 17 },
});
