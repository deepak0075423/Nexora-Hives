import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as studentApi from '@/api/student.api';
import * as teacherApi from '@/api/teacher.api';
import ModuleDisabled from '@/components/ModuleDisabled';

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat'];
const COLORS = ['#DBEAFE','#DCFCE7','#FEF3C7','#EDE9FE','#FCE7F3','#CCFBF1','#FEE2E2','#FFF7ED'];

export default function TimetableScreen() {
  const { user } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async () => {
    try {
      const res: any = user?.role === 'teacher'
        ? await teacherApi.getTimetable()
        : await studentApi.getTimetable();
      setData((res as any)?.data?.timetable ?? (res as any)?.timetable ?? (res as any)?.data ?? res ?? []);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Timetable' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Timetable' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : data.length === 0 ? (
          <Text style={s.empty}>No timetable available</Text>
        ) : (
          DAYS.map((day) => {
            const slots: any[] = data.filter((sl: any) => sl.day === day || sl.dayOfWeek === day);
            if (!slots.length) return null;
            return (
              <View key={day} style={s.dayBlock}>
                <Text style={s.dayLabel}>{day}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {slots.map((sl: any, i: number) => (
                    <View key={i} style={[s.slot, { backgroundColor: COLORS[i % COLORS.length] }]}>
                      <Text style={s.period}>P{sl.period ?? i + 1}</Text>
                      <Text style={s.subject}>{sl.subject?.name ?? sl.subjectName ?? sl.subject ?? 'â€”'}</Text>
                      <Text style={s.time}>{sl.startTime ?? ''}{sl.endTime ? `â€“${sl.endTime}` : ''}</Text>
                      {sl.teacherName && <Text style={s.teacher}>{sl.teacherName}</Text>}
                    </View>
                  ))}
                </ScrollView>
              </View>
            );
          })
        )}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', paddingTop: 80 },
  empty: { textAlign: 'center', color: Colors.textSecondary, marginTop: 80, ...Typography.body },
  dayBlock: { marginBottom: Spacing.lg },
  dayLabel: { ...Typography.h4, color: Colors.text, marginBottom: 8 },
  slot: {
    width: 110, marginRight: 10, borderRadius: Radius.md,
    padding: 12, minHeight: 90,
  },
  period: { fontSize: 10, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase' },
  subject: { fontSize: 14, fontWeight: '700', color: Colors.text, marginTop: 4, marginBottom: 4 },
  time: { fontSize: 10, color: Colors.textSecondary },
  teacher: { fontSize: 10, color: Colors.primary, marginTop: 2 },
});
