import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { verifyOtp } from '@/api/auth.api';

export default function VerifyOtpScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [otp, setOtp]       = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const inputs = useRef<(TextInput | null)[]>([]);

  const handleChange = (val: string, idx: number) => {
    setError('');
    const digits = val.replace(/\D/g, '');
    const next = [...otp];
    next[idx] = digits.slice(-1);
    setOtp(next);
    if (digits && idx < 5) inputs.current[idx + 1]?.focus();
  };

  const handleKeyPress = (e: any, idx: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    setError('');
    const code = otp.join('');
    if (code.length < 6) {
      setError('Please enter the complete 6-digit code.');
      return;
    }
    setLoading(true);
    try {
      await verifyOtp({ email: email!, otp: code });
      router.push({ pathname: '/(auth)/new-password' as any, params: { email, otp: code } });
    } catch (err: any) {
      setError(err?.message || 'Code is incorrect or expired. Try again.');
      // Clear the OTP boxes so user can re-enter
      setOtp(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
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
          <Ionicons name="shield-checkmark-outline" size={32} color={Colors.success} />
        </View>
        <Text style={s.title}>Verify OTP</Text>
        <Text style={s.subtitle}>
          We sent a 6-digit code to{'\n'}
          <Text style={s.emailText}>{email}</Text>
        </Text>

        {!!error && (
          <View style={s.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        <View style={s.otpRow}>
          {otp.map((digit, idx) => (
            <TextInput
              key={idx}
              ref={r => { inputs.current[idx] = r; }}
              style={[s.otpBox, digit ? s.otpBoxFilled : null, !!error && s.otpBoxError]}
              value={digit}
              onChangeText={v => handleChange(v, idx)}
              onKeyPress={e => handleKeyPress(e, idx)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
            />
          ))}
        </View>

        <TouchableOpacity
          style={[s.btn, loading && s.btnDisabled]}
          onPress={handleVerify}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>Verify Code</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={s.resendBtn} onPress={() => router.back()}>
          <Text style={s.resendText}>
            Didn't receive it? <Text style={s.resendLink}>Go back</Text>
          </Text>
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
    backgroundColor: Colors.successLight, alignItems: 'center',
    justifyContent: 'center', marginBottom: Spacing.lg,
  },
  title:    { ...Typography.h2, color: Colors.text, marginBottom: Spacing.sm },
  subtitle: { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.xl, lineHeight: 22 },
  emailText:{ color: Colors.primary, fontWeight: '600' },

  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.dangerLight, borderRadius: Radius.sm,
    padding: Spacing.sm, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.danger + '40',
  },
  errorText: { ...Typography.bodySmall, color: Colors.danger, flex: 1, lineHeight: 18 },

  otpRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xl },
  otpBox: {
    width: 48, height: 56, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, textAlign: 'center', fontSize: 22, fontWeight: '700',
    color: Colors.text, backgroundColor: Colors.surface,
  },
  otpBoxFilled: { borderColor: Colors.primary, backgroundColor: Colors.surfaceAlt },
  otpBoxError:  { borderColor: Colors.danger },

  btn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 14, alignItems: 'center', marginBottom: Spacing.md,
  },
  btnDisabled: { opacity: 0.7 },
  btnText:     { ...Typography.h4, color: '#fff' },
  resendBtn:   { alignItems: 'center' },
  resendText:  { ...Typography.body, color: Colors.textSecondary },
  resendLink:  { color: Colors.accent, fontWeight: '600' },
});
