/**
 * OS push notifications.
 *
 * Not wired up: `expo-notifications` is not a dependency of this app, and
 * adding it needs a new native build (EAS) rather than a JS change. Everything
 * a push would *do* on arrival, though, already exists — so turning it on later
 * is a small change, not a redesign:
 *
 *   • the backend resolves every notification into a per-reader destination and
 *     puts a receipt id on the payload (services/notificationLinks.js)
 *   • `aksharum://notification/<receiptId>` opens app/notification/[id].tsx,
 *     which resolves that receipt and forwards to the right screen — handling
 *     cold start, background, a locked app and a signed-out session
 *   • DeepLinkBridge in app/_layout.tsx catches links the router does not route
 *     itself, at launch and while running
 *
 * To finish it: install expo-notifications, register the device token here and
 * POST it to the backend, have notifyService include
 *   { data: { url: `aksharum://notification/${receiptId}` } }
 * on the Expo push message, and add a response listener that opens
 * `response.notification.request.content.data.url`. Nothing else has to change.
 */
export async function registerForPushNotifications(): Promise<void> {
  // No-op until expo-notifications is part of the native build.
}
