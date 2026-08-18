import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as teacherApi from '@/api/teacher.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, ActionBtn, SegTabs,
  FormModal, Input, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

const TABS = [
  { key: 'mark', label: 'Mark Class' },
  { key: 'mine', label: 'My Attendance' },
  { key: 'ranking', label: 'Ranking' },
  { key: 'corrections', label: 'Corrections' },
];

// Local date — toISOString() is UTC and shows yesterday during early-morning hours in IST
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function TeacherAttendanceScreen() {
  const [tab, setTab] = useState('mark');
  const [disabled, setDisabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ── Mark class ──────────────────────────────────────────────────────────────
  const [date, setDate] = useState(todayStr());
  const [students, setStudents] = useState<any[]>([]);
  const [records, setRecords] = useState<Record<string, string>>({});
  const [markLoading, setMarkLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadMark = async (d = date) => {
    setMarkLoading(true);
    try {
      const res = unwrap(await teacherApi.getAttendance({ date: d }));
      setStudents(res?.students ?? []);
      const map: Record<string, string> = {};
      (res?.records ?? []).forEach((r: any) => { map[String(r.student)] = String(r.status).toLowerCase(); });
      setRecords(map);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setMarkLoading(false); setRefreshing(false); }
  };

  const idOf = (s: any) => String(s.user?._id ?? s._id);
  const setStatus = (s: any, status: string) => setRecords(r => ({ ...r, [idOf(s)]: status }));
  const markAll = (status: string) => {
    const map: Record<string, string> = {};
    students.forEach(s => { map[idOf(s)] = status; });
    setRecords(map);
  };

  const saveMark = async () => {
    setSaving(true);
    try {
      await teacherApi.markAttendance({
        date,
        records: students.map(s => ({ studentId: idOf(s), status: records[idOf(s)] || 'absent' })),
      });
      Alert.alert('Saved', 'Attendance saved for ' + fmtDate(date));
      loadMark();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  const shiftDate = (days: number) => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + days);
    // Format from local parts — toISOString() is UTC and shifts the day in TZ>0
    const nd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (nd > todayStr()) return;
    setDate(nd);
    loadMark(nd);
  };

  // ── My attendance ───────────────────────────────────────────────────────────
  const [mine, setMine] = useState<any>(null);
  const [mineLoading, setMineLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showReg, setShowReg] = useState(false);
  const [regForm, setRegForm] = useState({ date: '', checkIn: '', checkOut: '', reason: '' });
  const [myRegs, setMyRegs] = useState<any[]>([]);

  const loadMine = async () => {
    setMineLoading(true);
    try {
      const [att, regs]: any[] = await Promise.all([
        teacherApi.getMyAttendance(),
        teacherApi.getMyRegularizations().catch(() => null),
      ]);
      setMine(unwrap(att));
      const r = unwrap(regs);
      setMyRegs(Array.isArray(r) ? r : r?.requests ?? []);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setMineLoading(false); setRefreshing(false); }
  };

  const punch = async (dir: 'in' | 'out') => {
    setBusy(true);
    try {
      if (dir === 'in') await teacherApi.clockIn(); else await teacherApi.clockOut();
      loadMine();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setBusy(false); }
  };

  const submitReg = async () => {
    if (!regForm.date || !/^\d{4}-\d{2}-\d{2}$/.test(regForm.date))
      return Alert.alert('Required', 'Date is required (YYYY-MM-DD)');
    if (!regForm.checkIn && !regForm.checkOut)
      return Alert.alert('Required', 'Provide at least a check-in or check-out time (HH:MM)');
    setSaving(true);
    try {
      await teacherApi.submitRegularization(regForm);
      setShowReg(false);
      setRegForm({ date: '', checkIn: '', checkOut: '', reason: '' });
      loadMine();
      Alert.alert('Submitted', 'Your regularization request is pending admin approval.');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  // ── Ranking ─────────────────────────────────────────────────────────────────
  const [ranking, setRanking] = useState<any>(null);
  const loadRanking = async () => {
    try { setRanking(unwrap(await teacherApi.getClassRanking())); }
    catch {} finally { setRefreshing(false); }
  };

  // ── Corrections ─────────────────────────────────────────────────────────────
  const [corrections, setCorrections] = useState<any[]>([]);
  const [corrLoading, setCorrLoading] = useState(true);
  const loadCorrections = async () => {
    setCorrLoading(true);
    try {
      const d = unwrap(await teacherApi.getCorrectionRequests());
      setCorrections(Array.isArray(d) ? d : []);
    } catch {} finally { setCorrLoading(false); setRefreshing(false); }
  };

  const review = async (r: any, status: 'approved' | 'rejected') => {
    try { await teacherApi.reviewCorrection({ id: r._id, status }); loadCorrections(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  useEffect(() => { loadMark(); }, []);
  useEffect(() => {
    if (tab === 'mine') loadMine();
    if (tab === 'ranking') loadRanking();
    if (tab === 'corrections') loadCorrections();
  }, [tab]);

  const onRefresh = () => {
    setRefreshing(true);
    if (tab === 'mark') loadMark();
    else if (tab === 'mine') loadMine();
    else if (tab === 'ranking') loadRanking();
    else loadCorrections();
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Attendance' }} />
      <ModuleDisabled />
    </>
  );

  const today = mine?.today;
  const summary = mine?.summary;
  const days: any[] = mine?.days ?? [];

  return (
    <>
      <Stack.Screen options={{ title: 'Attendance' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <SegTabs tabs={TABS} active={tab} onChange={setTab} />

        {/* ── Mark class ── */}
        {tab === 'mark' && (
          markLoading ? <LoaderView /> : (
            <>
              <View style={ta.dateRow}>
                <TouchableOpacity onPress={() => shiftDate(-1)} style={ta.dateBtn}>
                  <Ionicons name="chevron-back" size={18} color={Colors.text} />
                </TouchableOpacity>
                <Text style={ta.dateText}>{fmtDate(date)}{date === todayStr() ? ' · Today' : ''}</Text>
                <TouchableOpacity onPress={() => shiftDate(1)} style={[ta.dateBtn, date === todayStr() && { opacity: 0.3 }]}>
                  <Ionicons name="chevron-forward" size={18} color={Colors.text} />
                </TouchableOpacity>
              </View>

              {students.length === 0 ? (
                <Empty icon="people-outline" text="No students in your section (only class teachers can mark attendance)" />
              ) : (
                <>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: Spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <ActionBtn label="All Present" tone="success" small onPress={() => markAll('present')} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ActionBtn label="All Absent" tone="danger" small onPress={() => markAll('absent')} />
                    </View>
                  </View>

                  {students.map((s: any, i: number) => {
                    const st = records[idOf(s)];
                    return (
                      <View key={i} style={ta.studentRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={ta.studentName}>{s.user?.name ?? s.name}</Text>
                          {s.rollNumber ? <Text style={ta.roll}>Roll {s.rollNumber}</Text> : null}
                        </View>
                        {['present', 'absent', 'late'].map(opt => (
                          <TouchableOpacity
                            key={opt}
                            style={[ta.statusBtn, st === opt && ta[`statusBtn_${opt}` as keyof typeof ta] as any]}
                            onPress={() => setStatus(s, opt)}
                          >
                            <Text style={[ta.statusBtnText, st === opt && { color: '#fff' }]}>
                              {opt === 'present' ? 'P' : opt === 'absent' ? 'A' : 'L'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    );
                  })}
                  <ActionBtn label={saving ? 'Saving…' : 'Save Attendance'} tone="success" onPress={saveMark} />
                </>
              )}
            </>
          )
        )}

        {/* ── My attendance ── */}
        {tab === 'mine' && (
          mineLoading ? <LoaderView /> : (
            <>
              <Card>
                {today?.onLeave ? (
                  <KV label="Today" value={<Badge label={today.leaveLabel || 'On Leave'} tone="info" />} />
                ) : (
                  <>
                    <KV label="Check-in" value={today?.checkIn || 'Not yet'} />
                    <KV label="Check-out" value={today?.checkOut || 'Not yet'} />
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
                  </>
                )}
              </Card>

              {summary && (
                <Card>
                  <View style={ta.summaryRow}>
                    {Object.entries(summary).map(([k, v]: [string, any]) => (
                      <View key={k} style={ta.summaryItem}>
                        <Text style={ta.summaryVal}>{v}</Text>
                        <Text style={ta.summaryLabel}>{k.replace('-', ' ')}</Text>
                      </View>
                    ))}
                  </View>
                </Card>
              )}

              <View style={{ marginBottom: Spacing.sm }}>
                <ActionBtn label="Request Regularization" tone="info" onPress={() => setShowReg(true)} />
              </View>

              {myRegs.length > 0 && (
                <>
                  <Text style={ta.groupLabel}>My Requests</Text>
                  {myRegs.map((r: any, i: number) => (
                    <Card key={i}>
                      <KV label="Date" value={fmtDate(r.date)} />
                      <KV label="Times" value={`${r.checkIn ?? '--'} → ${r.checkOut ?? '--'}`} />
                      {r.reason ? <KV label="Reason" value={r.reason} /> : null}
                      <KV label="Status" value={<Badge label={String(r.status ?? 'pending').toLowerCase()} />} />
                    </Card>
                  ))}
                </>
              )}

              <Text style={ta.groupLabel}>This Month</Text>
              {days.filter((d: any) => d.status && !['weekend', 'pending'].includes(d.status)).length === 0 ? (
                <Empty icon="calendar-outline" text="No attendance recorded this month" />
              ) : (
                days.filter((d: any) => d.status && !['weekend', 'pending'].includes(d.status)).map((d: any, i: number) => (
                  <View key={i} style={ta.dayRow}>
                    <Text style={ta.dayNum}>{d.day ?? d.date ?? i + 1}</Text>
                    <Text style={ta.dayTimes}>{d.checkIn ? `${d.checkIn}${d.checkOut ? ` – ${d.checkOut}` : ''}` : ''}</Text>
                    <Badge label={String(d.status ?? '--')} />
                  </View>
                ))
              )}
            </>
          )
        )}

        {/* ── Ranking ── */}
        {tab === 'ranking' && (
          !ranking ? <LoaderView /> : (ranking.ranking ?? []).length === 0 ? (
            <Empty icon="trophy-outline" text="No ranking data yet" />
          ) : (
            (ranking.ranking as any[]).map((row: any, i: number) => (
              <View key={row.student?._id ?? i} style={ta.rankRow}>
                <Text style={ta.rankPos}>#{row.rank ?? i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={ta.studentName}>{row.student?.name ?? '--'}</Text>
                  {row.student?.rollNumber ? <Text style={ta.roll}>Roll {row.student.rollNumber}</Text> : null}
                  <Text style={ta.roll}>{row.present ?? 0}/{row.total ?? 0} present</Text>
                </View>
                <Text style={ta.rankPct}>{row.percentage != null ? `${row.percentage}%` : '--'}</Text>
              </View>
            ))
          )
        )}

        {/* ── Corrections ── */}
        {tab === 'corrections' && (
          corrLoading ? <LoaderView /> : corrections.length === 0 ? (
            <Empty icon="checkmark-done-outline" text="No correction requests from students" />
          ) : (
            corrections.map((r: any) => (
              <Card key={r._id}>
                <KV label="Student" value={r.student?.name ?? '--'} />
                <KV label="Date" value={fmtDate(r.date)} />
                <KV label="Requested" value={r.requestedStatus ?? '--'} />
                {r.reason ? <KV label="Reason" value={r.reason} /> : null}
                <KV label="Status" value={<Badge label={String(r.status ?? 'pending').toLowerCase()} />} />
                {String(r.status).toLowerCase() === 'pending' && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <View style={{ flex: 1 }}>
                      <ActionBtn label="Approve" tone="success" onPress={() => review(r, 'approved')} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ActionBtn label="Reject" tone="danger" onPress={() => review(r, 'rejected')} />
                    </View>
                  </View>
                )}
              </Card>
            ))
          )
        )}
      </ScrollView>

      {/* Regularization form */}
      <FormModal visible={showReg} title="Regularization Request" onClose={() => setShowReg(false)} onSubmit={submitReg} submitting={saving} submitLabel="Submit Request">
        <Input label="Date * (YYYY-MM-DD)" value={regForm.date} onChange={v => setRegForm(f => ({ ...f, date: v }))} placeholder={todayStr()} />
        <Input label="Check-in time (HH:MM)" value={regForm.checkIn} onChange={v => setRegForm(f => ({ ...f, checkIn: v }))} placeholder="08:05" />
        <Input label="Check-out time (HH:MM)" value={regForm.checkOut} onChange={v => setRegForm(f => ({ ...f, checkOut: v }))} placeholder="15:30" />
        <Input label="Reason" value={regForm.reason} onChange={v => setRegForm(f => ({ ...f, reason: v }))} placeholder="Why was the punch missed?" multiline />
      </FormModal>
    </>
  );
}

const ta = StyleSheet.create({
  dateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 8,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm,
  },
  dateBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  dateText: { ...Typography.label, color: Colors.text },
  studentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 10,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 6,
  },
  studentName: { ...Typography.label, color: Colors.text },
  roll: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  statusBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  statusBtn_present: { backgroundColor: Colors.success, borderColor: Colors.success },
  statusBtn_absent: { backgroundColor: Colors.danger, borderColor: Colors.danger },
  statusBtn_late: { backgroundColor: Colors.warning, borderColor: Colors.warning },
  statusBtnText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center' },
  summaryVal: { fontSize: 18, fontWeight: '700', color: Colors.text },
  summaryLabel: { fontSize: 10, color: Colors.textSecondary, textTransform: 'capitalize', marginTop: 2 },
  groupLabel: { ...Typography.h4, color: Colors.text, marginBottom: 8, marginTop: 4 },
  dayRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 10,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 6,
  },
  dayNum: { width: 30, fontSize: 13, fontWeight: '700', color: Colors.text },
  dayTimes: { flex: 1, fontSize: 12, color: Colors.textSecondary },
  rankRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 8,
  },
  rankRowMine: { borderColor: Colors.accent, backgroundColor: Colors.accentLight },
  rankPos: { fontSize: 16, fontWeight: '800', color: Colors.primary, width: 40 },
  rankPct: { fontSize: 15, fontWeight: '700', color: Colors.success },
});
