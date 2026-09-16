/**
 * Admin → Attendance: the staff regularization queue.
 *
 * There is no "My Attendance" here. Clocking in and out and asking for a missed
 * punch belong to the teacher role, decided by the post the session is signed
 * in as — an admin who also teaches switches to their teacher post (Profile →
 * switch) and clocks in from Teacher Attendance. Old links that asked for
 * ?tab=mine open the queue.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { FocusRow } from '@/components/FocusHighlight';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Card, KV, ActionBtn,
  fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

export default function AdminAttendanceScreen() {
  // First hook in the component on purpose: the early module-disabled
  // return sits below, and a hook after it would not run every render.
  // Held so a notification can scroll its record into view.
  const scrollRef = useRef<ScrollView>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async () => {
    try {
      const reqs: any = await adminApi.getRegularizationRequests({ status: 'pending', page: 1, limit: 50 });
      setRequests(reqs?.data ?? unwrap(reqs) ?? []);
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

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Attendance' }} />
      <ModuleDisabled />
    </>
  );

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
        )}
      </ScrollView>
    </>
  );
}
