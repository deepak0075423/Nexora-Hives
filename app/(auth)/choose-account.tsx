/**
 * "Which of you is signing in?"
 *
 * One email address can be several people's worth of access: a teacher at two
 * schools, a parent with children at three, a teacher who is also a parent. The
 * password proved who they are; this screen asks which post they are here as,
 * and no session exists until they say.
 *
 * Two questions, each asked only when it has more than one answer — the role
 * ("Continue as"), then the school. A parent with children at two schools
 * therefore sees only the school question.
 *
 * The list and its ten-minute ticket arrive as a route param from the sign-in
 * screen. Leaving this screen (back, or "Use a different account") abandons
 * both, which is the intended way out: nothing has been granted yet.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Image,
} from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { selectAccount, type AccountOption } from '@/api/auth.api';
import { useAuth } from '@/contexts/AuthContext';
import { schoolLogoUrl } from '@/utils/branding';

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Platform Admin',
  school_admin: 'School Admin',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent',
};
const ROLE_ICON: Record<string, any> = {
  super_admin: 'shield-outline',
  school_admin: 'briefcase-outline',
  teacher: 'people-outline',
  student: 'school-outline',
  parent: 'person-outline',
};

export default function ChooseAccountScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const params = useLocalSearchParams<{ payload?: string }>();

  // Route params are strings, so the list travels as JSON.
  const data = useMemo(() => {
    try { return JSON.parse(String(params.payload || '{}')); }
    catch { return {}; }
  }, [params.payload]);

  const accounts: AccountOption[] = data.accounts || [];
  const [role, setRole]   = useState<string | null>(null);
  const [busy, setBusy]   = useState('');
  const [error, setError] = useState('');

  const roles = useMemo(() => [...new Set(accounts.map(a => a.role))], [accounts]);
  // One role: the role question has no content, so the screen opens on schools.
  const activeRole = role ?? (roles.length === 1 ? roles[0] : null);
  const showingSchools = activeRole !== null;

  // Nothing to choose from (opened directly, or the app was reloaded) — the
  // only honest thing is to start again. A <Redirect>, not router.replace():
  // navigating from inside render is a side effect React may run twice.
  if (!data.selectionToken || !accounts.length) {
    return <Redirect href={'/(auth)/login' as any} />;
  }

  const open = async (account: AccountOption) => {
    setError('');
    setBusy(account.id);
    try {
      const res: any = await selectAccount({ selectionToken: data.selectionToken, userId: account.id });
      // signIn stores the tokens and sets the user; the root guard routes from there.
      await signIn(res.token, res.refreshToken, res.user);
    } catch (err: any) {
      if (err?.data?.code === 'SELECTION_EXPIRED') {
        router.replace('/(auth)/login' as any);
        return;
      }
      setError(err?.message || 'Could not open that account.');
      setBusy('');
    }
  };

  const pickRole = (r: string) => {
    const mine = accounts.filter(a => a.role === r);
    if (mine.length === 1) return open(mine[0]);
    setRole(r);
  };

  const rows = showingSchools
    ? accounts.filter(a => a.role === activeRole).map(a => ({
        key: a.id,
        title: a.school?.name || 'School',
        meta: `Continue as ${(ROLE_LABEL[a.role] || a.role).toLowerCase()}`,
        logo: schoolLogoUrl({ logo: a.school?.logo }),
        icon: 'business-outline',
        onPress: () => open(a),
        opens: [a.id],
      }))
    : roles.map(r => ({
        key: r,
        title: ROLE_LABEL[r] || r,
        meta: (() => {
          const n = accounts.filter(a => a.role === r).length;
          return n > 1 ? `${n} schools` : 'One school';
        })(),
        logo: '',
        icon: ROLE_ICON[r] || 'person-outline',
        onPress: () => pickRole(r),
        // A role held at one school opens that post directly, so its row is
        // the one that spins while the post's id is busy.
        opens: accounts.filter(a => a.role === r).map(a => a.id),
      }));

  return (
    <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <View style={s.logoBox}>
          <Image source={require('@/assets/images/logo.png')} style={s.logoImg} resizeMode="contain" />
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.title}>
          {showingSchools ? 'Which school would you like to access?' : 'Continue as'}
        </Text>
        <Text style={s.subtitle}>
          {showingSchools
            ? `Signed in as ${data.email}. You'll see that school's information only — switch schools any time from your profile.`
            : `Hi ${String(data.name || '').split(' ')[0] || 'there'} — this email is used for more than one role.`}
        </Text>

        {!!error && (
          <View style={s.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {rows.map(row => (
          <TouchableOpacity
            key={row.key}
            style={s.row}
            onPress={row.onPress}
            activeOpacity={0.7}
            disabled={!!busy}
          >
            <View style={s.mark}>
              {row.logo
                ? <Image source={{ uri: row.logo }} style={s.markImg} resizeMode="contain" />
                : <Ionicons name={row.icon} size={20} color={Colors.primary} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle} numberOfLines={2}>{row.title}</Text>
              <Text style={s.rowMeta} numberOfLines={1}>{row.meta}</Text>
            </View>
            {row.opens.includes(busy)
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />}
          </TouchableOpacity>
        ))}

        {/* Only when going back has somewhere to go. */}
        {showingSchools && roles.length > 1 && (
          <TouchableOpacity style={s.linkBtn} onPress={() => setRole(null)} disabled={!!busy}>
            <Ionicons name="arrow-back" size={15} color={Colors.accent} />
            <Text style={s.linkText}>Back to roles</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={s.linkBtn}
          onPress={() => router.replace('/(auth)/login' as any)}
          disabled={!!busy}
        >
          <Text style={s.linkText}>Use a different account</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: Spacing.lg, backgroundColor: Colors.background },
  header:    { alignItems: 'center', marginBottom: Spacing.xl },
  logoBox:   { width: 72, height: 72, borderRadius: 16 },
  logoImg:   { width: 72, height: 72, borderRadius: 16 },
  card: {
    width: '100%', backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.lg,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1, shadowRadius: 20, elevation: 4,
  },
  title:    { ...Typography.h3, color: Colors.text, marginBottom: 4 },
  subtitle: { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.md },
  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.dangerLight, borderRadius: Radius.sm,
    padding: Spacing.sm, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.danger + '40',
  },
  errorText: { ...Typography.bodySmall, color: Colors.danger, flex: 1, lineHeight: 18 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 12, marginBottom: Spacing.sm,
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  // A light tint, not Colors.primaryLight — that is a solid dark purple meant
  // to carry white content, and the icon on it is Colors.primary (near-black).
  mark: {
    width: 40, height: 40, borderRadius: 10, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EDE7FB', borderWidth: 1, borderColor: Colors.border,
  },
  markImg:  { width: 40, height: 40, backgroundColor: '#fff' },
  rowTitle: { ...Typography.label, color: Colors.text },
  rowMeta:  { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  linkBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm },
  linkText: { ...Typography.label, color: Colors.accent },
});
