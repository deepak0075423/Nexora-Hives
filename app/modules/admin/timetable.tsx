/**
 * Admin → Timetable (phone).
 *
 * The module's front door. On the web this is a drag-and-drop section editor;
 * a phone is the wrong tool for laying out a week period by period, so here it
 * is the door to the seven tools and a clear read of any section's LIVE week —
 * the one teachers and students are actually looking at right now.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Select, Card, SectionTitle, SegTabs, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';
import {
  DayStrip, DayList, WeekStrip, DAYS, todayName, isTeachingPeriod, weekShape, type Cell,
} from '@/components/timetable/viewKit';

// Every tool the module has, in the order an admin reaches for them. Reports and
// Configuration were web-only until now.
const TOOLS = [
  { key: 'substitutions', label: 'Substitutions',        icon: 'repeat',        route: '/modules/admin/substitutions',          tone: Colors.danger },
  { key: 'generate',      label: 'Generate',             icon: 'flash',         route: '/modules/admin/timetable-generate',     tone: Colors.accent },
  { key: 'versions',      label: 'Versions',             icon: 'albums',        route: '/modules/admin/timetable-versions',     tone: Colors.primary },
  { key: 'availability',  label: 'Teacher Availability', icon: 'person-circle', route: '/modules/admin/timetable-availability', tone: Colors.success },
  { key: 'rooms',         label: 'Rooms & Labs',         icon: 'business',      route: '/modules/admin/timetable-rooms',        tone: Colors.warning },
  { key: 'reports',       label: 'Reports',              icon: 'bar-chart',     route: '/modules/admin/timetable-reports',      tone: Colors.info },
  { key: 'configuration', label: 'Configuration',        icon: 'settings',      route: '/modules/admin/timetable-configuration', tone: '#7C3AED' },
];

export default function AdminTimetableScreen() {
  const [classes, setClasses]   = useState<any[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [periods, setPeriods]   = useState<any[]>([]);
  const [entries, setEntries]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [view, setView]         = useState<'day' | 'week'>('day');
  const [day, setDay]           = useState<string>(() => todayName());

  useEffect(() => {
    adminApi.getClassesWithSections()
      .then((res: any) => setClasses(unwrap(res) ?? []))
      .catch((err: any) => { if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true); });
  }, []);

  const sectionOptions = useMemo(() => {
    const opts: { label: string; value: string }[] = [];
    (classes ?? []).forEach((c: any) => (c.sections ?? []).forEach((sec: any) =>
      opts.push({ label: `${c.className ?? c.name} · ${sec.sectionName ?? sec.name}`, value: String(sec._id) })));
    return opts;
  }, [classes]);

  const load = useCallback(async (id = sectionId) => {
    if (!id) return;
    setLoading(true);
    try {
      // The grid needs the period structure (breaks, times) as well as the
      // lessons — the old screen fetched only lessons, so breaks never showed.
      const [ttRes, eRes] = await Promise.all([
        adminApi.getSectionTimetable(id),
        adminApi.getSectionEntries(id),
      ]);
      const tt = unwrap(ttRes);
      const list = unwrap(eRes);
      setPeriods(tt?.periodsStructure ?? []);
      setEntries(Array.isArray(list) ? list : []);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  }, [sectionId]);

  const changeSection = (id: string) => { setSectionId(id); load(id); };

  const bySlot = useMemo(() => {
    const map = new Map<string, any>();
    for (const e of entries) {
      const d = typeof e.dayOfWeek === 'number' ? DAYS[e.dayOfWeek - 1] : e.dayOfWeek;
      map.set(`${d}#${e.periodNumber}`, e);
    }
    return map;
  }, [entries]);

  const cellFor = useCallback((d: string, n: number): Cell | null => {
    const e = bySlot.get(`${d}#${n}`);
    if (!e) return null;
    const name = e.subject?.subjectName || 'Subject';
    return {
      title: name,
      toneKey: e.subject?._id || name,
      sub: e.teacher?.name || 'No teacher assigned',
      extras: (e.mergedSections ?? []).length
        ? [`with ${(e.mergedSections as any[]).map((m: any) => m.sectionName ?? m).join(', ')}`] : [],
    };
  }, [bySlot]);

  // Days with any lesson on them, or the standard week when nothing is set yet.
  const days = useMemo(() => {
    const seen = new Set(entries.map((e: any) =>
      (typeof e.dayOfWeek === 'number' ? DAYS[e.dayOfWeek - 1] : e.dayOfWeek)));
    const list = DAYS.filter((d) => seen.has(d));
    return list.length ? list : DAYS.slice(0, 5);
  }, [entries]);

  const shape = weekShape(periods, days, entries.length);

  if (disabled) {
    return (<><Stack.Screen options={{ title: 'Timetable' }} /><ModuleDisabled /></>);
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Timetable' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <View style={tt.toolGrid}>
          {TOOLS.map((t) => (
            <TouchableOpacity key={t.key} style={tt.tool} activeOpacity={0.7}
              onPress={() => router.push(t.route as any)}>
              <View style={[tt.toolIcon, { backgroundColor: `${t.tone}22` }]}>
                <Ionicons name={t.icon as any} size={18} color={t.tone} />
              </View>
              <Text style={tt.toolLabel} numberOfLines={2}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <SectionTitle>Live timetable</SectionTitle>
        <Select label="Section" value={sectionId} onChange={changeSection}
          options={sectionOptions} placeholder="Pick a section" />
        <Text style={tt.hint}>
          The schedule teachers and students see right now. Build a new one with Generate,
          then publish it from Versions.
        </Text>

        {loading ? <LoaderView /> : !sectionId ? (
          <Empty icon="calendar-outline" text="Pick a section to read its week" />
        ) : !entries.length || !periods.some(isTeachingPeriod) ? (
          <Empty icon="calendar-outline" text="No timetable is set for this section yet" />
        ) : (
          <>
            <View style={tt.facts}>
              <Fact label="Periods a week" value={entries.length} />
              <Fact label="A day" value={shape.perDay} />
              <Fact label="School day" value={shape.dayLabel} />
            </View>

            <SegTabs tabs={[{ key: 'day', label: 'Day' }, { key: 'week', label: 'Week' }]}
              active={view} onChange={(k: string) => setView(k as 'day' | 'week')} />

            {view === 'day' ? (
              <>
                <DayStrip days={days} value={day} onChange={setDay} />
                <View style={{ height: 10 }} />
                <Card><DayList periods={periods} day={day} cellFor={cellFor} /></Card>
              </>
            ) : (
              <Card>
                <WeekStrip periods={periods} days={days} cellFor={cellFor}
                  onPickDay={(d) => { setDay(d); setView('day'); }} />
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

function Fact({ label, value }: { label: string; value: any }) {
  return (
    <View style={tt.fact}>
      <Text style={tt.factValue} numberOfLines={1}>{String(value)}</Text>
      <Text style={tt.factLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const tt = StyleSheet.create({
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.md },
  tool: {
    flexGrow: 1, flexBasis: '30%', alignItems: 'center', gap: 6,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, paddingVertical: 12, paddingHorizontal: 6,
  },
  toolIcon: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  toolLabel: { fontSize: 10.5, fontWeight: '600', color: Colors.text, textAlign: 'center' },
  hint: { fontSize: 11, color: Colors.textSecondary, marginBottom: Spacing.sm, lineHeight: 16 },
  facts: { flexDirection: 'row', gap: 8, marginBottom: Spacing.md },
  fact: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, paddingVertical: 10, paddingHorizontal: 10,
  },
  factValue: { fontSize: 15, fontWeight: '800', color: Colors.text },
  factLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
});
