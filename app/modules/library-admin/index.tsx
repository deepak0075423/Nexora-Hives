import React, { useEffect, useState } from 'react';
import { ScrollView, RefreshControl } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import * as libApi from '@/api/library.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, RowItem, StatRow, StatTile, Badge, SectionTitle, fmtDate,
  MODULE_BLOCKED_CODES,
} from '@/components/ui/kit';

export default function LibraryAdminDashboardScreen() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [denied, setDenied] = useState(false);

  const load = async () => {
    try { setData(unwrap(await libApi.getDashboard())); }
    catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) setDisabled(true);
      else if (err?.status === 403) setDenied(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  if (disabled || denied) return (
    <>
      <Stack.Screen options={{ title: 'Manage Library' }} />
      <ModuleDisabled message={denied ? 'You need the Librarian designation (or admin role) to manage the library.' : undefined} />
    </>
  );

  const LINKS = [
    { label: 'Books', sub: 'Catalogue, copies and availability', icon: 'book', route: '/modules/library-admin/books' },
    { label: 'Circulation', sub: 'Issue, return and renew books', icon: 'swap-horizontal', route: '/modules/library-admin/circulation' },
    { label: 'Reservations', sub: 'Queue and ready-for-pickup', icon: 'bookmark', route: '/modules/library-admin/reservations' },
    { label: 'Fines', sub: 'Collect or waive late fines', icon: 'cash', route: '/modules/library-admin/fines' },
    { label: 'Reports', sub: 'Overdue, dead stock, stock take', icon: 'bar-chart', route: '/modules/library-admin/reports' },
    { label: 'Policy', sub: 'Limits, durations and fine rates', icon: 'settings', route: '/modules/library-admin/policy' },
  ];

  return (
    <>
      <Stack.Screen options={{ title: 'Manage Library' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {loading ? <LoaderView /> : (
          <>
            <StatRow>
              <StatTile label="Books" value={data?.totalBooks ?? '--'} icon="book" tone="info" />
              <StatTile label="Issued" value={data?.issuedCopies ?? '--'} icon="swap-horizontal" tone="warning" />
              <StatTile label="Overdue" value={data?.overdue ?? '--'} icon="alert-circle" tone="danger" />
            </StatRow>
            <StatRow>
              <StatTile label="Copies" value={data?.totalCopies ?? '--'} icon="albums" tone="neutral" />
              {/* Queued plus held for collection — the server counted only the
                  queue, so a title with everyone already called up read 0. */}
              <StatTile label="Active Reservations" value={data?.reservations ?? '--'} icon="bookmark" tone="info" />
              <StatTile label="Fines Due" value={data?.pendingFines ?? '--'} icon="cash" tone="warning" />
            </StatRow>

            {LINKS.map(l => (
              <RowItem key={l.label} icon={l.icon} iconColor="#059669" iconBg="#D1FAE5"
                title={l.label} sub={l.sub} onPress={() => router.push(l.route as any)} />
            ))}

            {Array.isArray(data?.recent) && data.recent.length > 0 && (
              <>
                <SectionTitle>Recent issuances</SectionTitle>
                {data.recent.map((r: any) => (
                  <RowItem key={r._id}
                    icon="book" iconColor={Colors.info} iconBg={Colors.infoLight}
                    title={r.book?.title ?? '--'}
                    sub={`${r.issuedTo?.name ?? '--'} · ${fmtDate(r.issueDate)} → due ${fmtDate(r.dueDate)}`}
                    right={<Badge label={r.status} />}
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
