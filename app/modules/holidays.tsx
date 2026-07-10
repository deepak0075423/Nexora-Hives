import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as studentApi from '@/api/student.api';
import * as teacherApi from '@/api/teacher.api';
import * as parentApi from '@/api/parent.api';
import ModuleDisabled from '@/components/ModuleDisabled';

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  public:    { bg: '#DCFCE7', color: '#16A34A' },
  school:    { bg: '#DBEAFE', color: '#2563EB' },
  regional:  { bg: '#FEF3C7', color: '#D97706' },
  default:   { bg: Colors.surfaceAlt, color: Colors.primary },
};

export default function HolidaysScreen() {
  const { user } = useAuth();
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async () => {
    try {
      let res: any;
      if (user?.role === 'teacher') res = await teacherApi.getHolidays();
      else if (user?.role === 'parent') res = await parentApi.getHolidays();
      else res = await studentApi.getHolidays();
      setHolidays((res as any)?.data ?? res ?? []);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    }
    finally { setLoading(false); setRefreshing(false); }
  };

  // Wait for the user record — firing before role is known would hit the wrong role's API
  useEffect(() => { if (user?.role) load(); }, [user?.role]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const upcoming = holidays.filter((h: any) => new Date(h.endDate ?? h.date) >= new Date());
  const past = holidays.filter((h: any) => new Date(h.endDate ?? h.date) < new Date());

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Holidays' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Holidays' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : holidays.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="sunny-outline" size={48} color={Colors.textLight} />
            <Text style={s.emptyText}>No holidays found</Text>
          </View>
        ) : (
          <>
            {upcoming.length > 0 && (
              <>
                <Text style={s.groupLabel}>Upcoming</Text>
                {upcoming.map((h: any, i: number) => <HolidayCard key={i} holiday={h} />)}
              </>
            )}
            {past.length > 0 && (
              <>
                <Text style={[s.groupLabel, { marginTop: Spacing.md }]}>Past</Text>
                {past.map((h: any, i: number) => <HolidayCard key={i} holiday={h} faded />)}
              </>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

function HolidayCard({ holiday, faded }: { holiday: any; faded?: boolean }) {
  const type = holiday.type?.toLowerCase() ?? 'default';
  const cfg = TYPE_COLORS[type] ?? TYPE_COLORS.default;
  const start = holiday.startDate ?? holiday.date;
  const end = holiday.endDate;
  const dateStr = start
    ? end && end !== start
      ? `${new Date(start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} â€“ ${new Date(end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
      : new Date(start).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' })
    : '';

  return (
    <View style={[s.card, faded && s.cardFaded]}>
      <View style={[s.dateBadge, { backgroundColor: cfg.bg }]}>
        <Text style={[s.dateDay, { color: cfg.color }]}>
          {start ? new Date(start).getDate() : 'â€”'}
        </Text>
        <Text style={[s.dateMon, { color: cfg.color }]}>
          {start ? new Date(start).toLocaleDateString('en-IN', { month: 'short' }) : ''}
        </Text>
      </View>
      <View style={s.body}>
        <Text style={[s.name, faded && s.nameFaded]}>{holiday.name ?? holiday.title ?? 'Holiday'}</Text>
        <Text style={s.dateStr}>{dateStr}</Text>
        {holiday.type && (
          <View style={[s.typeBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[s.typeText, { color: cfg.color }]}>{holiday.type}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', paddingTop: 80 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { ...Typography.body, color: Colors.textSecondary },
  groupLabel: { ...Typography.h4, color: Colors.text, marginBottom: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardFaded: { opacity: 0.55 },
  dateBadge: {
    width: 52, height: 52, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  dateDay: { fontSize: 20, fontWeight: '700' },
  dateMon: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  body: { flex: 1 },
  name: { ...Typography.label, color: Colors.text },
  nameFaded: { color: Colors.textSecondary },
  dateStr: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  typeBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginTop: 4 },
  typeText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
});
