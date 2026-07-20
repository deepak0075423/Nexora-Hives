import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { newPassword } from '@/api/auth.api';
import { passwordError } from '@/utils/validators';

export default function NewPasswordScreen() {
  const router = useRouter();
  const { resetToken } = useLocalSearchParams<{ email: string; resetToken: string }>();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [done, setDone]         = useState(false);

  const handleSubmit = async () => {
    setError('');
    const pwErr = passwordError(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await newPassword({ resetToken: resetToken!, password });
      setDone(true);
      // Navigate to login after a brief moment so user sees the success state
      setTimeout(() => router.replace('/(auth)/login' as any), 1200);
    } catch (err: any) {
      setError(err?.message || 'Could not reset password. Try again.');
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
          <Ionicons name="key-outline" size={32} color={Colors.primary} />
        </View>
        <Text style={s.title}>New Password</Text>
        <Text style={s.subtitle}>Set a strong password for your account.</Text>

        {!!error && (
          <View style={s.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {done && (
          <View style={s.successBox}>
            <Ionicons name="checkmark-circle-outline" size={16} color={Colors.success} />
            <Text style={s.successText}>Password reset! Redirecting to login…</Text>
          </View>
        )}

        <View style={s.field}>
          <Text style={s.label}>New Password</Text>
          <View style={[s.inputRow, !!error && s.inputRowError]}>
            <Ionicons name="lock-closed-outline" size={18} color={Colors.textLight} style={s.inputIcon} />
            <TextInput
              style={[s.input, s.inputFlex]}
              placeholder="••••••••"
              placeholderTextColor={Colors.textLight}
              value={password}
              onChangeText={v => { setPassword(v); setError(''); }}
              secureTextEntry={!showPass}
            />
            <TouchableOpacity onPress={() => setShowPass(v => !v)} style={s.eyeBtn}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textLight} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.field}>
          <Text style={s.label}>Confirm Password</Text>
          <View style={[s.inputRow, !!error && s.inputRowError]}>
            <Ionicons name="lock-closed-outline" size={18} color={Colors.textLight} style={s.inputIcon} />
            <TextInput
              style={[s.input, s.inputFlex]}
              placeholder="••••••••"
              placeholderTextColor={Colors.textLight}
              value={confirm}
              onChangeText={v => { setConfirm(v); setError(''); }}
              secureTextEntry={!showPass}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[s.btn, (loading || done) && s.btnDisabled]}
          onPress={handleSubmit}
          disabled={loading || done}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : done ? (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={s.btnText}>  Done</Text>
            </>
          ) : (
            <Text style={s.btnText}>Reset Password</Text>
          )}
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
    backgroundColor: Colors.surfaceAlt, alignItems: 'center',
    justifyContent: 'center', marginBottom: Spacing.lg,
  },
  title:    { ...Typography.h2, color: Colors.text, marginBottom: Spacing.sm },
  subtitle: { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.xl },

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

  field:     { marginBottom: Spacing.md },
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
  inputFlex: { flex: 1 },
  eyeBtn:    { padding: Spacing.xs },
  btn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 14, marginTop: Spacing.md,
  },
  btnDisabled: { opacity: 0.7 },
  btnText:     { ...Typography.h4, color: '#fff' },
});
