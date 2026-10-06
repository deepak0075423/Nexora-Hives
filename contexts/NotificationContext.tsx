import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { connectSocket, disconnectSocket } from '@/utils/socket';
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

  const refreshUnread = useCallback(async () => {
    try {
      const res: any = await getUnreadCount();
      setUnreadCount(res?.count ?? res?.data?.count ?? 0);
    } catch { /* offline is fine */ }
  }, []);

  useEffect(() => {
    if (!user?._id) {
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
  }, [user?._id, refreshUnread]);

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
