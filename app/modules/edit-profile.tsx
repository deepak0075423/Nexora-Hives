import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/api/axios';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, reload } = useAuth();

  const [name, setName]   = useState(user?.name ?? '');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Error', 'Name cannot be empty.'); return; }
    setLoading(true);
    try {
      await (api as any).put('/auth/profile', { name: name.trim(), phone: phone.trim() });
      await reload();
      Alert.alert('Success', 'Profile updated.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (err: any) {
      Alert.alert('Failed', err?.message ?? 'Could not update profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Edit Profile' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1, backgroundColor: Colors.background }}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar */}
          <View style={s.avatarRow}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>
                {(name || user?.name || 'U').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={s.fieldGroup}>
            <Field label="Full Name" value={name} onChangeText={setName} placeholder="Your full name" />
            <Field label="Email" value={user?.email ?? ''} editable={false} placeholder="" last />
          </View>

          <TouchableOpacity style={s.btn} onPress={handleSave} disabled={loading} activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.btnText}>Save Changes</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function Field({ label, value, onChangeText, placeholder, editable = true, last }: {
  label: string; value: string; onChangeText?: (v: string) => void;
  placeholder: string; editable?: boolean; last?: boolean;
}) {
  return (
    <View style={[f.wrapper, !last && f.border]}>
      <Text style={f.label}>{label}</Text>
      <TextInput
        style={[f.input, !editable && f.inputDisabled]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textLight}
        editable={editable}
        autoCapitalize="words"
      />
    </View>
  );
}

const f = StyleSheet.create({
  wrapper: { paddingVertical: 12 },
  border: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  label: { ...Typography.label, color: Colors.textSecondary, marginBottom: 6 },
  input: { ...Typography.body, color: Colors.text, paddingVertical: 0 },
  inputDisabled: { color: Colors.textLight },
});

const s = StyleSheet.create({
  avatarRow: { alignItems: 'center', marginBottom: Spacing.lg },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#fff' },
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
