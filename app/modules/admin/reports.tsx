import React from 'react';
import { ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import { useModules } from '@/hooks/useModules';
import { RowItem, LoaderView } from '@/components/ui/kit';

const REPORT_LINKS = [
  { module: 'fees',         route: '/modules/admin/fees-reports',  icon: 'card',           label: 'Fees Collection & Dues',  desc: 'Collection summaries and outstanding dues' },
  { module: 'fees',         route: '/modules/admin/fees',          icon: 'trending-up',    label: 'Fees Overview',           desc: 'Collection progress at a glance' },
  { module: 'leave',        route: '/modules/admin/leave',         icon: 'airplane',       label: 'Leave Requests',          desc: 'Teacher leave queue and history' },
  { module: 'payroll',      route: '/modules/admin/payroll',       icon: 'cash',           label: 'Payroll Summary',         desc: 'Run totals — gross, deductions, net' },
  { module: 'library',      route: '/modules/library-admin',       icon: 'library',        label: 'Library Overview',        desc: 'Circulation, overdues, reservations, fines' },
  { module: 'result',       route: '/modules/admin/results',       icon: 'bar-chart',      label: 'Exam Results',            desc: 'Formal exam status and published results' },
  { module: 'aptitudeExam', route: '/modules/admin/exams',         icon: 'bulb',           label: 'Aptitude Exams',          desc: 'Exams overview across the school' },
  { module: 'attendance',   route: '/modules/admin/attendance',    icon: 'checkmark-circle', label: 'Attendance',            desc: 'Staff regularization queue' },
];

export default function AdminReportsScreen() {
  const router = useRouter();
  const { isEnabled, ready } = useModules();
  const links = REPORT_LINKS.filter(l => isEnabled(l.module));

  return (
    <>
      <Stack.Screen options={{ title: 'Reports' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
      >
        {!ready ? <LoaderView /> : links.map(l => (
          <RowItem
            key={l.label}
            icon={l.icon} iconColor={Colors.primary} iconBg={Colors.surfaceAlt}
            title={l.label}
            sub={l.desc}
            onPress={() => router.push(l.route as any)}
          />
        ))}
      </ScrollView>
    </>
  );
}
