import React from 'react';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import ProfileScreen from '@/app/(tabs)/profile';

// Profile module screen delegates to the profile tab content
export default function ProfileModuleScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Profile' }} />
      <ProfileScreen />
    </>
  );
}
