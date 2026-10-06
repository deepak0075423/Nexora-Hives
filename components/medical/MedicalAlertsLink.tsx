/**
 * A pointer from a duty screen — a cover, an exam room, the hostel — to the
 * Medical Room's critical alerts for the children on that duty (Oct 2026,
 * server services/medicalNeedToKnow). Shown only when the school runs the
 * Medical Room for this person.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useModules } from '@/hooks/useModules';

export default function MedicalAlertsLink({ title, body }: { title: string; body: string }) {
  const { isEnabled } = useModules();
  const router = useRouter();
  if (!isEnabled('medical')) return null;
  return (
    <TouchableOpacity style={s.box} onPress={() => router.push('/modules/medical?tab=alerts' as any)} accessibilityRole="link" accessibilityLabel={title}>
      <View style={s.icon}><Ionicons name="medkit-outline" size={18} color="#BE123C" /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.body}>{body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FECDD3', backgroundColor: '#FFF1F2' },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFE4E6' },
  title: { fontSize: 14, fontWeight: '700', color: Colors.text },
  body: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },
});
