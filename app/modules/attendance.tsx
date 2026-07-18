import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as studentApi from '@/api/student.api';
import * as teacherApi from '@/api/teacher.api';
import * as parentApi from '@/api/parent.api';
import ModuleDisabled from '@/components/ModuleDisabled';

const STATUS_STYLE: Record<string, { bg: string; color: string; icon: string }> = {
  present: { bg: Colors.successLight, color: Colors.success, icon: 'checkmark-circle' },
  absent:  { bg: Colors.dangerLight,  color: Colors.danger,  icon: 'close-circle' },
  late:    { bg: Colors.warningLight, color: Colors.warning, icon: 'time' },
};

export default function AttendanceScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Teachers get the full attendance workspace (mark class, clock in/out, corrections)
  useEffect(() => {
    if (user?.role === 'teacher') router.replace('/modules/teacher-attendance' as any);
  }, [user?.role]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async () => {
    try {
      let res: any;
      if (user?.role === 'teacher') res = await teacherApi.getMyAttendance();
      else if (user?.role === 'parent') res = await parentApi.getChildAttendance();
      else res = await studentApi.getMyAttendance();
      setData((res as any)?.data ?? res);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    }
    finally { setLoading(false); setRefreshing(false); }
  };

  // Wait for the user record — firing before role is known would hit the wrong role's API
  useEffect(() => { if (user?.role) load(); }, [user?.role]);
  const onRefresh = () => { setRefreshing(true); load(); };

  // Student/parent calendar endpoints return a bare records array; teacher self
  // attendance returns { records/days, summary }. Handle both shapes.
  const records: any[] = Array.isArray(data) ? data : (data?.records ?? data?.calendar ?? []);

  // Those calendar endpoints carry no summary — derive one so the header shows.
  const summary = data?.summary ?? (records.length ? (() => {
    const count = (st: string) => records.filter((r: any) => String(r.status).toLowerCase() === st).length;
    const present = count('present'), absent = count('absent'), late = count('late');
    return { present, absent, late, percentage: Math.round((present / records.length) * 100) };
  })() : null);

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Attendance' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ title: 'Attendance' }} />
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : (
          <>
            {/* Summary */}
            {summary && (
              <View style={s.summary}>
                <View style={s.summaryItem}>
                  <Text style={s.summaryVal}>{summary.percentage ?? '--'}%</Text>
                  <Text style={s.summaryLabel}>Attendance</Text>
                </View>
                <View style={s.divider} />
                <View style={s.summaryItem}>
                  <Text style={[s.summaryVal, { color: Colors.success }]}>{summary.present ?? '--'}</Text>
                  <Text style={s.summaryLabel}>Present</Text>
                </View>
                <View style={s.divider} />
                <View style={s.summaryItem}>
                  <Text style={[s.summaryVal, { color: Colors.danger }]}>{summary.absent ?? '--'}</Text>
                  <Text style={s.summaryLabel}>Absent</Text>
                </View>
                {summary.late != null && (
                  <>
                    <View style={s.divider} />
                    <View style={s.summaryItem}>
                      <Text style={[s.summaryVal, { color: Colors.warning }]}>{summary.late}</Text>
                      <Text style={s.summaryLabel}>Late</Text>
                    </View>
                  </>
                )}
              </View>
            )}

            {/* Records */}
            <View style={{ padding: Spacing.md, paddingTop: 0 }}>
              {records.length === 0 ? (
                <View style={s.empty}>
                  <Ionicons name="calendar-outline" size={48} color={Colors.textLight} />
                  <Text style={s.emptyText}>No attendance records</Text>
                </View>
              ) : (
                records.map((rec: any, i: number) => {
                  const status = rec.status?.toLowerCase() ?? 'present';
                  const cfg = STATUS_STYLE[status] ?? STATUS_STYLE.present;
                  return (
                    <View key={i} style={s.card}>
                      <View style={[s.statusDot, { backgroundColor: cfg.bg }]}>
                        <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
                      </View>
                      <View style={s.cardBody}>
                        <Text style={s.cardDate}>
                          {rec.date ? new Date(rec.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : 'â€”'}
                        </Text>
                        {rec.subject && <Text style={s.cardSub}>{rec.subject}</Text>}
                      </View>
                      <View style={[s.badge, { backgroundColor: cfg.bg }]}>
                        <Text style={[s.badgeText, { color: cfg.color }]}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  summary: {
    flexDirection: 'row', backgroundColor: Colors.primary,
    marginHorizontal: Spacing.md, marginVertical: Spacing.md,
    borderRadius: Radius.xl, paddingVertical: Spacing.md,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal: { fontSize: 22, fontWeight: '700', color: '#fff' },
  summaryLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2, fontWeight: '500' },
  divider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  empty: { alignItems: 'center', paddingTop: 40, gap: 12 },
  emptyText: { ...Typography.body, color: Colors.textSecondary },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  statusDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardBody: { flex: 1 },
  cardDate: { ...Typography.label, color: Colors.text },
  cardSub: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  badgeText: { fontSize: 11, fontWeight: '600' },
});
