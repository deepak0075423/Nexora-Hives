import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as libApi from '@/api/library.api';
import {
  unwrap, LoaderView, Empty, RowItem, FAB, FormModal, Input, Select, Card, KV,
  SectionTitle, confirmAsync, Badge, fmtDate, SegTabs,
} from '@/components/ui/kit';

// The physical copies of one catalogue title. A book with none of these cannot
// be issued or reserved, so this screen is the step between "in the catalogue"
// and "on the shelf".

const CONDITIONS = [
  { label: 'New', value: 'new' }, { label: 'Good', value: 'good' },
  { label: 'Fair', value: 'fair' }, { label: 'Damaged', value: 'damaged' },
];
// 'issued' is missing on purpose — circulation owns that transition.
const MANUAL_STATUSES = [
  { label: 'Available', value: 'available' }, { label: 'Reserved', value: 'reserved' },
  { label: 'Damaged', value: 'damaged' }, { label: 'Lost', value: 'lost' },
];

const EMPTY_ADD = { count: '1', condition: 'new', rackLocation: '', vendor: '', billNumber: '', cost: '' };

export default function LibraryBookCopiesScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();

  const [book, setBook] = useState<any>(null);
  // The endpoint pages the copy list — a class set can run to hundreds — so the
  // screen accumulates pages rather than assuming one response holds them all.
  const [copies, setCopies] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD);
  const [editCopy, setEditCopy] = useState<any>(null);
  const [editForm, setEditForm] = useState({ condition: 'new', rackLocation: '' });

  const load = useCallback(async (p = 1, status = statusFilter) => {
    try {
      const res: any = await libApi.getBook(id, { page: p, limit: 25, status: status || undefined });
      const payload = unwrap(res);
      setBook(payload);
      const rows = payload?.copies ?? [];
      setCopies(prev => (p === 1 ? rows : [...prev, ...rows]));
      setTotal((res as any)?.total ?? rows.length);
      setPage(p);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally { setLoading(false); setRefreshing(false); }
  }, [id, statusFilter]);

  useEffect(() => { setLoading(true); load(1, statusFilter); }, [id, statusFilter]);

  const breakdown = book?.breakdown ?? {};

  const submitAdd = async () => {
    const count = parseInt(addForm.count, 10);
    if (!Number.isInteger(count) || count < 1 || count > 100)
      return Alert.alert('Required', 'Enter a number of copies between 1 and 100');
    setSaving(true);
    try {
      await libApi.addCopies(id, {
        count,
        condition: addForm.condition,
        rackLocation: addForm.rackLocation.trim(),
        vendor: addForm.vendor.trim(),
        billNumber: addForm.billNumber.trim(),
        cost: addForm.cost === '' ? 0 : Number(addForm.cost),
      });
      setShowAdd(false);
      setAddForm(EMPTY_ADD);
      load(1);
      Alert.alert('Added', `${count} ${count === 1 ? 'copy is' : 'copies are'} now on the shelf list.`);
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  const submitEdit = async () => {
    setSaving(true);
    try {
      await libApi.updateCopy(id, editCopy._id, editForm);
      setEditCopy(null);
      load(1);
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  const changeStatus = async (copy: any, status: string, chargeLastBorrower = false) => {
    try {
      const res: any = await libApi.setCopyStatus(id, copy._id, status, chargeLastBorrower);
      load(1);
      if (res?.fine) Alert.alert('Charged', `₹${res.fine.amount} raised against the last borrower.`);
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  // Losing a copy is discovered at stock check, and costs the school a book.
  // Ask whether the person who last had it should pay for it.
  const writeOff = (copy: any, status: 'lost' | 'damaged') => {
    Alert.alert(
      `Mark ${copy.uniqueCode} ${status}`,
      'This takes the copy out of the collection. Charge the person who last had it?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'No charge', onPress: () => changeStatus(copy, status, false) },
        { text: 'Charge them', style: 'destructive', onPress: () => changeStatus(copy, status, true) },
      ],
    );
  };

  const removeCopy = async (copy: any) => {
    if (!(await confirmAsync('Remove Copy', `Remove ${copy.uniqueCode}? This cannot be undone.`, 'Remove'))) return;
    try { await libApi.deleteCopy(id, copy._id); load(1); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const openCopy = (copy: any) => {
    const actions: any[] = [{ text: 'Close', style: 'cancel' }];
    if (copy.status !== 'issued') {
      actions.push({
        text: 'Change status',
        onPress: () => Alert.alert(copy.uniqueCode, 'Mark this copy as…', [
          { text: 'Cancel', style: 'cancel' },
          ...MANUAL_STATUSES.filter(s => s.value !== copy.status).map(s => ({
            text: s.label,
            onPress: () => (s.value === 'lost' || s.value === 'damaged')
              ? writeOff(copy, s.value as 'lost' | 'damaged')
              : changeStatus(copy, s.value),
          })),
        ]),
      });
      actions.push({
        text: 'Edit',
        onPress: () => {
          setEditForm({ condition: copy.condition || 'new', rackLocation: copy.rackLocation || '' });
          setEditCopy(copy);
        },
      });
      actions.push({ text: 'Remove', style: 'destructive', onPress: () => removeCopy(copy) });
    }
    Alert.alert(
      copy.uniqueCode,
      [`Status: ${copy.status}`, `Condition: ${copy.condition || '--'}`, `Rack: ${copy.rackLocation || '--'}`,
       copy.vendor ? `Vendor: ${copy.vendor}` : '', copy.billNumber ? `Bill: ${copy.billNumber}` : '',
       copy.cost ? `Cost: ₹${copy.cost}` : ''].filter(Boolean).join('\n'),
      actions,
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: title || book?.title || 'Copies' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1); }} tintColor={Colors.primary} />}
        >
          {loading ? <LoaderView /> : (
            <>
              <Card>
                <KV label="Title" value={book?.title} />
                <KV label="Author(s)" value={(book?.authors ?? []).join(', ') || '--'} />
                {book?.isbn ? <KV label="ISBN" value={book.isbn} /> : null}
                <KV label="Availability" value={`${book?.availableCopies ?? 0} available of ${book?.totalCopies ?? 0}`} />
              </Card>

              {copies.length === 0 && (
                <Card style={{ marginTop: Spacing.md }}>
                  <Text style={{ color: Colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                    No physical copies yet — this title cannot be issued or reserved until at
                    least one copy is registered. Tap + to add them.
                  </Text>
                </Card>
              )}

              <SectionTitle>Copies ({total})</SectionTitle>
              <SegTabs
                tabs={[
                  { key: '', label: 'All' },
                  { key: 'available', label: `Shelf ${breakdown.available ?? 0}` },
                  { key: 'issued', label: `Out ${breakdown.issued ?? 0}` },
                  { key: 'lost', label: `Lost ${breakdown.lost ?? 0}` },
                  { key: 'damaged', label: `Damaged ${breakdown.damaged ?? 0}` },
                ]}
                active={statusFilter}
                onChange={setStatusFilter}
              />
              {copies.length === 0 ? (
                <Empty icon="book-outline" text="No copies match" />
              ) : copies.map((c: any) => (
                <RowItem
                  key={c._id}
                  icon="bookmark" iconColor="#7C3AED" iconBg="#EDE9FE"
                  title={c.uniqueCode}
                  sub={`${c.condition || 'unknown'}${c.rackLocation ? ` · Rack ${c.rackLocation}` : ''}${c.acquisitionDate ? ` · ${fmtDate(c.acquisitionDate)}` : ''}`}
                  right={<Badge label={c.status} />}
                  onPress={() => openCopy(c)}
                />
              ))}
              {copies.length < total && (
                <TouchableOpacity onPress={() => load(page + 1)} style={{ padding: 14, alignItems: 'center' }}>
                  <Text style={{ color: Colors.accent, fontWeight: '600', fontSize: 13 }}>
                    Load more ({copies.length}/{total})
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
        <FAB onPress={() => setShowAdd(true)} />
      </View>

      <FormModal visible={showAdd} title="Add Copies" onClose={() => setShowAdd(false)} onSubmit={submitAdd} submitting={saving} submitLabel="Add Copies">
        <Input label="Number of copies *" value={addForm.count} keyboardType="numeric"
          onChange={v => setAddForm(f => ({ ...f, count: v.replace(/[^0-9]/g, '') }))} placeholder="e.g. 10" />
        <Select label="Condition" value={addForm.condition} options={CONDITIONS}
          onChange={v => setAddForm(f => ({ ...f, condition: v }))} />
        <Input label="Rack location" value={addForm.rackLocation}
          onChange={v => setAddForm(f => ({ ...f, rackLocation: v }))} placeholder="e.g. A-01" />
        <Input label="Vendor" value={addForm.vendor}
          onChange={v => setAddForm(f => ({ ...f, vendor: v }))} placeholder="Who it was bought from" />
        <Input label="Bill number" value={addForm.billNumber}
          onChange={v => setAddForm(f => ({ ...f, billNumber: v }))} placeholder="Invoice reference" />
        <Input label="Cost per copy (₹)" value={addForm.cost} keyboardType="numeric"
          onChange={v => setAddForm(f => ({ ...f, cost: v.replace(/[^0-9.]/g, '') }))} placeholder="0" />
        <Text style={{ color: Colors.textLight, fontSize: 12, paddingHorizontal: 2 }}>
          Each copy gets its own code, e.g. LIB-COPY-000042, and its own accession record.
        </Text>
      </FormModal>

      <FormModal visible={!!editCopy} title={editCopy?.uniqueCode ?? 'Edit Copy'} onClose={() => setEditCopy(null)} onSubmit={submitEdit} submitting={saving} submitLabel="Save">
        <Select label="Condition" value={editForm.condition} options={CONDITIONS}
          onChange={v => setEditForm(f => ({ ...f, condition: v }))} />
        <Input label="Rack location" value={editForm.rackLocation}
          onChange={v => setEditForm(f => ({ ...f, rackLocation: v }))} placeholder="e.g. A-01" />
      </FormModal>
    </>
  );
}
