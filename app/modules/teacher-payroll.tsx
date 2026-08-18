import React, { useEffect, useState } from 'react';
import { ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as payrollApi from '@/api/payroll.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Badge, Card, KV, RowItem, SegTabs, FormModal,
  fmtMoney, fmtDate, SectionTitle,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function TeacherPayrollScreen() {
  const [tab, setTab] = useState('ctc');
  const [ctc, setCtc] = useState<any>(null);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [slip, setSlip] = useState<any>(null);

  const load = async () => {
    try {
      const [c, p]: any[] = await Promise.all([
        payrollApi.getMyCtc().catch(() => null),
        payrollApi.getMyPayslips().catch(() => null),
      ]);
      setCtc(unwrap(c));
      setPayslips((p as any)?.data ?? unwrap(p) ?? []);
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const openSlip = async (id: string) => {
    try { setSlip(unwrap(await payrollApi.getPayslipDetail(id))); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Payroll' }} />
      <ModuleDisabled />
    </>
  );

  const breakdown = ctc?.breakdown;
  const entry = slip?.payrollEntry ?? slip?.entry ?? slip;

  return (
    <>
      <Stack.Screen options={{ title: 'My Payroll' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : (
          <>
            <SegTabs tabs={[{ key: 'ctc', label: 'My CTC' }, { key: 'payslips', label: `Payslips (${payslips.length})` }]} active={tab} onChange={setTab} />

            {tab === 'ctc' ? (
              !ctc ? <Empty icon="cash-outline" text="No salary assignment yet. Contact your admin." /> : (
                <>
                  <Card>
                    <KV label="Structure" value={ctc.assignment?.structure?.name ?? '--'} />
                    <KV label="Annual CTC" value={fmtMoney(ctc.assignment?.ctc)} />
                    <KV label="Monthly CTC" value={fmtMoney(Math.round(ctc.monthlyCtc ?? 0))} />
                    <KV label="Effective from" value={fmtDate(ctc.assignment?.effectiveDate)} />
                  </Card>
                  {breakdown && (
                    <>
                      <SectionTitle>Monthly breakdown</SectionTitle>
                      <Card>
                        {(breakdown.earnings ?? breakdown.components ?? []).map((c: any, i: number) => (
                          <KV key={i} label={c.name ?? c.componentName} value={fmtMoney(Math.round(c.amount ?? 0))} />
                        ))}
                        <KV label="Gross" value={fmtMoney(Math.round(breakdown.grossSalary ?? 0))} />
                        {(breakdown.deductions ?? []).map((d: any, i: number) => (
                          <KV key={i} label={d.name ?? d.componentName} value={`- ${fmtMoney(Math.round(d.amount ?? 0))}`} />
                        ))}
                        <KV label="Net Salary" value={fmtMoney(Math.round(breakdown.netSalary ?? 0))} />
                      </Card>
                    </>
                  )}
                </>
              )
            ) : (
              payslips.length === 0 ? <Empty icon="document-text-outline" text="No payslips published yet" /> :
              payslips.map((p: any) => (
                <RowItem
                  key={p._id}
                  icon="document-text" iconColor="#15803D" iconBg="#F0FDF4"
                  title={`${MONTHS[(p.month ?? p.payrollEntry?.month ?? 1) - 1]} ${p.year ?? p.payrollEntry?.year ?? ''}`}
                  sub={`Net ${fmtMoney(p.netSalary ?? p.payrollEntry?.netSalary)}`}
                  right={<Badge label={p.status ?? 'published'} />}
                  onPress={() => openSlip(p._id)}
                />
              ))
            )}
          </>
        )}
      </ScrollView>

      <FormModal visible={!!slip} title="Payslip" onClose={() => setSlip(null)}>
        <KV label="Month" value={entry?.month ? `${MONTHS[entry.month - 1]} ${entry.year ?? ''}` : '--'} />
        <KV label="Gross" value={fmtMoney(entry?.grossSalary)} />
        <KV label="Deductions" value={fmtMoney(entry?.totalDeductions)} />
        <KV label="LOP days" value={String(entry?.lopDays ?? 0)} />
        <KV label="Net Pay" value={fmtMoney(entry?.netSalary)} />
        {(entry?.earnings ?? []).map((c: any, i: number) => (
          <KV key={`e${i}`} label={c.name ?? c.componentName} value={fmtMoney(Math.round(c.amount ?? 0))} />
        ))}
        {(entry?.deductions ?? []).map((d: any, i: number) => (
          <KV key={`d${i}`} label={d.name ?? d.componentName} value={`- ${fmtMoney(Math.round(d.amount ?? 0))}`} />
        ))}
      </FormModal>
    </>
  );
}
