import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as studentApi from '@/api/student.api';
import * as teacherApi from '@/api/teacher.api';
import * as parentApi from '@/api/parent.api';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PERIOD_COLORS = ['#DBEAFE','#DCFCE7','#FEF3C7','#EDE9FE','#FCE7F3','#CCFBF1','#FEE2E2'];

export default function CalendarScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      let res: any;
      if (user?.role === 'teacher') res = await teacherApi.getTimetable();
      else if (user?.role === 'parent') res = await parentApi.getChildClass();
      else res = await studentApi.getTimetable();
      setData((res as any)?.data ?? res);
    } catch { /* empty state */ }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  const title = user?.role === 'parent' ? 'Child\'s Class' :
                user?.role === 'teacher' ? 'My Timetable' : 'Timetable';

  const slots: any[] = data?.timetable ?? data?.slots ?? [];

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.sub}>{data?.class ?? data?.section ?? ''}</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : slots.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="calendar-outline" size={48} color={Colors.textLight} />
            <Text style={s.emptyText}>No timetable available</Text>
          </View>
        ) : (
          DAY_LABELS.map((day) => {
            const daySlots = slots.filter((sl: any) => sl.day === day || sl.dayOfWeek === day);
            if (!daySlots.length) return null;
            return (
              <View key={day} style={s.dayBlock}>
                <Text style={s.dayLabel}>{day}</Text>
                {daySlots.map((sl: any, i: number) => (
                  <View key={i} style={[s.slot, { backgroundColor: PERIOD_COLORS[i % PERIOD_COLORS.length] }]}>
                    <Text style={s.slotPeriod}>Period {sl.period ?? i + 1}</Text>
                    <Text style={s.slotSubject}>{sl.subject?.name ?? sl.subjectName ?? sl.subject ?? '—'}</Text>
                    <Text style={s.slotTime}>{sl.startTime ?? ''}{sl.endTime ? ` – ${sl.endTime}` : ''}</Text>
                    {sl.teacherName && <Text style={s.slotTeacher}>{sl.teacherName}</Text>}
                  </View>
                ))}
              </View>
            );
          })
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.md, paddingBottom: Spacing.sm },
  title: { ...Typography.h2, color: Colors.text },
  sub: { ...Typography.body, color: Colors.textSecondary, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { ...Typography.body, color: Colors.textSecondary },
  dayBlock: { paddingHorizontal: Spacing.md, marginBottom: Spacing.md },
  dayLabel: { ...Typography.h4, color: Colors.text, marginBottom: 8 },
  slot: {
    borderRadius: Radius.md, padding: Spacing.sm + 2, marginBottom: 6,
  },
  slotPeriod: { fontSize: 10, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  slotSubject: { ...Typography.h4, color: Colors.text, marginTop: 2 },
  slotTime: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  slotTeacher: { fontSize: 11, color: Colors.primary, marginTop: 2 },
});
