import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { registerForPushNotifications } from '@/utils/pushNotifications';
import { lockRequired, clearPinAndLocks } from '@/utils/appLock';
import LockScreen from '@/components/LockScreen';
import storage from '@/utils/storage';

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

const RELOCK_AFTER_MS = 30_000;

/** Shows the PIN screen at cold start, on account switch, and after 30s in background */
function LockGate({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const [locked, setLocked] = useState(false);
  const lastUserRef = useRef<string | null | undefined>(undefined);
  const bgAtRef = useRef<number>(0);

  // Evaluate on start and whenever the active account changes
  useEffect(() => {
    if (loading) return;
    const uid = user?._id ?? null;
    if (uid === lastUserRef.current) return;
    lastUserRef.current = uid;
    lockRequired(uid).then(req => { if (req) setLocked(true); });
  }, [user?._id, loading]);

  // Re-lock after the app sits in background
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (st) => {
      if (st === 'background' || st === 'inactive') {
        if (!bgAtRef.current) bgAtRef.current = Date.now();
      } else if (st === 'active') {
        const away = bgAtRef.current ? Date.now() - bgAtRef.current : 0;
        bgAtRef.current = 0;
        if (away > RELOCK_AFTER_MS && (await lockRequired(lastUserRef.current ?? null))) {
          setLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, []);

  const forgot = async () => {
    // Last resort: wipe PIN, locks and all saved sessions
    await clearPinAndLocks();
    await storage.deleteItem('accounts');
    await signOut();
    setLocked(false);
  };

  if (locked) {
    return <LockScreen onUnlock={() => setLocked(false)} onForgot={forgot} />;
  }
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <LockGate>
          <RootGuard />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)"   options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)"   options={{ headerShown: false }} />
            <Stack.Screen name="modules"  options={{ headerShown: false }} />
          </Stack>
          <StatusBar style="auto" />
        </LockGate>
      </NotificationProvider>
    </AuthProvider>
  );
}
