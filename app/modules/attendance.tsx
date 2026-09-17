/**
 * Attendance — the student's own, or a parent's for one child at a time.
 *
 * The phone half of the web pages (school-frontend pages/student/Attendance.jsx
 * and pages/parent/ChildAttendance.jsx):
 *   student  Overview · Class Ranking · My Requests (ask for a correction, answer the teacher)
 *   parent   Overview · Correction Requests (read-only; the child replies from their account)
 *
 * Notifications open ?tab=requests&focus=<request>, a mark notice ?date=YYYY-MM-DD
 * (that month, that day picked), an alert ?focus=<student>; a parent's also carry ?child=.
 * Teachers are sent on to their own workspace.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import * as studentApi from '@/api/student.api';
import * as parentApi from '@/api/parent.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { FocusRow } from '@/components/FocusHighlight';
import { MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import {
  BRAND, MUTE, TEXT, LINE, Head, TabBar, Btn, Card, Blank, Loading, useFlash, appendFiles, todayKey, errText,
  type Picked,
} from '@/components/attendance/parts';
import { CorrectionSheet, OverviewBody, RankingBody, RequestsBody } from '@/components/attendance/StudentView';

const STUDENT_TABS = [
  { value: 'overview', label: 'Overview', icon: 'calendar-outline' },
  { value: 'ranking', label: 'Class Ranking', icon: 'trophy-outline' },
  { value: 'requests', label: 'My Requests', icon: 'time-outline' },
];
const PARENT_TABS = [
  { value: 'overview', label: 'Overview', icon: 'calendar-outline' },
  { value: 'requests', label: 'Correction Requests', icon: 'time-outline' },
];
const unwrap = (res: any) => res?.data ?? res;

export default function AttendanceScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const params = useLocalSearchParams<{ tab?: string; date?: string; child?: string; focus?: string }>();
  const role = user?.role;
  const parent = role === 'parent';
  const tabs = parent ? PARENT_TABS : STUDENT_TABS;

  const linkDate = /^\d{4}-\d{2}-\d{2}$/.test(String(params.date || '')) ? String(params.date) : '';
  const [tab, setTab] = useState(['overview', 'ranking', 'requests'].includes(String(params.tab)) ? String(params.tab) : 'overview');
  const [month, setMonth] = useState((linkDate || todayKey()).slice(0, 7));
  const [day, setDay] = useState(linkDate || todayKey());
  const [child, setChild] = useState(params.child ? String(params.child) : '');

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');
  const [requests, setRequests] = useState<any[] | null>(null);
  const [ranking, setRanking] = useState<any>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const flash = useFlash();

  useEffect(() => { if (role === 'teacher') router.replace('/modules/teacher-attendance' as any); }, [role]);

  const blocked = (e: any) => { if (MODULE_BLOCKED_CODES.includes(e?.data?.code)) { setDisabled(true); return true; } return false; };

  const loadOverview = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = parent
        ? await parentApi.getChildAttendanceOverview({ child: child || undefined, month })
        : await studentApi.getAttendanceOverview({ month });
      setData(unwrap(res));
    } catch (e) { if (!blocked(e)) setError(errText(e)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [parent, child, month]);

  const childId = data?.child?._id || child;
  const loadRequests = useCallback(async () => {
    try {
      const res = parent
        ? (childId ? await parentApi.getChildCorrections({ child: childId }) : [])
        : await studentApi.getMyCorrections();
      const list = unwrap(res);
      setRequests(Array.isArray(list) ? list : []);
    } catch (e) { if (!blocked(e)) setRequests([]); }
    finally { setRefreshing(false); }
  }, [parent, childId]);

  const loadRanking = useCallback(async () => {
    try { setRanking(unwrap(await studentApi.getClassRanking())); }
    catch (e) { if (!blocked(e)) setRanking({ ranking: [] }); }
    finally { setRefreshing(false); }
  }, []);

  // Wait for the user record — firing before the role is known hits the wrong role's API.
  useEffect(() => { if (role === 'student' || role === 'parent') loadOverview(); }, [role, loadOverview]);
  useEffect(() => { if ((role === 'student' || role === 'parent') && tab === 'requests') loadRequests(); }, [role, tab, loadRequests]);
  useEffect(() => { if (role === 'student' && tab === 'ranking') loadRanking(); }, [role, tab, loadRanking]);

  const onRefresh = () => {
    setRefreshing(true);
    loadOverview();
    if (tab === 'requests') loadRequests();
    if (tab === 'ranking') loadRanking();
  };
  const onMonth = (ym: string) => { setMonth(ym); setDay(ym === todayKey().slice(0, 7) ? todayKey() : `${ym}-01`); };
  const pickChild = (id: string) => { setChild(id); setRequests(null); };

  const reply = async (r: any, text: string, files: Picked[]) => {
    const body = new FormData();
    body.append('message', text);
    appendFiles(body, files);
    try {
      await studentApi.replyCorrection(r._id, body);
      flash.good('Reply sent to your teacher');
      loadRequests(); loadOverview();
    } catch (e) { flash.bad(errText(e)); throw e; }
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Attendance' }} /><ModuleDisabled /></>);
  if (role === 'teacher') return <Stack.Screen options={{ title: 'Attendance' }} />;

  const children: any[] = data?.children || [];
  const name = data?.student?.name || 'your child';
  const counts = { requests: data?.requests?.awaitingReply || 0 };

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F7FB' }}>
      <Stack.Screen options={{ title: parent ? 'Child Attendance' : 'My Attendance' }} />
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}>
        <Head title={parent ? 'Child Attendance' : 'My Attendance'}
          subtitle={parent ? `How regularly ${name} attends school, day by day, and any corrections asked for.` : 'Your attendance day by day, where you stand in class, and your correction requests.'} />

        {parent && children.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
            {children.map((c) => {
              const on = String(c._id) === String(data?.child?._id);
              return (
                <TouchableOpacity key={c._id} style={[st.kid, on && st.kidOn]} onPress={() => pickChild(String(c._id))}
                  accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={c.name}>
                  <View style={[st.kidAv, on && { backgroundColor: BRAND }]}><Text style={[st.kidInit, on && { color: '#fff' }]}>{String(c.name || '?').slice(0, 1).toUpperCase()}</Text></View>
                  <View style={{ minWidth: 0 }}>
                    <Text style={[st.kidName, on && { color: BRAND }]} numberOfLines={1}>{c.name}</Text>
                    <Text style={st.kidClass} numberOfLines={1}>{[c.className, c.sectionName ? `Section ${c.sectionName}` : ''].filter(Boolean).join(' — ') || 'No class yet'}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        {!parent ? (
          <View style={{ marginBottom: 12 }}>
            <Btn label="Request Correction" icon="create-outline" kind="primary" onPress={() => setAsking(tab === 'overview' && day >= (data?.canRequestFrom || '') ? day : '')} />
          </View>
        ) : null}

        <TabBar tabs={tabs} value={tab} onChange={setTab} counts={counts} />
        {flash.node}

        {parent && !loading && data && !children.length ? (
          <Card><Blank icon="people-outline" title="No children linked" body="Ask the school office to link your child to your account." /></Card>
        ) : error && !data ? (
          <Card><Blank icon="alert-circle-outline" title="Attendance could not be loaded" body={error} /></Card>
        ) : tab === 'overview' ? (
          !data?.student ? <Loading /> : (
            <FocusRow id={data.student._id} scrollRef={scrollRef}>
              <OverviewBody data={data} who={parent ? 'parent' : 'student'} day={day} onDay={setDay} onMonth={onMonth} loading={loading}
                onRequest={parent ? undefined : (k) => setAsking(k)} onRequests={() => setTab('requests')} />
            </FocusRow>
          )
        ) : tab === 'ranking' && !parent ? (
          !ranking ? <Loading /> : <RankingBody data={ranking} me={user?._id} unit={data?.mode === 'subject' ? 'classes' : 'days'} />
        ) : (
          requests == null ? <Loading /> : (
            <RequestsBody requests={requests} who={parent ? 'parent' : 'student'} name={name} onReply={parent ? undefined : reply}
              onError={flash.bad} wrap={(id, card) => <FocusRow id={id} scrollRef={scrollRef}>{card}</FocusRow>}
              emptyBody={parent ? `${name} can ask for a correction from their own account when a mark looks wrong.` : 'When a mark looks wrong, use Request Correction and your teacher will review it.'} />
          )
        )}
      </ScrollView>

      {!parent ? (
        <CorrectionSheet visible={asking != null} date={asking || ''} minDate={data?.canRequestFrom} onClose={() => setAsking(null)}
          onSaved={() => { setAsking(null); flash.good('Request sent — your teacher will review it'); setTab('requests'); loadRequests(); loadOverview(); }} />
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  kid: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: LINE, backgroundColor: '#fff', maxWidth: 240 },
  kidOn: { borderColor: BRAND, backgroundColor: '#F5F6FF' },
  kidAv: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#EEF0FF', alignItems: 'center', justifyContent: 'center' },
  kidInit: { fontSize: 13, fontWeight: '800', color: BRAND },
  kidName: { fontSize: 13, fontWeight: '700', color: TEXT },
  kidClass: { fontSize: 11, color: MUTE },
});

