import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as studentApi from '@/api/student.api';
import ModuleDisabled from '@/components/ModuleDisabled';

export default function MyClassScreen() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async () => {
    try {
      const res: any = await studentApi.getMyClass();
      setData((res as any)?.data ?? res);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  const classmates: any[] = data?.classmates ?? data?.students ?? [];
  const announcements: any[] = data?.announcements ?? [];

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'My Class' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'My Class' }} />
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
            {/* Class info card */}
            <View style={s.infoCard}>
              <View style={s.infoRow}>
                <Ionicons name="school" size={20} color={Colors.textInverse} />
                <Text style={s.infoTitle}>{data?.className ?? data?.class ?? 'My Class'}</Text>
              </View>
              {data?.section && <Text style={s.infoSub}>Section {data.section}</Text>}
              {data?.classTeacher?.name && (
                <Text style={s.infoSub}>Class Teacher: {data.classTeacher.name}</Text>
              )}
            </View>

            {/* Announcements */}
            {announcements.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Announcements</Text>
                {announcements.map((ann: any, i: number) => (
                  <View key={i} style={s.annCard}>
                    <View style={s.annIcon}>
                      <Ionicons name="megaphone" size={16} color={Colors.accent} />
                    </View>
                    <View style={s.annBody}>
                      <Text style={s.annText}>{ann.message ?? ann.content ?? ann.text ?? ''}</Text>
                      {ann.createdAt && (
                        <Text style={s.annDate}>
                          {new Date(ann.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Classmates */}
            {classmates.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Classmates ({classmates.length})</Text>
                {classmates.map((cm: any, i: number) => (
                  <View key={i} style={s.cmRow}>
                    <View style={s.cmAvatar}>
                      <Text style={s.cmAvatarText}>{cm.name?.[0] ?? '?'}</Text>
                    </View>
                    <Text style={s.cmName}>{cm.name ?? 'Student'}</Text>
                    {cm.rollNumber && <Text style={s.cmRoll}>#{cm.rollNumber}</Text>}
                  </View>
                ))}
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
  infoCard: {
    backgroundColor: Colors.primary, borderRadius: Radius.xl,
    padding: Spacing.md, marginBottom: Spacing.md,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  infoTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  infoSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 3 },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { ...Typography.h4, color: Colors.text, marginBottom: 8 },
  annCard: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  annIcon: {
    width: 32, height: 32, borderRadius: Radius.sm,
    backgroundColor: Colors.accentLight, alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  annBody: { flex: 1 },
  annText: { ...Typography.body, color: Colors.text, lineHeight: 20 },
  annDate: { fontSize: 10, color: Colors.textLight, marginTop: 4 },
  cmRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: Radius.md, padding: 10, marginBottom: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  cmAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  cmAvatarText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  cmName: { flex: 1, ...Typography.label, color: Colors.text },
  cmRoll: { fontSize: 11, color: Colors.textSecondary },
});
