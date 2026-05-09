// Push notifications require an EAS production build — not available in Expo Go.
// Registration is a no-op in development; the backend already stores tokens and
// the dispatch logic is in the backend notification controller.
export async function registerForPushNotifications(): Promise<void> {
  // Will be implemented when building for production with EAS Build
}
