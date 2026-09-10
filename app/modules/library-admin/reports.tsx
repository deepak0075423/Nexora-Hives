import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as libApi from '@/api/library.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, Card, KV, Badge, SectionTitle, SegTabs, SearchBar,
  ActionBtn, StatRow, StatTile, MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

// The reports screen builds itself from the server's own registry: a report
// brings its name, the columns it answers on and what each value *is*, so a
// report added on the backend appears here, formatted, with no edit.
//
// Reports needing a member picked are a desk job and stay on the web panel;
// everything else is a shelf-side question a librarian asks while standing in
// the stacks, so it is here with its filters left at their defaults.
//
// Rows arrive a page at a time — the accession register is every copy the
// library owns, and pulling all of it onto a phone to show twenty is how a
// screen like this stops being usable in a school with a real collection.

const PAGE = 25;

type Column = {
  key: string; label: string; type: string;
  sub?: string; inline?: boolean; empty?: string; decimals?: number;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-09-04` → `04 Sep 2026`, read off the string so no zone can shift it. */
const fmtDay = (v: any) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(v ?? '');
};

const money = (n: any) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const words = (v: any) => String(v ?? '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** One value, said the way its column says it should be. */
function display(column: Column, row: any): string {
  const v = row[column.key];
  if (v === '' || v === null || v === undefined) return column.empty ?? '--';
  switch (column.type) {
    case 'date':  return fmtDay(v);
    case 'money': return money(v);
    case 'days':  return Number(v) > 0 ? `${v} days` : (column.empty ?? '0');
    case 'num':   return column.decimals ? Number(v).toFixed(column.decimals) : String(v);
    case 'chip':
    case 'role':  return words(v);
    default:      return String(v);
  }
}

const fmtStat = (s: any) =>
  (s.type === 'money' ? money(s.value)
    : s.type === 'days' ? `${s.value} day${Number(s.value) === 1 ? '' : 's'}`
      : String(s.value));

const STAT_ICONS = ['book-outline', 'swap-horizontal-outline', 'people-outline', 'cash-outline'];

export default function LibraryReportsScreen() {
  const [reports, setReports] = useState<any[]>([]);
  const [active, setActive] = useState<string>('');
  const [rows, setRows] = useState<any[] | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [note, setNote] = useState('');

  const report = useMemo(() => reports.find((r: any) => r.key === active), [reports, active]);
  const takesSearch = (report?.filters ?? []).some((f: any) => f.type === 'search');

  useEffect(() => {
    libApi.listReports()
      .then((res: any) => {
        // A report that needs a member picked is a desk job, not a phone job;
        // everything else runs on its defaults.
        const list = ((res as any)?.data ?? []).filter(
          (r: any) => !(r.filters ?? []).some((f: any) => f.required),
        );
        setReports(list);
        if (list.length) setActive(list[0].key);
      })
      .catch((err: any) => {
        if (MODULE_BLOCKED_CODES.includes(err?.data?.code) || err?.status === 403) setDisabled(true);
      })
      .finally(() => setLoading(false));
  }, []);

  // A request per keystroke is a request per keystroke; wait for a pause.
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const run = useCallback(async (key: string, wanted = 1, q = term) => {
    const r = reports.find((x: any) => x.key === key);
    if (!r) return;
    if (wanted === 1) setLoading(true); else setMore(true);
    setNote('');
    try {
      const res: any = await libApi.runReport(r.path, { page: wanted, limit: PAGE, q: q || undefined });
      const batch = unwrap(res) ?? [];
      // Page two onwards is appended: a phone list grows, it does not replace
      // itself with a slice the librarian has to page back through.
      setRows((prev) => (wanted === 1 || !prev ? batch : [...prev, ...batch]));
      setColumns(res?.columns ?? r.columns ?? []);
      setSummary(res?.summary ?? []);
      setTotal(res?.total ?? batch.length);
      setPage(wanted);
    } catch (err: any) {
      if (wanted === 1) setRows(null);
      setNote(err?.message || 'The report could not be run');
    } finally { setLoading(false); setMore(false); setRefreshing(false); }
  }, [reports, term]);

  useEffect(() => { if (active) run(active, 1, term); }, [active, term, run]);

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Reports' }} />
      <ModuleDisabled />
    </>
  );

  // The lead line of a card is the thing the row is about; the rest are its
  // details. Columns folded into another cell on the web (an ISBN under a
  // title) are listed in full here, where there is room for a line each.
  const lead = columns.find((c) => c.type === 'title' || c.type === 'person') || columns[0];
  const rest = columns.filter((c) => c && c !== lead && !c.inline);
  const shown = rows?.length ?? 0;

  return (
    <>
      <Stack.Screen options={{ title: 'Library Reports' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); run(active, 1, term); }}
              tintColor={Colors.primary} />
          }
        >
          {reports.length > 1 && (
            <SegTabs
              tabs={reports.map((r: any) => ({ key: r.key, label: r.name }))}
              active={active}
              onChange={(k: string) => { setRows(null); setSearch(''); setTerm(''); setActive(k); }}
            />
          )}

          {report ? (
            <Text style={{ color: Colors.textSecondary, fontSize: 12, marginBottom: Spacing.sm }}>
              {report.blurb}
            </Text>
          ) : null}

          {loading ? <LoaderView /> : (
            <>
              {note ? (
                <Card><Text style={{ color: Colors.danger, fontSize: 13 }}>{note}</Text></Card>
              ) : null}

              {summary.length > 0 && (
                <StatRow>
                  {summary.slice(0, 4).map((s: any, i: number) => (
                    <StatTile key={s.label} label={s.label} value={fmtStat(s)}
                      icon={STAT_ICONS[i] ?? 'stats-chart-outline'}
                      tone={s.type === 'money' ? 'success' : 'info'} />
                  ))}
                </StatRow>
              )}

              {takesSearch && (
                <SearchBar value={search} onChange={setSearch}
                  placeholder={(report?.filters ?? []).find((f: any) => f.type === 'search')?.placeholder || 'Search…'} />
              )}

              {!rows ? (
                <Empty icon="bar-chart-outline" text="Pick a report" />
              ) : rows.length === 0 ? (
                <Empty icon="checkmark-circle-outline"
                  text={term ? 'Nothing matches that search' : 'Nothing to show — usually good news'} />
              ) : (
                <>
                  <SectionTitle>{`${shown} of ${total} row${total === 1 ? '' : 's'}`}</SectionTitle>

                  {rows.map((r: any, i: number) => (
                    <Card key={r._id ?? i}>
                      {lead ? (
                        <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 6 }}>
                          {display(lead, r)}
                          {lead.sub && r[lead.sub]
                            ? <Text style={{ fontWeight: '400', color: Colors.textSecondary }}>{`  ${r[lead.sub]}`}</Text>
                            : null}
                        </Text>
                      ) : null}
                      {rest.map((c) => (
                        c.type === 'status'
                          ? <KV key={c.key} label={c.label} value={<Badge label={words(r[c.key])} />} />
                          : <KV key={c.key} label={c.label} value={display(c, r)} />
                      ))}
                    </Card>
                  ))}

                  {shown < total && (
                    <ActionBtn label={more ? 'Loading…' : `Load ${Math.min(PAGE, total - shown)} more`}
                      tone="info" disabled={more} onPress={() => run(active, page + 1, term)} />
                  )}
                </>
              )}

              <Text style={{ color: Colors.textLight, fontSize: 11, textAlign: 'center', marginTop: 12 }}>
                Per-member reports, custom date ranges and the Excel export live on the web panel.
              </Text>
            </>
          )}
        </ScrollView>
      </View>
    </>
  );
}
