import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Image, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import * as h from '@/api/hostel.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, SectionTitle, RowItem, StatRow, StatTile,
  SegTabs, Select, Input, FormModal, ActionBtn, SearchBar, fmtDate, fmtDateTime, fmtMoney,
  confirmAsync, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

const label = (v?: string) => String(v ?? '').replace(/_/g, ' ');
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const opts = (arr: string[]) => arr.map((v) => ({ label: label(v), value: v }));

const MARKS = ['present', 'absent', 'late', 'excused', 'on_leave'];
const MARK_TONE: Record<string, any> = {
  present: 'success', absent: 'danger', late: 'warning', excused: 'info', on_leave: 'info',
};

/**
 * Hostel — warden console.
 *
 * Deliberately not the whole administrative surface: setting up buildings and
 * fee plans is desk work and lives on the web. What a warden does on their feet
 * is here — the roll call, the gate, approvals, and who is where right now.
 */
export default function AdminHostelScreen() {
  const { user } = useAuth();
  const [dash, setDash] = useState<any>(undefined);
  const [meta, setMeta] = useState<any>(null);
  const [tab, setTab] = useState('overview');
  const [disabled, setDisabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [hostel, setHostel] = useState('');
  const [session, setSession] = useState('morning');
  const [register, setRegister] = useState<any>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [savingRoll, setSavingRoll] = useState(false);

  const [live, setLive] = useState<any>(null);
  const [approvals, setApprovals] = useState<any>({ admissions: [], leaves: [], outpasses: [] });
  const [tickets, setTickets] = useState<any>({ complaints: [], maintenance: [] });
  const [visitors, setVisitors] = useState<any[]>([]);
  const [residents, setResidents] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  const [gateOpen, setGateOpen] = useState(false);
  const [gateToken, setGateToken] = useState('');
  const [gateFound, setGateFound] = useState<any>(null);
  const [gateBusy, setGateBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, m] = await Promise.all([h.getDashboard(), h.getMeta()]);
      setDash(unwrap(d));
      const mt = unwrap(m);
      setMeta(mt);
      if (!hostel && mt?.hostels?.length) setHostel(mt.hostels[0]._id);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true); else setDash(null);
    } finally { setRefreshing(false); }
  }, [hostel]);
  useEffect(() => { if (user?.role) load(); }, [user?.role]); // eslint-disable-line

  // ── Per-tab loading ────────────────────────────────────────────────────────
  const loadRegister = useCallback(async () => {
    if (!hostel) return;
    try {
      const d = unwrap(await h.getRegister({ hostel, session, date: iso(new Date()) }));
      setRegister(d);
      setMarks(Object.fromEntries((d.rows || []).map((r: any) => [
        String(r.student?._id ?? r.student), r.record?.status ?? r.suggested,
      ])));
    } catch { setRegister(null); }
  }, [hostel, session]);

  const loadTab = useCallback(async (t: string) => {
    try {
      if (t === 'rollcall') return loadRegister();
      if (t === 'gate') setLive(unwrap(await h.getLiveMovement()));
      if (t === 'approvals') {
        const [ad, lv, op] = await Promise.all([
          h.getAdmissions({ status: 'pending_approval', limit: 25 }),
          h.getLeaves({ status: 'pending', limit: 25 }),
          h.getOutpasses({ status: 'pending', limit: 25 }),
        ]);
        setApprovals({
          admissions: unwrap(ad)?.data ?? [],
          leaves: unwrap(lv)?.data ?? [],
          outpasses: unwrap(op)?.data ?? [],
        });
      }
      if (t === 'tickets') {
        const [cp, mt] = await Promise.all([
          h.getComplaints({ status: 'open', limit: 25 }),
          h.getMaintenance({ status: 'open', limit: 25 }),
        ]);
        setTickets({ complaints: unwrap(cp)?.data ?? [], maintenance: unwrap(mt)?.data ?? [] });
      }
      if (t === 'visitors') setVisitors(unwrap(await h.getVisitors({ status: 'pending', limit: 30 }))?.data ?? []);
      if (t === 'residents') setResidents(unwrap(await h.getAllocations({ status: 'active', limit: 100 }))?.data ?? []);
    } catch { /* the tab renders empty */ }
  }, [loadRegister]);
  useEffect(() => { if (dash) loadTab(tab); }, [tab, loadTab, dash]);
  useEffect(() => { if (tab === 'rollcall') loadRegister(); }, [hostel, session]); // eslint-disable-line

  // ── Actions ────────────────────────────────────────────────────────────────
  const submitRoll = async () => {
    setSavingRoll(true);
    try {
      const records = Object.entries(marks).map(([student, status]) => ({ student, status }));
      const r = unwrap(await h.markAttendance({ hostel, session, date: iso(new Date()), records }));
      alert(`${r.created} marked, ${r.updated} updated`);
      loadRegister();
    } catch (err: any) { alert(err?.message ?? 'Could not save the roll call'); }
    finally { setSavingRoll(false); }
  };

  const decide = async (kind: string, id: string, action: string) => {
    const verb = action === 'approve' ? 'Approve' : 'Reject';
    if (!await confirmAsync(`${verb}?`, `${verb} this request?`, verb)) return;
    try {
      if (kind === 'admission') await h.decideAdmission(id, { action });
      if (kind === 'leave') await h.actOnLeave(id, { action });
      if (kind === 'outpass') await h.actOnOutpass(id, { action });
      loadTab('approvals');
      load();
    } catch (err: any) { alert(err?.message ?? 'Could not complete that'); }
  };

  const lookupPass = async () => {
    if (!gateToken.trim()) return;
    try { setGateFound(unwrap(await h.verifyOutpass(gateToken.trim()))); }
    catch (err: any) { alert(err?.message ?? 'That pass is not valid'); setGateFound(null); }
  };

  const recordGate = async (direction: 'in' | 'out') => {
    setGateBusy(true);
    try {
      const r = unwrap(await h.gateScan({ token: gateToken.trim(), direction, gate: 'Main Gate' }));
      alert(direction === 'out'
        ? 'Departure recorded'
        : `Return recorded${r.lateMinutes > 0 ? ` — ${r.lateMinutes} min late` : ''}`);
      setGateToken(''); setGateFound(null); setGateOpen(false);
      loadTab('gate'); load();
    } catch (err: any) { alert(err?.message ?? 'Could not record that'); }
    finally { setGateBusy(false); }
  };

  const actVisitor = async (id: string, action: string) => {
    try { await h.actOnVisitor(id, { action }); loadTab('visitors'); }
    catch (err: any) { alert(err?.message ?? 'Could not update the visitor'); }
  };

  if (disabled) return <><Stack.Screen options={{ title: 'Hostel' }} /><ModuleDisabled /></>;
  if (dash === undefined) return <><Stack.Screen options={{ title: 'Hostel' }} /><LoaderView /></>;
  const d = dash || {};

  const pendingTotal = (d.pendingAdmissions ?? 0) + (d.pendingLeaves ?? 0) + (d.pendingOutpasses ?? 0);
  const hostelOpts = (meta?.hostels || []).map((x: any) => ({ label: x.name, value: x._id }));
  const filteredResidents = residents.filter((r) =>
    !search || String(r.student?.name ?? '').toLowerCase().includes(search.toLowerCase())
    || String(r.room?.roomNumber ?? '').includes(search));

  return (
    <>
      <Stack.Screen options={{ title: 'Hostel' }} />
      <ScrollView style={s.root} contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); loadTab(tab); }} />}>

        <StatRow>
          <StatTile label="Beds" value={`${d.occupiedBeds ?? 0}/${d.totalBeds ?? 0}`} icon="bed" tone="info" />
          <StatTile label="Inside" value={d.studentsStaying ?? 0} icon="home" tone="success" />
          <StatTile label="Outside" value={d.studentsOutside ?? 0} icon="walk" tone="warning" />
        </StatRow>
        <StatRow>
          <StatTile label="On leave" value={d.studentsOnLeave ?? 0} icon="airplane" tone="info" />
          <StatTile label="Overdue" value={d.overdueOutpasses ?? 0} icon="time"
            tone={d.overdueOutpasses ? 'danger' : 'neutral'} />
          <StatTile label="Pending" value={pendingTotal} icon="hourglass"
            tone={pendingTotal ? 'warning' : 'neutral'} />
        </StatRow>

        <SegTabs active={tab} onChange={setTab} tabs={[
          { key: 'overview', label: 'Overview' }, { key: 'rollcall', label: 'Roll Call' },
          { key: 'gate', label: 'Gate' }, { key: 'approvals', label: `Approvals${pendingTotal ? ` (${pendingTotal})` : ''}` },
          { key: 'visitors', label: 'Visitors' }, { key: 'tickets', label: 'Tickets' },
          { key: 'residents', label: 'Residents' },
        ]} />

        {tab === 'overview' && (
          <>
            <Card>
              <SectionTitle>Today&apos;s roll call</SectionTitle>
              <KV label="Present" value={d.attendanceToday?.present ?? 0} />
              <KV label="Absent" value={d.attendanceToday?.absent ?? 0} />
              <KV label="Late" value={d.attendanceToday?.late ?? 0} />
              <KV label="Marked" value={d.attendanceToday?.marked ?? 0} />
            </Card>
            <Card>
              <SectionTitle>Estate</SectionTitle>
              <KV label="Hostels" value={d.totalHostels ?? 0} />
              <KV label="Rooms" value={d.totalRooms ?? 0} />
              <KV label="Available beds" value={d.availableBeds ?? 0} />
              <KV label="Residents" value={d.totalResidents ?? 0} />
            </Card>
            <Card>
              <SectionTitle>Needs attention</SectionTitle>
              <KV label="Open complaints" value={d.pendingComplaints ?? 0} />
              <KV label="Open maintenance" value={d.openMaintenance ?? 0} />
              <KV label="Visitors today" value={d.todayVisitors ?? 0} />
              <KV label="Outstanding fees" value={fmtMoney(d.outstandingFees)} />
            </Card>
            {(d.recentIncidents || []).length > 0 && (
              <>
                <SectionTitle>Recent incidents</SectionTitle>
                {d.recentIncidents.slice(0, 5).map((i: any) => (
                  <RowItem key={i._id} icon="warning" title={label(i.incidentType)}
                    sub={`${i.student?.name ?? 'Unattributed'} · ${fmtDate(i.date)}`}
                    right={<Badge label={i.severity} tone={['critical', 'high'].includes(i.severity) ? 'danger' : 'neutral'} />} />
                ))}
              </>
            )}
          </>
        )}

        {tab === 'rollcall' && (
          <>
            <Select label="Hostel" value={hostel} options={hostelOpts} onChange={setHostel} />
            <Select label="Session" value={session} onChange={setSession}
              options={opts(['morning', 'evening', 'night', 'roll_call'])} />

            {!register ? <Empty icon="people-outline" text="No residents for this hostel" /> : (
              <>
                <View style={s.bulkRow}>
                  <Text style={s.bulkLabel}>Mark all:</Text>
                  {['present', 'absent'].map((m) => (
                    <ActionBtn key={m} small label={label(m)} tone={MARK_TONE[m]}
                      onPress={() => setMarks(Object.fromEntries(
                        (register.rows || []).map((r: any) => [String(r.student?._id ?? r.student), m])))} />
                  ))}
                </View>

                {(register.rows || []).map((r: any) => {
                  const sid = String(r.student?._id ?? r.student);
                  return (
                    <Card key={sid}>
                      <View style={s.cardHead}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.cardTitle}>{r.student?.name}</Text>
                          <Text style={s.cardSub}>
                            Room {r.room?.roomNumber ?? '--'}
                            {r.onLeave ? ' · on leave' : r.onOutpass ? ' · on outpass' : ''}
                          </Text>
                        </View>
                      </View>
                      <View style={s.markRow}>
                        {MARKS.map((m) => (
                          <TouchableOpacity key={m}
                            style={[s.mark, marks[sid] === m && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                            onPress={() => setMarks((x) => ({ ...x, [sid]: m }))}>
                            <Text style={[s.markText, marks[sid] === m && { color: '#fff' }]}>{label(m)}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </Card>
                  );
                })}

                <TouchableOpacity style={[s.primaryBtn, savingRoll && { opacity: 0.6 }]}
                  onPress={submitRoll} disabled={savingRoll}>
                  <Text style={s.primaryBtnText}>
                    {savingRoll ? 'Saving…' : `Save roll call (${(register.rows || []).length})`}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {tab === 'gate' && (
          <>
            <TouchableOpacity style={s.primaryBtn} onPress={() => { setGateOpen(true); setGateToken(''); setGateFound(null); }}>
              <Ionicons name="qr-code" size={18} color="#fff" />
              <Text style={s.primaryBtnText}>  Verify a pass</Text>
            </TouchableOpacity>

            <StatRow>
              <StatTile label="Inside" value={live?.inside ?? 0} icon="home" tone="success" />
              <StatTile label="Out" value={live?.outside ?? 0} icon="walk" tone="warning" />
              <StatTile label="Overdue" value={live?.overdue?.length ?? 0} icon="alarm"
                tone={live?.overdue?.length ? 'danger' : 'neutral'} />
            </StatRow>

            {(live?.overdue || []).length > 0 && (
              <>
                <SectionTitle>Overdue returns</SectionTitle>
                {live.overdue.map((o: any) => (
                  <RowItem key={o._id} icon="alarm" iconColor={Colors.danger} iconBg={Colors.dangerLight}
                    title={o.student?.name ?? '--'}
                    sub={`${o.outpassNumber} · expected ${fmtDateTime(o.expectedReturnAt)}`} />
                ))}
              </>
            )}

            <SectionTitle>Recent movement</SectionTitle>
            {(live?.recent || []).length === 0
              ? <Empty icon="swap-horizontal-outline" text="No movement recorded today" />
              : live.recent.slice(0, 20).map((m: any) => (
                <RowItem key={m._id}
                  icon={m.direction === 'out' ? 'exit' : 'enter'}
                  iconColor={m.direction === 'out' ? Colors.warning : Colors.success}
                  iconBg={m.direction === 'out' ? Colors.warningLight : Colors.successLight}
                  title={m.student?.name ?? m.personName ?? '--'}
                  sub={`${label(m.movementType)} · ${fmtDateTime(m.at)}`}
                  right={m.isLate ? <Badge label="late" tone="danger" /> : undefined} />
              ))}
          </>
        )}

        {tab === 'approvals' && (
          <>
            <SectionTitle>Admissions ({approvals.admissions.length})</SectionTitle>
            {approvals.admissions.length === 0 ? <Empty icon="documents-outline" text="Nothing waiting" />
              : approvals.admissions.map((a: any) => (
                <Card key={a._id}>
                  <View style={s.cardHead}>
                    <Text style={s.cardTitle}>{a.student?.name}</Text>
                    <Badge label={label(a.status)} />
                  </View>
                  <KV label="Application" value={a.applicationNumber} />
                  <KV label="Hostel" value={a.hostel?.name} />
                  <KV label="Preferred" value={label(a.preferredRoomType) || 'no preference'} />
                  <View style={s.actions}>
                    <ActionBtn small label="Approve" tone="success" onPress={() => decide('admission', a._id, 'approve')} />
                    <ActionBtn small label="Reject" tone="danger" onPress={() => decide('admission', a._id, 'reject')} />
                    <ActionBtn small label="Waitlist" tone="warning" onPress={() => decide('admission', a._id, 'waitlist')} />
                  </View>
                </Card>
              ))}

            <SectionTitle>Leave ({approvals.leaves.length})</SectionTitle>
            {approvals.leaves.length === 0 ? <Empty icon="airplane-outline" text="Nothing waiting" />
              : approvals.leaves.map((l: any) => (
                <Card key={l._id}>
                  <View style={s.cardHead}>
                    <Text style={s.cardTitle}>{l.student?.name}</Text>
                    <Badge label={label(l.status)} />
                  </View>
                  <KV label="Dates" value={`${fmtDate(l.fromDate)} – ${fmtDate(l.toDate)}`} />
                  <KV label="Reason" value={l.reason} />
                  <KV label="Parent consent"
                    value={!l.parentApprovalRequired ? 'not required' : l.parentApprovedAt ? 'given' : 'awaiting'} />
                  <View style={s.actions}>
                    <ActionBtn small label="Approve" tone="success" onPress={() => decide('leave', l._id, 'approve')} />
                    <ActionBtn small label="Reject" tone="danger" onPress={() => decide('leave', l._id, 'reject')} />
                  </View>
                </Card>
              ))}

            <SectionTitle>Outpass ({approvals.outpasses.length})</SectionTitle>
            {approvals.outpasses.length === 0 ? <Empty icon="ticket-outline" text="Nothing waiting" />
              : approvals.outpasses.map((o: any) => (
                <Card key={o._id}>
                  <View style={s.cardHead}>
                    <Text style={s.cardTitle}>{o.student?.name}</Text>
                    <Badge label={label(o.status)} />
                  </View>
                  <KV label="Purpose" value={o.purpose} />
                  <KV label="Out" value={`${fmtDate(o.departureDate)} ${o.expectedDepartureTime ?? ''}`} />
                  <View style={s.actions}>
                    <ActionBtn small label="Approve" tone="success" onPress={() => decide('outpass', o._id, 'approve')} />
                    <ActionBtn small label="Reject" tone="danger" onPress={() => decide('outpass', o._id, 'reject')} />
                  </View>
                </Card>
              ))}
          </>
        )}

        {tab === 'visitors' && (
          visitors.length === 0 ? <Empty icon="people-outline" text="No visitors waiting" />
            : visitors.map((v: any) => (
              <Card key={v._id}>
                <View style={s.cardHead}>
                  <Text style={s.cardTitle}>{v.visitorName}</Text>
                  <Badge label={label(v.status)} />
                </View>
                <KV label="Visiting" value={v.student?.name} />
                <KV label="Relationship" value={v.relationship} />
                <KV label="Purpose" value={v.purpose} />
                <View style={s.actions}>
                  {v.status === 'pending' && <>
                    <ActionBtn small label="Approve" tone="success" onPress={() => actVisitor(v._id, 'approve')} />
                    <ActionBtn small label="Reject" tone="danger" onPress={() => actVisitor(v._id, 'reject')} />
                  </>}
                  {v.status === 'approved' && <ActionBtn small label="Check in" tone="info" onPress={() => actVisitor(v._id, 'entry')} />}
                  {v.status === 'checked_in' && <ActionBtn small label="Check out" tone="neutral" onPress={() => actVisitor(v._id, 'exit')} />}
                </View>
              </Card>
            ))
        )}

        {tab === 'tickets' && (
          <>
            <SectionTitle>Complaints ({tickets.complaints.length})</SectionTitle>
            {tickets.complaints.length === 0 ? <Empty icon="megaphone-outline" text="No open complaints" />
              : tickets.complaints.map((c: any) => (
                <Card key={c._id}>
                  <View style={s.cardHead}>
                    <Text style={s.cardTitle}>{c.ticketNumber}</Text>
                    <Badge label={c.priority} tone={c.priority === 'urgent' ? 'danger' : c.priority === 'high' ? 'warning' : 'info'} />
                  </View>
                  <KV label="Category" value={label(c.category)} />
                  <KV label="From" value={c.student?.name ?? '--'} />
                  <Text style={s.body}>{c.description}</Text>
                  <View style={s.actions}>
                    <ActionBtn small label="Start" tone="info"
                      onPress={async () => { try { await h.actOnComplaint(c._id, { action: 'start' }); loadTab('tickets'); } catch { /* refreshed */ } }} />
                    <ActionBtn small label="Resolve" tone="success"
                      onPress={async () => { try { await h.actOnComplaint(c._id, { action: 'resolve', resolution: 'Resolved on site' }); loadTab('tickets'); } catch { /* refreshed */ } }} />
                  </View>
                </Card>
              ))}

            <SectionTitle>Maintenance ({tickets.maintenance.length})</SectionTitle>
            {tickets.maintenance.length === 0 ? <Empty icon="construct-outline" text="No open work orders" />
              : tickets.maintenance.map((m: any) => (
                <Card key={m._id}>
                  <View style={s.cardHead}>
                    <Text style={s.cardTitle}>{m.requestNumber}</Text>
                    <Badge label={label(m.status)} />
                  </View>
                  <KV label="Category" value={label(m.category)} />
                  <KV label="Room" value={m.room?.roomNumber ?? 'common area'} />
                  <Text style={s.body}>{m.description}</Text>
                  <View style={s.actions}>
                    <ActionBtn small label="Start" tone="info"
                      onPress={async () => { try { await h.actOnMaintenance(m._id, { action: 'start' }); loadTab('tickets'); } catch { /* refreshed */ } }} />
                    <ActionBtn small label="Complete" tone="success"
                      onPress={async () => { try { await h.actOnMaintenance(m._id, { action: 'complete', resolution: 'Completed' }); loadTab('tickets'); } catch { /* refreshed */ } }} />
                  </View>
                </Card>
              ))}
          </>
        )}

        {tab === 'residents' && (
          <>
            <SearchBar value={search} onChange={setSearch} placeholder="Search name or room…" />
            {filteredResidents.length === 0 ? <Empty icon="people-outline" text="No residents" />
              : filteredResidents.map((r: any) => (
                <RowItem key={r._id} icon="person" title={r.student?.name ?? '--'}
                  sub={`${r.hostel?.name ?? ''} · Room ${r.room?.roomNumber ?? '--'} · Bed ${r.bed?.bedNumber ?? '--'}`}
                  right={<Badge label={label(r.presence)}
                    tone={r.presence === 'in' ? 'success' : r.presence === 'out' ? 'warning' : 'info'} />} />
              ))}
          </>
        )}
      </ScrollView>

      {/* ── The gate ────────────────────────────────────────────────────── */}
      <FormModal visible={gateOpen} title="Gate Verification" onClose={() => { setGateOpen(false); setGateFound(null); }}>
        <Input label="Pass token" value={gateToken} onChange={setGateToken}
          placeholder="Scan or type the token from the student's pass" />
        <TouchableOpacity style={s.primaryBtn} onPress={lookupPass}>
          <Text style={s.primaryBtnText}>Look up</Text>
        </TouchableOpacity>

        {gateFound && (
          <View style={{ marginTop: Spacing.md }}>
            <Card>
              <View style={s.cardHead}>
                <Text style={s.cardTitle}>{gateFound.outpassNumber}</Text>
                <Badge label={label(gateFound.status)} />
              </View>
              <KV label="Student" value={gateFound.student?.name} />
              <KV label="Room" value={gateFound.room} />
              <KV label="Purpose" value={gateFound.purpose} />
              <KV label="Back by" value={fmtDateTime(gateFound.expectedReturnAt)} />
              {/* The pass image, so the guard can compare it with the phone
                  the student is holding up. */}
              {gateFound.qrImage && (
                <Image source={{ uri: gateFound.qrImage }} style={s.gateQr} resizeMode="contain" />
              )}
            </Card>
            <View style={s.actions}>
              {gateFound.expectedAction === 'out' && (
                <ActionBtn label={gateBusy ? 'Recording…' : 'Record departure'} tone="warning" onPress={() => recordGate('out')} />
              )}
              {gateFound.expectedAction === 'in' && (
                <ActionBtn label={gateBusy ? 'Recording…' : 'Record return'} tone="success" onPress={() => recordGate('in')} />
              )}
              {!gateFound.valid && <Text style={s.body}>This pass cannot be used.</Text>}
            </View>
          </View>
        )}
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 80 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 4 },
  cardTitle: { ...Typography.h4, color: Colors.text },
  cardSub: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  body: { ...Typography.body, color: Colors.textSecondary, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  bulkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.sm, flexWrap: 'wrap' },
  bulkLabel: { ...Typography.caption, color: Colors.textSecondary },
  markRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 },
  mark: {
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
  },
  markText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, textTransform: 'capitalize' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 13, marginVertical: Spacing.sm,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  gateQr: { width: 160, height: 160, alignSelf: 'center', marginTop: Spacing.md, backgroundColor: '#fff', borderRadius: Radius.md },
});
