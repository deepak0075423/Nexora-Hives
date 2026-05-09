import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as parentApi from '@/api/parent.api';
import ModuleDisabled from '@/components/ModuleDisabled';

export default function ChildClassScreen() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async () => {
    try {
      const res: any = await parentApi.getChildClass();
      setData((res as any)?.data ?? res);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  const announcements: any[] = data?.announcements ?? [];

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: "Child's Class" }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: "Child's Class" }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : (
          <>
            <View style={s.card}>
              <Text style={s.cardTitle}>{data?.className ?? 'â€”'}</Text>
              {data?.section && <Text style={s.cardSub}>Section: {data.section}</Text>}
              {data?.classTeacher?.name && (
                <View style={s.teacherRow}>
                  <Ionicons name="person-circle" size={16} color="rgba(255,255,255,0.7)" />
                  <Text style={s.teacherName}>{data.classTeacher.name}</Text>
                </View>
              )}
            </View>

            {announcements.length > 0 && (
              <>
                <Text style={s.groupLabel}>Announcements</Text>
                {announcements.map((a: any, i: number) => (
                  <View key={i} style={s.ann}>
                    <Text style={s.annText}>{a.message ?? a.content ?? ''}</Text>
                    {a.createdAt && (
                      <Text style={s.annDate}>
                        {new Date(a.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </Text>
                    )}
                  </View>
                ))}
              </>
            )}

            {announcements.length === 0 && !loading && (
              <View style={s.empty}>
                <Ionicons name="school-outline" size={48} color={Colors.textLight} />
                <Text style={s.emptyText}>No announcements</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', paddingTop: 80 },
  card: {
    backgroundColor: Colors.primary, borderRadius: Radius.xl, padding: Spacing.md, marginBottom: Spacing.lg,
  },
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  cardSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  teacherRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  teacherName: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  groupLabel: { ...Typography.h4, color: Colors.text, marginBottom: 8 },
  ann: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  annText: { ...Typography.body, color: Colors.text, lineHeight: 20 },
  annDate: { fontSize: 10, color: Colors.textLight, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 40, gap: 12 },
  emptyText: { ...Typography.body, color: Colors.textSecondary },
});
