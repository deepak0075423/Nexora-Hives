/**
 * Video Learning on the phone — what its screens share.
 *
 * Watching happens on the web player (pages/videos/player on the web app).
 * The phone app has no video component of its own yet: one that keeps the
 * seek and speed rules needs a native module (expo-video) and a new native
 * build. Until then "Watch" opens the video on the web app in the browser,
 * where the student signs in once.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Colors, Spacing, Radius } from '@/constants/theme';

/** The web app's address: EXPO_PUBLIC_WEB_URL, else the production app. */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || 'https://app.aksharum.com').replace(/\/+$/, '');

export const openOnWeb = (path: string) => WebBrowser.openBrowserAsync(`${WEB_URL}${path}`);

export const clock = (sec?: number) => {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};
export const spent = (sec?: number) => {
  const m = Math.round((Number(sec) || 0) / 60);
  if (!sec) return '0 min';
  return m < 1 ? 'under a minute' : m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};
export const plural = (n: number, one: string, many?: string) => `${n} ${n === 1 ? one : (many || `${one}s`)}`;

const WORDS: Record<string, string> = {
  not_started: 'Not started', in_progress: 'In progress', completed: 'Completed', locked: 'Locked', available: 'Available',
  active: 'Open', scheduled: 'Scheduled', expired: 'Expired', unpublished: 'Unpublished', revoked: 'Revoked',
  pending: 'Pending', under_review: 'Under review', approved: 'Approved', rejected: 'Rejected',
};
export const word = (s?: string) => WORDS[String(s)] || String(s || '').replace(/_/g, ' ');
export const tone = (s?: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary' => (
  ({ completed: 'success', active: 'success', approved: 'success', in_progress: 'warning', pending: 'warning', unpublished: 'warning',
    scheduled: 'info', under_review: 'info', available: 'primary', revoked: 'danger', rejected: 'danger' } as any)[String(s)] || 'neutral');

/** A progress bar with its figure. */
export function Meter({ percent = 0 }: { percent?: number }) {
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  return (
    <View style={m.row}>
      <View style={m.track}><View style={[m.fill, { width: `${p}%` }, p >= 100 && { backgroundColor: Colors.success }]} /></View>
      <Text style={m.pct}>{p}%</Text>
    </View>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return <View style={m.note}><Text style={m.noteText}>{children}</Text></View>;
}

const m = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  track: { flex: 1, height: 6, borderRadius: 999, backgroundColor: Colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999, backgroundColor: Colors.primary },
  pct: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, minWidth: 34, textAlign: 'right' },
  note: { backgroundColor: Colors.infoLight, borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.md },
  noteText: { color: Colors.info, fontSize: 13, lineHeight: 18 },
});
