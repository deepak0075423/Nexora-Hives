import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { resetPassword } from '@/api/auth.api';
import { useAuth } from '@/contexts/AuthContext';
import { passwordError } from '@/utils/validators';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { user, reload } = useAuth();
  const isFirstLogin = user?.isFirstLogin === true;

  const [current, setCurrent]   = useState('');
  const [next, setNext]         = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async () => {
    if (!isFirstLogin && !current.trim()) { Alert.alert('Error', 'Please enter your current password.'); return; }
    const pwErr = passwordError(next);
    if (pwErr) { Alert.alert('Error', pwErr); return; }
    if (next !== confirm) { Alert.alert('Error', 'New passwords do not match.'); return; }

    setLoading(true);
    try {
      await resetPassword({ currentPassword: current.trim(), newPassword: next });
      await reload();
      Alert.alert('Success', 'Password set successfully.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/' as any) },
      ]);
    } catch (err: any) {
      Alert.alert('Failed', err?.message ?? 'Could not change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: isFirstLogin ? 'Set Password' : 'Change Password', headerBackVisible: !isFirstLogin }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1, backgroundColor: Colors.background }}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.infoBox}>
            <Ionicons name="information-circle" size={18} color={Colors.info} />
            <Text style={s.infoText}>
              {isFirstLogin
                ? 'Welcome! Please set a new password to continue.'
                : 'Your new password must be at least 8 characters long.'}
            </Text>
          </View>

          <View style={s.fieldGroup}>
            {!isFirstLogin && (
              <PasswordField
                label="Current Password"
                value={current}
                onChangeText={setCurrent}
                show={showCurrent}
                onToggleShow={() => setShowCurrent(v => !v)}
              />
            )}
            <PasswordField
              label="New Password"
              value={next}
              onChangeText={setNext}
              show={showNext}
              onToggleShow={() => setShowNext(v => !v)}
            />
            <PasswordField
              label="Confirm New Password"
              value={confirm}
              onChangeText={setConfirm}
              show={showConfirm}
              onToggleShow={() => setShowConfirm(v => !v)}
              last
            />
          </View>

          <TouchableOpacity style={s.btn} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.btnText}>Change Password</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function PasswordField({
  label, value, onChangeText, show, onToggleShow, last,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  show: boolean; onToggleShow: () => void; last?: boolean;
}) {
  return (
    <View style={[pf.wrapper, !last && pf.wrapperBorder]}>
      <Text style={pf.label}>{label}</Text>
      <View style={pf.row}>
        <TextInput
          style={pf.input}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={Colors.textLight}
          placeholder="••••••••"
        />
        <TouchableOpacity onPress={onToggleShow} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const pf = StyleSheet.create({
  wrapper: { paddingVertical: 12 },
  wrapperBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  label: { ...Typography.label, color: Colors.textSecondary, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, ...Typography.body, color: Colors.text, paddingVertical: 0 },
});

const s = StyleSheet.create({
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.infoLight, borderRadius: Radius.md,
    padding: Spacing.sm, marginBottom: Spacing.lg,
  },
  infoText: { flex: 1, fontSize: 13, color: Colors.info, lineHeight: 18 },
  fieldGroup: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    paddingHorizontal: Spacing.md, marginBottom: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  btn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 14, alignItems: 'center',
  },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
