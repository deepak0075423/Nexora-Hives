import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as notifApi from '@/api/notifications.api';
import { rememberPendingNotification } from '@/utils/notificationLink';

/**
 * aksharum://notification/<receiptId> — where every notification link lands.
 *
 * A link cannot know which screen it belongs on: the same notification opens
 * somewhere different for a teacher, an admin and a parent, and the sender does
 * not know who taps it. So the link carries only the receipt, and the server
 * answers "for you, this goes to …" — marking it read on the way through.
 *
 * The cases this has to survive, all of which really happen:
 *   • app already open, signed in     → resolve and go, immediately
 *   • app cold-started by the link    → wait out the session restore, then go
 *   • signed out                      → park the target, sign in, resume here
 *   • the PIN lock is up              → the gate holds this screen; it resolves after unlock
 *   • notification belongs to another account → say so instead of a blank screen
 */
export default function NotificationDeepLink() {
  const { id }            = useLocalSearchParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router            = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    // The session is still being restored — this screen is the right place to
    // wait, so nothing is lost.
    if (loading || !id) return;

    if (!user) {
      // Sign-in is somewhere else entirely; leave a note for the way back —
      // the root guard replays it the moment a session exists.
      rememberPendingNotification(String(id)).then(() => {
        router.replace('/(auth)/login' as any);
      });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res: any = await notifApi.resolveNotification(String(id));
        const data = res?.data ?? res;
        if (cancelled) return;
        const target = data?.link?.mobile;
        // `replace`, not `push`: this screen is a signpost, and nobody should
        // be able to swipe back onto it.
        router.replace((target || '/(tabs)/notifications') as any);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.status === 404
          ? 'This notification is not on this account. If you use more than one, sign in with the other.'
          : (err?.message || 'Could not open this notification.'));
      }
    })();
    return () => { cancelled = true; };
  }, [id, user, loading, router]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        {error ? (
          <>
            <Ionicons name="alert-circle-outline" size={44} color={Colors.danger} />
            <Text style={s.msg}>{error}</Text>
            <TouchableOpacity style={s.btn} onPress={() => router.replace('/(tabs)' as any)}>
              <Text style={s.btnText}>Go to home</Text>
            </TouchableOpacity>
          </>
        ) : !loading && !user ? (
          <>
            <Ionicons name="lock-closed-outline" size={44} color={Colors.textLight} />
            <Text style={s.msg}>Sign in to open this notification.</Text>
            <TouchableOpacity style={s.btn} onPress={() => router.replace('/(auth)/login' as any)}>
              <Text style={s.btnText}>Sign in</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={s.msg}>Opening notification…</Text>
          </>
        )}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background, padding: Spacing.xl, gap: 14,
  },
  msg: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  btn: {
    backgroundColor: Colors.primary, paddingHorizontal: 22, paddingVertical: 11,
    borderRadius: Radius.md, marginTop: 4,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
