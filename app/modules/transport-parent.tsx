import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Linking, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import * as t from '@/api/transport.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Colors, Spacing } from '@/constants/theme';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, SegTabs, RowItem, ActionBtn, Select, FAB,
  FormModal, Input, fmtMoney, fmtDate,
} from '@/components/ui/kit';

const tm = (v?: string) => v ? new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
const REQ_TYPES = [
  { label: 'New Transport', value: 'new_transport' },
  { label: 'Stop Change', value: 'stop_change' },
  { label: 'Temporary Address', value: 'temporary_address' },
  { label: 'Cancellation', value: 'cancellation' },
];

export default function ParentTransportScreen() {
  const { user } = useAuth();
  const [children, setChildren] = useState<any[]>([]);
  const [childId, setChildId] = useState('');
  const [info, setInfo] = useState<any>(null);
  const [track, setTrack] = useState<any>(null);
  const [att, setAtt] = useState<any[]>([]);
  const [inv, setInv] = useState<any[]>([]);
  const [reqs, setReqs] = useState<any[]>([]);
  const [tab, setTab] = useState('track');
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showReq, setShowReq] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reqForm, setReqForm] = useState({ requestType: 'new_transport', reason: '', address: '' });

  const loadChild = useCallback(async (cid: string) => {
    if (!cid) return;
    try {
      const [d, a, i, tr] = await Promise.all([
        t.parentTransport(cid), t.parentAttendance(cid), t.parentInvoices(cid), t.parentTrack(cid),
      ]);
      setInfo(unwrap(d)); setAtt(unwrap(a) ?? []); setInv(unwrap(i) ?? []); setTrack(unwrap(tr));
    } catch (err: any) { if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  const init = useCallback(async () => {
    try {
      const kids = unwrap(await t.parentChildren()) ?? [];
      setChildren(kids);
      const first = kids[0]?.studentId || '';
      setChildId(first);
      setReqs(unwrap(await t.parentRequests()) ?? []);
      if (first) await loadChild(first); else setLoading(false);
    } catch (err: any) { if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true); setLoading(false); }
  }, [loadChild]);
  useEffect(() => { if (user?.role) init(); }, [user?.role]); // eslint-disable-line

  const changeChild = (id: string) => { setChildId(id); setLoading(true); loadChild(id); };
  const submitReq = async () => {
    setSubmitting(true);
    try {
      await t.parentCreateRequest({ studentId: childId, requestType: reqForm.requestType,
        details: { reason: reqForm.reason, address: reqForm.address } });
      setShowReq(false); setReqForm({ requestType: 'new_transport', reason: '', address: '' });
      setReqs(unwrap(await t.parentRequests()) ?? []);
      Alert.alert('Submitted', 'Your request has been sent to the transport office.');
    } catch (err: any) { Alert.alert('Error', err?.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  if (disabled) return <><Stack.Screen options={{ title: 'Transport' }} /><ModuleDisabled /></>;
  if (loading) return <><Stack.Screen options={{ title: 'Transport' }} /><LoaderView /></>;

  const r = info?.route;
  return (
    <>
      <Stack.Screen options={{ title: 'Transport' }} />
      <ScrollView style={s.root} contentContainerStyle={{ padding: Spacing.md, paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadChild(childId); }} />}>
        {children.length > 1 && (
          <Select label="Child" value={childId}
            options={children.map(c => ({ label: c.name, value: c.studentId }))} onChange={changeChild} />
        )}

        <SegTabs active={tab} onChange={setTab} tabs={[
          { key: 'track', label: 'Track' }, { key: 'bus', label: 'My Bus' },
          { key: 'att', label: 'Attendance' }, { key: 'fees', label: 'Fees' }, { key: 'req', label: 'Requests' }]} />

        {tab === 'track' && (
          !track || (!track.active && track.reason)
            ? <Empty icon="navigate-outline" text="No live trip right now." />
            : (
              <Card>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <Badge label={track.status} /><Badge label={`${track.shift} ${track.direction}`} tone="info" />
                  <Badge label={`child: ${track.myStatus}`} tone={track.myStatus === 'boarded' ? 'success' : 'neutral'} />
                  {track.delayMinutes > 0 && <Badge label={`${track.delayMinutes}m late`} tone="danger" />}
                </View>
                <KV label="Bus" value={track.vehicle?.vehicleNumber} />
                <KV label="Driver" value={track.driver?.name} />
                {track.lastLocation?.latitude
                  ? <View style={{ marginTop: 8 }}><ActionBtn label="Open live location in Maps" tone="info" onPress={() => Linking.openURL(`https://www.google.com/maps?q=${track.lastLocation.latitude},${track.lastLocation.longitude}`)} /></View>
                  : <Text style={s.muted}>Awaiting GPS signal…</Text>}
                <View style={{ marginTop: 10 }}>
                  {(track.stops || []).map((st: any, i: number) => (
                    <View key={i} style={s.stopRow}>
                      <View style={[s.dot, { backgroundColor: st.status === 'reached' ? Colors.success : Colors.border }]} />
                      <Text style={s.stopName}>{st.name}</Text>
                      <Text style={s.muted}>{st.reachedAt ? tm(st.reachedAt) : st.plannedTime}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            )
        )}

        {tab === 'bus' && (!info ? <Empty icon="bus-outline" text="No transport assigned." /> : (
          <Card>
            <KV label="Route" value={`${r?.name} (${r?.routeCode})`} />
            <KV label="Bus" value={r?.vehicle?.vehicleNumber} />
            <KV label="Registration" value={r?.vehicle?.registrationNumber} />
            <KV label="Driver" value={r?.driver?.name} />
            <KV label="Pickup" value={info.pickupStopName || '--'} />
            <KV label="Drop" value={info.dropStopName || '--'} />
            <KV label="Seat" value={info.seatNumber || '--'} />
            {r?.driver?.phone ? <View style={{ marginTop: 8 }}><ActionBtn label={`Call driver · ${r.driver.phone}`} tone="info" onPress={() => Linking.openURL(`tel:${r.driver.phone}`)} /></View> : null}
          </Card>
        ))}

        {tab === 'att' && (att.length === 0 ? <Empty icon="checkmark-circle-outline" text="No records yet." />
          : att.map((a, i) => (
            <RowItem key={i} icon="bus" title={`${fmtDate(a.date)} · ${a.shift} ${a.direction}`}
              sub={`Boarded ${tm(a.boardTime)} · Dropped ${tm(a.dropTime)}`} right={<Badge label={a.status} />} />
          )))}

        {tab === 'fees' && (inv.length === 0 ? <Empty icon="card-outline" text="No invoices yet." />
          : inv.map((v, i) => (
            <RowItem key={i} icon="receipt" title={`${v.invoiceNumber} · ${v.period?.label}`}
              sub={`Due ${fmtMoney(Math.max(0, v.netAmount - v.paidAmount))}`} right={<Badge label={v.status} />} />
          )))}

        {tab === 'req' && (reqs.length === 0 ? <Empty icon="mail-outline" text="No requests yet. Tap + to raise one." />
          : reqs.map((rq, i) => (
            <RowItem key={i} icon="mail" title={REQ_TYPES.find(x => x.value === rq.requestType)?.label || rq.requestType}
              sub={`${rq.requestCode} · ${rq.student?.name || ''}`} right={<Badge label={rq.status} />} />
          )))}
      </ScrollView>

      {tab === 'req' && <FAB icon="add" onPress={() => setShowReq(true)} />}

      <FormModal visible={showReq} title="New Transport Request" onClose={() => setShowReq(false)}
        onSubmit={submitReq} submitting={submitting} submitLabel="Submit">
        <Select label="Request Type" value={reqForm.requestType} options={REQ_TYPES}
          onChange={v => setReqForm(f => ({ ...f, requestType: v }))} />
        {reqForm.requestType === 'temporary_address' && (
          <Input label="Temporary Address" value={reqForm.address} onChange={v => setReqForm(f => ({ ...f, address: v }))} multiline />
        )}
        <Input label="Reason / Note" value={reqForm.reason} onChange={v => setReqForm(f => ({ ...f, reason: v }))} multiline
          placeholder="Describe your request for the transport office" />
      </FormModal>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  muted: { fontSize: 12, color: Colors.textSecondary },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  stopName: { flex: 1, fontSize: 13, color: Colors.text },
});
