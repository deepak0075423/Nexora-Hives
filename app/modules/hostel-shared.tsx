import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Image, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import * as hostelApi from '@/api/hostel.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, SectionTitle, RowItem, StatRow, StatTile,
  SegTabs, Select, Input, FormModal, ActionBtn, FAB, fmtDate, fmtDateTime, fmtMoney,
  confirmAsync, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

const label = (v?: string) => String(v ?? '').replace(/_/g, ' ');
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => iso(new Date());

const LEAVE_TYPES = ['home', 'weekend', 'short', 'medical', 'emergency', 'holiday', 'other'];
const OUTPASS_TYPES = ['day', 'night', 'medical', 'emergency', 'academic', 'market', 'other'];
const COMPLAINT_CATS = ['room', 'mess', 'cleaning', 'security', 'maintenance', 'food', 'facilities', 'internet', 'other'];
const opts = (arr: string[]) => arr.map((v) => ({ label: label(v), value: v }));

/**
 * The resident's hostel screen, shared by the student and parent tabs.
 *
 * `role` picks the API surface; a parent additionally chooses which child they
 * are looking at, and the server refuses any student that is not theirs.
 */
export default function HostelResident({ role }: { role: 'student' | 'parent' }) {
  const api = role === 'parent' ? hostelApi.parent : hostelApi.student;
  const title = role === 'parent' ? 'Hostel' : 'My Hostel';

  const [data, setData] = useState<any>(undefined);
  const [tab, setTab] = useState('overview');
  const [lists, setLists] = useState<Record<string, any>>({});
  const [children, setChildren] = useState<any[]>([]);
  const [child, setChild] = useState('');
  const [disabled, setDisabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [modal, setModal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pass, setPass] = useState<any>(null);

  const [leaveForm, setLeaveForm] = useState<any>({ leaveType: 'home', fromDate: '', toDate: '', reason: '', destination: '', guardianPhone: '' });
  const [outForm, setOutForm] = useState<any>({ outpassType: 'day', purpose: '', destination: '', departureDate: today(), expectedDepartureTime: '', expectedReturnTime: '', guardianPhone: '' });
  const [visitorForm, setVisitorForm] = useState<any>({ visitorName: '', mobile: '', relationship: '', purpose: '' });
  const [complaintForm, setComplaintForm] = useState<any>({ category: 'room', priority: 'medium', subject: '', description: '', attachments: [] as string[] });

  const q = role === 'parent' && child ? { student: child } : undefined;

  useEffect(() => {
    if (role !== 'parent') return;
    hostelApi.parent.children()
      .then((r: any) => {
        const list = unwrap(r) ?? [];
        setChildren(list);
        if (list.length) setChild((c) => c || list[0]._id);
      })
      .catch(() => setChildren([]));
  }, [role]);

  const load = useCallback(async () => {
    if (role === 'parent' && !child) return;
    try {
      setData(unwrap(await api.myHostel(q)));
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else setData(null);
    } finally { setRefreshing(false); }
  }, [role, child]); // eslint-disable-line
  useEffect(() => { load(); }, [load]);

  const loadTab = useCallback(async (t: string) => {
    const fetchers: Record<string, () => Promise<any>> = {
      attendance: () => api.attendance(q),
      leave:      () => api.leaves(q),
      outpass:    () => api.outpasses(q),
      visitors:   () => api.visitors(q),
      fees:       () => api.fees(q),
      complaints: () => api.complaints(q),
      mess:       () => api.mess(q),
    };
    if (!fetchers[t]) return;
    try {
      const res = unwrap(await fetchers[t]());
      setLists((l) => ({ ...l, [t]: res }));
    } catch { /* leave the tab empty */ }
  }, [api, child]); // eslint-disable-line
  useEffect(() => { if (data?.resident) loadTab(tab); }, [tab, loadTab, data?.resident]);

  const pickAttachment = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (res.canceled || !res.assets?.length) return;
    try {
      const up = unwrap(await api.uploadAttachment(res.assets[0]));
      setComplaintForm((f: any) => ({ ...f, attachments: [...f.attachments, up.storedName] }));
    } catch { /* the complaint can still be filed without the photo */ }
  };

  const submit = async (kind: string) => {
    setSaving(true);
    try {
      if (kind === 'leave')     { await api.applyLeave({ ...leaveForm, ...(q || {}) }); loadTab('leave'); }
      if (kind === 'outpass')   { await api.applyOutpass({ ...outForm, ...(q || {}) }); loadTab('outpass'); }
      if (kind === 'visitor')   { await api.requestVisitor({ ...visitorForm, ...(q || {}) }); loadTab('visitors'); }
      if (kind === 'complaint') {
        await api.raiseComplaint({ ...complaintForm, ...(q || {}) });
        setComplaintForm({ category: 'room', priority: 'medium', subject: '', description: '', attachments: [] });
        loadTab('complaints');
      }
      setModal(null);
    } catch (err: any) { alert(err?.message ?? 'Could not submit'); }
    finally { setSaving(false); }
  };

  const showPass = async (id: string) => {
    try { setPass(unwrap(await hostelApi.student.outpassPass(id))); }
    catch (err: any) { alert(err?.message ?? 'No pass available'); }
  };

  const cancelLeave = async (id: string) => {
    if (!await confirmAsync('Cancel leave', 'Withdraw this leave request?', 'Cancel leave')) return;
    try { await api.actOnLeave(id, { action: 'cancel' }); loadTab('leave'); } catch { /* refreshed below */ }
  };
  const consent = async (id: string, approve: boolean) => {
    try { await api.actOnLeave(id, { action: approve ? 'parent_approve' : 'parent_reject' }); loadTab('leave'); }
    catch (err: any) { alert(err?.message ?? 'Could not record consent'); }
  };

  if (disabled) return <><Stack.Screen options={{ title }} /><ModuleDisabled /></>;
  if (data === undefined) return <><Stack.Screen options={{ title }} /><LoaderView /></>;

  const childPicker = role === 'parent' && children.length > 1 ? (
    <Select label="Child" value={child} onChange={setChild}
      options={children.map((c: any) => ({ label: c.name, value: c._id }))} />
  ) : null;

  // ── Not a resident ─────────────────────────────────────────────────────────
  if (!data?.resident) {
    const pending = (data?.admissions || []).find((a: any) =>
      ['applied', 'pending_approval', 'waitlisted'].includes(a.status));
    return (
      <>
        <Stack.Screen options={{ title }} />
        <ScrollView style={s.root} contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
          {childPicker}
          {pending ? (
            <Card>
              <SectionTitle>Application in progress</SectionTitle>
              <KV label="Application" value={pending.applicationNumber} />
              <KV label="Hostel" value={pending.hostel?.name} />
              <KV label="Applied" value={fmtDate(pending.appliedAt)} />
              <KV label="Status" value={<Badge label={label(pending.status)} />} />
              {pending.status === 'waitlisted' && <KV label="Waitlist position" value={pending.waitlistPosition} />}
            </Card>
          ) : (
            <Empty icon="business-outline" text="Not a hostel resident. Contact the hostel office to apply." />
          )}
          {(data?.admissions || []).length > 0 && (
            <>
              <SectionTitle>Application history</SectionTitle>
              {data.admissions.map((a: any) => (
                <RowItem key={a._id} icon="document-text" title={a.applicationNumber}
                  sub={`${a.hostel?.name ?? ''} · ${a.academicYear?.yearName ?? ''}`}
                  right={<Badge label={label(a.status)} />} />
              ))}
            </>
          )}
        </ScrollView>
      </>
    );
  }

  // ── Resident ───────────────────────────────────────────────────────────────
  const c = data.current;
  const fab = { leave: 'leave', outpass: 'outpass', visitors: 'visitor', complaints: 'complaint' }[tab];

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView style={s.root} contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); loadTab(tab); }} />}>

        {childPicker}

        <Card style={{ backgroundColor: Colors.primary }}>
          <Text style={s.heroLabel}>{c.hostel?.name}</Text>
          <Text style={s.heroRoom}>Room {c.room?.roomNumber} · Bed {c.bed?.bedNumber}</Text>
          <Text style={s.heroSub}>
            {[c.building?.name, c.floor?.name].filter(Boolean).join(' · ')}
          </Text>
        </Card>

        <SegTabs active={tab} onChange={setTab} tabs={[
          { key: 'overview', label: 'Overview' }, { key: 'attendance', label: 'Attendance' },
          { key: 'leave', label: 'Leave' }, { key: 'outpass', label: 'Outpass' },
          { key: 'visitors', label: 'Visitors' }, { key: 'mess', label: 'Mess' },
          { key: 'fees', label: 'Fees' }, { key: 'complaints', label: 'Complaints' },
        ]} />

        {tab === 'overview' && (
          <>
            {data.warden && (
              <Card>
                <SectionTitle>Your warden</SectionTitle>
                <KV label="Name" value={data.warden.name} />
                <KV label="Phone" value={data.warden.phone} />
                <KV label="Hostel contact" value={c.hostel?.contactNumber} />
              </Card>
            )}
            <Card>
              <SectionTitle>Timings</SectionTitle>
              <KV label="Entry" value={data.rules?.entryTime} />
              <KV label="Exit" value={data.rules?.exitTime} />
              <KV label="Curfew" value={data.rules?.curfewTime} />
              <KV label="Visiting hours" value={`${data.rules?.visitorFrom ?? '--'} – ${data.rules?.visitorTo ?? '--'}`} />
            </Card>
            {(data.roommates || []).length > 0 && (
              <>
                <SectionTitle>Roommates</SectionTitle>
                {data.roommates.map((r: any) => (
                  <RowItem key={r._id} icon="person" title={r.student?.name ?? '--'} sub={`Bed ${r.bed?.bedNumber ?? '--'}`} />
                ))}
              </>
            )}
            {(data.assets || []).length > 0 && (
              <>
                <SectionTitle>Items issued to you</SectionTitle>
                {data.assets.map((a: any) => (
                  <RowItem key={a._id} icon="cube" title={`${a.name} × ${a.quantity}`} sub={fmtDate(a.issuedAt)} />
                ))}
              </>
            )}
            {(data.rules?.hostelRules || []).length > 0 && (
              <Card>
                <SectionTitle>Hostel rules</SectionTitle>
                {data.rules.hostelRules.map((r: string, i: number) => (
                  <Text key={i} style={s.rule}>•  {r}</Text>
                ))}
              </Card>
            )}
          </>
        )}

        {tab === 'attendance' && (
          <>
            <StatRow>
              <StatTile label="Present" value={lists.attendance?.summary?.present ?? 0} icon="checkmark-circle" tone="success" />
              <StatTile label="Absent" value={lists.attendance?.summary?.absent ?? 0} icon="close-circle" tone="danger" />
              <StatTile label="Present %" value={`${lists.attendance?.summary?.presentPercent ?? 0}%`} icon="stats-chart" tone="info" />
            </StatRow>
            {(lists.attendance?.rows || []).length === 0
              ? <Empty icon="checkmark-done-outline" text="No attendance recorded yet" />
              : lists.attendance.rows.map((r: any) => (
                <RowItem key={r._id} icon="calendar" title={fmtDate(r.date)} sub={label(r.session)}
                  right={<Badge label={label(r.status)} />} />
              ))}
          </>
        )}

        {tab === 'leave' && (
          (lists.leave || []).length === 0
            ? <Empty icon="airplane-outline" text="No leave requests" />
            : lists.leave.map((l: any) => (
              <Card key={l._id}>
                <View style={s.cardHead}>
                  <Text style={s.cardTitle}>{l.leaveNumber}</Text>
                  <Badge label={label(l.status)} />
                </View>
                <KV label="Dates" value={`${fmtDate(l.fromDate)} – ${fmtDate(l.toDate)}`} />
                <KV label="Days" value={l.totalDays} />
                <KV label="Reason" value={l.reason} />
                <View style={s.actions}>
                  {role === 'parent' && l.status === 'pending' && (
                    <>
                      <ActionBtn small label="Give consent" tone="success" onPress={() => consent(l._id, true)} />
                      <ActionBtn small label="Decline" tone="danger" onPress={() => consent(l._id, false)} />
                    </>
                  )}
                  {['pending', 'parent_approved', 'approved'].includes(l.status) && (
                    <ActionBtn small label="Cancel" tone="neutral" onPress={() => cancelLeave(l._id)} />
                  )}
                </View>
              </Card>
            ))
        )}

        {tab === 'outpass' && (
          (lists.outpass || []).length === 0
            ? <Empty icon="ticket-outline" text="No outpasses" />
            : lists.outpass.map((o: any) => (
              <Card key={o._id}>
                <View style={s.cardHead}>
                  <Text style={s.cardTitle}>{o.outpassNumber}</Text>
                  <Badge label={label(o.status)} />
                </View>
                <KV label="Purpose" value={o.purpose} />
                <KV label="Out" value={`${fmtDate(o.departureDate)} ${o.expectedDepartureTime ?? ''}`} />
                <KV label="Back by" value={fmtDateTime(o.expectedReturnAt)} />
                {o.lateReturnMinutes > 0 && <KV label="Returned late by" value={`${o.lateReturnMinutes} min`} />}
                <View style={s.actions}>
                  {role === 'student' && ['approved', 'active'].includes(o.status) && (
                    <ActionBtn small label="Show pass" tone="info" onPress={() => showPass(o._id)} />
                  )}
                  {['pending', 'approved'].includes(o.status) && (
                    <ActionBtn small label="Cancel" tone="neutral"
                      onPress={async () => {
                        if (!await confirmAsync('Cancel outpass', 'Withdraw this outpass?', 'Cancel')) return;
                        try { await api.cancelOutpass(o._id); loadTab('outpass'); } catch { /* refreshed */ }
                      }} />
                  )}
                </View>
              </Card>
            ))
        )}

        {tab === 'visitors' && (
          <>
            {(lists.visitors?.restricted || []).length > 0 && (
              <Card style={{ backgroundColor: Colors.dangerLight }}>
                <Text style={s.warn}>
                  Restricted: {lists.visitors.restricted.map((v: any) => v.visitorName).join(', ')}
                </Text>
              </Card>
            )}
            {(lists.visitors?.visits || []).length === 0
              ? <Empty icon="people-outline" text="No visitors yet" />
              : lists.visitors.visits.map((v: any) => (
                <RowItem key={v._id} icon="person-add" title={v.visitorName}
                  sub={[v.relationship, v.entryTime ? `in ${fmtDateTime(v.entryTime)}` : ''].filter(Boolean).join(' · ')}
                  right={<Badge label={label(v.status)} />} />
              ))}
          </>
        )}

        {tab === 'mess' && (
          !lists.mess?.member
            ? <Empty icon="restaurant-outline" text="Not enrolled in a mess" />
            : (
              <>
                <Card>
                  <SectionTitle>{lists.mess.member.mess?.name}</SectionTitle>
                  <KV label="Preference" value={label(lists.mess.member.foodPreference)} />
                  <KV label="Meal plan" value={label(lists.mess.member.mealPlan)} />
                  <KV label="Allergies" value={(lists.mess.member.allergies || []).join(', ') || 'none'} />
                </Card>
                <SectionTitle>Menu</SectionTitle>
                {(lists.mess.menu || []).length === 0
                  ? <Empty icon="fast-food-outline" text="No menu published yet" />
                  : lists.mess.menu.map((m: any) => (
                    <RowItem key={m._id} icon="fast-food" title={`${label(m.meal)} · ${fmtDate(m.date)}`}
                      sub={(m.items || []).join(', ')} />
                  ))}
              </>
            )
        )}

        {tab === 'fees' && (
          <>
            <StatRow>
              <StatTile label="Billed" value={fmtMoney(lists.fees?.summary?.billed)} icon="receipt" tone="info" />
              <StatTile label="Paid" value={fmtMoney(lists.fees?.summary?.paid)} icon="checkmark-circle" tone="success" />
              <StatTile label="Due" value={fmtMoney(lists.fees?.summary?.outstanding)} icon="alert-circle"
                tone={lists.fees?.summary?.outstanding ? 'danger' : 'neutral'} />
            </StatRow>
            {(lists.fees?.invoices || []).length === 0
              ? <Empty icon="card-outline" text="No hostel fees raised" />
              : lists.fees.invoices.map((i: any) => (
                <RowItem key={i._id} icon="card" title={`${i.invoiceNumber} · ${fmtMoney(i.netAmount)}`}
                  sub={`${label(i.feeType)}${i.period?.label ? ` · ${i.period.label}` : ''} · due ${fmtDate(i.dueDate)}`}
                  right={<Badge label={label(i.status)} />} />
              ))}
          </>
        )}

        {tab === 'complaints' && (
          (lists.complaints || []).length === 0
            ? <Empty icon="megaphone-outline" text="No complaints raised" />
            : lists.complaints.map((cm: any) => (
              <Card key={cm._id}>
                <View style={s.cardHead}>
                  <Text style={s.cardTitle}>{cm.ticketNumber}</Text>
                  <Badge label={label(cm.status)} />
                </View>
                <KV label="Category" value={label(cm.category)} />
                <KV label="Raised" value={fmtDate(cm.createdAt)} />
                <Text style={s.body}>{cm.description}</Text>
                {['resolved', 'closed'].includes(cm.status) && (
                  <View style={s.actions}>
                    <ActionBtn small label="Reopen" tone="warning"
                      onPress={async () => {
                        try { await api.actOnComplaint(cm._id, { action: 'reopen' }); loadTab('complaints'); }
                        catch (err: any) { alert(err?.message ?? 'Could not reopen'); }
                      }} />
                  </View>
                )}
              </Card>
            ))
        )}
      </ScrollView>

      {fab && <FAB icon="add" onPress={() => setModal(fab)} />}

      {/* ── Request forms ───────────────────────────────────────────────── */}
      <FormModal visible={modal === 'leave'} title="Request Leave" onClose={() => setModal(null)}
        onSubmit={() => submit('leave')} submitting={saving} submitLabel="Request">
        <Select label="Type" value={leaveForm.leaveType} options={opts(LEAVE_TYPES)}
          onChange={(v) => setLeaveForm((f: any) => ({ ...f, leaveType: v }))} />
        <Input label="From (YYYY-MM-DD)" value={leaveForm.fromDate} placeholder={today()}
          onChange={(v) => setLeaveForm((f: any) => ({ ...f, fromDate: v }))} />
        <Input label="To (YYYY-MM-DD)" value={leaveForm.toDate} placeholder={today()}
          onChange={(v) => setLeaveForm((f: any) => ({ ...f, toDate: v }))} />
        <Input label="Reason" value={leaveForm.reason} multiline
          onChange={(v) => setLeaveForm((f: any) => ({ ...f, reason: v }))} />
        <Input label="Destination" value={leaveForm.destination}
          onChange={(v) => setLeaveForm((f: any) => ({ ...f, destination: v }))} />
        <Input label="Guardian phone" value={leaveForm.guardianPhone} keyboardType="phone-pad"
          onChange={(v) => setLeaveForm((f: any) => ({ ...f, guardianPhone: v }))} />
      </FormModal>

      <FormModal visible={modal === 'outpass'} title="Request Outpass" onClose={() => setModal(null)}
        onSubmit={() => submit('outpass')} submitting={saving} submitLabel="Request">
        <Select label="Type" value={outForm.outpassType} options={opts(OUTPASS_TYPES)}
          onChange={(v) => setOutForm((f: any) => ({ ...f, outpassType: v }))} />
        <Input label="Purpose" value={outForm.purpose}
          onChange={(v) => setOutForm((f: any) => ({ ...f, purpose: v }))} />
        <Input label="Departure date (YYYY-MM-DD)" value={outForm.departureDate}
          onChange={(v) => setOutForm((f: any) => ({ ...f, departureDate: v }))} />
        <Input label="Leaving at (HH:MM)" value={outForm.expectedDepartureTime} placeholder="16:00"
          onChange={(v) => setOutForm((f: any) => ({ ...f, expectedDepartureTime: v }))} />
        <Input label="Back by (HH:MM)" value={outForm.expectedReturnTime} placeholder="20:00"
          onChange={(v) => setOutForm((f: any) => ({ ...f, expectedReturnTime: v }))} />
        <Input label="Destination" value={outForm.destination}
          onChange={(v) => setOutForm((f: any) => ({ ...f, destination: v }))} />
        <Input label="Guardian phone" value={outForm.guardianPhone} keyboardType="phone-pad"
          onChange={(v) => setOutForm((f: any) => ({ ...f, guardianPhone: v }))} />
      </FormModal>

      <FormModal visible={modal === 'visitor'} title="Pre-register a Visitor" onClose={() => setModal(null)}
        onSubmit={() => submit('visitor')} submitting={saving} submitLabel="Register">
        <Input label="Visitor name" value={visitorForm.visitorName}
          onChange={(v) => setVisitorForm((f: any) => ({ ...f, visitorName: v }))} />
        <Input label="Mobile" value={visitorForm.mobile} keyboardType="phone-pad"
          onChange={(v) => setVisitorForm((f: any) => ({ ...f, mobile: v }))} />
        <Input label="Relationship" value={visitorForm.relationship}
          onChange={(v) => setVisitorForm((f: any) => ({ ...f, relationship: v }))} />
        <Input label="Purpose" value={visitorForm.purpose}
          onChange={(v) => setVisitorForm((f: any) => ({ ...f, purpose: v }))} />
      </FormModal>

      <FormModal visible={modal === 'complaint'} title="Raise a Complaint" onClose={() => setModal(null)}
        onSubmit={() => submit('complaint')} submitting={saving} submitLabel="Raise">
        <Select label="Category" value={complaintForm.category} options={opts(COMPLAINT_CATS)}
          onChange={(v) => setComplaintForm((f: any) => ({ ...f, category: v }))} />
        <Select label="Priority" value={complaintForm.priority} options={opts(['low', 'medium', 'high', 'urgent'])}
          onChange={(v) => setComplaintForm((f: any) => ({ ...f, priority: v }))} />
        <Input label="Subject" value={complaintForm.subject}
          onChange={(v) => setComplaintForm((f: any) => ({ ...f, subject: v }))} />
        <Input label="Description" value={complaintForm.description} multiline
          onChange={(v) => setComplaintForm((f: any) => ({ ...f, description: v }))} />
        <TouchableOpacity style={s.attachBtn} onPress={pickAttachment} activeOpacity={0.7}>
          <Ionicons name="camera" size={16} color={Colors.primary} />
          <Text style={s.attachText}>
            {complaintForm.attachments.length
              ? `${complaintForm.attachments.length} photo(s) attached`
              : 'Attach a photo'}
          </Text>
        </TouchableOpacity>
      </FormModal>

      {/* ── The gate pass ───────────────────────────────────────────────── */}
      <FormModal visible={!!pass} title="Gate Pass" onClose={() => setPass(null)}>
        {pass && (
          <View style={{ alignItems: 'center', paddingVertical: Spacing.md }}>
            <Text style={s.passNumber}>{pass.outpassNumber}</Text>
            <Text style={s.passSub}>{pass.student?.name} · Room {pass.room}</Text>
            {/* Rendered server-side and delivered as a data URI, so the app
                needs no QR library — see school-backend/utils/qrcode.js. */}
            {pass.qrImage
              ? <Image source={{ uri: pass.qrImage }} style={s.qr} resizeMode="contain" />
              : <Text style={s.passToken}>{pass.qrToken}</Text>}
            <Text style={s.passSub}>Back by {fmtDateTime(pass.expectedReturnAt)}</Text>
            <View style={{ marginTop: Spacing.sm }}><Badge label={label(pass.status)} /></View>
          </View>
        )}
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 90 },
  heroLabel: { ...Typography.body, color: Colors.accentLight },
  heroRoom: { ...Typography.h2, color: Colors.textInverse, marginTop: 2 },
  heroSub: { ...Typography.caption, color: Colors.accentLight, marginTop: 4 },
  rule: { ...Typography.body, color: Colors.textSecondary, lineHeight: 22 },
  body: { ...Typography.body, color: Colors.textSecondary, marginTop: 6 },
  warn: { ...Typography.body, color: Colors.danger },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle: { ...Typography.h4, color: Colors.text },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  attachBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10,
    paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.border, backgroundColor: Colors.surfaceAlt, marginBottom: Spacing.sm,
  },
  attachText: { ...Typography.body, color: Colors.primary },
  qr: { width: 220, height: 220, marginVertical: Spacing.md, backgroundColor: '#fff', borderRadius: Radius.md },
  passNumber: { ...Typography.h3, color: Colors.text },
  passSub: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  passToken: {
    fontFamily: 'monospace', fontSize: 11, color: Colors.text, backgroundColor: Colors.surfaceAlt,
    padding: Spacing.md, borderRadius: Radius.md, marginVertical: Spacing.md, textAlign: 'center',
  },
});
