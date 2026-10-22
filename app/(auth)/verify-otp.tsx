import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { TextInput } from '@/components/ui/TextInput';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { forgotPassword, verifyOtp } from '@/api/auth.api';
import { clock, codeState, codeStateFromParams, opensAt, type CodeState } from '@/utils/authWait';

export default function VerifyOtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email: string; resendAt?: string; sendsLeft?: string; maxSends?: string; availableAt?: string }>();
  const email = String(params.email || '');
  const [otp, setOtp]       = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [notice, setNotice] = useState('');
  const inputs = useRef<(TextInput | null)[]>([]);

  // Asking for another code: 60 seconds after the last one, three in a row,
  // then not for a day. The server decides (services/resetCodeLimit); this
  // screen shows where the person stands.
  const [codes, setCodes]         = useState<CodeState>(() => codeStateFromParams(params));
  const [resending, setResending] = useState(false);
  const [now, setNow]             = useState(Date.now());
  const wait = Math.max(0, Math.ceil((codes.resendAt - now) / 1000));
  const counting = wait > 0;
  useEffect(() => {
    if (!counting) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [counting]);

  const take = (d: any) => { setCodes(codeState(d)); setNow(Date.now()); };

  // Right here — the screen used to send the person back to the email form.
  const resend = async () => {
    setError(''); setNotice('');
    setResending(true);
    try {
      const d: any = await forgotPassword({ email });
      take(d);
      setOtp(['', '', '', '', '', '']);
      setNotice('A new code is on its way. Use the newest one — earlier codes no longer work.');
      inputs.current[0]?.focus();
    } catch (err: any) {
      const d = err?.data || {};
      if (d.code === 'OTP_WAIT' || d.code === 'OTP_LIMIT') take(d);
      else setError(err?.message || 'Could not send a new code.');
    } finally {
      setResending(false);
    }
  };

  const usedUp = codes.sendsLeft === 0;
  const until  = usedUp ? opensAt(codes.availableAt) : null;

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
      const res: any = await verifyOtp({ email, otp: code });
      router.push({ pathname: '/(auth)/new-password' as any, params: { email, resetToken: res?.resetToken ?? '' } });
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

        {!!notice && !error && (
          <View style={s.noticeBox}>
            <Ionicons name="mail-outline" size={16} color={Colors.success} />
            <Text style={s.noticeText}>{notice}</Text>
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

        <View style={s.resendBox}>
          {usedUp ? (
            <Text style={s.resendText}>
              You have asked for all {codes.maxSends} codes.
              {until ? <> You can ask for a new one after <Text style={s.resendStrong}>{until}</Text>.</> : ' You can ask for a new one in 24 hours.'}
            </Text>
          ) : counting ? (
            <Text style={s.resendText}>
              Didn’t get it? Resend in <Text style={s.resendStrong}>{clock(wait)}</Text>
            </Text>
          ) : (
            <TouchableOpacity onPress={resend} disabled={resending} hitSlop={8}>
              <Text style={s.resendText}>
                Didn’t get it? <Text style={s.resendLink}>{resending ? 'Sending…' : 'Resend code'}</Text>
              </Text>
            </TouchableOpacity>
          )}
          {!usedUp && codes.sendsLeft != null && (
            <Text style={s.resendLeft}>
              You can ask for {codes.sendsLeft} more {codes.sendsLeft === 1 ? 'code' : 'codes'}.
            </Text>
          )}
        </View>
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
  resendBox:   { alignItems: 'center', gap: 6 },
  resendText:  { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  resendLink:  { color: Colors.accent, fontWeight: '600' },
  resendStrong:{ color: Colors.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
  resendLeft:  { ...Typography.bodySmall, color: Colors.textLight },

  noticeBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.successLight, borderRadius: Radius.sm,
    padding: Spacing.sm, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.success + '40',
  },
  noticeText: { ...Typography.bodySmall, color: Colors.success, flex: 1, lineHeight: 18 },
});
