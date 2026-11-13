/**
 * Admin → Video Learning (phone): where the school stands — what it follows,
 * what is released, how students are getting on — and its requests.
 * Choosing the board, subjects and books is done on the web app (Setup).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, RefreshControl, View } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import { LoaderView, Empty, Card, RowItem, Badge, SegTabs, StatRow, StatTile, SectionTitle, unwrap, fmtDate, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import ModuleDisabled from '@/components/ModuleDisabled';
import * as api from '@/api/video.api';
import { Meter, Note, word, tone, spent } from '@/components/videos/parts';

export default function AdminVideos() {
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState<any>(null);
  const [reqs, setReqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      if (tab === 'overview') setData(unwrap(await api.schoolAnalytics()));
      else setReqs(unwrap(await api.schoolRequests({ limit: 50 })) || []);
      setError('');
    } catch (e: any) { if (MODULE_BLOCKED_CODES.includes(e?.data?.code)) setBlocked(true); else setError(e?.message || 'Could not load'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [tab]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  const head = <Stack.Screen options={{ title: 'Video Learning' }} />;
  if (blocked) return <>{head}<ModuleDisabled /></>;
  return (
    <>
      {head}
      <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: Spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        <SegTabs tabs={[{ key: 'overview', label: 'Overview' }, { key: 'requests', label: 'Requests' }]} active={tab} onChange={setTab} />
        {loading ? <LoaderView /> : error ? <Empty icon="alert-circle-outline" text={error} /> : tab === 'overview' ? (
          <>
            {!data.setup.booksFollowed ? <Note>No books are assigned yet, so teachers have nothing to release. Choose the board, subjects and books on the web app under Video Learning › Setup.</Note> : null}
            <StatRow>
              <StatTile label="Books" value={data.setup.booksFollowed} icon="library-outline" />
              <StatTile label="Live releases" value={data.setup.liveReleases} icon="paper-plane-outline" tone="primary" />
              <StatTile label="Requests" value={data.setup.openRequests} icon="mail-outline" tone="warning" />
            </StatRow>
            <StatRow>
              <StatTile label="Watching" value={data.students.started} icon="trending-up-outline" tone="warning" />
              <StatTile label="Completed" value={data.students.completed} icon="checkmark-done-outline" tone="success" />
              <StatTile label="Watch time" value={spent(data.students.watchSeconds)} icon="time-outline" />
            </StatRow>
            <SectionTitle>Sections</SectionTitle>
            {data.sections.length ? (
              <Card>
                {data.sections.map((s: any) => (
                  <View key={s.section}>
                    <RowItem icon="people-outline" title={`${s.className} ${s.sectionName}`} sub={`${s.students} students · ${s.started} started · ${s.completed} completed`} />
                    <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm }}><Meter percent={s.percent} /></View>
                  </View>
                ))}
              </Card>
            ) : <Empty icon="paper-plane-outline" text="Figures appear once teachers release books, chapters or videos." />}
          </>
        ) : reqs.length ? (
          <Card>
            {reqs.map((r) => (
              <RowItem key={r._id} icon={r.type === 'book' ? 'book-outline' : 'albums-outline'}
                title={r.type === 'book' ? r.title : `Chapter ${r.chapterNumber ?? ''} ${r.chapterName || ''}`.trim()}
                sub={`${r.type === 'book' ? 'Book' : `In ${r.bookTitle || r.title}`} · ${fmtDate(r.createdAt)}${r.reviewNote ? ` · ${r.reviewNote}` : ''}`}
                right={<Badge label={word(r.status)} tone={tone(r.status)} />} />
            ))}
          </Card>
        ) : <Empty icon="mail-outline" text="No requests yet. Request books and chapters on the web app." />}
      </ScrollView>
    </>
  );
}
