import React, { useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as feesApi from '@/api/fees.api';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, ActionBtn, SegTabs, FAB,
  FormModal, Input, Select, RowItem, confirmAsync, fmtMoney, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

const MODE_OPTIONS = [
  { label: 'Cash', value: 'cash' },
  { label: 'UPI', value: 'upi' },
  { label: 'Card', value: 'card' },
  { label: 'Bank Transfer', value: 'bank_transfer' },
  { label: 'Cheque', value: 'cheque' },
];

const TABS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected', label: 'Rejected' },
];

export default function AdminFeesPaymentsScreen() {
  const [status, setStatus] = useState('pending');
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  // Record payment
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [studentQ, setStudentQ] = useState('');
  const [studentResults, setStudentResults] = useState<any[]>([]);
  const [student, setStudent] = useState<any>(null);
  const [form, setForm] = useState({ amount: '', paymentMode: 'cash', transactionRef: '', remarks: '' });

  const load = async (st = status) => {
    try {
      const res: any = await feesApi.getPayments({ page: 1, limit: 50, ...(st ? { paymentStatus: st } : {}) });
      setList((res as any)?.data ?? []);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);
  const changeTab = (st: string) => { setStatus(st); setLoading(true); load(st); };

  const approve = async (p: any) => {
    if (!(await confirmAsync('Approve Payment', `Approve ${fmtMoney(p.amount)} from ${p.student?.name}? This posts the ledger credit and issues a receipt.`, 'Approve'))) return;
    try { await feesApi.approvePayment(p._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const reject = async (p: any) => {
    if (!(await confirmAsync('Reject Payment', `Reject ${fmtMoney(p.amount)} from ${p.student?.name}?`, 'Reject'))) return;
    try { await feesApi.rejectPayment(p._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const searchStudents = async () => {
    try {
      const d = unwrap(await adminApi.getStudents({ page: 1, limit: 15, search: studentQ }));
      setStudentResults(d?.data ?? []);
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  const submit = async () => {
    if (!student) return Alert.alert('Required', 'Pick a student first');
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0)
      return Alert.alert('Required', 'Enter a valid amount');
    setSaving(true);
    try {
      await feesApi.recordPayment({
        studentId: student._id,
        amount: Number(form.amount),
        paymentMode: form.paymentMode,
        transactionRef: form.transactionRef,
        remarks: form.remarks,
      });
      setShowForm(false);
      setStudent(null); setStudentQ(''); setStudentResults([]);
      setForm({ amount: '', paymentMode: 'cash', transactionRef: '', remarks: '' });
      load();
      Alert.alert('Recorded', 'Payment recorded and receipt issued.');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Payments' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Fee Payments' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          <SegTabs tabs={TABS} active={status} onChange={changeTab} />
          {loading ? <LoaderView /> : list.length === 0 ? (
            <Empty icon="receipt-outline" text="No payments here" />
          ) : (
            list.map((p: any) => (
              <Card key={p._id}>
                <KV label="Student" value={p.student?.name ?? '--'} />
                <KV label="Amount" value={fmtMoney(p.amount)} />
                <KV label="Mode" value={p.paymentMode ?? '--'} />
                <KV label="Date" value={fmtDate(p.paymentDate)} />
                {p.receiptNumber ? <KV label="Receipt" value={p.receiptNumber} /> : null}
                {p.collectedBy?.name ? <KV label="Collected by" value={p.collectedBy.name} /> : null}
                <KV label="Status" value={<Badge label={p.paymentStatus} />} />
                {p.paymentStatus === 'pending' && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <View style={{ flex: 1 }}>
                      <ActionBtn label="Approve" tone="success" onPress={() => approve(p)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ActionBtn label="Reject" tone="danger" onPress={() => reject(p)} />
                    </View>
                  </View>
                )}
              </Card>
            ))
          )}
        </ScrollView>
        <FAB onPress={() => setShowForm(true)} />
      </View>

      <FormModal visible={showForm} title="Record Payment" onClose={() => setShowForm(false)} onSubmit={submit} submitting={saving} submitLabel="Record Payment">
        {student ? (
          <View style={{ marginBottom: 8 }}>
            <KV label="Student" value={`${student.name} (${student.email})`} />
            <ActionBtn label="Change" tone="neutral" small onPress={() => setStudent(null)} />
          </View>
        ) : (
          <>
            <Input label="Search student" value={studentQ} onChange={setStudentQ} placeholder="Name or email" />
            <ActionBtn label="Search" tone="info" onPress={searchStudents} />
            {studentResults.map((st: any) => (
              <RowItem key={st._id} title={st.name} sub={st.email}
                onPress={() => { setStudent(st); setStudentResults([]); }} />
            ))}
            <View style={{ height: 8 }} />
          </>
        )}
        <Input label="Amount (₹) *" value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} keyboardType="numeric" placeholder="0" />
        <Select label="Payment Mode" value={form.paymentMode} onChange={v => setForm(f => ({ ...f, paymentMode: v }))} options={MODE_OPTIONS} />
        <Input label="Transaction Ref" value={form.transactionRef} onChange={v => setForm(f => ({ ...f, transactionRef: v }))} placeholder="Optional" />
        <Input label="Remarks" value={form.remarks} onChange={v => setForm(f => ({ ...f, remarks: v }))} placeholder="Optional" multiline />
      </FormModal>
    </>
  );
}
