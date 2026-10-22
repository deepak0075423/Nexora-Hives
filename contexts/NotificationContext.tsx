import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { connectSocket, disconnectSocket, onSocketState, socketState } from '@/utils/socket';
import { getUnreadCount } from '@/api/notifications.api';
import storage from '@/utils/storage';
import type { NotificationLink } from '@/utils/notificationLink';
import { presentFromSocket, setBadge } from '@/utils/pushNotifications';

export interface LiveNotification {
  _id: string;
  /** This reader's receipt — what a tap resolves against */
  receiptId?: string | null;
  title: string;
  body: string;
  senderRole?: string;
  createdAt?: string;
  /** Where it opens, already resolved for this reader's role by the server */
  link?: NotificationLink;
  /** 'high' | 'medium' | 'low' */
  priority?: string;
  /** The sender marked it urgent — the banner stays until it is seen, and the phone vibrates */
  urgent?: boolean;
}

interface NotificationContextValue {
  unreadCount: number;
  /** Bumps every time a notification:new event arrives — subscribe to refresh lists */
  lastEventAt: number;
  lastNotification: LiveNotification | null;
  /**
   * Bumps when the server says what this person may open has changed — a
   * teacher made class teacher, an enrolment, another year activated
   * (`access:changed`). It is a nudge to ask /modules again, never the answer;
   * hooks/useModules listens for it.
   */
  accessChangedAt: number;
  /** Drop the banner without opening it */
  dismissLast: () => void;
  refreshUnread: () => Promise<void>;
  setUnreadCount: (n: number) => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  unreadCount: 0,
  lastEventAt: 0,
  lastNotification: null,
  accessChangedAt: 0,
  dismissLast: () => {},
  refreshUnread: async () => {},
  setUnreadCount: () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastEventAt, setLastEventAt] = useState(0);
  const [lastNotification, setLastNotification] = useState<LiveNotification | null>(null);
  const [accessChangedAt, setAccessChangedAt] = useState(0);
  const connectedFor = useRef<string | null>(null);
  const lastPushAt = useRef(0);   // when the gateway last pushed the count

  const refreshUnread = useCallback(async () => {
    const askedAt = Date.now();
    try {
      const res: any = await getUnreadCount();
      // A count pushed while this was on its way is newer than the answer.
      if (lastPushAt.current > askedAt) return;
      const n = res?.count ?? res?.data?.count ?? 0;
      setUnreadCount(n);
      setBadge(n);
    } catch { /* offline is fine */ }
  }, []);

  useEffect(() => {
    // An applicant (guest) gets no in-app notifications — their updates are
    // emailed and shown on the admission portal.
    if (!user?._id || user.role === 'guest') {
      disconnectSocket();
      connectedFor.current = null;
      setUnreadCount(0);
      return;
    }
    if (connectedFor.current === user._id) return;

    let cancelled = false;
    (async () => {
      const token = await storage.getItem('token');
      if (!token || cancelled) return;

      // Account switch — drop the old user's socket first
      if (connectedFor.current) disconnectSocket();
      connectedFor.current = user._id;

      const sock = connectSocket(token);
      sock.on('notification:unread_count', ({ count }: { count: number }) => {
        lastPushAt.current = Date.now();
        setUnreadCount(count ?? 0);
        setBadge(count ?? 0);
      });
      sock.on('notification:new', (n: LiveNotification) => {
        setLastNotification(n);
        setLastEventAt(Date.now());
        // The OS's own notification too, when remote push is not already bringing it.
        presentFromSocket(n);
      });
      // Listened for here, where the socket is owned: an account switch
      // replaces the socket, and a listener a screen had put on the old one
      // would be gone with it.
      sock.on('access:changed', () => setAccessChangedAt(Date.now()));
      refreshUnread();
    })();

    return () => { cancelled = true; };
  }, [user?._id, user?.role, refreshUnread]);

  // While the socket is down — a gateway the phone cannot reach — the count
  // used to move only when the notifications screen was opened. Read it from
  // the server when the app comes to the front, and every 30 seconds while it
  // is in front and the socket is still down; once connected, the gateway's
  // pushes take over.
  useEffect(() => {
    if (!user?._id || user.role === 'guest') return undefined;
    let timer: ReturnType<typeof setInterval> | null = null;
    const sync = () => {
      if (timer) clearInterval(timer);
      timer = null;
      if (socketState() !== 'connected' && AppState.currentState === 'active') timer = setInterval(refreshUnread, 30000);
    };
    const stopWatching = onSocketState(sync);
    const sub = AppState.addEventListener('change', (next) => { if (next === 'active') refreshUnread(); sync(); });
    sync();
    return () => { stopWatching(); sub.remove(); if (timer) clearInterval(timer); };
  }, [user?._id, user?.role, refreshUnread]);

  const dismissLast = useCallback(() => setLastNotification(null), []);

  return (
    <NotificationContext.Provider
      value={{ unreadCount, lastEventAt, lastNotification, accessChangedAt, dismissLast, refreshUnread, setUnreadCount }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
