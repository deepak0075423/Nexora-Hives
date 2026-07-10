import React, { useEffect, useState } from 'react';
import { ScrollView, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, fmtDate,
} from '@/components/ui/kit';

export default function AdminExamsScreen() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async () => {
    try {
      const d = unwrap(await adminApi.getExams());
      setList(Array.isArray(d) ? d : d?.data ?? d?.exams ?? []);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Aptitude Exams' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Aptitude Exams' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : list.length === 0 ? (
          <Empty icon="bulb-outline" text="No aptitude exams in this school yet" />
        ) : (
          list.map((exam: any) => (
            <Card key={exam._id}>
              <KV label="Title" value={exam.title ?? exam.name ?? '--'} />
              <KV label="Teacher" value={exam.createdBy?.name ?? exam.teacher?.name ?? '--'} />
              <KV label="Target" value={exam.section?.sectionName ? `${exam.class?.className ?? ''} ${exam.section.sectionName}` : exam.class?.className ?? '--'} />
              <KV label="Scheduled" value={fmtDate(exam.scheduledDate ?? exam.startTime ?? exam.createdAt)} />
              <KV label="Questions" value={exam.questionCount ?? exam.totalQuestions ?? '--'} />
              <KV label="Attempts" value={exam.attemptCount ?? exam.submissions ?? '--'} />
              <KV label="Status" value={<Badge label={String(exam.status ?? 'draft')} />} />
            </Card>
          ))
        )}
      </ScrollView>
    </>
  );
}
