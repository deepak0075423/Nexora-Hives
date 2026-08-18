import React, { useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as libApi from '@/api/library.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, RowItem, Badge, SegTabs, FAB, FormModal,
  Input, Select, ActionBtn, KV, confirmAsync, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

export default function LibraryCirculationScreen() {
  const [tab, setTab] = useState('issued');
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  // Issue flow
  const [showIssue, setShowIssue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bookQ, setBookQ] = useState('');
  const [bookResults, setBookResults] = useState<any[]>([]);
  const [book, setBook] = useState<any>(null);
  const [copies, setCopies] = useState<any[]>([]);
  const [issueForm, setIssueForm] = useState({ copyId: '', userId: '', userRole: 'student' });

  const load = async (st = tab) => {
    try {
      const res: any = await libApi.getIssuances({ page: 1, limit: 50, ...(st ? { status: st } : {}) });
      setList((res as any)?.data ?? []);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code) || err?.status === 403) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);
  const changeTab = (st: string) => { setTab(st); setLoading(true); load(st); };

  const searchBooks = async () => {
    try {
      const res: any = await libApi.getBooks({ page: 1, limit: 15, q: bookQ });
      setBookResults((res as any)?.data ?? []);
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  const pickBook = async (b: any) => {
    setBook(b); setBookResults([]);
    try {
      const d = unwrap(await libApi.getIssueForm({ bookId: b._id }));
      setCopies(d?.copies ?? []);
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  const submitIssue = async () => {
    if (!book || !issueForm.copyId || !issueForm.userId.trim())
      return Alert.alert('Required', 'Pick a book, a copy, and enter the member User ID');
    setSaving(true);
    try {
      await libApi.issueBook({
        bookId: book._id, copyId: issueForm.copyId,
        userId: issueForm.userId.trim(), userRole: issueForm.userRole,
      });
      setShowIssue(false);
      setBook(null); setBookQ(''); setCopies([]);
      setIssueForm({ copyId: '', userId: '', userRole: 'student' });
      changeTab('issued');
      Alert.alert('Issued', 'Book issued successfully.');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  const doReturn = async (iss: any) => {
    if (!(await confirmAsync('Return Book', `Return "${iss.book?.title}" from ${iss.issuedTo?.name}? Late fines are applied automatically.`, 'Return'))) return;
    try {
      const d = unwrap(await libApi.returnBook({ issuanceId: iss._id }));
      load();
      if (d?.fine) Alert.alert('Returned with fine', `A late fine of ₹${d.fine.amount} was created.`);
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  const doRenew = async (iss: any) => {
    if (!(await confirmAsync('Renew Book', `Renew "${iss.book?.title}" for ${iss.issuedTo?.name}?`, 'Renew'))) return;
    try { await libApi.renewBook(iss._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Circulation' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Circulation' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          <SegTabs
            tabs={[{ key: 'issued', label: 'Issued' }, { key: 'overdue', label: 'Overdue' }, { key: 'returned', label: 'Returned' }, { key: '', label: 'All' }]}
            active={tab} onChange={changeTab}
          />
          {loading ? <LoaderView /> : list.length === 0 ? (
            <Empty icon="swap-horizontal-outline" text="No issuances here" />
          ) : (
            list.map((iss: any) => (
              <View key={iss._id} style={{ marginBottom: 4 }}>
                <RowItem
                  icon="book" iconColor="#059669" iconBg="#D1FAE5"
                  title={iss.book?.title ?? '--'}
                  sub={`${iss.issuedTo?.name ?? '--'} (${iss.issuedToRole || 'member'}) · ${fmtDate(iss.issueDate)} → due ${fmtDate(iss.dueDate)}`}
                  right={<Badge label={iss.status} />}
                />
                {(iss.status === 'issued' || iss.status === 'overdue') && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: -4, marginBottom: 8 }}>
                    <View style={{ flex: 1 }}>
                      <ActionBtn label="Return" tone="success" small onPress={() => doReturn(iss)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ActionBtn label="Renew" tone="info" small onPress={() => doRenew(iss)} />
                    </View>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
        <FAB icon="add" onPress={() => setShowIssue(true)} />
      </View>

      <FormModal visible={showIssue} title="Issue Book" onClose={() => setShowIssue(false)} onSubmit={submitIssue} submitting={saving} submitLabel="Issue Book">
        {book ? (
          <View style={{ marginBottom: 8 }}>
            <KV label="Book" value={book.title} />
            <ActionBtn label="Change Book" tone="neutral" small onPress={() => { setBook(null); setCopies([]); setIssueForm(f => ({ ...f, copyId: '' })); }} />
          </View>
        ) : (
          <>
            <Input label="Search book" value={bookQ} onChange={setBookQ} placeholder="Title or ISBN" />
            <ActionBtn label="Search" tone="info" onPress={searchBooks} />
            {bookResults.map((b: any) => (
              <RowItem key={b._id} title={b.title}
                sub={`${(b.authors ?? []).join(', ')} · ${b.availableCopies ?? 0} available`}
                onPress={() => pickBook(b)} />
            ))}
            <View style={{ height: 8 }} />
          </>
        )}
        {book && (
          <Select label="Copy *" value={issueForm.copyId} onChange={v => setIssueForm(f => ({ ...f, copyId: v }))}
            options={copies.map((c: any) => ({ label: c.uniqueCode ?? c._id, value: c._id }))}
            placeholder={copies.length ? 'Pick an available copy' : 'No copies available'} />
        )}
        <Input label="Member User ID *" value={issueForm.userId} onChange={v => setIssueForm(f => ({ ...f, userId: v }))}
          placeholder="Paste the member's user ID" />
        <Select label="Member Role" value={issueForm.userRole} onChange={v => setIssueForm(f => ({ ...f, userRole: v }))}
          options={[{ label: 'Student', value: 'student' }, { label: 'Teacher', value: 'teacher' }]} />
      </FormModal>
    </>
  );
}
