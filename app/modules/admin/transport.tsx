import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import * as t from '@/api/transport.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { Colors, Spacing } from '@/constants/theme';
import {
  unwrap, LoaderView, Empty, Badge, Card, StatRow, StatTile, SegTabs, RowItem, fmtMoney,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

export default function AdminTransportScreen() {
  const { user } = useAuth();
  const [dash, setDash] = useState<any>(undefined);
  const [live, setLive] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [tab, setTab] = useState('overview');
  const [disabled, setDisabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setDash(unwrap(await t.getDashboard()));
      const [lv, vh, rt] = await Promise.all([t.getLiveTrips(), t.getVehicles({ limit: 50 }), t.getRoutes({ limit: 50 })]);
      setLive(unwrap(lv) ?? []);
      setVehicles(unwrap(vh)?.data ?? []);
      setRoutes(unwrap(rt)?.data ?? []);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true); else setDash(null);
    } finally { setRefreshing(false); }
  }, []);
  useEffect(() => { if (user?.role) load(); }, [user?.role]); // eslint-disable-line

  if (disabled) return <><Stack.Screen options={{ title: 'Transport' }} /><ModuleDisabled /></>;
  if (dash === undefined) return <><Stack.Screen options={{ title: 'Transport' }} /><LoaderView /></>;
  const d = dash || {};

  return (
    <>
      <Stack.Screen options={{ title: 'Transport' }} />
      <ScrollView style={s.root} contentContainerStyle={{ padding: Spacing.md, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>

        <StatRow>
          <StatTile label="Vehicles" value={d.totalVehicles ?? 0} icon="bus" tone="info" />
          <StatTile label="Drivers" value={`${d.activeDrivers ?? 0}/${d.totalDrivers ?? 0}`} icon="person" tone="success" />
          <StatTile label="Students" value={d.studentsTransported ?? 0} icon="school" tone="warning" />
        </StatRow>
        <StatRow>
          <StatTile label="Today Trips" value={d.todaysTrips ?? 0} icon="calendar" tone="info" />
          <StatTile label="Running" value={d.runningTrips ?? 0} icon="navigate" tone="success" />
          <StatTile label="Delayed" value={d.delayedTrips ?? 0} icon="time" tone={d.delayedTrips ? 'danger' : 'neutral'} />
        </StatRow>

        <SegTabs active={tab} onChange={setTab} tabs={[
          { key: 'overview', label: 'Overview' }, { key: 'live', label: 'Live' },
          { key: 'vehicles', label: 'Vehicles' }, { key: 'routes', label: 'Routes' }]} />

        {tab === 'overview' && (
          <>
            <Card>
              <Text style={s.h}>This month</Text>
              <View style={s.grid}>
                <Metric label="Collected" value={fmtMoney(d.feeCollectedMonth)} />
                <Metric label="Fuel cost" value={fmtMoney(d.fuelCostMonth)} />
                <Metric label="Maintenance" value={fmtMoney(d.maintenanceCostMonth)} />
                <Metric label="Occupancy" value={`${d.occupancy ?? 0}%`} />
              </View>
            </Card>
            {(d.upcomingRenewals || []).length > 0 && (
              <Card>
                <Text style={s.h}>Upcoming renewals</Text>
                {d.upcomingRenewals.slice(0, 6).map((rn: any, i: number) => {
                  const days = Math.ceil((new Date(rn.date).getTime() - Date.now()) / 864e5);
                  return <RowItem key={i} icon={rn.kind === 'vehicle' ? 'bus' : 'person'} title={`${rn.name} — ${rn.doc}`}
                    right={<Badge label={days < 0 ? 'Expired' : `${days}d`} tone={days < 0 ? 'danger' : days <= 7 ? 'warning' : 'neutral'} />} />;
                })}
              </Card>
            )}
            {(d.openComplaints > 0 || d.openIncidents > 0 || d.pendingRequests > 0) && (
              <Card>
                <Text style={s.h}>Needs attention</Text>
                <KVLine label="Open complaints" value={d.openComplaints || 0} />
                <KVLine label="Open incidents" value={d.openIncidents || 0} />
                <KVLine label="Pending requests" value={d.pendingRequests || 0} />
              </Card>
            )}
          </>
        )}

        {tab === 'live' && (live.length === 0 ? <Empty icon="navigate-outline" text="No trips running right now." />
          : live.map((lt) => (
            <RowItem key={lt._id} icon="bus" title={`${lt.vehicle?.vehicleNumber || '--'} · ${lt.route?.name || ''}`}
              sub={`${lt.shift} ${lt.direction} · boarded ${lt.boarded}/${lt.total} · stops ${lt.stopsReached}/${lt.stopsTotal}`}
              right={<Badge label={lt.status} tone={lt.status === 'started' ? 'success' : 'warning'} />} />
          )))}

        {tab === 'vehicles' && (vehicles.length === 0 ? <Empty icon="bus-outline" text="No vehicles." />
          : vehicles.map((v) => (
            <RowItem key={v._id} icon="bus" title={v.vehicleNumber} sub={`${v.registrationNumber} · ${v.currentOccupancy || 0}/${v.capacity} seats`}
              right={<Badge label={v.status} />} />
          )))}

        {tab === 'routes' && (routes.length === 0 ? <Empty icon="git-branch-outline" text="No routes." />
          : routes.map((r) => (
            <RowItem key={r._id} icon="git-branch" title={r.name} sub={`${r.routeCode} · ${r.stops?.length || 0} stops · ${r.studentCount || 0} students`}
              right={<Badge label={r.vehicle?.vehicleNumber || 'unassigned'} tone={r.vehicle ? 'info' : 'warning'} />} />
          )))}
      </ScrollView>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={s.metric}><Text style={s.mLabel}>{label}</Text><Text style={s.mValue}>{value}</Text></View>;
}
function KVLine({ label, value }: { label: string; value: number }) {
  return <View style={s.kvLine}><Text style={s.mLabel}>{label}</Text><Text style={s.mValue}>{value}</Text></View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  h: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  metric: { width: '50%', paddingVertical: 6 },
  kvLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  mLabel: { fontSize: 11, color: Colors.textSecondary },
  mValue: { fontSize: 15, fontWeight: '700', color: Colors.text },
});
