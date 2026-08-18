import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Linking } from 'react-native';
import { Stack } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import * as t from '@/api/transport.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Colors, Spacing } from '@/constants/theme';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, SegTabs, RowItem, ActionBtn, fmtMoney, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

const tm = (v?: string) => v ? new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';

export default function StudentTransportScreen() {
  const { user } = useAuth();
  const [info, setInfo] = useState<any>(undefined);
  const [track, setTrack] = useState<any>(null);
  const [att, setAtt] = useState<any[]>([]);
  const [inv, setInv] = useState<any[]>([]);
  const [tab, setTab] = useState('bus');
  const [disabled, setDisabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setInfo(unwrap(await t.studentTransport()));
      const [a, i] = await Promise.all([t.studentAttendance(), t.studentInvoices()]);
      setAtt(unwrap(a) ?? []); setInv(unwrap(i) ?? []);
      setTrack(unwrap(await t.studentTrack()));
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true); else setInfo(null);
    } finally { setRefreshing(false); }
  }, []);
  useEffect(() => { if (user?.role) load(); }, [user?.role]); // eslint-disable-line

  if (disabled) return <><Stack.Screen options={{ title: 'Transport' }} /><ModuleDisabled /></>;
  if (info === undefined) return <><Stack.Screen options={{ title: 'Transport' }} /><LoaderView /></>;

  const r = info?.route;
  return (
    <>
      <Stack.Screen options={{ title: 'My Transport' }} />
      <ScrollView style={s.root} contentContainerStyle={{ padding: Spacing.md, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        {!info ? <Empty icon="bus-outline" text="You are not assigned to a school bus." /> : (
          <>
            <SegTabs active={tab} onChange={setTab} tabs={[
              { key: 'bus', label: 'My Bus' }, { key: 'track', label: 'Track' },
              { key: 'att', label: 'Attendance' }, { key: 'fees', label: 'Fees' }]} />

            {tab === 'bus' && (
              <Card>
                <KV label="Route" value={`${r?.name} (${r?.routeCode})`} />
                <KV label="Bus" value={r?.vehicle?.vehicleNumber} />
                <KV label="Driver" value={r?.driver?.name} />
                <KV label="Attendant" value={r?.attendant?.name || '--'} />
                <KV label="Pickup" value={info.pickupStopName || '--'} />
                <KV label="Drop" value={info.dropStopName || '--'} />
                <KV label="Seat" value={info.seatNumber || '--'} />
                <KV label="Status" value={<Badge label={info.status} />} />
                {r?.driver?.phone ? <View style={{ marginTop: 8 }}><ActionBtn label={`Call driver · ${r.driver.phone}`} tone="info" onPress={() => Linking.openURL(`tel:${r.driver.phone}`)} /></View> : null}
              </Card>
            )}

            {tab === 'track' && (
              !track || (!track.active && track.reason)
                ? <Empty icon="navigate-outline" text="No live trip right now. Check back near pickup / drop time." />
                : (
                  <Card>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      <Badge label={track.status} /><Badge label={`${track.shift} ${track.direction}`} tone="info" />
                      <Badge label={`me: ${track.myStatus}`} tone={track.myStatus === 'boarded' ? 'success' : 'neutral'} />
                      {track.delayMinutes > 0 && <Badge label={`${track.delayMinutes}m late`} tone="danger" />}
                    </View>
                    {track.lastLocation?.latitude
                      ? <ActionBtn label="Open live location in Maps" tone="info" onPress={() => Linking.openURL(`https://www.google.com/maps?q=${track.lastLocation.latitude},${track.lastLocation.longitude}`)} />
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

            {tab === 'att' && (att.length === 0 ? <Empty icon="checkmark-circle-outline" text="No attendance records yet." />
              : att.map((a, i) => (
                <RowItem key={i} icon="bus" title={`${fmtDate(a.date)} · ${a.shift} ${a.direction}`}
                  sub={`Boarded ${tm(a.boardTime)} · Dropped ${tm(a.dropTime)}`}
                  right={<Badge label={a.status} />} />
              )))}

            {tab === 'fees' && (inv.length === 0 ? <Empty icon="card-outline" text="No transport invoices yet." />
              : inv.map((v, i) => (
                <RowItem key={i} icon="receipt" title={`${v.invoiceNumber} · ${v.period?.label}`}
                  sub={`Due ${fmtMoney(Math.max(0, v.netAmount - v.paidAmount))}`}
                  right={<Badge label={v.status} />} />
              )))}
          </>
        )}
      </ScrollView>
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
