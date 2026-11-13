/**
 * Student → Video Learning (phone). The books the student's section follows,
 * what has been released from them, and anything half-watched.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, RefreshControl, View, Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import { LoaderView, Empty, Card, SectionTitle, RowItem, StatRow, StatTile, unwrap, MODULE_BLOCKED_CODES } from '@/components/ui/kit';
import ModuleDisabled from '@/components/ModuleDisabled';
import * as api from '@/api/video.api';
import { Meter, clock, plural } from '@/components/videos/parts';

export default function StudentVideos() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(unwrap(await api.studentHome())); setError(''); }
    catch (e: any) { if (MODULE_BLOCKED_CODES.includes(e?.data?.code)) setBlocked(true); else setError(e?.message || 'Could not load your videos'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const head = <Stack.Screen options={{ title: 'Video Learning' }} />;
  if (blocked) return <>{head}<ModuleDisabled /></>;
  if (loading) return <>{head}<LoaderView /></>;
  const t = data?.totals;

  return (
    <>
      {head}
      <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: Spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        {error ? <Empty icon="alert-circle-outline" text={error} /> : !data?.where?.placed ? (
          <Empty icon="school-outline" text="Video lessons follow your class and section. They appear here once the school places you in one." />
        ) : !data.books.length ? (
          <Empty icon="library-outline" text="Your school has not chosen video lesson books for your section yet." />
        ) : (
          <>
            <Text style={{ color: Colors.textSecondary, marginBottom: Spacing.sm }}>{data.where.className} {data.where.sectionName} · {data.where.yearName}</Text>
            <StatRow>
              <StatTile label="Videos" value={t.videos} icon="film-outline" />
              <StatTile label="Completed" value={t.completed} icon="checkmark-done-outline" tone="success" />
              <StatTile label="Progress" value={`${t.percent}%`} icon="trending-up-outline" tone="primary" />
            </StatRow>

            {data.continueWatching.length ? (
              <>
                <SectionTitle>Continue watching</SectionTitle>
                <Card>
                  {data.continueWatching.map((v: any) => (
                    <RowItem key={v.chapterVideo} icon="play-circle-outline" title={v.title}
                      sub={`Chapter ${v.chapterNumber} · ${v.bookTitle} · resume at ${clock(v.resumePositionSec)}`}
                      onPress={() => router.push(`/modules/video-player?id=${v.chapterVideo}` as any)} />
                  ))}
                </Card>
              </>
            ) : null}

            {data.subjects.map((s: any) => (
              <View key={s._id}>
                <SectionTitle>{s.name}</SectionTitle>
                <Card>
                  {data.books.filter((b: any) => String(b.lmsSubject) === String(s._id)).map((b: any) => (
                    <View key={b._id}>
                      <RowItem icon="book-outline" title={b.title}
                        sub={b.videos ? `${plural(b.releasedChapters, 'chapter')} · ${b.completed} of ${plural(b.videos, 'video')} completed` : 'Nothing released yet'}
                        onPress={() => router.push(`/modules/video-book?id=${b._id}` as any)} />
                      {b.videos ? <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm }}><Meter percent={b.percent} /></View> : null}
                    </View>
                  ))}
                </Card>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}
