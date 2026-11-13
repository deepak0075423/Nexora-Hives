/**
 * Student → Video Learning → watching (phone).
 *
 * Videos play in the web app's controlled player: it is what keeps the rules
 * (no skipping ahead, fixed speed) and reports watching to the server. The
 * phone app cannot host that player until a native video module is added, so
 * this screen shows where the student is and opens the video on the web.
 * Notifications about a released video land here (services/notificationLinks).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing } from '@/constants/theme';
import { LoaderView, Empty, Card, KV, ActionBtn, Badge, unwrap } from '@/components/ui/kit';
import * as api from '@/api/video.api';
import { Meter, Note, clock, word, tone, openOnWeb } from '@/components/videos/parts';

export default function VideoPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [video, setVideo] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setVideo(unwrap(await api.studentVideo(String(id)))); }
    catch (e: any) { setError(e?.data?.code === 'NOT_RELEASED' ? 'This video is not released to you, or it is no longer available.' : (e?.message || 'Could not load this video')); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <><Stack.Screen options={{ title: 'Video' }} /><LoaderView /></>;
  return (
    <>
      <Stack.Screen options={{ title: video?.title || 'Video' }} />
      <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: Spacing.md }}>
        {error ? <Empty icon="lock-closed-outline" text={error} /> : (
          <>
            <Card>
              <View style={{ padding: Spacing.md }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: Colors.text }}>{video.title}</Text>
                <Text style={{ color: Colors.textSecondary, marginTop: 4 }}>Chapter {video.chapter.chapterNumber}: {video.chapter.title} · {video.chapter.bookTitle}</Text>
                <View style={{ flexDirection: 'row', marginTop: Spacing.sm }}><Badge label={word(video.status)} tone={tone(video.status)} /></View>
                <Meter percent={video.watchedPercent} />
              </View>
              <KV label="Length" value={clock(video.durationSec)} />
              {video.canResume ? <KV label="Resume at" value={clock(video.resumePositionSec)} /> : null}
            </Card>
            <Note>Videos play in the school's web player, which keeps your progress. It opens in your browser — sign in there once with your school account.</Note>
            <ActionBtn label={video.status === 'completed' ? 'Watch again on the web' : video.canResume ? 'Resume on the web' : 'Watch on the web'} tone="primary"
              onPress={() => openOnWeb(`/student/videos/watch/${id}`)} />
          </>
        )}
      </ScrollView>
    </>
  );
}
