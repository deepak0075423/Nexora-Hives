import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { logout } from '@/api/auth.api';
import { getProfile } from '@/api/profile.api';

interface ProfileData {
  user: { name: string; email: string; phone?: string; role: string; profileImage?: string };
  profile: Record<string, any> | null;
}

const ROLE_LABELS: Record<string, string> = {
  student: 'Student', teacher: 'Teacher', parent: 'Parent',
  admin: 'Administrator', school_admin: 'Administrator', 'super-admin': 'Super Admin',
};

const ROLE_COLORS: Record<string, string> = {
  student: '#0284C7', teacher: '#16A34A', parent: '#DB2777',
  admin: '#7C3AED', 'super-admin': '#DC2626',
};

function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function InfoItem({ icon, label, value }: { icon: string; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={ii.row}>
      <View style={ii.iconWrap}>
        <Ionicons name={icon as any} size={15} color={Colors.primary} />
      </View>
      <View style={ii.body}>
        <Text style={ii.label}>{label}</Text>
        <Text style={ii.value}>{value}</Text>
      </View>
    </View>
  );
}

function Block({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={bl.wrap}>
      {title && <Text style={bl.title}>{title}</Text>}
      <View style={bl.card}>{children}</View>
    </View>
  );
}

function MenuItem({
  icon, label, onPress, danger, last,
}: { icon: string; label: string; onPress: () => void; danger?: boolean; last?: boolean }) {
  return (
    <TouchableOpacity
      style={[mi.row, !last && mi.border]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[mi.iconWrap, danger && mi.iconDanger]}>
        <Ionicons name={icon as any} size={17} color={danger ? Colors.danger : Colors.primary} />
      </View>
      <Text style={[mi.label, danger && mi.labelDanger]}>{label}</Text>
      <Ionicons name="chevron-forward" size={15} color={danger ? Colors.danger : Colors.textLight} />
    </TouchableOpacity>
  );
}

function RoleInfoBlock({ role, p }: { role: string; p: Record<string, any> }) {
  if (role === 'teacher') return (
    <>
      <InfoItem icon="briefcase-outline"    label="Designation"   value={p.designation} />
      <InfoItem icon="business-outline"     label="Department"    value={p.department} />
      <InfoItem icon="card-outline"         label="Employee ID"   value={p.employeeId} />
      <InfoItem icon="school-outline"       label="Qualification" value={p.qualification} />
      <InfoItem icon="time-outline"         label="Experience"    value={p.experience} />
      <InfoItem icon="person-outline"       label="Gender"        value={p.gender} />
      <InfoItem icon="calendar-outline"     label="Date of Birth" value={fmtDate(p.dob)} />
    </>
  );
  if (role === 'student') return (
    <>
      <InfoItem icon="document-text-outline" label="Admission No."  value={p.admissionNumber} />
      <InfoItem icon="list-outline"          label="Roll Number"    value={p.rollNumber} />
      <InfoItem icon="water-outline"         label="Blood Group"    value={p.bloodGroup} />
      <InfoItem icon="person-outline"        label="Gender"         value={p.gender} />
      <InfoItem icon="calendar-outline"      label="Date of Birth"  value={fmtDate(p.dob)} />
      <InfoItem icon="location-outline"      label="Address"        value={p.address} />
    </>
  );
  if (role === 'parent') return (
    <>
      <InfoItem icon="heart-outline"   label="Relationship"       value={p.relationship} />
      <InfoItem icon="call-outline"    label="Emergency Contact"  value={p.emergencyContact} />
      <InfoItem icon="person-outline"  label="Father Occupation"  value={p.fatherOccupation} />
      <InfoItem icon="person-outline"  label="Mother Occupation"  value={p.motherOccupation} />
    </>
  );
  return null;
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [data, setData]         = useState<ProfileData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res: any = await getProfile();
      // axios interceptor already unwraps res.data, so res = { success, data: { user, profile } }
      setData(res.data ?? null);
    } catch { /* keep stale */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Re-fetch every time this tab comes into focus (catches edits from edit-profile)
  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const onRefresh = () => { setRefreshing(true); fetchData(true); };

  // Core logout logic — shared by web and native paths
  const performLogout = useCallback(async () => {
    try { await logout(); } catch { /* ignore network errors on sign-out */ }
    await signOut();
    router.replace('/(auth)/login' as any);
  }, [signOut, router]);

  // Alert.alert uses window.confirm on web which can silently fail in some browsers.
  // On web skip the dialog and sign out directly; on native show a confirmation.
  const handleLogout = useCallback(() => {
    if (Platform.OS === 'web') {
      performLogout();
      return;
    }
    Alert.alert(
      'Sign Out', 'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: performLogout },
      ],
    );
  }, [performLogout]);

  const role     = user?.role ?? '';
  const initials = (data?.user?.name ?? user?.name ?? 'U')
    .split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
  const roleColor = ROLE_COLORS[role] ?? Colors.primary;
  const phone    = data?.user?.phone;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {/* ── Hero Block ─────────────────────────────────────────── */}
        <View style={s.hero}>
          <View style={[s.avatarRing, { borderColor: roleColor + '60' }]}>
            <View style={s.avatar}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.avatarText}>{initials}</Text>
              }
            </View>
          </View>
          <Text style={s.heroName}>{data?.user?.name ?? user?.name ?? '—'}</Text>
          <View style={[s.rolePill, { backgroundColor: roleColor + '20', borderColor: roleColor + '40' }]}>
            <Text style={[s.rolePillText, { color: roleColor }]}>
              {ROLE_LABELS[role] ?? role}
            </Text>
          </View>
          {user?.school?.name && (
            <View style={s.schoolRow}>
              <Ionicons name="business-outline" size={13} color="rgba(255,255,255,0.7)" />
              <Text style={s.schoolName}>{user.school.name}</Text>
            </View>
          )}
        </View>

        <View style={s.body}>

          {/* ── Contact Block ──────────────────────────────────────── */}
          <Block title="Contact">
            <InfoItem icon="call-outline"  label="Phone" value={phone || (loading ? 'Loading…' : 'Not set')} />
            <InfoItem icon="mail-outline"  label="Email" value={data?.user?.email ?? user?.email} />
          </Block>

          {/* ── Role Details Block ─────────────────────────────────── */}
          {data?.profile && (
            <Block title={role === 'teacher' ? 'Professional' : role === 'student' ? 'Academic' : role === 'parent' ? 'Family' : undefined}>
              <RoleInfoBlock role={role} p={data.profile} />
            </Block>
          )}

          {/* ── Account Block ──────────────────────────────────────── */}
          <Block title="Account">
            <MenuItem icon="create-outline"       label="Edit Profile"    onPress={() => router.push('/modules/edit-profile' as any)} />
            <MenuItem icon="lock-closed-outline"  label="Change Password" onPress={() => router.push('/modules/change-password' as any)} />
            <MenuItem icon="notifications-outline" label="Notifications"  onPress={() => router.push('/modules/alerts' as any)} last />
          </Block>

          {/* ── App Block ──────────────────────────────────────────── */}
          <Block title="App">
            <MenuItem
              icon="help-circle-outline"
              label="Help & Support"
              onPress={() => Alert.alert('Help & Support', 'For assistance, contact us at:\nsupport@nexorahives.com')}
            />
            <MenuItem
              icon="information-circle-outline"
              label="About"
              onPress={() => Alert.alert('Nexora Hives', 'Version 1.0.0\n\nA complete school management solution.\n\n© 2025 Nexora Hives')}
              last
            />
          </Block>

          {/* ── Sign Out ───────────────────────────────────────────── */}
          <TouchableOpacity style={s.signOutBtn} onPress={handleLogout} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
            <Text style={s.signOutText}>Sign Out</Text>
          </TouchableOpacity>

          <Text style={s.version}>Nexora Hives v1.0.0</Text>
          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const ii = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  iconWrap: { width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  body:     { flex: 1 },
  label:    { ...Typography.caption, color: Colors.textSecondary, marginBottom: 2 },
  value:    { ...Typography.label, color: Colors.text },
});

const bl = StyleSheet.create({
  wrap:  { marginBottom: Spacing.md },
  title: { ...Typography.bodySmall, color: Colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, paddingHorizontal: 2 },
  card:  { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, overflow: 'hidden' },
});

const mi = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  border:    { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  iconWrap:  { width: 32, height: 32, borderRadius: 9, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  iconDanger:{ backgroundColor: Colors.dangerLight },
  label:     { flex: 1, ...Typography.label, color: Colors.text },
  labelDanger: { color: Colors.danger },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  hero: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl + Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  avatarRing: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 3, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText:   { fontSize: 32, fontWeight: '800', color: '#fff' },
  heroName:     { ...Typography.h3, color: '#fff', marginBottom: Spacing.sm, textAlign: 'center' },
  rolePill:     { paddingHorizontal: 14, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, marginBottom: 8 },
  rolePillText: { ...Typography.label, fontWeight: '600' },
  schoolRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  schoolName:   { ...Typography.bodySmall, color: 'rgba(255,255,255,0.7)' },

  body:         { padding: Spacing.md, marginTop: -Spacing.lg, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, backgroundColor: Colors.background },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.dangerLight, borderRadius: Radius.md,
    paddingVertical: 14, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.danger + '30',
  },
  signOutText: { ...Typography.label, color: Colors.danger, fontWeight: '700' },
  version:     { textAlign: 'center', ...Typography.caption, color: Colors.textLight },
});
