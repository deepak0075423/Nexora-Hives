import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { newPassword } from '@/api/auth.api';

export default function NewPasswordScreen() {
  const router = useRouter();
  const { email, otp } = useLocalSearchParams<{ email: string; otp: string }>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await newPassword({ email: email!, otp: otp!, password });
      Alert.alert('Success', 'Password reset successfully. Please log in.', [
        { text: 'OK', onPress: () => router.replace('/(auth)/login' as any) },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>

        <View style={styles.iconBox}>
          <Ionicons name="key-outline" size={32} color={Colors.primary} />
        </View>
        <Text style={styles.title}>New Password</Text>
        <Text style={styles.subtitle}>Set a strong password for your account.</Text>

        {(['New Password', 'Confirm Password'] as const).map((lbl, i) => (
          <View style={styles.field} key={lbl}>
            <Text style={styles.label}>{lbl}</Text>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textLight} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, styles.inputFlex]}
                placeholder="••••••••"
                placeholderTextColor={Colors.textLight}
                value={i === 0 ? password : confirm}
                onChangeText={i === 0 ? setPassword : setConfirm}
                secureTextEntry={!showPass}
              />
              {i === 0 && (
                <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
                  <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textLight} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Reset Password</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  container: { flexGrow: 1, padding: Spacing.lg, paddingTop: 60 },
  back: { marginBottom: Spacing.xl },
  iconBox: {
    width: 64, height: 64, borderRadius: Radius.xl,
    backgroundColor: Colors.surfaceAlt, alignItems: 'center',
    justifyContent: 'center', marginBottom: Spacing.lg,
  },
  title: { ...Typography.h2, color: Colors.text, marginBottom: Spacing.sm },
  subtitle: { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.xl },
  field: { marginBottom: Spacing.md },
  label: { ...Typography.label, color: Colors.text, marginBottom: Spacing.xs },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.sm,
  },
  inputIcon: { marginRight: Spacing.xs },
  input: { flex: 1, paddingVertical: 13, ...Typography.body, color: Colors.text },
  inputFlex: { flex: 1 },
  eyeBtn: { padding: Spacing.xs },
  btn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 14, alignItems: 'center', marginTop: Spacing.md,
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { ...Typography.h4, color: '#fff' },
});
