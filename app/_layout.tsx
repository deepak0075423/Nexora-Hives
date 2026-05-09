import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { registerForPushNotifications } from '@/utils/pushNotifications';

function RootGuard() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Auth routing
  useEffect(() => {
    if (loading) return;
    const inAuth           = (segments[0] as string) === '(auth)';
    const inModules        = (segments[0] as string) === 'modules';
    const inChangePassword = inModules && segments[1] === 'change-password';

    if (!user && !inAuth) {
      router.replace('/(auth)/login' as any);
    } else if (user && inAuth) {
      router.replace(user.isFirstLogin ? ('/modules/change-password' as any) : ('/(tabs)' as any));
    } else if (user && user.isFirstLogin && !inChangePassword) {
      router.replace('/modules/change-password' as any);
    }
  }, [user, loading, segments]);

  // Register push token once logged in (no-op in Expo Go dev builds)
  useEffect(() => {
    if (user) registerForPushNotifications();
  }, [user]);

  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootGuard />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)"   options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)"   options={{ headerShown: false }} />
        <Stack.Screen name="modules"  options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </AuthProvider>
  );
}
