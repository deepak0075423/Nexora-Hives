/** Student → Video Learning → a chapter (phone): the videos released to the student. */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, RefreshControl, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import { LoaderView, Empty, Card, RowItem, Badge, unwrap } from '@/components/ui/kit';
import * as api from '@/api/video.api';
import { Meter, clock, word, tone } from '@/components/videos/parts';

export default function StudentVideoChapter() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try { setData(unwrap(await api.studentChapter(String(id)))); setError(''); }
    catch (e: any) { setError(e?.data?.code === 'NOT_RELEASED' ? 'This chapter has not been released to you yet.' : (e?.message || 'Could not load this chapter')); }
    finally { setLoading(false); setRefreshing(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const title = data?.chapter ? `Chapter ${data.chapter.chapterNumber}` : 'Chapter';
  if (loading) return <><Stack.Screen options={{ title }} /><LoaderView /></>;
  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: Spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}>
        {error ? <Empty icon="lock-closed-outline" text={error} /> : (
          <Card>
            {data.videos.map((v: any, i: number) => (
              <View key={v.chapterVideo}>
                <RowItem icon={v.status === 'completed' ? 'checkmark-circle-outline' : 'play-circle-outline'} title={`${i + 1}. ${v.title}`}
                  sub={`${clock(v.durationSec)}${v.canResume ? ` · resume at ${clock(v.resumePositionSec)}` : ''}`}
                  right={<Badge label={word(v.status)} tone={tone(v.status)} />}
                  onPress={() => router.push(`/modules/video-player?id=${v.chapterVideo}` as any)} />
                <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm }}><Meter percent={v.watchedPercent} /></View>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </>
  );
}
