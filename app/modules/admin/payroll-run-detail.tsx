import React, { useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as payrollApi from '@/api/payroll.api';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, ActionBtn, RowItem,
  confirmAsync, fmtMoney, SectionTitle,
} from '@/components/ui/kit';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function AdminPayrollRunDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [run, setRun] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    try { setRun(unwrap(await payrollApi.getRunDetail(id))); }
    catch (err: any) { Alert.alert('Error', err.message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, [id]);

  const advance = async (status: string, label: string) => {
    if (!(await confirmAsync(label, `Mark this run as ${status}?`, label))) return;
    setBusy(true);
    try { await payrollApi.updateRunStatus(id!, status); load(); }
    catch (err: any) { Alert.alert('Error', err.message); }
    finally { setBusy(false); }
  };

  const publish = async () => {
    if (!(await confirmAsync('Publish Run', 'Publish this run? Payslips will be generated and become visible to staff.', 'Publish'))) return;
    setBusy(true);
    try { await payrollApi.publishRun(id!); load(); Alert.alert('Published', 'Payslips generated.'); }
    catch (err: any) { Alert.alert('Error', err.message); }
    finally { setBusy(false); }
  };

  const entries: any[] = run?.entries ?? [];

  return (
    <>
      <Stack.Screen options={{ title: run ? `${MONTHS[(run.month ?? 1) - 1]} ${run.year}` : 'Payroll Run' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : !run ? <Empty text="Run not found" /> : (
          <>
            <Card>
              <KV label="Status" value={<Badge label={run.status} />} />
              <KV label="Gross" value={fmtMoney(run.totalGross)} />
              <KV label="Deductions" value={fmtMoney(run.totalDeductions)} />
              <KV label="Net Payout" value={fmtMoney(run.totalNet)} />
              <KV label="Processed by" value={run.processedBy?.name ?? '--'} />
              {run.approvedBy?.name ? <KV label="Approved by" value={run.approvedBy.name} /> : null}

              {/* Workflow: draft → reviewed → approved → published */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                {run.status === 'draft' && (
                  <View style={{ flex: 1 }}>
                    <ActionBtn label={busy ? '…' : 'Mark Reviewed'} tone="info" onPress={() => advance('reviewed', 'Mark Reviewed')} />
                  </View>
                )}
                {run.status === 'reviewed' && (
                  <View style={{ flex: 1 }}>
                    <ActionBtn label={busy ? '…' : 'Approve'} tone="success" onPress={() => advance('approved', 'Approve')} />
                  </View>
                )}
                {run.status === 'approved' && (
                  <View style={{ flex: 1 }}>
                    <ActionBtn label={busy ? '…' : 'Publish & Generate Payslips'} tone="warning" onPress={publish} />
                  </View>
                )}
              </View>
            </Card>

            <SectionTitle>Entries ({entries.length})</SectionTitle>
            {entries.length === 0 ? <Empty icon="people-outline" text="No entries in this run" /> :
              entries.map((e: any) => (
                <RowItem
                  key={e._id}
                  icon="person" iconColor="#15803D" iconBg="#F0FDF4"
                  title={e.employee?.name ?? '--'}
                  sub={`Gross ${fmtMoney(e.grossSalary)} · Deductions ${fmtMoney(e.totalDeductions)} · LOP ${e.lopDays ?? 0}d`}
                  right={<Badge label={e.payslip ? 'payslip ready' : run.status} tone={e.payslip ? 'success' : undefined} />}
                />
              ))}
          </>
        )}
      </ScrollView>
    </>
  );
}
