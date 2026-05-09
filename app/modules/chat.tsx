import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography } from '@/constants/theme';

export default function ChatScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Chat' }} />
      <View style={s.root}>
        <Ionicons name="chatbubbles-outline" size={56} color={Colors.textLight} />
        <Text style={s.title}>Chat</Text>
        <Text style={s.sub}>Messaging module coming soon.</Text>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { ...Typography.h4, color: Colors.textSecondary },
  sub: { ...Typography.body, color: Colors.textLight },
});
