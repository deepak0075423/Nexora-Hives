/**
 * Employee Directory — the administrator's read of the school's shape, on the
 * phone: departments, designations, the reporting lines and the reports.
 *
 * Reading only. Adding a department, renaming one, changing access and taking a
 * report away as a file are done on the web, where there is room for them; a
 * person's own placement can be changed here from their profile.
 *
 * Every figure is the server's (the same endpoints the web pages read), and a
 * row that counts people opens the list of exactly those people.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import * as dirApi from '@/api/employeeDirectory.api';
import {
  unwrap, LoaderView, Empty, Badge, Card, SegTabs, Select, SearchBar, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

const TABS = [
  { key: 'departments',  label: 'Departments' },
  { key: 'designations', label: 'Designations' },
  { key: 'org',          label: 'Organisation' },
  { key: 'reports',      label: 'Reports' },
];
const REPORT_ROWS = 40;

export default function EmployeeDirectoryAdminScreen() {
  const router = useRouter();
  const [tab, setTab] = useState('departments');
  const [data, setData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fatal, setFatal] = useState<{ message: string; code?: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState('');
  const [q, setQ] = useState('');
  // Reports: the catalogue once, then the chosen report.
  const [report, setReport] = useState('directory');
  const [rows, setRows] = useState<any>(null);
  const [rowsBusy, setRowsBusy] = useState(false);

  const fetchers: Record<string, () => Promise<any>> = useMemo(() => ({
    departments:  dirApi.getDepartments,
    designations: dirApi.getDesignations,
    org:          dirApi.getOrgStructure,
    reports:      dirApi.listReports,
  }), []);

  const load = useCallback(async (which: string, force = false) => {
    if (!force && data[which]) return;
    try {
      const res = unwrap(await fetchers[which]());
      setData((d) => ({ ...d, [which]: res }));
      setErrors((e) => ({ ...e, [which]: '' }));
    } catch (e: any) {
      const code = e?.data?.code;
      if (code && MODULE_BLOCKED_CODES.includes(code)) setFatal({ message: e?.message || 'You do not have access to this', code });
      else setErrors((x) => ({ ...x, [which]: e?.message || 'Could not load this' }));
    } finally { setRefreshing(false); }
  }, [data, fetchers]);

  useEffect(() => { load(tab); setOpen(''); setQ(''); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== 'reports') return;
    let alive = true;
    setRowsBusy(true);
    dirApi.getReport(report)
      .then((res) => { if (alive) setRows(unwrap(res)); })
      .catch(() => { if (alive) setRows({ rows: [], columns: [], failed: true }); })
      .finally(() => { if (alive) setRowsBusy(false); });
    return () => { alive = false; };
  }, [tab, report]);

  const list = (params: Record<string, string>) => router.push({ pathname: '/modules/employee-directory', params } as any);
  const person = (id: string) => router.push(`/modules/employee-directory-detail?id=${id}` as any);

  if (fatal) {
    return (
      <>
        <Stack.Screen options={{ title: 'Directory' }} />
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <Empty icon="lock-closed-outline" text={fatal.message} />
        </View>
      </>
    );
  }

  const cur = data[tab];
  const term = q.trim().toLowerCase();

  /** The reporting tree, as an indented list (it can be as deep as the school is). */
  const Branch = ({ node, depth }: { node: any; depth: number }) => (
    <>
      <TouchableOpacity
        style={[s.treeRow, { paddingLeft: 10 + Math.min(depth, 6) * 16 }]}
        activeOpacity={node.isSchoolAdmin ? 1 : 0.7}
        onPress={() => { if (!node.isSchoolAdmin) person(node._id); }}
        accessibilityRole="button" accessibilityLabel={node.name}
      >
        <Ionicons name={node.children?.length ? 'git-network-outline' : 'person-outline'} size={14} color={Colors.textLight} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.name} numberOfLines={1}>{node.name}</Text>
          <Text style={s.sub} numberOfLines={1}>{[node.designation, node.department].filter(Boolean).join(' · ') || 'No designation'}</Text>
        </View>
        {node.children?.length ? <Badge label={`${node.children.length}`} tone="info" /> : null}
      </TouchableOpacity>
      {(node.children || []).map((c: any) => <Branch key={c._id} node={c} depth={depth + 1} />)}
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Directory — structure' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(tab, true); }} />}
      >
        <SegTabs tabs={TABS} active={tab} onChange={setTab} />

        {errors[tab] ? <Empty icon="cloud-offline-outline" text={errors[tab]} />
          : !cur ? <LoaderView />
            : tab === 'departments' ? (
              <>
                <SearchBar value={q} onChange={setQ} placeholder="Find a department…" />
                {(cur.departments || []).filter((d: any) => !term || d.name.toLowerCase().includes(term)).map((d: any) => (
                  <Card key={d.name} style={{ marginBottom: Spacing.sm }}>
                    <TouchableOpacity style={s.head} activeOpacity={0.75} onPress={() => setOpen(open === d.name ? '' : d.name)}
                      accessibilityRole="button" accessibilityLabel={`${d.name}, ${d.total} people`}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.name} numberOfLines={1}>{d.name}</Text>
                        <Text style={s.sub} numberOfLines={2}>
                          {[`${d.teaching} teaching`, `${d.nonTeaching} non-teaching`, d.head ? `Head: ${d.head.name}` : ''].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      {d.listed === false && <Badge label="Not on the list" tone="warning" />}
                      <Badge label={`${d.total}`} tone={d.name === 'Unassigned' ? 'warning' : 'info'} />
                      <Ionicons name={open === d.name ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
                    </TouchableOpacity>
                    {open === d.name && (
                      <View style={{ marginTop: Spacing.sm }}>
                        {d.members.length === 0 ? <Text style={s.note}>Nobody is in it yet.</Text> : d.members.map((m: any) => (
                          <TouchableOpacity key={m._id} style={s.member} onPress={() => person(m._id)} accessibilityRole="button" accessibilityLabel={m.name}>
                            <Text style={s.memberName} numberOfLines={1}>{m.name}{m.isActive === false ? ' (deactivated)' : ''}</Text>
                            <Text style={s.sub} numberOfLines={1}>{m.designation || 'No designation'}</Text>
                          </TouchableOpacity>
                        ))}
                        {d.total > 0 && (
                          <TouchableOpacity style={s.linkRow} onPress={() => list({ department: d.name, accountStatus: 'all' })} accessibilityRole="button">
                            <Text style={s.link}>Open these {d.total} in the staff list</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </Card>
                ))}
                <Text style={s.note}>Adding, renaming and merging departments is done on the web. A person's department can be changed here from their profile.</Text>
              </>
            ) : tab === 'designations' ? (
              <>
                <SearchBar value={q} onChange={setQ} placeholder="Find a designation…" />
                {(cur.designations || []).filter((d: any) => !term || d.name.toLowerCase().includes(term)).map((d: any) => (
                  <Card key={d.name} style={{ marginBottom: Spacing.sm }}>
                    <TouchableOpacity style={s.head} activeOpacity={0.75} onPress={() => setOpen(open === d.name ? '' : d.name)}
                      accessibilityRole="button" accessibilityLabel={`${d.name}, ${d.total} people`}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.name} numberOfLines={1}>{d.name}</Text>
                        <Text style={s.sub}>{d.active} of {d.total} active</Text>
                      </View>
                      <Badge label={`${d.total}`} tone={d.name === 'Unassigned' ? 'warning' : 'info'} />
                      <Ionicons name={open === d.name ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
                    </TouchableOpacity>
                    {open === d.name && (
                      <View style={{ marginTop: Spacing.sm }}>
                        {d.members.map((m: any) => (
                          <TouchableOpacity key={m._id} style={s.member} onPress={() => person(m._id)} accessibilityRole="button" accessibilityLabel={m.name}>
                            <Text style={s.memberName} numberOfLines={1}>{m.name}{m.isActive === false ? ' (deactivated)' : ''}</Text>
                            <Text style={s.sub} numberOfLines={1}>{m.department || 'No department'}</Text>
                          </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={s.linkRow} onPress={() => list({ designation: d.name, accountStatus: 'all' })} accessibilityRole="button">
                          <Text style={s.link}>Open these {d.total} in the staff list</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </Card>
                ))}
                <Text style={s.note}>What each designation opens is set by the school administrator on the web (Admin → Designations).</Text>
              </>
            ) : tab === 'org' ? (
              <>
                <Text style={s.note}>
                  {cur.hasReportingLines
                    ? `${cur.reporting} of ${cur.employeeCount} employees report to someone.`
                    : 'No reporting manager has been set on anybody yet, so everyone sits at the top. Set one from a profile (Employment → Edit employment).'}
                </Text>
                <Card>
                  {(cur.tree || []).map((n: any) => <Branch key={n._id} node={n} depth={0} />)}
                </Card>
              </>
            ) : (
              <>
                <Select label="Report" value={report}
                  options={(cur.reports || []).map((r: any) => ({ label: r.label, value: r.key }))}
                  onChange={(v) => setReport(v || 'directory')} />
                {rowsBusy || !rows ? <View style={{ paddingVertical: 40 }}><ActivityIndicator color={Colors.primary} /></View>
                  : rows.failed ? <Empty icon="cloud-offline-outline" text="Could not build this report" />
                    : !rows.rows.length ? <Empty icon="document-outline" text="No employee records fall into this report yet." />
                      : (
                        <>
                          <Text style={s.note}>{rows.rows.length} row{rows.rows.length === 1 ? '' : 's'}{rows.rows.length > REPORT_ROWS ? ` — the first ${REPORT_ROWS} are shown` : ''}. Download the file from the web.</Text>
                          {rows.rows.slice(0, REPORT_ROWS).map((r: any[], i: number) => (
                            <Card key={i} style={{ marginBottom: Spacing.sm }}>
                              {r.map((cell, j) => (cell === '' || cell == null ? null : (
                                <View key={j} style={s.cell}>
                                  <Text style={s.cellLabel}>{rows.columns[j]}</Text>
                                  <Text style={s.cellValue}>{String(cell)}</Text>
                                </View>
                              )))}
                            </Card>
                          ))}
                        </>
                      )}
              </>
            )}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 14.5, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  note: { fontSize: 12.5, lineHeight: 18, color: Colors.textSecondary, marginVertical: Spacing.sm },
  member: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  memberName: { fontSize: 13.5, fontWeight: '600', color: Colors.text },
  linkRow: { paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  link: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  treeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingRight: 6,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  cell: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  cellLabel: { width: 120, fontSize: 12, color: Colors.textSecondary },
  cellValue: { flex: 1, fontSize: 13, color: Colors.text, borderRadius: Radius.sm },
});
