import React, { useEffect, useState } from 'react';
import { MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as studentApi from '@/api/student.api';
import * as teacherApi from '@/api/teacher.api';
import ModuleDisabled from '@/components/ModuleDisabled';

const COLORS = ['#DBEAFE', '#DCFCE7', '#FEF3C7', '#EDE9FE', '#FCE7F3', '#CCFBF1', '#FEE2E2', '#FFF7ED'];

/**
 * Both /teacher/timetable and /student/timetable return:
 *   { entries: [{ dayOfWeek: 'Monday', periodNumber, subject{subjectName}, teacher{name},
 *                 timetable?{ section{sectionName, class{className}}, periodsStructure } }],
 *     days: ['Monday', …], periodsStructure? (teacher), timetable?{periodsStructure} (student) }
 */
export default function TimetableScreen() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async () => {
    try {
      const res: any = user?.role === 'teacher'
        ? await teacherApi.getTimetable()
        : await studentApi.getTimetable();
      setData((res as any)?.data ?? res ?? null);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    }
    finally { setLoading(false); setRefreshing(false); }
  };

  // Wait for the user record — firing before role is known would hit the wrong role's API
  useEffect(() => { if (user?.role) load(); }, [user?.role]);
  const onRefresh = () => { setRefreshing(true); load(); };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Timetable' }} />
      <ModuleDisabled />
    </>
  );

  const entries: any[] = Array.isArray(data?.entries) ? data.entries : [];
  const days: string[] = Array.isArray(data?.days) && data.days.length
    ? data.days
    : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const periods: any[] = data?.periodsStructure?.length
    ? data.periodsStructure
    : data?.timetable?.periodsStructure ?? [];
  const timeFor = (periodNumber: number) => {
    const p = periods.find((x: any) => x.periodNumber === periodNumber);
    return p?.startTime ? `${p.startTime}${p.endTime ? `–${p.endTime}` : ''}` : '';
  };

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
        ) : entries.length === 0 ? (
          <Text style={s.empty}>No timetable available yet</Text>
        ) : (
          days.map((day) => {
            const slots = entries
              .filter((e: any) => e.dayOfWeek === day)
              .sort((a: any, b: any) => (a.periodNumber ?? 0) - (b.periodNumber ?? 0));
            if (!slots.length) return null;
            return (
              <View key={day} style={s.dayBlock}>
                <Text style={s.dayLabel}>{day}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {slots.map((sl: any, i: number) => (
                    <View key={i} style={[s.slot, { backgroundColor: COLORS[((sl.periodNumber ?? i) - 1 + COLORS.length) % COLORS.length] }]}>
                      <Text style={s.period}>P{sl.periodNumber ?? i + 1}</Text>
                      <Text style={s.subject} numberOfLines={2}>{sl.subject?.subjectName ?? '—'}</Text>
                      <Text style={s.time}>{timeFor(sl.periodNumber)}</Text>
                      {user?.role === 'teacher'
                        ? (sl.timetable?.section
                            ? <Text style={s.teacher} numberOfLines={1}>
                                {sl.timetable.section.class?.className ?? ''} {sl.timetable.section.sectionName ?? ''}
                              </Text>
                            : null)
                        : (sl.teacher?.name
                            ? <Text style={s.teacher} numberOfLines={1}>{sl.teacher.name}</Text>
                            : null)}
                      {(sl.mergedSections ?? []).length > 0 && (
                        <Text style={s.teacher} numberOfLines={1}>
                          🔗 with {(sl.mergedSections as any[]).map((m: any) => m.sectionName ?? m).join(', ')}
                        </Text>
                      )}
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
