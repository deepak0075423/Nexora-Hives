import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl,
  TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as teacherApi from '@/api/teacher.api';
import ModuleDisabled from '@/components/ModuleDisabled';

export default function MySectionScreen() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [disabled, setDisabled] = useState(false);

  const load = async () => {
    try {
      const res: any = await teacherApi.getMySection();
      setData((res as any)?.data ?? res);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = () => { setRefreshing(true); load(); };

  const students: any[] = (data?.students ?? []).filter((st: any) =>
    !searchQuery || st.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const announcements: any[] = data?.announcements ?? [];

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'My Section' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'My Section' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : (
          <>
            {/* Section info */}
            <View style={s.infoCard}>
              <Text style={s.infoTitle}>{data?.className ?? 'My Section'}</Text>
              {data?.section && <Text style={s.infoSub}>Section {data.section}</Text>}
              <Text style={s.infoCount}>{data?.students?.length ?? 0} students</Text>
            </View>

            {/* Search */}
            <View style={s.searchBox}>
              <Ionicons name="search-outline" size={16} color={Colors.textLight} />
              <TextInput
                style={s.searchInput}
                placeholder="Search students..."
                placeholderTextColor={Colors.textLight}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Students */}
            <View style={{ paddingHorizontal: Spacing.md }}>
              <Text style={s.groupLabel}>Students ({students.length})</Text>
              {students.map((st: any, i: number) => (
                <View key={i} style={s.studentRow}>
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>{st.name?.[0] ?? '?'}</Text>
                  </View>
                  <View style={s.studentInfo}>
                    <Text style={s.studentName}>{st.name}</Text>
                    {st.rollNumber && <Text style={s.roll}>Roll #{st.rollNumber}</Text>}
                  </View>
                </View>
              ))}
            </View>

            {/* Announcements */}
            {announcements.length > 0 && (
              <View style={{ padding: Spacing.md, paddingTop: Spacing.sm }}>
                <Text style={s.groupLabel}>Announcements</Text>
                {announcements.map((ann: any, i: number) => (
                  <View key={i} style={s.annCard}>
                    <Text style={s.annText}>{ann.message ?? ann.content ?? ''}</Text>
                    {ann.createdAt && (
                      <Text style={s.annDate}>
                        {new Date(ann.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </Text>
                    )}
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
    backgroundColor: Colors.primary, margin: Spacing.md, marginBottom: Spacing.sm,
    borderRadius: Radius.xl, padding: Spacing.md,
  },
  infoTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  infoSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 3 },
  infoCount: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    marginHorizontal: Spacing.md, marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  searchInput: { flex: 1, paddingVertical: 10, marginLeft: 6, ...Typography.body, color: Colors.text },
  groupLabel: { ...Typography.h4, color: Colors.text, marginBottom: 8 },
  studentRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: Radius.md, padding: 10, marginBottom: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  avatarText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  studentInfo: { flex: 1 },
  studentName: { ...Typography.label, color: Colors.text },
  roll: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  annCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  annText: { ...Typography.body, color: Colors.text, lineHeight: 20 },
  annDate: { fontSize: 10, color: Colors.textLight, marginTop: 4 },
});
