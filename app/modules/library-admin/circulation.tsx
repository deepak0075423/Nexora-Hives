import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert } from 'react-native';
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
  const [tab, setTab] = useState('');   // All — matches the web default
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

  // Member lookup. The form used to ask the librarian to paste a user id,
  // because the only search in the app was admin-only and refused a
  // Librarian-designated teacher. This is the library's own lookup.
  const [memberQ, setMemberQ] = useState('');
  const [memberHits, setMemberHits] = useState<any[]>([]);
  const [member, setMember] = useState<any>(null);

  useEffect(() => {
    if (member || memberQ.trim().length < 2) { setMemberHits([]); return; }
    let live = true;
    const t = setTimeout(async () => {
      try {
        const res: any = await libApi.searchMembers(memberQ.trim());
        if (live) setMemberHits((res as any)?.data ?? []);
      } catch { if (live) setMemberHits([]); }
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [memberQ, member]);

  const resetIssue = () => {
    setBook(null); setBookQ(''); setCopies([]); setBookResults([]);
    setMember(null); setMemberQ(''); setMemberHits([]);
    setIssueForm({ copyId: '', userId: '', userRole: 'student' });
  };

  const submitIssue = async () => {
    if (!book || !issueForm.copyId || !issueForm.userId)
      return Alert.alert('Required', 'Pick a book, a copy and a member');
    setSaving(true);
    try {
      await libApi.issueBook({
        bookId: book._id, copyId: issueForm.copyId, userId: issueForm.userId,
      });
      setShowIssue(false);
      resetIssue();
      changeTab('issued');
      Alert.alert('Issued', 'Book issued successfully.');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  // ── Scanner ────────────────────────────────────────────────────────────────
  // A Bluetooth scanner types the code into this field and submits. One scan
  // tells the desk whether the next move is an issue or a return.
  const [showScan, setShowScan] = useState(false);
  const [scanCode, setScanCode] = useState('');
  const [scanned, setScanned] = useState<any>(null);

  const runScan = async () => {
    const code = scanCode.trim();
    if (!code) return;
    try {
      const d = unwrap(await libApi.scanCopy(code));
      setScanned(d);
      setScanCode('');
    } catch (err: any) { setScanned(null); Alert.alert('Not found', err.message); }
  };

  const scanReturn = (condition: 'good' | 'damaged' | 'lost') => {
    setShowScan(false);
    submitReturn(scanned.issuance, condition);
    setScanned(null);
  };

  const scanIssue = () => {
    setShowScan(false);
    setBook(scanned.book);
    setCopies([scanned.copy]);
    setIssueForm({ copyId: scanned.copy._id, userId: '', userRole: 'student' });
    setMember(null); setMemberQ('');
    setScanned(null);
    setShowIssue(true);
  };

  // How the book came back decides whether the copy goes on the shelf and what
  // the borrower is charged, so the counter has to say.
  const submitReturn = async (iss: any, condition: 'good' | 'damaged' | 'lost', fineAmount?: number) => {
    try {
      const d = unwrap(await libApi.returnBook({
        issuanceId: iss._id, condition,
        ...(fineAmount !== undefined ? { fineAmount } : {}),
      }));
      load();
      if (d?.fine) {
        const label = d.fine.fineType === 'lost' ? 'Lost book' : d.fine.fineType === 'damaged' ? 'Damaged book' : 'Late return';
        Alert.alert('Recorded with fine', `${label} — a fine of ₹${d.fine.amount} was created.`);
      }
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  // A damaged or lost book can be charged at what it actually cost, rather than
  // the policy multiple — so those two open a small form instead of acting.
  const [damaged, setDamaged] = useState<any>(null);
  const [damageCondition, setDamageCondition] = useState<'damaged' | 'lost'>('damaged');
  const [damagePrice, setDamagePrice] = useState('');

  const doReturn = async (iss: any) => {
    Alert.alert(
      'Return Book',
      `"${iss.book?.title}" from ${iss.issuedTo?.name}. How did it come back?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Good condition', onPress: () => submitReturn(iss, 'good') },
        { text: 'Damaged', onPress: () => { setDamageCondition('damaged'); setDamagePrice(''); setDamaged(iss); } },
        { text: 'Lost', style: 'destructive', onPress: () => { setDamageCondition('lost'); setDamagePrice(''); setDamaged(iss); } },
      ],
    );
  };

  const submitDamaged = async () => {
    const priced = damagePrice.trim() === '' ? undefined : Number(damagePrice);
    if (priced !== undefined && (!Number.isFinite(priced) || priced < 0))
      return Alert.alert('Check the amount', 'Enter a charge of zero or more.');
    const iss = damaged;
    setDamaged(null);
    await submitReturn(iss, damageCondition, priced);
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
        <View style={{ position: 'absolute', right: 20, bottom: 92 }}>
          <ActionBtn label="📷 Scan" tone="info" onPress={() => { setScanned(null); setScanCode(''); setShowScan(true); }} />
        </View>
        <FAB icon="add" onPress={() => { resetIssue(); setShowIssue(true); }} />
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
        {member ? (
          <View style={{ marginBottom: 8 }}>
            <KV label="Member" value={`${member.name}${member.identifier ? ` · ${member.identifier}` : ''}`} />
            <KV label="Currently has" value={`${member.booksOut} book(s)${member.finesDue ? ` · ₹${member.finesDue} owed` : ''}`} />
            <ActionBtn label="Change Member" tone="neutral" small
              onPress={() => { setMember(null); setIssueForm(f => ({ ...f, userId: '' })); }} />
          </View>
        ) : (
          <>
            <Input label="Member *" value={memberQ} onChange={setMemberQ}
              placeholder="Search by name or admission number" />
            {memberHits.map((m: any) => (
              <RowItem key={m._id} title={m.name}
                sub={[m.identifier, m.detail, `${m.booksOut} out`, m.finesDue ? `₹${m.finesDue} owed` : '']
                  .filter(Boolean).join(' · ')}
                right={m.overdue > 0 ? <Badge label={`${m.overdue} overdue`} tone="danger" /> : undefined}
                onPress={() => {
                  setMember(m); setMemberHits([]); setMemberQ('');
                  setIssueForm(f => ({ ...f, userId: m._id, userRole: m.role }));
                }} />
            ))}
          </>
        )}
      </FormModal>

      <FormModal visible={!!damaged} title={damageCondition === 'lost' ? 'Book reported lost' : 'Book returned damaged'}
        onClose={() => setDamaged(null)} onSubmit={submitDamaged} submitting={false}
        submitLabel={damageCondition === 'lost' ? 'Record as lost' : 'Record as damaged'}>
        <KV label="Book" value={damaged?.book?.title} />
        <KV label="Borrower" value={damaged?.issuedTo?.name} />
        <Input label="Charge (₹)" value={damagePrice} keyboardType="numeric"
          onChange={v => setDamagePrice(v.replace(/[^0-9.]/g, ''))} placeholder="Policy rate" />
        <Text style={{ color: Colors.textLight, fontSize: 12, paddingHorizontal: 2 }}>
          Leave blank to charge the rate in the library policy, or enter what the book actually cost.
          Any late fine is added on top.
        </Text>
      </FormModal>

      <FormModal visible={showScan} title="Scan a copy" onClose={() => { setShowScan(false); setScanned(null); }}
        onSubmit={runScan} submitting={false} submitLabel="Look up">
        <Input label="Copy code" value={scanCode} onChange={setScanCode}
          placeholder="Scan the spine label, or type LIB-COPY-000042" />
        {scanned && (
          <View style={{ marginTop: 12 }}>
            <KV label="Book" value={scanned.book?.title} />
            <KV label="Copy" value={`${scanned.copy?.uniqueCode} · ${scanned.copy?.status}`} />
            {scanned.action === 'return' && (
              <>
                <KV label="Out with" value={`${scanned.issuance?.issuedTo?.name} · due ${fmtDate(scanned.issuance?.dueDate)}`} />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <ActionBtn label="Return" tone="success" small onPress={() => scanReturn('good')} />
                  <ActionBtn label="Damaged" tone="warning" small onPress={() => scanReturn('damaged')} />
                  <ActionBtn label="Lost" tone="danger" small onPress={() => scanReturn('lost')} />
                </View>
              </>
            )}
            {scanned.action === 'issue' && (
              <View style={{ marginTop: 10 }}>
                <ActionBtn label="Issue this copy" tone="success" onPress={scanIssue} />
              </View>
            )}
            {scanned.action === 'blocked' && (
              <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 8 }}>
                This copy is marked {scanned.copy?.status}, so it cannot be issued.
              </Text>
            )}
          </View>
        )}
      </FormModal>
    </>
  );
}
