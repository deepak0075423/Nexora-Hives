import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
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

/**
 * Everything below this belongs to ONE membership — one school, one role.
 *
 * Screens here fetch on mount and keep what they fetched in component state;
 * most only refetch when the ROLE changes. That is right for one session and
 * wrong across a switch: a parent moving from one school to the other keeps the
 * same role, so the Home tab would go on showing the first school's children,
 * notices and holidays under the second school's name.
 *
 * So when one signed-in membership is replaced directly by another — switching
 * school or role, or flipping to a saved account — the whole tree is mounted
 * afresh, the in-app equivalent of the full page reload the web app does.
 * Signing out and in again is not counted: navigating through the sign-in
 * screens already unmounts the tabs, and remounting at cold start (no user →
 * user) would only mount everything twice.
 */
function SessionScope({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const id = user?._id ?? null;
  const generation = useRef(0);
  const lastId = useRef<string | null>(null);
  if (id !== lastId.current) {
    if (id && lastId.current) generation.current += 1;
    lastId.current = id;
  }
  return <React.Fragment key={generation.current}>{children}</React.Fragment>;
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
      <SessionScope>
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
      </SessionScope>
    </AuthProvider>
  );
}
