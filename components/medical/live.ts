/**
 * The Medical Room, live, on the phone (Oct 2026). The server nudges the
 * medical staff (`medical:changed` — the kind of record, never its contents)
 * and the teacher who sent a student (`medical:request`); the screen reads
 * again a moment later through the same guarded endpoints. An emergency
 * also buzzes the phone.
 */
import { useEffect, useRef } from 'react';
import { Vibration, Platform } from 'react-native';
import { onSocketEvent } from '@/utils/socket';

/** A long-short-long buzz for an emergency (nothing on the web build). */
export function buzz() {
  if (Platform.OS === 'web') return;
  try { Vibration.vibrate([0, 400, 150, 400]); } catch { /* no vibration motor */ }
}

/** A live notification from the Medical Room (for `when` on a family's or a teacher's screen). */
export const medicalNotice = (n: any) => String(n?.link?.type || '').startsWith('medical.');

/**
 * `when` limits it to the events it accepts: a family's screen listens to its
 * own live notifications (`notification:new` + medicalNotice), so urgent news
 * shows its "I have seen this" at once.
 */
export function useMedLive(reload: () => void, { event = 'medical:changed', onUrgent, when }: { event?: string; onUrgent?: (data: any) => void; when?: (data: any) => boolean } = {}) {
  const ref = useRef({ reload, onUrgent, when });
  ref.current = { reload, onUrgent, when };
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Through the registry, not on the socket: the app replaces its socket
    // (an account switch, or the notification context connecting after this
    // screen mounted), and a listener on the old one heard nothing.
    const off = onSocketEvent(event, (data: any = {}) => {
      if (ref.current.when && !ref.current.when(data)) return;
      if (data?.urgent) ref.current.onUrgent?.(data);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => ref.current.reload(), 400);
    });
    return () => { if (timer) clearTimeout(timer); off(); };
  }, [event]);
}
