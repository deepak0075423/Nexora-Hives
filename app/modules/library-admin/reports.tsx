import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as libApi from '@/api/library.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Card, KV, SectionTitle, SegTabs, ActionBtn,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

// The reports screen builds itself from the server's own list, so a report
// added on the backend appears here without an edit.
//
// Reports needing a date range or a member are run from the web panel — on a
// phone the useful ones are the shelf-side questions a librarian asks while
// standing in the stacks.

export default function LibraryReportsScreen() {
  const [reports, setReports] = useState<any[]>([]);
  const [active, setActive] = useState<string>('');
  const [rows, setRows] = useState<any[] | null>(null);
  const [extra, setExtra] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    libApi.listReports()
      .then((res: any) => {
        // Anything needing a filter is a desk job, not a phone job.
        const list = ((res as any)?.data ?? []).filter((r: any) => r.filters.length === 0);
        setReports(list);
        if (list.length) setActive(list[0].key);
      })
      .catch((err: any) => {
        if (MODULE_BLOCKED_CODES.includes(err?.data?.code) || err?.status === 403) setDisabled(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const run = useCallback(async (key: string) => {
    const report = reports.find((r: any) => r.key === key);
    if (!report) return;
    setLoading(true); setNote('');
    try {
      const res: any = await libApi.runReport(report.path);
      setRows(unwrap(res) ?? []);
      const { success, data, ...rest } = res || {};
      setExtra(Object.keys(rest).length ? rest : null);
    } catch (err: any) {
      setRows(null);
      setNote(err.message || 'The report could not be run');
    } finally { setLoading(false); setRefreshing(false); }
  }, [reports]);

  useEffect(() => { if (active) run(active); }, [active, run]);

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Reports' }} />
      <ModuleDisabled />
    </>
  );

  const columns = rows?.length ? Object.keys(rows[0]) : [];

  return (
    <>
      <Stack.Screen options={{ title: 'Library Reports' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); run(active); }}
              tintColor={Colors.primary} />
          }
        >
          {reports.length > 1 && (
            <SegTabs
              tabs={reports.map((r: any) => ({ key: r.key, label: r.name }))}
              active={active}
              onChange={setActive}
            />
          )}

          {loading ? <LoaderView /> : (
            <>
              {note ? (
                <Card><Text style={{ color: Colors.danger, fontSize: 13 }}>{note}</Text></Card>
              ) : null}

              {extra?.total != null && (
                <Card><KV label="Rows" value={String(extra.total)} /></Card>
              )}

              {!rows ? (
                <Empty icon="bar-chart-outline" text="Pick a report" />
              ) : rows.length === 0 ? (
                <Empty icon="checkmark-circle-outline" text="Nothing to show — usually good news" />
              ) : (
                <>
                  <SectionTitle>{rows.length} row{rows.length === 1 ? '' : 's'}</SectionTitle>
                  {rows.slice(0, 100).map((r: any, i: number) => (
                    <Card key={i}>
                      {columns.map(c => (
                        r[c] === '' || r[c] == null ? null : <KV key={c} label={c} value={String(r[c])} />
                      ))}
                    </Card>
                  ))}
                  {rows.length > 100 && (
                    <Text style={{ color: Colors.textSecondary, fontSize: 12, textAlign: 'center', paddingVertical: 12 }}>
                      Showing the first 100 of {rows.length}. Use the web panel for the full list and the export.
                    </Text>
                  )}
                </>
              )}

              <View style={{ marginTop: 16 }}>
                <ActionBtn label="Refresh" tone="info" onPress={() => run(active)} />
              </View>
              <Text style={{ color: Colors.textLight, fontSize: 11, textAlign: 'center', marginTop: 12 }}>
                Date-range and per-member reports, and Excel export, live on the web panel.
              </Text>
            </>
          )}
        </ScrollView>
      </View>
    </>
  );
}
