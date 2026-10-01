/**
 * Inventory → My Requests (teacher), on the phone.
 *
 * The same screen as the web (school-frontend/src/pages/inventory/teacher):
 * what this teacher has asked the office for, and where each ask has got to.
 * Four state tiles, pill tabs over the same counts, and the table's columns
 * folded into a card per request.
 *
 * Two things the old screen could not do, both fixed here:
 *   • every line was posted with `item: null`, so a teacher could never pick a
 *     catalogue item and an approver got names to match up by hand;
 *   • there was no way to see what happened to a request beyond a status word —
 *     no approver, no comment, no lines.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FocusRow } from '@/components/FocusHighlight';
import { useAuth } from '@/contexts/AuthContext';
import * as inv from '@/api/inventory.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Colors, Spacing } from '@/constants/theme';
import { unwrap, LoaderView, FAB, confirmAsync, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import {
  Head, Tiles, Tile, Tabs, Panel, Pill, StatusPill, Thumb, Rec, Facts, Fact, Note, Blank, Btn,
  Sheet, Step, Field, Box, Pick, ItemPick, Muted,
  TINT, PRIORITY, OUTCOME, words, count, money, plural, fmtDay, ago,
} from '@/components/inventory/parts';

const REASON_MAX = 500;
const blank = () => ({ item: '', itemName: '', quantity: '1', price: '' });
const usable = (l: any) => !!(l.item || String(l.itemName || '').trim());

export default function InventoryRequestsScreen() {
  // First hook on purpose: the module-disabled return sits below, and a hook
  // after it would not run every render.
  const scrollRef = useRef<ScrollView>(null);
  const { user } = useAuth();

  const [board, setBoard] = useState<any>(undefined);
  const [meta, setMeta] = useState<any>({ items: [], departments: [] });
  const [tab, setTab] = useState('all');
  const [disabled, setDisabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [view, setView] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({ department: '', priority: 'normal', purpose: '', reason: '', lines: [blank()] });
  const [tried, setTried] = useState(false);

  const load = useCallback(async (which = tab) => {
    try {
      const [b, m] = await Promise.all([
        inv.getMyRequestBoard({ tab: which, limit: 50 }),
        inv.getTeacherMeta(),
      ]);
      setBoard(unwrap(b) || {});
      setMeta(unwrap(m) || { items: [], departments: [] });
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else setBoard(null);
    } finally { setRefreshing(false); }
  }, [tab]);

  useEffect(() => { if (user?.role) load(tab); }, [user?.role, tab]); // eslint-disable-line

  // ── The form ────────────────────────────────────────────────────────────
  const setLine = (i: number, patch: any) =>
    setForm((f: any) => ({ ...f, lines: f.lines.map((l: any, j: number) => (j === i ? { ...l, ...patch } : l)) }));

  const live = form.lines.filter((l: any) => usable(l) && Number(l.quantity) > 0);
  const estimated = live.reduce((t: number, l: any) => t + Number(l.quantity || 0) * Number(l.price || 0), 0);
  const dept = (meta.departments || []).find((d: any) => String(d._id) === String(form.department));

  const errors = useMemo(() => {
    const e: any = {};
    if (!form.department) e.department = 'Pick the department this is for';
    if (!String(form.purpose).trim()) e.purpose = 'Say what the items are for';
    if (!live.length) e.lines = 'Add at least one item — choose one from the catalogue or type a name';
    return e;
  }, [form.department, form.purpose, live.length]);

  const openForm = () => {
    setForm({ department: '', priority: 'normal', purpose: '', reason: '', lines: [blank()] });
    setTried(false); setShow(true);
  };

  const submit = async () => {
    setTried(true);
    const first = Object.keys(errors)[0];
    if (first) return Alert.alert('Not ready yet', errors[first]);
    setBusy(true);
    try {
      await inv.createMyRequest({
        department: form.department || null,
        priority: form.priority,
        // The purpose is the headline; the justification, when there is one, is
        // the detail behind it. The server stores one reason, so they are
        // joined here rather than one of them being dropped.
        reason: [String(form.purpose).trim(), String(form.reason || '').trim()].filter(Boolean).join(' — '),
        items: live.map((l: any) => {
          const it = (meta.items || []).find((x: any) => String(x._id) === String(l.item));
          return {
            item: l.item || null,
            itemName: l.itemName || it?.name || '',
            quantity: Number(l.quantity) || 0,
            unit: it?.unit || 'Nos',
            estimatedPrice: Number(l.price) || 0,
          };
        }),
      });
      setShow(false);
      await load(tab);
      Alert.alert('Submitted', 'Your request has been sent. You will hear when somebody acts on it.');
    } catch (err: any) {
      Alert.alert('Not submitted', err?.message || 'That request could not be submitted.');
    } finally { setBusy(false); }
  };

  const cancelReq = async (r: any) => {
    if (!(await confirmAsync('Cancel request', `${r.requestNumber} will be withdrawn and nobody will be asked to act on it.`))) return;
    try { setView(null); await inv.cancelMyRequest(r._id); await load(tab); }
    catch (err: any) { Alert.alert('Not cancelled', err?.message || 'That request could not be cancelled.'); }
  };

  if (disabled) return <><Stack.Screen options={{ title: 'Inventory' }} /><ModuleDisabled /></>;
  if (board === undefined) return <><Stack.Screen options={{ title: 'My Requests' }} /><LoaderView /></>;

  const t = board?.tiles || {};
  const tabs = board?.tabs || {};
  const rows: any[] = board?.rows || [];

  return (
    <>
      <Stack.Screen options={{ title: 'My Requests' }} />
      <ScrollView
        ref={scrollRef} style={s.root}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(tab); }} />}
      >
        <Head
          title="My Purchase Requests"
          subtitle="Request items from the inventory department and track their status."
        />

        <Tiles>
          <Tile icon="document-text-outline" tone="indigo" value={count(t.total)} label="Total Requests" />
          <Tile icon="time-outline" tone="amber" value={count(t.pending)} label="Pending Approval"
            caption={t.pending ? 'You can still cancel these' : undefined} />
          <Tile icon="checkmark-circle-outline" tone="green" value={count(t.approved)} label="Approved" />
          <Tile icon="close-circle-outline" tone="red" value={count(t.rejected)} label="Rejected" />
        </Tiles>

        <Tabs
          value={tab} onChange={(k) => { setBoard(undefined); setTab(k); }}
          items={[
            { key: 'all', label: 'All', count: tabs.all },
            { key: 'pending', label: 'Pending', count: tabs.pending },
            { key: 'approved', label: 'Approved', count: tabs.approved },
            { key: 'rejected', label: 'Rejected', count: tabs.rejected },
            { key: 'draft', label: 'Draft', count: tabs.draft },
          ]}
        />

        <View style={{ height: 12 }} />

        {rows.length === 0 ? (
          <Blank
            icon="document-text-outline"
            title={tab === 'all' ? 'You have not asked for anything yet' : 'Nothing in this tab'}
            body={tab === 'all'
              ? 'Ask for what you need — chalk, lab supplies, a replacement projector. If the school already has it, it is issued to you rather than bought.'
              : 'Try another tab.'}
            action={tab === 'all' ? <Btn kind="primary" icon="add" onPress={openForm}>Raise your first request</Btn> : undefined}
          />
        ) : rows.map((r) => (
          <FocusRow key={r._id} id={r._id} scrollRef={scrollRef}>
            <Rec
              image={r.lead?.image} icon={r.lead?.icon}
              title={r.lead?.name || 'No items'}
              sub={r.reason}
              right={<StatusPill value={r.status} />}
              onPress={() => setView(r)}
              meta={
                <>
                  <Muted>{r.requestNumber}</Muted>
                  <Muted>·</Muted>
                  <Muted>{plural(r.lines, 'item')}</Muted>
                  <Muted>·</Muted>
                  <Muted>{money(r.estimatedTotal)}</Muted>
                  <View style={{ flex: 1 }} />
                  <Muted>{ago(r.updatedAt || r.createdAt)}</Muted>
                </>
              }
            />
          </FocusRow>
        ))}
      </ScrollView>

      <FAB icon="add" onPress={openForm} />

      {/* ── One request, in full ───────────────────────────────────────── */}
      <Sheet
        visible={!!view} icon="document-text-outline" tone="violet"
        title={view?.requestNumber || 'Request'}
        subtitle={view ? `Raised ${fmtDay(view.createdAt)}` : undefined}
        onClose={() => setView(null)}
        footer={view?.status === 'pending'
          ? <Btn kind="danger" icon="close-circle-outline" block onPress={() => cancelReq(view)}>Cancel request</Btn>
          : <Btn block onPress={() => setView(null)}>Close</Btn>}
      >
        {view ? (
          <>
            <Note
              tone={['rejected', 'cancelled'].includes(view.status) ? 'amber' : view.status === 'pending' ? 'blue' : 'green'}
              icon={view.status === 'pending' ? 'time-outline' : ['rejected', 'cancelled'].includes(view.status) ? 'alert-circle-outline' : 'checkmark-circle-outline'}
            >
              {OUTCOME[view.status] || words(view.status)}
            </Note>

            <Panel icon="information-circle-outline" tone="indigo" title="Request">
              <Facts>
                <Fact k="Status" v={<StatusPill value={view.status} />} />
                <Fact k="Department" v={view.department?.name} />
                <Fact k="Priority" v={<Pill tone={PRIORITY[view.priority] || 'slate'}>{words(view.priority)}</Pill>} />
                <Fact k="Raised" v={fmtDay(view.createdAt)} />
                <Fact k="Last updated" v={ago(view.updatedAt || view.createdAt)} />
                <Fact k="Estimated total" v={money(view.estimatedTotal)} />
                {view.purchaseOrder ? <Fact k="Order" v={`${view.purchaseOrder.poNumber} · ${words(view.purchaseOrder.status)}`} /> : null}
                <Fact k="Purpose" v={view.reason} />
              </Facts>
            </Panel>

            <Panel icon="cube-outline" tone="blue" title={`Items (${count(view.lines)})`}>
              {(view.items || []).length ? (view.items || []).map((l: any, i: number) => (
                <View key={i} style={s.line}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.lineTitle} numberOfLines={2}>{l.itemName}</Text>
                    <Text style={s.lineSub}>{count(l.quantity)} {l.unit}</Text>
                  </View>
                  {l.estimatedPrice ? <Text style={s.lineVal}>{money(l.quantity * l.estimatedPrice)}</Text> : null}
                </View>
              )) : <Muted>No lines on this request.</Muted>}
            </Panel>

            <Panel icon="people-outline" tone="teal" title="Who has looked at it">
              {(view.approvals || []).length ? (view.approvals || []).map((a: any, i: number) => (
                <View key={i} style={s.line}>
                  <Ionicons
                    name={a.action === 'approved' ? 'checkmark-circle' : a.action === 'rejected' ? 'close-circle' : 'time-outline'}
                    size={17}
                    color={a.action === 'approved' ? TINT.green.fg : a.action === 'rejected' ? TINT.red.fg : TINT.amber.fg}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.lineTitle}>{a.stage}</Text>
                    <Text style={s.lineSub}>
                      {words(a.action)}{a.comment ? ` — “${a.comment}”` : ''}
                    </Text>
                  </View>
                  {a.actedAt ? <Text style={s.lineSub}>{fmtDay(a.actedAt)}</Text> : null}
                </View>
              )) : (
                <Muted>Nobody has acted on it yet — it is sitting with whoever approves requests for your department.</Muted>
              )}
            </Panel>
          </>
        ) : null}
      </Sheet>

      {/* ── A new request ─────────────────────────────────────────────── */}
      <Sheet
        visible={show} icon="add-circle-outline" tone="violet"
        title="New Purchase Request"
        subtitle="Request items from the inventory department for your classroom or activities."
        onClose={() => setShow(false)} busy={busy}
        footer={
          <>
            <Btn block onPress={() => setShow(false)} disabled={busy}>Cancel</Btn>
            <Btn kind="primary" block onPress={submit} disabled={busy}>
              {busy ? 'Submitting…' : 'Submit Request'}
            </Btn>
          </>
        }
      >
        <Step n={1} title="Request details" sub="Provide basic information about your request.">
          <Field label="Department" required error={tried ? errors.department : undefined}>
            <Pick
              label="Department" value={form.department} placeholder="Select department"
              options={(meta.departments || []).map((d: any) => ({ label: d.name, value: String(d._id) }))}
              onChange={(v) => setForm((f: any) => ({ ...f, department: v }))}
            />
          </Field>
          <Field label="Priority" hint="Urgent requests are looked at first, so keep them for things that cannot wait.">
            <Pick
              label="Priority" value={form.priority}
              options={[{ label: 'Low', value: 'low' }, { label: 'Normal', value: 'normal' },
                { label: 'High', value: 'high' }, { label: 'Urgent', value: 'urgent' }]}
              onChange={(v) => setForm((f: any) => ({ ...f, priority: v }))}
            />
          </Field>
          <Field label="Purpose" required error={tried ? errors.purpose : undefined}>
            <Box value={form.purpose} onChange={(v) => setForm((f: any) => ({ ...f, purpose: v }))}
              placeholder="e.g. Classroom use, Practical, Event, Project etc." />
          </Field>
        </Step>

        <Step n={2} title="Requested items" sub="Add the items you need. You can add multiple items to this request.">
          {form.lines.map((l: any, i: number) => (
            <View key={i} style={s.lineCard}>
              <View style={s.lineCardHead}>
                <Text style={s.lineCardNo}>Item {i + 1}</Text>
                {form.lines.length > 1 ? (
                  <TouchableOpacity onPress={() => setForm((f: any) => ({ ...f, lines: f.lines.filter((_: any, j: number) => j !== i) }))}
                    hitSlop={8} accessibilityLabel={`Remove item ${i + 1}`}>
                    <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <ItemPick
                items={meta.items || []} line={l}
                onPick={(id, it) => setLine(i, { item: id, itemName: it.name, price: String(it.purchasePrice ?? '') })}
                onName={(name) => setLine(i, { item: '', itemName: name })}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Quantity">
                    <Box value={String(l.quantity)} onChange={(v) => setLine(i, { quantity: v })} keyboardType="number-pad" />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Est. price (₹)">
                    <Box value={String(l.price)} onChange={(v) => setLine(i, { price: v })} keyboardType="decimal-pad" placeholder="0.00" />
                  </Field>
                </View>
              </View>
            </View>
          ))}
          <TouchableOpacity style={s.addLine} onPress={() => setForm((f: any) => ({ ...f, lines: [...f.lines, blank()] }))}>
            <Ionicons name="add" size={16} color={TINT.indigo.fg} />
            <Text style={s.addLineText}>Add another item</Text>
          </TouchableOpacity>
          {tried && errors.lines ? <Text style={s.err}>{errors.lines}</Text> : null}
        </Step>

        <Step n={3} title="Reason / Justification" sub="Explain why you need these items.">
          <Box multiline value={form.reason} maxLength={REASON_MAX}
            onChange={(v) => setForm((f: any) => ({ ...f, reason: v }))}
            placeholder="Describe the purpose, expected use and any additional details…" />
          <Text style={s.counter}>{String(form.reason || '').length}/{REASON_MAX}</Text>
        </Step>

        {/* The web puts this in a column beside the form; a phone has no room
            for a column, so it reads as the total of what you just filled in. */}
        <Panel icon="cart-outline" tone="violet" title="Request summary">
          <Facts>
            <Fact k="Department" v={dept?.name} />
            <Fact k="Items" v={count(live.length)} />
            <Fact k="Estimated cost" v={money(estimated, 2)} />
            <Fact k="Priority" v={words(form.priority)} />
          </Facts>
        </Panel>

        <Note tone="blue" title="Guidelines">
          <View style={{ gap: 5, marginTop: 3 }}>
            {['Request only items required for academic and school activities.',
              'Your request will be reviewed by the inventory department.',
              'You will be notified once your request is approved or rejected.',
              'Include clear justification to avoid delays.'].map((g, i) => (
              <Text key={i} style={s.rule}>{'•'}  {g}</Text>
            ))}
          </View>
        </Note>
      </Sheet>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  lineTitle: { fontSize: 13, fontWeight: '600', color: Colors.text },
  lineSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },
  lineVal: { fontSize: 12.5, fontWeight: '700', color: Colors.text },

  lineCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 11, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  lineCardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  lineCardNo: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.3 },

  addLine: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 9 },
  addLineText: { fontSize: 13, fontWeight: '700', color: TINT.indigo.fg },

  err: { fontSize: 11.5, color: Colors.danger, marginTop: 4 },
  counter: { fontSize: 11, color: Colors.textLight, textAlign: 'right', marginTop: 5 },
  rule: { fontSize: 11.5, color: Colors.text, lineHeight: 17 },
});
