import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { registerForPushNotifications } from '@/utils/pushNotifications';
import { lockRequired, clearPinAndLocks } from '@/utils/appLock';
import {
  receiptIdFromUrl, rememberPendingNotification, takePendingNotification,
} from '@/utils/notificationLink';
import NotificationBanner from '@/components/NotificationBanner';
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
    // The deep-link screen decides for itself what to do about a missing
    // session — it parks the target first. Bouncing it to login here would
    // throw away the very thing the person tapped.
    const inNotifLink      = (segments[0] as string) === 'notification';

    if (!user && !inAuth && !inNotifLink) {
      router.replace('/(auth)/login' as any);
    } else if (user && inAuth) {
      router.replace(user.isFirstLogin ? ('/modules/change-password' as any) : ('/(tabs)' as any));
    } else if (user && user.isFirstLogin && !inChangePassword) {
      router.replace('/modules/change-password' as any);
    }
  }, [user, loading, segments]);

  // A notification tapped while signed out (or before the session had loaded)
  // is replayed the moment there is somewhere to take it. Not for a first
  // login — that has to finish changing the password first.
  useEffect(() => {
    if (loading || !user || user.isFirstLogin) return;
    let cancelled = false;
    takePendingNotification().then(receiptId => {
      if (receiptId && !cancelled) router.replace(`/notification/${receiptId}` as any);
    });
    return () => { cancelled = true; };
  }, [user, loading, router]);

  // Register push token once logged in (no-op in Expo Go dev builds)
  useEffect(() => {
    if (user) registerForPushNotifications();
  }, [user]);

  return null;
}

/**
 * Deep links that expo-router cannot route on its own.
 *
 * The app's own scheme (aksharum://notification/<id>) matches app/notification/
 * and is handled by the router. Two other shapes reach us and would otherwise
 * do nothing: the https://…/n/<id> URL printed in notification emails, and any
 * link carrying ?receipt=. Both are normalised to the one screen that knows
 * what to do with a receipt. A link that arrives at cold start is picked up
 * from `getInitialURL`, one that arrives while the app is alive from the
 * listener — both cases, not just the easy one.
 */
function DeepLinkBridge() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    const handle = (url?: string | null) => {
      const receiptId = receiptIdFromUrl(url);
      if (!receiptId) return;
      // Already inside app/notification/* — the router has it.
      if (url && /aksharum:\/\/notification\//.test(url)) return;
      if (loading || !user) rememberPendingNotification(receiptId);
      else router.replace(`/notification/${receiptId}` as any);
    };

    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, [router, user, loading]);

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
        <DeepLinkBridge />
        <LockGate>
          <RootGuard />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)"       options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)"       options={{ headerShown: false }} />
            <Stack.Screen name="modules"      options={{ headerShown: false }} />
            <Stack.Screen name="notification" options={{ headerShown: false }} />
          </Stack>
          {/* Sits above every screen so a notification arriving mid-task can be
              followed without hunting for the tab. */}
          <NotificationBanner />
          <StatusBar style="auto" />
        </LockGate>
      </NotificationProvider>
    </AuthProvider>
  );
}
