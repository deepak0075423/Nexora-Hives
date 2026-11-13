/** Student → Video Learning → a book (phone): its chapters, locked until released. */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, RefreshControl, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import { LoaderView, Empty, Card, RowItem, Badge, StatRow, StatTile, unwrap } from '@/components/ui/kit';
import * as api from '@/api/video.api';
import { Meter, plural, word, tone } from '@/components/videos/parts';

export default function StudentVideoBook() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try { setData(unwrap(await api.studentBook(String(id)))); setError(''); }
    catch (e: any) { setError(e?.message || 'Could not load this book'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const title = data?.book?.title || 'Book';
  if (loading) return <><Stack.Screen options={{ title }} /><LoaderView /></>;
  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: Spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        {error ? <Empty icon="alert-circle-outline" text={error} /> : (
          <>
            <StatRow>
              <StatTile label="Chapters open" value={`${data.totals.releasedChapters}/${data.chapters.length}`} icon="layers-outline" />
              <StatTile label="Videos" value={data.totals.videos} icon="film-outline" />
              <StatTile label="Completed" value={`${data.totals.percent}%`} icon="checkmark-done-outline" tone="success" />
            </StatRow>
            <Card>
              {data.chapters.length ? data.chapters.map((c: any) => (
                <View key={c._id}>
                  <RowItem icon={c.status === 'locked' ? 'lock-closed-outline' : 'albums-outline'} title={`Chapter ${c.chapterNumber}: ${c.title}`}
                    sub={c.status === 'locked' ? 'Not released yet' : `${plural(c.videoCount, 'video')} · ${c.completedCount} completed`}
                    right={<Badge label={word(c.status)} tone={tone(c.status)} />}
                    onPress={c.status === 'locked' ? undefined : () => router.push(`/modules/video-chapter?id=${c._id}` as any)} />
                  {c.status !== 'locked' ? <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm }}><Meter percent={c.percent} /></View> : null}
                </View>
              )) : <Empty icon="book-outline" text="This book's chapters have not been added yet." />}
            </Card>
          </>
        )}
      </ScrollView>
    </>
  );
}
