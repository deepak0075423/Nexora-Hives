import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { login } from '@/api/auth.api';
import { useAuth } from '@/contexts/AuthContext';
import { isEmail } from '@/utils/validators';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, accounts, switchAccount, removeAccount } = useAuth();

  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [switching, setSwitching]     = useState('');
  const [error, setError]             = useState('');

  const handleQuickLogin = async (accountId: string) => {
    setError('');
    setSwitching(accountId);
    const ok = await switchAccount(accountId);
    setSwitching('');
    if (!ok) setError('That session has expired — please sign in with your password.');
  };

  const handleLogin = async () => {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    if (!isEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const data: any = await login({ email: email.trim().toLowerCase(), password });
      await signIn(data.token, data.refreshToken, data.user);
    } catch (err: any) {
      const isNetwork = err?.status === 0 || !err?.status;
      setError(
        isNetwork
          ? `Cannot reach server — check your connection.\n(${err?.message ?? 'No response'})`
          : err?.message || 'Invalid email or password.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={s.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <View style={s.logoBox}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={s.logoImg}
              resizeMode="contain"
            />
          </View>
          <Text style={s.appName}>Aksharum</Text>
        </View>

        {/* Saved accounts — quick switch */}
        {accounts.length > 0 && (
          <View style={s.card}>
            <Text style={s.title}>Saved accounts</Text>
            <Text style={s.subtitle}>Tap to continue</Text>
            {accounts.map(acc => (
              <TouchableOpacity key={acc._id} style={s.accountRow}
                onPress={() => handleQuickLogin(acc._id)} activeOpacity={0.7}
                disabled={!!switching}>
                <View style={s.accountAvatar}>
                  <Text style={s.accountAvatarText}>{acc.name?.[0]?.toUpperCase() ?? '?'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.accountName} numberOfLines={1}>{acc.name}</Text>
                  <Text style={s.accountMeta} numberOfLines={1}>
                    {acc.email} · {acc.role.replace('-', ' ')}
                  </Text>
                </View>
                {switching === acc._id
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : (
                    <TouchableOpacity onPress={() => removeAccount(acc._id)} hitSlop={10}>
                      <Ionicons name="close-circle-outline" size={18} color={Colors.textLight} />
                    </TouchableOpacity>
                  )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Card */}
        <View style={s.card}>
          <Text style={s.title}>{accounts.length > 0 ? 'Another account' : 'Welcome back'}</Text>
          <Text style={s.subtitle}>Sign in to your account</Text>

          {/* Inline error banner */}
          {!!error && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <View style={s.field}>
            <Text style={s.label}>Email</Text>
            <View style={[s.inputRow, !!error && s.inputRowError]}>
              <Ionicons name="mail-outline" size={18} color={Colors.textLight} style={s.inputIcon} />
              <TextInput
                style={s.input}
                placeholder="you@school.com"
                placeholderTextColor={Colors.textLight}
                value={email}
                onChangeText={v => { setEmail(v); setError(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={s.field}>
            <Text style={s.label}>Password</Text>
            <View style={[s.inputRow, !!error && s.inputRowError]}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textLight} style={s.inputIcon} />
              <TextInput
                style={[s.input, s.inputFlex]}
                placeholder="••••••••"
                placeholderTextColor={Colors.textLight}
                value={password}
                onChangeText={v => { setPassword(v); setError(''); }}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={s.eyeBtn}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={Colors.textLight}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={s.forgotBtn}
            onPress={() => router.push('/(auth)/forgot-password' as any)}
          >
            <Text style={s.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.loginBtn, loading && s.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.loginBtnText}>Sign In</Text>
            }
          </TouchableOpacity>
        </View>

        <Text style={s.footer}>© 2026 Aksharum</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex:       { flex: 1, backgroundColor: Colors.background },
  container:  { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  header:     { alignItems: 'center', marginBottom: Spacing.xl },
  logoBox: {
    width: 72, height: 72, borderRadius: 16,
    marginBottom: Spacing.md,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 8,
  },
  logoImg: { width: 72, height: 72, borderRadius: 16 },
  appName:  { ...Typography.h2, color: Colors.primary, marginBottom: 4 },
  card: {
    width: '100%', backgroundColor: Colors.surface, borderRadius: Radius.xl,
    padding: Spacing.lg, marginBottom: Spacing.lg,
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

  field:    { marginBottom: Spacing.md },
  label:    { ...Typography.label, color: Colors.text, marginBottom: Spacing.xs },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: Spacing.sm,
  },
  inputRowError: { borderColor: Colors.danger },
  inputIcon: { marginRight: Spacing.xs },
  input:     { flex: 1, paddingVertical: 13, ...Typography.body, color: Colors.text },
  inputFlex: { flex: 1 },
  eyeBtn:    { padding: Spacing.xs },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: Spacing.lg },
  forgotText:{ ...Typography.label, color: Colors.accent },
  loginBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 14, alignItems: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 4,
  },
  loginBtnDisabled: { opacity: 0.7 },
  loginBtnText:     { ...Typography.h4, color: '#fff' },
  footer:    { ...Typography.caption, color: Colors.textLight },

  accountRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  accountAvatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  accountAvatarText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  accountName: { ...Typography.label, color: Colors.text },
  accountMeta: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
});
