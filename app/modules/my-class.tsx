/**
 * My Class — where a student sits, who teaches them, and who they sit with.
 *
 * The same screen the parent gets for a child (child-class.tsx); both are built
 * from one server view, so a parent looking at a child sees what the child
 * sees.
 *
 * Being in a class but not yet in a section is a normal step, not a fault — the
 * screen names the class rather than claiming there is none.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as studentApi from '@/api/student.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { unwrap, LoaderView, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import { Hero } from '@/components/library/parts';
import { ClassBody, classTitle } from '@/components/class/ClassBody';

export default function MyClassScreen() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(unwrap(await studentApi.getMyClass()));
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <Hero icon="school"
          title={loading ? 'My Class' : classTitle(data?.section, data?.pendingClass)}
          blurb={data?.section?.academicYear?.yearName
            ? `Academic Year ${data.section.academicYear.yearName} · learn together, grow together.`
            : 'Your class, your teachers and your classmates.'}
          quote="“A better tomorrow starts with what you learn today.”" />

        {loading ? <LoaderView /> : (
          <ClassBody view={data} quickLinks={[
            { icon: 'time-outline', label: 'Timetable', to: '/modules/timetable', tone: 'blue' },
            { icon: 'checkbox-outline', label: 'Attendance', to: '/modules/attendance', tone: 'green' },
            { icon: 'document-text-outline', label: 'Exams', to: '/modules/exams', tone: 'pink' },
            { icon: 'bar-chart-outline', label: 'Results', to: '/modules/results', tone: 'amber' },
          ]} />
        )}
      </ScrollView>
    </>
  );
}
