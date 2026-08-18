import React, { useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as adminApi from '@/api/admin.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, ActionBtn, FormModal, Input,
  confirmAsync, fmtDate, toneFor,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

// Formal exam workflow: DRAFT → MARKS_PENDING → SUBMITTED → CLASS_APPROVED → FINAL_APPROVED
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', MARKS_PENDING: 'Marks pending', SUBMITTED: 'Submitted',
  CLASS_APPROVED: 'Awaiting final approval', FINAL_APPROVED: 'Published',
  REJECTED: 'Rejected', REOPENED: 'Reopened',
};

const statusTone = (s: string) =>
  s === 'FINAL_APPROVED' ? 'success' :
  s === 'CLASS_APPROVED' ? 'info' :
  s === 'REJECTED' ? 'danger' : 'warning';

export default function AdminResultsScreen() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [rejecting, setRejecting] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res: any = await adminApi.getFormalExams();
      const d = unwrap(res);
      setList(Array.isArray(d) ? d : d?.data ?? []);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const approve = async (exam: any) => {
    if (!(await confirmAsync('Publish Results', `Give final approval for "${exam.name ?? exam.examName}"? Results become visible to students and parents.`, 'Approve'))) return;
    try { await adminApi.approveFormalExam(exam._id); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const submitReject = async () => {
    setSaving(true);
    try {
      await adminApi.rejectFormalExam(rejecting._id, { reason });
      setRejecting(null); setReason('');
      load();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  const reopen = async (exam: any) => {
    if (!(await confirmAsync('Reopen Exam', 'Reopen this exam for marks correction?', 'Reopen'))) return;
    try { await adminApi.reopenFormalExam(exam._id, { reason: 'Reopened from mobile' }); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Results' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Exam Results' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : list.length === 0 ? (
          <Empty icon="bar-chart-outline" text="No formal exams yet. Create exams from the web admin panel." />
        ) : (
          list.map((exam: any) => (
            <Card key={exam._id}>
              <KV label="Exam" value={exam.name ?? exam.examName ?? '--'} />
              <KV label="Type" value={exam.examType?.replace('_', ' ') ?? '--'} />
              <KV label="Class" value={exam.class?.className ?? exam.section?.sectionName ?? '--'} />
              <KV label="Dates" value={`${fmtDate(exam.startDate)} – ${fmtDate(exam.endDate)}`} />
              <KV label="Status" value={<Badge label={STATUS_LABEL[exam.status] ?? exam.status} tone={statusTone(exam.status) as any} />} />
              {exam.status === 'CLASS_APPROVED' && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <View style={{ flex: 1 }}>
                    <ActionBtn label="Final Approve" tone="success" onPress={() => approve(exam)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ActionBtn label="Reject" tone="danger" onPress={() => setRejecting(exam)} />
                  </View>
                </View>
              )}
              {exam.status === 'FINAL_APPROVED' && (
                <View style={{ marginTop: 10 }}>
                  <ActionBtn label="Reopen for Corrections" tone="warning" onPress={() => reopen(exam)} />
                </View>
              )}
            </Card>
          ))
        )}
      </ScrollView>

      <FormModal visible={!!rejecting} title="Reject Results" onClose={() => setRejecting(null)} onSubmit={submitReject} submitting={saving} submitLabel="Reject">
        <Input label="Reason" value={reason} onChange={setReason} placeholder="Why are the results rejected?" multiline />
      </FormModal>
    </>
  );
}
