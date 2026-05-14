import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { forgotPassword } from '@/api/auth.api';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [sent, setSent]     = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!email.trim()) {
      setError('Please enter your registered email.');
      return;
    }
    setLoading(true);
    try {
      await forgotPassword({ email: email.trim().toLowerCase() });
      setSent(true);
      router.push({ pathname: '/(auth)/verify-otp' as any, params: { email: email.trim().toLowerCase() } });
    } catch (err: any) {
      setError(err?.message || 'Could not send OTP. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>

        <View style={s.iconBox}>
          <Ionicons name="lock-open-outline" size={32} color={Colors.accent} />
        </View>
        <Text style={s.title}>Forgot Password?</Text>
        <Text style={s.subtitle}>
          Enter your registered email and we'll send you a verification code.
        </Text>

        {!!error && (
          <View style={s.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {sent && (
          <View style={s.successBox}>
            <Ionicons name="checkmark-circle-outline" size={16} color={Colors.success} />
            <Text style={s.successText}>OTP sent! Check your email.</Text>
          </View>
        )}

        <View style={s.field}>
          <Text style={s.label}>Email Address</Text>
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

        <TouchableOpacity
          style={[s.btn, loading && s.btnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>Send OTP</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: Colors.background },
  container: { flexGrow: 1, padding: Spacing.lg, paddingTop: 60 },
  back:      { marginBottom: Spacing.xl },
  iconBox: {
    width: 64, height: 64, borderRadius: Radius.xl,
    backgroundColor: Colors.accentLight, alignItems: 'center',
    justifyContent: 'center', marginBottom: Spacing.lg,
  },
  title:    { ...Typography.h2, color: Colors.text, marginBottom: Spacing.sm },
  subtitle: { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.xl, lineHeight: 22 },

  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.dangerLight, borderRadius: Radius.sm,
    padding: Spacing.sm, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.danger + '40',
  },
  errorText: { ...Typography.bodySmall, color: Colors.danger, flex: 1, lineHeight: 18 },

  successBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.successLight, borderRadius: Radius.sm,
    padding: Spacing.sm, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.success + '40',
  },
  successText: { ...Typography.bodySmall, color: Colors.success, flex: 1 },

  field:     { marginBottom: Spacing.xl },
  label:     { ...Typography.label, color: Colors.text, marginBottom: Spacing.xs },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.sm,
  },
  inputRowError: { borderColor: Colors.danger },
  inputIcon: { marginRight: Spacing.xs },
  input:     { flex: 1, paddingVertical: 13, ...Typography.body, color: Colors.text },
  btn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 14, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.7 },
  btnText:     { ...Typography.h4, color: '#fff' },
});
