import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useNotifications } from '@/contexts/NotificationContext';
import { useAuth } from '@/contexts/AuthContext';
import { notificationPath, hasTarget } from '@/utils/notificationLink';

const VISIBLE_MS = 5000;

/**
 * The in-app answer to "a notification just arrived while I was doing something
 * else". It appears over whatever screen is up, and tapping it goes where the
 * notification points — the destination the server already resolved for this
 * reader's role, so no lookup is needed to follow it.
 *
 * Deliberately silent on the auth screens: a notification arriving mid-login
 * has nowhere to take anyone yet.
 */
export default function NotificationBanner() {
  const { lastNotification, dismissLast } = useNotifications();
  const { user }   = useAuth();
  const router     = useRouter();
  const segments   = useSegments();
  const insets     = useSafeAreaInsets();
  const slide      = useRef(new Animated.Value(-160)).current;
  const [shown, setShown] = useState<typeof lastNotification>(null);
  const timer      = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onAuthScreen = (segments[0] as string) === '(auth)';

  useEffect(() => {
    if (!lastNotification || !user || onAuthScreen) return;
    setShown(lastNotification);
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(hide, VISIBLE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // A second notification while the first is up replaces it, which is why
    // this keys off the notification itself and not a mount-once effect.
  }, [lastNotification, user, onAuthScreen]);

  const hide = () => {
    Animated.timing(slide, { toValue: -160, duration: 200, useNativeDriver: true })
      .start(() => { setShown(null); dismissLast(); });
  };

  const open = () => {
    const path = notificationPath(shown);
    if (timer.current) clearTimeout(timer.current);
    hide();
    // Without its own destination the notification is its own content, so the
    // inbox — where the full text lives — is the honest place to land.
    router.push((path || '/(tabs)/notifications') as any);
  };

  if (!shown) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[s.wrap, { top: insets.top + 6, transform: [{ translateY: slide }] }]}
    >
      <TouchableOpacity style={s.card} activeOpacity={0.9} onPress={open}>
        <Ionicons name="notifications" size={18} color={Colors.primary} style={{ marginTop: 1 }} />
        <Animated.View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{shown.title}</Text>
          {!!shown.body && <Text style={s.body} numberOfLines={2}>{shown.body}</Text>}
          <Text style={s.hint}>{hasTarget(shown) ? 'Tap to open' : 'Tap to read'}</Text>
        </Animated.View>
        <TouchableOpacity onPress={hide} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={17} color={Colors.textLight} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: Spacing.md, right: Spacing.md, zIndex: 9999, elevation: 20 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 11, paddingHorizontal: 13,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 8 },
    }),
  },
  title: { fontSize: 13, fontWeight: '700', color: Colors.text },
  body:  { fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },
  hint:  { fontSize: 11, color: Colors.primary, fontWeight: '600', marginTop: 4 },
});
