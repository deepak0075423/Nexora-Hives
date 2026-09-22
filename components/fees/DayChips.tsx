import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

/**
 * A list of day-offsets, edited as chips: "3 days, 7 days" is two reminders,
 * one three days out and one seven. Kept as numbers because that is what the
 * server validates — whole days between 1 and 90, de-duplicated and sorted.
 */
export default function DayChips({
  label, hint, value = [], onChange,
}: {
  label: string; hint?: string; value?: number[]; onChange: (days: number[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const days = Array.isArray(value) ? value : [];

  const add = () => {
    if (!draft.trim()) return;
    const n = Math.round(Number(draft));
    if (!Number.isFinite(n) || n < 1 || n > 90) {
      Alert.alert('Not a number of days', 'Enter a whole number between 1 and 90.');
      return;
    }
    if (!days.includes(n)) onChange([...days, n].sort((a, b) => a - b));
    setDraft('');
  };

  return (
    <View style={{ marginBottom: Spacing.md }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.box}>
        {days.map(d => (
          <View key={d} style={s.chip}>
            <Text style={s.chipText}>{d} {d === 1 ? 'day' : 'days'}</Text>
            <Pressable onPress={() => onChange(days.filter(x => x !== d))} hitSlop={8}
              accessibilityLabel={`Remove ${d} days`}>
              <Ionicons name="close" size={14} color={Colors.primary} />
            </Pressable>
          </View>
        ))}
        <TextInput
          style={s.input}
          value={draft}
          onChangeText={setDraft}
          onBlur={add}
          onSubmitEditing={add}
          keyboardType="numeric"
          placeholder="add…"
          placeholderTextColor={Colors.textLight}
          returnKeyType="done"
        />
      </View>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  label: { ...Typography.label, color: Colors.text, marginBottom: 6 },
  box: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6,
    minHeight: 44, paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 4, paddingLeft: 10, paddingRight: 6,
    borderRadius: Radius.sm, backgroundColor: Colors.surfaceAlt,
  },
  chipText: { ...Typography.caption, color: Colors.primary, fontWeight: '600' },
  input: { minWidth: 64, flexGrow: 1, paddingVertical: 4, color: Colors.text, fontSize: 13 },
  hint: { fontSize: 11, color: Colors.textLight, marginTop: 4, lineHeight: 15 },
});
