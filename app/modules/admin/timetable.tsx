import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { unwrap, LoaderView, Empty, Select } from '@/components/ui/kit';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function AdminTimetableScreen() {
  const [sections, setSections] = useState<any[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    adminApi.getClassesWithSections()
      .then((res: any) => setSections(unwrap(res) ?? []))
      .catch((err: any) => { if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true); });
  }, []);

  const sectionOptions = useMemo(() => {
    const opts: { label: string; value: string }[] = [];
    (sections ?? []).forEach((c: any) => (c.sections ?? []).forEach((sec: any) =>
      opts.push({ label: `${c.className ?? c.name} · ${sec.sectionName ?? sec.name}`, value: sec._id })));
    return opts;
  }, [sections]);

  const load = async (id = sectionId) => {
    if (!id) return;
    setLoading(true);
    try {
      const d = unwrap(await adminApi.getSectionEntries(id));
      setEntries(Array.isArray(d) ? d : []);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  const changeSection = (id: string) => { setSectionId(id); load(id); };

  const byDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    entries.forEach((e: any) => {
      const day = typeof e.dayOfWeek === 'number' ? DAYS[e.dayOfWeek - 1] ?? String(e.dayOfWeek) : String(e.dayOfWeek);
      (map[day] = map[day] ?? []).push(e);
    });
    Object.values(map).forEach(list => list.sort((a, b) => (a.periodNumber ?? 0) - (b.periodNumber ?? 0)));
    return map;
  }, [entries]);

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <Select label="Section" value={sectionId} onChange={changeSection} options={sectionOptions} placeholder="Pick a section" />
        <Text style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: Spacing.sm }}>
          Timetable structure and period editing is available on the web admin panel.
        </Text>

        {loading ? <LoaderView /> : !sectionId ? (
          <Empty icon="calendar-outline" text="Select a section to view its timetable" />
        ) : entries.length === 0 ? (
          <Empty icon="calendar-outline" text="No timetable set for this section yet" />
        ) : (
          DAYS.filter(d => byDay[d]?.length).map(day => (
            <View key={day} style={tt.dayBlock}>
              <Text style={tt.dayTitle}>{day}</Text>
              {byDay[day].map((e: any, i: number) => (
                <View key={i} style={tt.periodRow}>
                  <View style={tt.periodNum}>
                    <Text style={tt.periodNumText}>{e.periodNumber ?? '-'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={tt.subject}>{e.subject?.subjectName ?? 'Free period'}</Text>
                    {e.teacher?.name ? <Text style={tt.teacher}>{e.teacher.name}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
}

const tt = StyleSheet.create({
  dayBlock: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.border,
  },
  dayTitle: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginBottom: 8 },
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  periodNum: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  periodNumText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  subject: { fontSize: 13, fontWeight: '600', color: Colors.text },
  teacher: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
});
