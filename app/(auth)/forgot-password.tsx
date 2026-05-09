import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { forgotPassword } from '@/api/auth.api';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your registered email.');
      return;
    }
    setLoading(true);
    try {
      await forgotPassword({ email: email.trim().toLowerCase() });
      router.push({ pathname: '/(auth)/verify-otp' as any, params: { email: email.trim().toLowerCase() } });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not send OTP');
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
          <Ionicons name="lock-open-outline" size={32} color={Colors.accent} />
        </View>
        <Text style={styles.title}>Forgot Password?</Text>
        <Text style={styles.subtitle}>
          Enter your registered email and we'll send you a verification code.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email Address</Text>
          <View style={styles.inputRow}>
            <Ionicons name="mail-outline" size={18} color={Colors.textLight} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="you@school.com"
              placeholderTextColor={Colors.textLight}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Send OTP</Text>
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
    backgroundColor: Colors.accentLight, alignItems: 'center',
    justifyContent: 'center', marginBottom: Spacing.lg,
  },
  title: { ...Typography.h2, color: Colors.text, marginBottom: Spacing.sm },
  subtitle: { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.xl, lineHeight: 22 },
  field: { marginBottom: Spacing.xl },
  label: { ...Typography.label, color: Colors.text, marginBottom: Spacing.xs },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.sm,
  },
  inputIcon: { marginRight: Spacing.xs },
  input: { flex: 1, paddingVertical: 13, ...Typography.body, color: Colors.text },
  btn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 14, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { ...Typography.h4, color: '#fff' },
});
