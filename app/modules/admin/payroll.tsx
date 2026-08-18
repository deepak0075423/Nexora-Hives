import React, { useEffect, useState } from 'react';
import { ScrollView, RefreshControl } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as payrollApi from '@/api/payroll.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, RowItem, StatRow, StatTile, Badge, SectionTitle, fmtMoney,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function AdminPayrollDashboardScreen() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = async () => {
    try { setData(unwrap(await payrollApi.getDashboard())); }
    catch (err: any) { if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Payroll' }} />
      <ModuleDisabled />
    </>
  );

  const LINKS = [
    { label: 'Payroll Runs', sub: 'Create and process monthly runs', icon: 'play-circle', route: '/modules/admin/payroll-runs' },
    { label: 'Salary Structures', sub: 'Component templates for salaries', icon: 'layers', route: '/modules/admin/payroll-structures' },
    { label: 'Assignments', sub: 'Assign structures & CTC to staff', icon: 'person-add', route: '/modules/admin/payroll-assignments' },
  ];

  return (
    <>
      <Stack.Screen options={{ title: 'Payroll Dashboard' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : (
          <>
            <StatRow>
              <StatTile label="Employees" value={data?.totalEmployees ?? '--'} icon="people" tone="info" />
              <StatTile label="On Payroll" value={data?.activeAssignments ?? '--'} icon="checkmark-circle" tone="success" />
            </StatRow>

            {LINKS.map(l => (
              <RowItem key={l.label} icon={l.icon} iconColor="#15803D" iconBg="#F0FDF4"
                title={l.label} sub={l.sub} onPress={() => router.push(l.route as any)} />
            ))}

            {data?.currentRun && (
              <>
                <SectionTitle>This month</SectionTitle>
                <RowItem
                  icon="calendar" iconColor={Colors.accent} iconBg={Colors.accentLight}
                  title={`${MONTHS[(data.currentRun.month ?? 1) - 1]} ${data.currentRun.year}`}
                  sub={`Net ${fmtMoney(data.currentRun.totalNet)} · ${data.currentRun.employeeCount ?? ''} employees`}
                  right={<Badge label={data.currentRun.status} />}
                  onPress={() => router.push({ pathname: '/modules/admin/payroll-run-detail', params: { id: data.currentRun._id } } as any)}
                />
              </>
            )}

            {Array.isArray(data?.recentRuns) && data.recentRuns.length > 0 && (
              <>
                <SectionTitle>Recent runs</SectionTitle>
                {data.recentRuns.map((r: any) => (
                  <RowItem key={r._id}
                    icon="time" iconColor={Colors.info} iconBg={Colors.infoLight}
                    title={`${MONTHS[(r.month ?? 1) - 1]} ${r.year}`}
                    sub={`Gross ${fmtMoney(r.totalGross)} · Net ${fmtMoney(r.totalNet)}`}
                    right={<Badge label={r.status} />}
                    onPress={() => router.push({ pathname: '/modules/admin/payroll-run-detail', params: { id: r._id } } as any)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}
