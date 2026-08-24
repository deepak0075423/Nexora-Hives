import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert } from 'react-native';
import { FocusRow } from '@/components/FocusHighlight';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, ActionBtn, SegTabs,
  fmtDate, fmtDateTime,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

export default function AdminAttendanceScreen() {
  // First hook in the component on purpose: the early module-disabled
  // return sits below, and a hook after it would not run every render.
  // Held so a notification can scroll its record into view.
  const scrollRef = useRef<ScrollView>(null);
  // A notification links straight at a tab (?tab=…), so the screen opens on
  // the list the notification was about rather than its default.
  const { tab: wantedTab } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState(
    ['requests', 'mine'].includes(String(wantedTab)) ? String(wantedTab) : 'requests');
  const [requests, setRequests] = useState<any[]>([]);
  const [myAtt, setMyAtt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [reqs, mine]: any[] = await Promise.all([
        adminApi.getRegularizationRequests({ status: 'pending', page: 1, limit: 50 }),
        adminApi.getMyAttendance().catch(() => null),
      ]);
      setRequests((reqs as any)?.data ?? unwrap(reqs) ?? []);
      setMyAtt(unwrap(mine));
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const review = async (r: any, status: 'approved' | 'rejected') => {
    try {
      await adminApi.reviewRegularization({ id: r._id, status, remarks: '' });
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  const punch = async (dir: 'in' | 'out') => {
    setBusy(true);
    try {
      if (dir === 'in') await adminApi.clockIn(); else await adminApi.clockOut();
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setBusy(false); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Attendance' }} />
      <ModuleDisabled />
    </>
  );

  // Self-attendance returns { days, summary, today }; show only days with real activity
  const days: any[] = myAtt?.days ?? (Array.isArray(myAtt) ? myAtt : []);
  const records: any[] = days.filter((d: any) => d.status && !['weekend', 'pending'].includes(d.status));
  const today = myAtt?.today;
  // `today` carries clock state, not a status — derive a label for the badge
  const todayStatus = today?.onLeave ? (today.leaveLabel || 'Leave') : today?.clockedIn ? 'Present' : null;

  return (
    <>
      <Stack.Screen options={{ title: 'Attendance' }} />
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : (
          <>
            <SegTabs
              tabs={[{ key: 'requests', label: `Regularizations (${requests.length})` }, { key: 'mine', label: 'My Attendance' }]}
              active={tab} onChange={setTab}
            />

            {tab === 'requests' ? (
              requests.length === 0 ? <Empty icon="checkmark-done-outline" text="No pending regularization requests" /> :
              requests.map((r: any) => (
                // A regularization notification names its request — this is
                // what scrolls to it and flags it on arrival.
                <FocusRow key={r._id} id={r._id} scrollRef={scrollRef}>
                <Card>
                  <KV label="Teacher" value={r.teacher?.name ?? '--'} />
                  <KV label="Date" value={fmtDate(r.date)} />
                  <KV label="Type" value={r.requestType ?? '--'} />
                  {r.reason ? <KV label="Reason" value={r.reason} /> : null}
                  {(r.checkIn || r.checkOut) && (
                    <KV label="Requested times" value={`${r.checkIn ?? '--'} → ${r.checkOut ?? '--'}`} />
                  )}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <View style={{ flex: 1 }}>
                      <ActionBtn label="Approve" tone="success" onPress={() => review(r, 'approved')} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ActionBtn label="Reject" tone="danger" onPress={() => review(r, 'rejected')} />
                    </View>
                  </View>
                </Card>
                </FocusRow>
              ))
            ) : (
              <>
                <Card>
                  <KV label="Today" value={todayStatus ? <Badge label={todayStatus} /> : 'Not marked'} />
                  <KV label="Check-in" value={today?.checkIn ?? '--'} />
                  <KV label="Check-out" value={today?.checkOut ?? '--'} />
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <View style={{ flex: 1 }}>
                      <ActionBtn label={busy ? '…' : today?.clockedIn ? 'Clocked In ✓' : 'Clock In'} tone="success"
                        onPress={() => !today?.clockedIn && punch('in')} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ActionBtn label={busy ? '…' : today?.clockedOut ? 'Clocked Out ✓' : 'Clock Out'} tone="warning"
                        onPress={() => !today?.clockedOut && punch('out')} />
                    </View>
                  </View>
                </Card>
                {records.length === 0 ? <Empty icon="calendar-outline" text="No attendance records" /> :
                  records.slice(0, 31).map((rec: any, i: number) => (
                    <Card key={i}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.text }}>{fmtDate(rec.date)}</Text>
                          <Text style={{ fontSize: 11, color: Colors.textSecondary, marginTop: 2 }}>
                            {rec.checkIn ?? '--'} → {rec.checkOut ?? '--'}
                          </Text>
                        </View>
                        <Badge label={String(rec.status ?? '--')} />
                      </View>
                    </Card>
                  ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}
