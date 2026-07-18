import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { schoolLogoUrl } from '@/utils/branding';

/**
 * Brand header shown at the top of the tab screens:
 * logo + app name + school on the left, notification bell on the right.
 */
export default function AppHeader({ unreadCount, title }: { unreadCount?: number; title?: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { unreadCount: liveUnread } = useNotifications();
  const insets = useSafeAreaInsets();

  // Live socket count wins over the prop (prop kept for backwards compat)
  const badgeCount = liveUnread || unreadCount || 0;
  const logoUri = schoolLogoUrl(user?.school as any);

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}>
      <View style={s.brandRow}>
        <Image
          source={logoUri ? { uri: logoUri } : require('@/assets/images/logo.png')}
          style={[s.logo, logoUri ? s.schoolLogo : null]}
          resizeMode="contain"
        />
        <View style={{ flex: 1 }}>
          <Text style={s.appName}>{title ?? user?.school?.name ?? 'Aksharum'}</Text>
          {user?.school?.name ? (
            <Text style={s.school} numberOfLines={1}>{title ? user.school.name : 'Aksharum'}</Text>
          ) : (
            <Text style={s.school}>Aksharum</Text>
          )}
        </View>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/modules/alerts' as any)}>
          <Ionicons name="notifications-outline" size={20} color={Colors.text} />
          {badgeCount > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{badgeCount > 9 ? '9+' : badgeCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.md,
    paddingBottom: 6,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: {
    width: 34, height: 34, borderRadius: 8,
  },
  schoolLogo: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.border, padding: 2,
  },
  appName: { fontSize: 16, fontWeight: '800', color: Colors.primary, letterSpacing: 0.2 },
  school: { fontSize: 10, color: Colors.textSecondary, marginTop: 1 },
  iconBtn: {
    width: 38, height: 38, borderRadius: Radius.md,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  badge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3, borderWidth: 1.5, borderColor: Colors.background,
  },
  badgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },
});
