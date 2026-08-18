import React, { useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as teacherApi from '@/api/teacher.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { unwrap, LoaderView, Empty, RowItem, Badge, MODULE_BLOCKED_CODES } from '@/components/ui/kit';

/** All sections this teacher is attached to — class teacher, substitute, or subject teacher */
export default function MySectionsScreen() {
  const router = useRouter();
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async () => {
    try {
      const d = unwrap(await teacherApi.getMySections());
      setSections(Array.isArray(d) ? d : []);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'My Sections' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'My Sections' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : sections.length === 0 ? (
          <Empty icon="people-outline" text="You are not assigned to any section yet" />
        ) : (
          sections.map((sec: any) => (
            <RowItem
              key={sec._id}
              icon="people" iconColor="#4338CA" iconBg="#EEF2FF"
              title={`${sec.className} · Section ${sec.sectionName}`}
              sub={`${sec.studentCount} students${sec.subjects?.length ? ` · ${sec.subjects.join(', ')}` : ''}`}
              right={<Badge label={(sec.roles ?? [])[0] ?? 'Teacher'} tone={sec.roles?.includes('Class Teacher') ? 'success' : 'info'} />}
              onPress={() => router.push({
                pathname: '/modules/teacher-section-detail',
                params: { id: sec._id, title: `${sec.className} · ${sec.sectionName}` },
              } as any)}
            />
          ))
        )}
      </ScrollView>
    </>
  );
}
