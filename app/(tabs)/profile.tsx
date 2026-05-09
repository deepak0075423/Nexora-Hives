import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { logout } from '@/api/auth.api';

interface MenuItem { icon: string; label: string; onPress: () => void; danger?: boolean; }

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          try { await logout(); } catch { /* ignore */ }
          await signOut();
        },
      },
    ]);
  };

  const menuItems: MenuItem[] = [
    { icon: 'person-outline',       label: 'Edit Profile',       onPress: () => router.push('/modules/edit-profile' as any) },
    { icon: 'lock-closed-outline',  label: 'Change Password',    onPress: () => router.push('/modules/change-password' as any) },
    { icon: 'notifications-outline',label: 'Notifications',      onPress: () => router.push('/modules/alerts' as any) },
    { icon: 'help-circle-outline',  label: 'Help & Support',     onPress: () => Alert.alert('Help & Support', 'For assistance, contact us at:\nsupport@nexorahives.com') },
    { icon: 'information-circle-outline', label: 'About',        onPress: () => Alert.alert('Nexora Hives', 'Version 1.0.0\n\nA complete school management solution.\n\n© 2025 Nexora Hives') },
    { icon: 'log-out-outline',      label: 'Sign Out',           onPress: handleLogout, danger: true },
  ];

  const roleLabel: Record<string, string> = {
    student: 'Student', teacher: 'Teacher', parent: 'Parent',
    admin: 'Administrator', 'super-admin': 'Super Admin',
  };

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? 'U';

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.hero}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <Text style={s.name}>{user?.name ?? '—'}</Text>
          <Text style={s.email}>{user?.email ?? ''}</Text>
          <View style={s.rolePill}>
            <Text style={s.roleText}>{roleLabel[user?.role ?? ''] ?? user?.role}</Text>
          </View>
          {user?.school?.name && (
            <Text style={s.school}>{user.school.name}</Text>
          )}
        </View>

        {/* Menu */}
        <View style={s.menuCard}>
          {menuItems.map((item, i) => (
            <TouchableOpacity
              key={item.label}
              style={[s.menuItem, i < menuItems.length - 1 && s.menuItemBorder]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={[s.menuIcon, item.danger && s.menuIconDanger]}>
                <Ionicons
                  name={item.icon as any} size={18}
                  color={item.danger ? Colors.danger : Colors.primary}
                />
              </View>
              <Text style={[s.menuLabel, item.danger && s.menuLabelDanger]}>{item.label}</Text>
              {!item.danger && (
                <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.version}>Nexora Hives v1.0.0</Text>
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  hero: {
    alignItems: 'center', paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  avatar: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  avatarText: { fontSize: 30, fontWeight: '700', color: '#fff' },
  name: { ...Typography.h3, color: Colors.text, marginBottom: 4 },
  email: { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.sm },
  rolePill: {
    backgroundColor: Colors.surfaceAlt, paddingHorizontal: 14, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, marginBottom: 6,
  },
  roleText: { ...Typography.label, color: Colors.primary },
  school: { ...Typography.bodySmall, color: Colors.textSecondary },
  menuCard: {
    backgroundColor: Colors.surface, marginHorizontal: Spacing.md,
    borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: Spacing.md,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  menuIcon: {
    width: 36, height: 36, borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  menuIconDanger: { backgroundColor: Colors.dangerLight },
  menuLabel: { flex: 1, ...Typography.label, color: Colors.text },
  menuLabelDanger: { color: Colors.danger },
  version: {
    textAlign: 'center', marginTop: Spacing.lg,
    fontSize: 11, color: Colors.textLight,
  },
});
