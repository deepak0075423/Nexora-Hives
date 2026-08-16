import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Alert,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import * as videoApi from '@/api/video.api';

// The mobile app has no native video component bundled, so playback opens in an
// in-app browser tab (Safari/Chrome Custom Tab) — which handles YouTube, Vimeo
// and signed S3 URLs natively. An embedded player is a future upgrade that needs
// react-native-webview (a native dependency + rebuild).
export default function VideoPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<any>(undefined);
  const [busy, setBusy] = useState(false);
  const [it, setIt] = useState({ liked: false, favorited: false, watchLater: false });

  const load = useCallback(async () => {
    try {
      const res: any = await videoApi.studentPlayer(String(id));
      const d = (res as any)?.data ?? res;
      setState(d);
      setIt({
        liked: !!d.interactions?.liked,
        favorited: !!d.interactions?.favorited,
        watchLater: !!d.interactions?.watchLater,
      });
    } catch (err: any) {
      setState(null);
      Alert.alert('Unavailable', err?.message || 'This video is not available to you right now.');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const play = async () => {
    if (!state?.playback?.url) return;
    try {
      // record the view/started progress, then open the stream
      videoApi.reportProgress({ videoId: id, assignmentId: state?.assignment?._id || null, positionSec: 0, device: 'mobile' }).catch(() => {});
      await WebBrowser.openBrowserAsync(state.playback.url);
    } catch {
      Alert.alert('Could not open', 'The video link could not be opened.');
    }
  };

  const markComplete = async () => {
    setBusy(true);
    try {
      await videoApi.reportProgress({
        videoId: id, assignmentId: state?.assignment?._id || null,
        progressPercent: 100, completed: true, device: 'mobile',
      });
      Alert.alert('Marked complete', 'This video is now marked as completed.');
      load();
    } catch (err: any) { Alert.alert('Error', err?.message || 'Could not update progress'); }
    finally { setBusy(false); }
  };

  const toggle = async (type: 'like' | 'favorite' | 'watch_later') => {
    try {
      const res: any = await videoApi.interact({ videoId: id, type });
      const active = (res as any)?.data?.active;
      setIt((prev) => ({
        ...prev,
        liked: type === 'like' ? !!active : prev.liked,
        favorited: type === 'favorite' ? !!active : prev.favorited,
        watchLater: type === 'watch_later' ? !!active : prev.watchLater,
      }));
    } catch { /* ignore */ }
  };

  const reportVideo = () => {
    Alert.prompt?.('Report video', 'What is the issue?', (reason?: string) => {
      if (reason) videoApi.interact({ videoId: id, type: 'report', reason }).then(() => Alert.alert('Reported', 'Thank you — your school has been notified.')).catch(() => {});
    });
  };

  if (state === undefined) return (
    <><Stack.Screen options={{ title: 'Video' }} /><View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View></>
  );
  if (state === null) return (
    <><Stack.Screen options={{ title: 'Video' }} />
      <View style={s.center}><Ionicons name="lock-closed" size={44} color={Colors.textSecondary} /><Text style={s.muted}>Video unavailable</Text></View></>
  );

  const { video, policy, assignment } = state;
  const chips: string[] = video?.taxonomy ? Object.values(video.taxonomy).flat() as string[] : [];

  return (
    <>
      <Stack.Screen options={{ title: 'Video' }} />
      <ScrollView style={s.screen} contentContainerStyle={{ padding: Spacing.md }}>
        <TouchableOpacity style={s.hero} activeOpacity={0.9} onPress={play}>
          {video.thumbnailUrl
            ? <Image source={{ uri: video.thumbnailUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
            : null}
          <View style={s.heroOverlay}>
            <View style={s.playBtn}><Ionicons name="play" size={30} color="#fff" /></View>
            <Text style={s.playHint}>Tap to play</Text>
          </View>
          {policy?.watermark ? <Text style={s.watermark}>{policy.watermarkText}</Text> : null}
        </TouchableOpacity>

        <Text style={s.title}>{video.title}</Text>
        <View style={s.badges}>
          {assignment ? <Badge text={assignment.mandatory ? 'Mandatory' : 'Assigned'} tone={assignment.mandatory ? 'danger' : 'info'} /> : null}
          {assignment?.minWatchPercent ? <Badge text={`Watch ≥ ${assignment.minWatchPercent}%`} tone="warn" /> : null}
          {video.category ? <Badge text={String(video.category).replace(/_/g, ' ')} tone="muted" /> : null}
        </View>

        <View style={s.actions}>
          <ActionBtn icon={it.liked ? 'thumbs-up' : 'thumbs-up-outline'} label="Like" active={it.liked} onPress={() => toggle('like')} />
          <ActionBtn icon={it.favorited ? 'heart' : 'heart-outline'} label="Favorite" active={it.favorited} onPress={() => toggle('favorite')} />
          <ActionBtn icon={it.watchLater ? 'time' : 'time-outline'} label="Later" active={it.watchLater} onPress={() => toggle('watch_later')} />
          <ActionBtn icon="flag-outline" label="Report" onPress={reportVideo} />
        </View>

        {assignment ? (
          <TouchableOpacity style={[s.completeBtn, busy && { opacity: 0.6 }]} onPress={markComplete} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark-done" size={18} color="#fff" /><Text style={s.completeTxt}>Mark as completed</Text></>}
          </TouchableOpacity>
        ) : null}

        {video.shortDescription ? <Text style={s.desc}>{video.shortDescription}</Text> : null}
        {video.learningOutcome ? (
          <View style={s.outcome}><Text style={s.outcomeLabel}>🎯 Learning outcome</Text><Text style={s.outcomeTxt}>{video.learningOutcome}</Text></View>
        ) : null}

        {chips.length > 0 && (
          <View style={s.chips}>{chips.map((c, i) => <View key={i} style={s.chip}><Text style={s.chipTxt}>{c}</Text></View>)}</View>
        )}

        {video.transcript ? (
          <View style={s.transcript}><Text style={s.transcriptLabel}>Transcript</Text><Text style={s.transcriptTxt}>{video.transcript}</Text></View>
        ) : null}

        {policy?.antiScreenRecordingHint ? (
          <Text style={s.notice}>🔒 This content is watermarked and licensed for your personal learning only.</Text>
        ) : null}
      </ScrollView>
    </>
  );
}

function Badge({ text, tone }: { text: string; tone: 'danger' | 'info' | 'warn' | 'muted' }) {
  const map: any = {
    danger: { bg: '#FEE2E2', fg: '#DC2626' }, info: { bg: '#DBEAFE', fg: '#2563EB' },
    warn: { bg: '#FEF3C7', fg: '#B45309' }, muted: { bg: '#F1F5F9', fg: '#64748B' },
  };
  const c = map[tone];
  return <View style={[s.badge, { backgroundColor: c.bg }]}><Text style={[s.badgeTxt, { color: c.fg }]}>{text}</Text></View>;
}

function ActionBtn({ icon, label, active, onPress }: { icon: string; label: string; active?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.actionBtn} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon as any} size={22} color={active ? Colors.primary : Colors.textSecondary} />
      <Text style={[s.actionTxt, active && { color: Colors.primary, fontWeight: '600' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.background },
  muted: { color: Colors.textSecondary, ...Typography.body },
  hero: { aspectRatio: 16 / 9, borderRadius: Radius.lg, backgroundColor: Colors.primary, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  heroOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(30,10,78,0.35)', gap: 8 },
  playBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  playHint: { color: '#fff', fontWeight: '600', fontSize: 13 },
  watermark: { position: 'absolute', top: 8, right: 10, color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600' },
  title: { ...Typography.h2, color: Colors.text, marginBottom: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.md },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  badgeTxt: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  actions: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: Colors.surface, borderRadius: Radius.md, paddingVertical: Spacing.sm, marginBottom: Spacing.md },
  actionBtn: { alignItems: 'center', gap: 3 },
  actionTxt: { fontSize: 11, color: Colors.textSecondary },
  completeBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#16A34A', borderRadius: Radius.md, paddingVertical: 13, marginBottom: Spacing.md },
  completeTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  desc: { ...Typography.body, color: Colors.text, marginBottom: Spacing.sm },
  outcome: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md },
  outcomeLabel: { ...Typography.label, color: Colors.text, marginBottom: 4 },
  outcomeTxt: { ...Typography.body, color: Colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.md },
  chip: { backgroundColor: Colors.surface, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  chipTxt: { fontSize: 11, color: Colors.textSecondary },
  transcript: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md },
  transcriptLabel: { ...Typography.label, color: Colors.text, marginBottom: 6 },
  transcriptTxt: { ...Typography.bodySmall, color: Colors.textSecondary, lineHeight: 20 },
  notice: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
});
