import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';

interface Props {
  message?: string;
}

/**
 * Shown when a module cannot be reached — either it is not enabled for the school
 * or the signed-in teacher's designation does not grant access to it. Both are
 * the same outcome for the user, and both are decided by the server.
 */
export default function ModuleDisabled({ message }: Props) {
  return (
    <View style={s.root}>
      <View style={s.iconBox}>
        <Ionicons name="lock-closed" size={32} color={Colors.textLight} />
      </View>
      <Text style={s.title}>Module Not Available</Text>
      <Text style={s.sub}>
        {message ?? 'This module is not enabled for your school, or your designation does not have access to it.\nPlease contact your administrator.'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xl, backgroundColor: Colors.background,
  },
  iconBox: {
    width: 72, height: 72, borderRadius: Radius.xl,
    backgroundColor: Colors.surfaceAlt, alignItems: 'center',
    justifyContent: 'center', marginBottom: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  title: { ...Typography.h3, color: Colors.textSecondary, marginBottom: Spacing.sm, textAlign: 'center' },
  sub: { ...Typography.body, color: Colors.textLight, textAlign: 'center', lineHeight: 22 },
});
