import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as videoApi from '@/api/video.api';
import ModuleDisabled from '@/components/ModuleDisabled';

const fmtDur = (s?: number) => {
  if (!s) return '';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};
const srcIcon = (src: string) => (src === 'youtube' ? 'logo-youtube' : src === 'vimeo' ? 'logo-vimeo' : 'film');

function VideoCard({ v, progress, onPress }: { v: any; progress?: number; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.card} activeOpacity={0.8} onPress={onPress}>
      <View style={s.thumb}>
        {v.thumbnailUrl
          ? <Image source={{ uri: v.thumbnailUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          : <Ionicons name="play-circle" size={38} color="#fff" />}
        {v.durationSec ? <Text style={s.dur}>{fmtDur(v.durationSec)}</Text> : null}
        {progress != null && progress > 0 ? (
          <View style={s.progressTrack}><View style={[s.progressBar, { width: `${Math.min(100, progress)}%` }]} /></View>
        ) : null}
      </View>
      <View style={s.cardBody}>
        <Text style={s.cardTitle} numberOfLines={2}>{v.title}</Text>
        <View style={s.cardMeta}>
          <Ionicons name={srcIcon(v.source) as any} size={12} color={Colors.textSecondary} />
          {v.category ? <Text style={s.cardCat}>{String(v.category).replace(/_/g, ' ')}</Text> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: Spacing.lg }}>
      <View style={s.secHead}>
        <Ionicons name={icon as any} size={16} color={Colors.primary} />
        <Text style={s.secTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export default function VideosScreen() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const load = useCallback(async () => {
    try {
      const res: any = await videoApi.studentDashboard();
      setData((res as any)?.data ?? res);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };
  const open = (id: string) => router.push(`/modules/video-player?id=${id}` as any);

  if (disabled) return (<><Stack.Screen options={{ title: 'Video Learning' }} /><ModuleDisabled /></>);
  if (loading) return (
    <><Stack.Screen options={{ title: 'Video Learning' }} />
      <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View></>
  );

  const cont = (data?.continueWatching ?? []).map((p: any) => ({ ...p.video, _pct: p.progressPercent }));
  const assigned = data?.assignedVideos ?? [];
  const recent = data?.recentlyAdded ?? [];
  const stats = data?.stats ?? {};
  const nothing = !cont.length && !assigned.length && !recent.length;

  return (
    <>
      <Stack.Screen options={{ title: 'Video Learning' }} />
      <ScrollView style={s.screen} contentContainerStyle={{ padding: Spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>

        <View style={s.statRow}>
          <StatChip icon="bookmark" label="Assigned" value={stats.assigned ?? 0} bg="#EEF2FF" ic="#4338CA" />
          <StatChip icon="checkmark-done" label="Completed" value={stats.completed ?? 0} bg="#DCFCE7" ic="#16A34A" />
          <StatChip icon="heart" label="Favorites" value={stats.favorites ?? 0} bg="#FCE7F3" ic="#DB2777" />
        </View>

        {nothing ? (
          <View style={s.empty}>
            <Ionicons name="film-outline" size={48} color={Colors.textSecondary} />
            <Text style={s.emptyTitle}>Nothing here yet</Text>
            <Text style={s.emptyMsg}>Your teachers haven&apos;t assigned videos yet, and the school library is being set up.</Text>
          </View>
        ) : (
          <>
            {cont.length > 0 && (
              <Section title="Continue watching" icon="play">
                {cont.map((v: any) => <VideoCard key={v._id} v={v} progress={v._pct} onPress={() => open(v._id)} />)}
              </Section>
            )}
            {assigned.length > 0 && (
              <Section title="Assigned to you" icon="bookmark">
                {assigned.map((v: any) => <VideoCard key={v._id} v={v} onPress={() => open(v._id)} />)}
              </Section>
            )}
            {recent.length > 0 && (
              <Section title="Recently added" icon="sparkles">
                {recent.map((v: any) => <VideoCard key={v._id} v={v} onPress={() => open(v._id)} />)}
              </Section>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

function StatChip({ icon, label, value, bg, ic }: { icon: string; label: string; value: number; bg: string; ic: string }) {
  return (
    <View style={s.statChip}>
      <View style={[s.statIcon, { backgroundColor: bg }]}><Ionicons name={icon as any} size={15} color={ic} /></View>
      <Text style={s.statVal}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  statRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  statChip: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center' },
  statIcon: { width: 30, height: 30, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statVal: { fontSize: 20, fontWeight: '700', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textSecondary },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
  secTitle: { ...Typography.h4, color: Colors.text },
  card: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.md, marginBottom: Spacing.sm, overflow: 'hidden' },
  thumb: { width: 128, height: 76, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  dur: { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 10, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' },
  progressTrack: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  progressBar: { height: 3, backgroundColor: '#EF4444' },
  cardBody: { flex: 1, padding: Spacing.sm, justifyContent: 'center' },
  cardTitle: { ...Typography.label, color: Colors.text, fontWeight: '600' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  cardCat: { fontSize: 11, color: Colors.textSecondary, textTransform: 'capitalize' },
  empty: { alignItems: 'center', padding: Spacing.xl, gap: 8 },
  emptyTitle: { ...Typography.h3, color: Colors.text },
  emptyMsg: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
});
