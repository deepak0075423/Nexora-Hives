/**
 * OS notifications on the phone (Oct 2026) — the system tray, the lock screen,
 * the badge on the app icon — for every notification and every chat message,
 * alongside the in-app banner (components/NotificationBanner).
 *
 * Two ways in, one result:
 *
 *   • remote push — the backend sends every notification (and every chat
 *     message) through Expo's push service, which hands it to Firebase on
 *     Android and Apple on iPhones, to the token registered here — so it
 *     arrives with the app closed (school-backend/services/pushService);
 *   • the websocket — while the app is running, a `notification:new` that
 *     arrives is shown as the OS's own notification by the app itself
 *     (presentFromSocket). That keeps the tray working where remote push
 *     cannot — this build has no push credentials yet, the person refused the
 *     token — and only then, so nothing ever shows twice.
 *
 * Tapping one opens aksharum://notification/<receipt> (marked read, forwarded
 * to the right screen for this reader — app/notification/[id].tsx) or the
 * chat conversation; PushBridge in app/_layout.tsx does the opening. In the
 * foreground the in-app banner speaks, and the OS keeps a copy in the tray
 * without a second banner. Nothing here runs on the web build.
 */
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import api from '@/api/axios';
import storage from '@/utils/storage';

const TOKEN_KEY = 'pushToken';
const native = Platform.OS === 'ios' || Platform.OS === 'android';
let configured = false;
/** A token is registered with the server for this session: remote push shows notifications, not the websocket. */
let remoteOn = false;

/** Once, at start: how a notification is shown while the app is open, and Android's channels. */
export function setUpNotifications(): void {
  if (configured || !native) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      // The app is open: the in-app banner shows it; the OS keeps it in the tray, quietly.
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
  if (Platform.OS === 'android') {
    const channels: [string, Notifications.NotificationChannelInput][] = [
      ['default', { name: 'Notifications', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250], lightColor: '#4F46E5' }],
      ['urgent', { name: 'Urgent', description: 'A child sent home, an emergency, a family the school has not reached', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 400, 200, 400], lightColor: '#DC2626' }],
      ['chat', { name: 'Messages', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 200] }],
    ];
    for (const [id, ch] of channels) Notifications.setNotificationChannelAsync(id, ch).catch(() => {});
  }
}

/**
 * After sign-in (and after switching account): ask once for permission, then
 * register this phone's Expo push token for the signed-in person. Without a
 * token — no permission, a build without push credentials, a simulator — the
 * websocket shows notifications instead (presentFromSocket).
 */
export async function registerForPushNotifications(): Promise<void> {
  if (!native) return;
  setUpNotifications();
  remoteOn = false;
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.post('/notifications/push/devices', {
      kind: 'expo', token, platform: Platform.OS,
      deviceName: Constants.deviceName || '', appVersion: Constants.expoConfig?.version || '',
    });
    await storage.setItem(TOKEN_KEY, token);
    remoteOn = true;
  } catch {
    // No push credentials in this build (Android needs Firebase), Expo Go, a simulator, offline:
    // the websocket keeps the tray working while the app runs.
    remoteOn = false;
  }
}

/** Signing out: this phone stops showing that person's notifications. Call while the session is still valid. */
export async function unregisterPush(): Promise<void> {
  remoteOn = false;
  if (!native) return;
  try {
    const token = await storage.getItem(TOKEN_KEY);
    if (token) {
      await api.post('/notifications/push/devices/remove', { token }).catch(() => {});
      await storage.deleteItem(TOKEN_KEY);
    }
  } catch { /* signing out regardless */ }
  Notifications.setBadgeCountAsync(0).catch(() => {});
  Notifications.dismissAllNotificationsAsync().catch(() => {});
}

/** The unread count, as the badge on the app icon. */
export function setBadge(count: number): void {
  if (!native) return;
  Notifications.setBadgeCountAsync(Math.max(0, count || 0)).catch(() => {});
}

/**
 * A notification that came over the websocket, as the OS's own — only when
 * remote push is not doing it already. In the foreground it goes straight to
 * the tray (the in-app banner is the alert); in the background it is a full
 * notification on its channel.
 */
export function presentFromSocket(n: { title?: string; body?: string; receiptId?: string | null; urgent?: boolean; link?: { mobile?: string } | null }): void {
  if (!native || remoteOn) return;
  Notifications.scheduleNotificationAsync({
    content: {
      title: n.title || 'New notification',
      body: n.body || '',
      data: { kind: 'notification', receiptId: n.receiptId || null, path: n.link?.mobile || null, urgent: !!n.urgent },
      sound: 'default',
    },
    trigger: Platform.OS === 'android' ? { channelId: n.urgent ? 'urgent' : 'default' } : null,
  }).catch(() => {});
}

/** A chat message that came over the websocket while the app is in the background — only when remote push is off. */
export function presentChatFromSocket(m: { chatId: string; title: string; body: string }): void {
  if (!native || remoteOn || AppState.currentState === 'active') return;
  Notifications.scheduleNotificationAsync({
    content: { title: m.title, body: m.body, data: { kind: 'chat', chatId: m.chatId }, sound: 'default' },
    trigger: Platform.OS === 'android' ? { channelId: 'chat' } : null,
  }).catch(() => {});
}

/** Whether remote push is carrying this session's notifications (for the screens that ask). */
export const pushIsRemote = () => remoteOn;
