/**
 * Payroll → Dashboard, on the phone.
 *
 * The web dashboard has a month stepper, five tiles, two charts and a rail.
 * Here the stepper stays — it is the one control that changes what every
 * figure means — the tiles go two across, the charts become the recent-runs
 * list they were summarising, and the rail becomes the bottom of the scroll.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as payrollApi from '@/api/payroll.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { unwrap, LoaderView, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import {
  Figures, Panel, Facts, Pill, StatusPill, PersonRow, NoteBox, Blank,
  money, compactMoney, shortDate, MONTHS, RUN_STATUS, TONES,
} from '@/components/payroll/parts';

export default function AdminPayrollDashboardScreen() {
  const router = useRouter();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = useCallback(async () => {
    try { setData(unwrap(await payrollApi.getOverview({ month, year }))); }
    catch (err: any) { if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true); }
    finally { setLoading(false); setRefreshing(false); }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const step = (delta: number) => {
    let m = month + delta; let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    // Never forward past the current month: there is no payroll for a month
    // that has not happened.
    if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth() + 1)) return;
    setMonth(m); setYear(y); setLoading(true);
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Payroll' }} /><ModuleDisabled /></>);

  const t = data?.tiles || {};
  const runs: any[] = data?.recentRuns || [];
  const dist: any[] = data?.distribution || [];
  const atMax = year === now.getFullYear() && month === now.getMonth() + 1;

  const LINKS = [
    { label: 'Payroll Runs', sub: 'Create, review and publish a month', icon: 'play-circle', tone: 'indigo', route: '/modules/admin/payroll-runs' },
    { label: 'Assignments', sub: 'Who is paid, and on what', icon: 'document-text', tone: 'green', route: '/modules/admin/payroll-assignments' },
    { label: 'Salary Structures', sub: 'Pay scales and components', icon: 'git-network', tone: 'orange', route: '/modules/admin/payroll-structures' },
    { label: 'Adjustments', sub: 'Advances, loans and reimbursements', icon: 'wallet', tone: 'blue', route: '/modules/admin/payroll-adjustments' },
    { label: 'Reports', sub: 'Registers, Form 16 and bank files', icon: 'bar-chart', tone: 'violet', route: '/modules/admin/payroll-reports' },
    { label: 'Settings', sub: 'Working days, tax, approvals, audit log', icon: 'settings', tone: 'slate', route: '/modules/admin/payroll-settings' },
    // Admins are paid by this module too. Without this there was no way for one
    // to reach their own payslip from the phone at all.
    { label: 'My Salary', sub: 'Your own CTC and payslips', icon: 'person-circle', tone: 'pink', route: '/modules/teacher-payroll' },
  ];

  return (
    <>
      <Stack.Screen options={{ title: 'Payroll' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        <View style={st.stepper}>
          <TouchableOpacity style={st.stepBtn} onPress={() => step(-1)}>
            <Ionicons name="chevron-back" size={18} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={st.stepMonth}>{MONTHS[month - 1]} {year}</Text>
            <Text style={st.stepSub}>{data?.isCurrentMonth ? 'Current month' : 'Selected month'}</Text>
          </View>
          <TouchableOpacity style={[st.stepBtn, atMax && { opacity: 0.35 }]} disabled={atMax} onPress={() => step(1)}>
            <Ionicons name="chevron-forward" size={18} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {loading ? <LoaderView /> : (
          <>
            <Figures items={[
              { icon: 'people', tone: 'indigo', label: 'Total employees', value: t.totalEmployees?.value ?? '--', caption: 'Active staff members' },
              { icon: 'document-text', tone: 'green', label: 'Active assignments', value: t.activeAssignments?.value ?? '--', caption: 'Teachers, staff & admin' },
              {
                icon: 'wallet', tone: 'violet', label: 'This month',
                value: t.thisMonth?.status ? compactMoney(t.thisMonth.value) : 'Not run',
                caption: t.thisMonth?.status ? (RUN_STATUS[t.thisMonth.status]?.[1] || t.thisMonth.status) : `${MONTHS[month - 1]} ${year}`,
              },
              {
                icon: 'bar-chart', tone: 'pink', label: 'Last month net',
                value: t.lastMonth?.value == null ? '--' : compactMoney(t.lastMonth.value),
                caption: t.lastMonth?.caption || 'No previous run',
              },
            ]} />

            {data?.unassigned > 0 && (
              <NoteBox tone="amber">
                {data.unassigned} {data.unassigned === 1 ? 'employee has' : 'employees have'} no salary assignment.
                They are left out of every payroll run until one is set up.
              </NoteBox>
            )}

            {dist.length > 0 && (
              <Panel icon="people-circle" tone="blue" title="Who is on the payroll"
                sub={`${dist.reduce((a, b) => a + b.count, 0)} employees`}>
                <Facts items={dist.map(b => [b.label, String(b.count)]) as [string, React.ReactNode][]} />
              </Panel>
            )}

            <Panel icon="play-circle" tone="indigo" title="Recent payroll runs"
              right={<TouchableOpacity onPress={() => router.push('/modules/admin/payroll-runs' as any)}>
                <Text style={st.link}>View all</Text>
              </TouchableOpacity>}>
              {runs.length === 0 ? (
                <Blank icon="play-circle-outline" title="No payroll runs yet"
                  body="Create the first run to compute salaries for every active assignment." />
              ) : runs.map(r => (
                <PersonRow key={r._id} name={r.runName} tone="indigo"
                  sub={`${r.period} · ${r.totalEmployees} employees · net ${money(r.totalNet)}`}
                  right={<StatusPill status={r.status} />}
                  onPress={() => router.push({ pathname: '/modules/admin/payroll-run-detail', params: { id: r._id } } as any)} />
              ))}
            </Panel>

            {Array.isArray(data?.upcoming) && data.upcoming.length > 0 && (
              <Panel icon="calendar" tone="amber" title="Coming up">
                {data.upcoming.map((u: any) => (
                  <PersonRow key={u.key} name={u.title} sub={u.subtitle} tone="amber"
                    right={u.badge ? <Pill label={u.badge.text} tone={u.badge.tone === 'green' ? 'green' : u.badge.tone === 'red' ? 'red' : 'amber'} />
                      : <Text style={st.when}>{shortDate(u.due)}</Text>} />
                ))}
              </Panel>
            )}

            <Panel icon="grid" tone="slate" title="Everything else">
              {LINKS.map(l => {
                const tone = TONES[l.tone as keyof typeof TONES];
                return (
                  <TouchableOpacity key={l.label} style={st.linkRow} onPress={() => router.push(l.route as any)} activeOpacity={0.7}>
                    <View style={[st.linkIcon, { backgroundColor: tone.bg }]}>
                      <Ionicons name={l.icon as any} size={17} color={tone.fg} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.linkTitle}>{l.label}</Text>
                      <Text style={st.linkSub}>{l.sub}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
                  </TouchableOpacity>
                );
              })}
            </Panel>
          </>
        )}
      </ScrollView>
    </>
  );
}

const st = StyleSheet.create({
  stepper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.sm, marginBottom: Spacing.md,
  },
  stepBtn: {
    width: 34, height: 34, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepMonth: { fontSize: 15, fontWeight: '800', color: Colors.text },
  stepSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  link: { fontSize: 12.5, fontWeight: '700', color: Colors.primary },
  when: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  linkIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  linkTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  linkSub: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 1 },
});
