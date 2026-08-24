import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { FocusRow } from '@/components/FocusHighlight';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import * as inv from '@/api/inventory.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Colors, Spacing, Radius } from '@/constants/theme';
import {
  unwrap, LoaderView, Empty, Badge, RowItem, FAB, FormModal, Input, Select, fmtMoney, confirmAsync,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

const PRIORITY = [
  { label: 'Low', value: 'low' }, { label: 'Normal', value: 'normal' },
  { label: 'High', value: 'high' }, { label: 'Urgent', value: 'urgent' },
];
const blankLine = () => ({ itemName: '', quantity: '1', estimatedPrice: '' });
const listOf = (res: any) => { const d = unwrap(res); return d?.data ?? d?.items ?? (Array.isArray(d) ? d : []); };

export default function InventoryRequestsScreen() {
  // First hook in the component on purpose: the early module-disabled
  // return sits below, and a hook after it would not run every render.
  // Held so a notification can scroll its record into view.
  const scrollRef = useRef<ScrollView>(null);
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [depts, setDepts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<any>({ department: '', priority: 'normal', reason: '', lines: [blankLine()] });

  const load = useCallback(async () => {
    try {
      setRows(listOf(await inv.getMyRequests()));
      const meta = unwrap(await inv.getTeacherMeta());
      setDepts(meta?.departments || []);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { if (user?.role) load(); }, [user?.role]); // eslint-disable-line

  const setLine = (i: number, k: string, v: string) =>
    setForm((f: any) => ({ ...f, lines: f.lines.map((l: any, idx: number) => idx === i ? { ...l, [k]: v } : l) }));
  const addLine = () => setForm((f: any) => ({ ...f, lines: [...f.lines, blankLine()] }));
  const rmLine = (i: number) => setForm((f: any) => ({ ...f, lines: f.lines.filter((_: any, idx: number) => idx !== i) }));

  const open = () => { setForm({ department: '', priority: 'normal', reason: '', lines: [blankLine()] }); setShow(true); };
  const submit = async () => {
    const valid = form.lines.filter((l: any) => l.itemName && Number(l.quantity) > 0);
    if (!valid.length) return Alert.alert('Add items', 'Add at least one item with a quantity.');
    setSubmitting(true);
    try {
      await inv.createMyRequest({
        department: form.department || null, priority: form.priority, reason: form.reason,
        items: valid.map((l: any) => ({ item: null, itemName: l.itemName, quantity: Number(l.quantity), unit: 'Nos', estimatedPrice: Number(l.estimatedPrice) || 0 })),
      });
      setShow(false); load();
      Alert.alert('Submitted', 'Your purchase request has been sent for approval.');
    } catch (err: any) { Alert.alert('Error', err?.message || 'Failed'); }
    finally { setSubmitting(false); }
  };
  const cancelReq = async (r: any) => {
    if (!(await confirmAsync('Cancel request', `Cancel ${r.requestNumber}?`))) return;
    try { await inv.cancelMyRequest(r._id); load(); } catch (err: any) { Alert.alert('Error', err?.message || 'Failed'); }
  };

  if (disabled) return <><Stack.Screen options={{ title: 'Inventory' }} /><ModuleDisabled /></>;
  if (loading) return <><Stack.Screen options={{ title: 'Inventory' }} /><LoaderView /></>;

  return (
    <>
      <Stack.Screen options={{ title: 'My Requests' }} />
      <ScrollView ref={scrollRef} style={s.root} contentContainerStyle={{ padding: Spacing.md, paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        {rows.length === 0 ? <Empty icon="document-text-outline" text="No requests yet. Tap + to raise one." />
          : rows.map((r) => (
            <FocusRow key={r._id} id={r._id} scrollRef={scrollRef}>
            <RowItem icon="document-text" title={r.requestNumber || 'Request'}
              sub={`${r.items?.length || 0} item(s) · ${fmtMoney(r.estimatedTotal)} · ${new Date(r.createdAt).toLocaleDateString()}`}
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Badge label={r.status?.replace(/_/g, ' ')} />
                  {r.status === 'pending' && (
                    <TouchableOpacity onPress={() => cancelReq(r)}><Ionicons name="close-circle" size={20} color={Colors.danger} /></TouchableOpacity>
                  )}
                </View>
              } />
            </FocusRow>
          ))}
      </ScrollView>

      <FAB icon="add" onPress={open} />

      <FormModal visible={show} title="New Purchase Request" onClose={() => setShow(false)}
        onSubmit={submit} submitting={submitting} submitLabel="Submit">
        <Select label="Department" value={form.department}
          options={[{ label: '— None —', value: '' }, ...depts.map((d: any) => ({ label: d.name, value: d._id }))]}
          onChange={v => setForm((f: any) => ({ ...f, department: v }))} />
        <Select label="Priority" value={form.priority} options={PRIORITY}
          onChange={v => setForm((f: any) => ({ ...f, priority: v }))} />

        <Text style={s.h}>Items</Text>
        {form.lines.map((l: any, i: number) => (
          <View key={i} style={s.lineCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={s.lineNo}>Item {i + 1}</Text>
              {form.lines.length > 1 && (
                <TouchableOpacity onPress={() => rmLine(i)}><Ionicons name="trash-outline" size={16} color={Colors.danger} /></TouchableOpacity>
              )}
            </View>
            <Input label="Name" value={l.itemName} onChange={v => setLine(i, 'itemName', v)} placeholder="e.g. Whiteboard markers" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Input label="Qty" value={l.quantity} onChange={v => setLine(i, 'quantity', v)} keyboardType="numeric" /></View>
              <View style={{ flex: 1 }}><Input label="Est. price" value={l.estimatedPrice} onChange={v => setLine(i, 'estimatedPrice', v)} keyboardType="numeric" /></View>
            </View>
          </View>
        ))}
        <TouchableOpacity style={s.addLine} onPress={addLine}>
          <Ionicons name="add" size={16} color={Colors.primary} />
          <Text style={s.addLineText}>Add item</Text>
        </TouchableOpacity>

        <Input label="Reason / Justification" value={form.reason} onChange={v => setForm((f: any) => ({ ...f, reason: v }))} multiline />
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  h: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  lineCard: { backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  lineNo: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, marginBottom: 4 },
  addLine: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, marginBottom: 6 },
  addLineText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
});
