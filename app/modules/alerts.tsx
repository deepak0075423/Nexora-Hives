import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  RefreshControl, TouchableOpacity, Alert, Modal, Pressable,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as notifApi from '@/api/notifications.api';
import * as adminApi from '@/api/admin.api';
import { notificationPath, hasTarget, type NotificationLink } from '@/utils/notificationLink';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Receipt {
  _id: string;
  isRead: boolean;
  notification: {
    _id: string;
    title: string;
    body: string;
    senderRole: string;
    createdAt: string;
  } | null;
  /** Resolved server-side for this reader's role — see utils/notificationLink */
  link?: NotificationLink;
  createdAt: string;
}

interface SentNotif {
  _id: string;
  title: string;
  body: string;
  target: { type: string };
  recipientCount: number;
  createdAt: string;
}

interface AllNotif {
  _id: string;
  title: string;
  body: string;
  senderRole: string;
  sender: { _id: string; name: string; role: string } | null;
  target: { type: string };
  recipientCount: number;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  teacher: 'Teacher', school_admin: 'Admin', admin: 'Admin',
  super_admin: 'Super Admin', 'super-admin': 'Super Admin',
  student: 'Student', parent: 'Parent', system: 'System',
};

const TARGET_LABEL: Record<string, string> = {
  all: 'Everyone', all_teachers: 'All Teachers', all_students: 'All Students',
  all_parents: 'All Parents', class_students: 'Class Students',
  class_parents: 'Class Parents', section_students: 'Section Students',
  section_parents: 'Section Parents', section_all: 'Section Everyone',
  all_schools: 'All Schools', specific_school: 'Specific School',
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function fullDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const CAN_SEND     = ['teacher', 'admin', 'super-admin'] as const;
const CAN_SEE_SENT = ['teacher', 'admin', 'super-admin'] as const;

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AlertsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  // Reached from a notification link with no destination of its own — it opens
  // on itself rather than on a bare list.
  const { receipt: openReceiptId } = useLocalSearchParams<{ receipt?: string }>();
  const role = user?.role ?? 'student';

  const canSend    = (CAN_SEND    as readonly string[]).includes(role);
  const canSeeSent = (CAN_SEE_SENT as readonly string[]).includes(role);
  const isAdmin    = role === 'admin';

  type TabType = 'inbox' | 'sent' | 'all';
  const [tab, setTab] = useState<TabType>('inbox');

  // Inbox state
  const [inbox, setInbox]             = useState<Receipt[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [inboxLoading, setInboxLoading]     = useState(true);
  const [inboxRefreshing, setInboxRefreshing] = useState(false);

  // Sent state
  const [sent, setSent]           = useState<SentNotif[]>([]);
  const [sentLoading, setSentLoading]   = useState(false);
  const [sentRefreshing, setSentRefreshing] = useState(false);
  const [sentLoaded, setSentLoaded] = useState(false);

  // All (admin only) state
  const [all, setAll]             = useState<AllNotif[]>([]);
  const [allLoading, setAllLoading]   = useState(false);
  const [allRefreshing, setAllRefreshing] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);

  // Detail modal
  const [selected, setSelected] = useState<Receipt | null>(null);

  // Load inbox
  const loadInbox = useCallback(async () => {
    try {
      // The full history, not the bell's queue: clearing the badge marks
      // receipts `isCleared`, which drops them from /inbox but not from here.
      const [inboxRes, countRes]: [any, any] = await Promise.all([
        notifApi.getAllNotifs(),
        notifApi.getUnreadCount(),
      ]);
      const data = (inboxRes as any)?.data ?? inboxRes ?? [];
      setInbox(Array.isArray(data) ? data : data.receipts ?? data.items ?? []);
      setUnreadCount((countRes as any)?.count ?? 0);
    } catch { /* empty */ }
    finally { setInboxLoading(false); setInboxRefreshing(false); }
  }, []);

  // Load sent
  const loadSent = useCallback(async () => {
    setSentLoading(true);
    try {
      const res: any = await notifApi.getSent();
      const data = (res as any)?.data ?? res ?? [];
      setSent(Array.isArray(data) ? data : []);
      setSentLoaded(true);
    } catch { /* empty */ }
    finally { setSentLoading(false); setSentRefreshing(false); }
  }, []);

  // Load all (admin)
  const loadAll = useCallback(async () => {
    setAllLoading(true);
    try {
      const res: any = await adminApi.getNotifications();
      const data = (res as any)?.data ?? res ?? [];
      setAll(Array.isArray(data) ? data : []);
      setAllLoaded(true);
    } catch { /* empty */ }
    finally { setAllLoading(false); setAllRefreshing(false); }
  }, []);

  useEffect(() => { loadInbox(); }, [loadInbox]);

  useEffect(() => {
    if (tab === 'sent' && !sentLoaded) loadSent();
    if (tab === 'all'  && !allLoaded)  loadAll();
  }, [tab]);

  const onRefreshInbox = () => { setInboxRefreshing(true); loadInbox(); };
  const onRefreshSent  = () => { setSentRefreshing(true); loadSent(); };
  const onRefreshAll   = () => { setAllRefreshing(true); loadAll(); };

  // Actions
  const handleMarkOneRead = async (receiptId: string) => {
    try {
      await notifApi.markOneRead(receiptId);
      setInbox(prev => prev.map(r => r._id === receiptId ? { ...r, isRead: true } : r));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* empty */ }
  };

  const handleClearOne = (receiptId: string) => {
    Alert.alert(
      'Dismiss notification',
      'This removes it from your unread badge. It stays on this page.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dismiss',
          onPress: async () => {
            try {
              await notifApi.clearOne(receiptId);
              const dismissed = inbox.find(r => r._id === receiptId);
              // Marked read rather than removed: the row is history now.
              setInbox(prev => prev.map(r => (r._id === receiptId ? { ...r, isRead: true } : r)));
              if (dismissed && !dismissed.isRead) setUnreadCount(prev => Math.max(0, prev - 1));
              if (selected?._id === receiptId) setSelected(null);
            } catch { /* empty */ }
          },
        },
      ],
    );
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear notification badge',
      'This clears the unread badge. Your notifications stay on this page.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          onPress: async () => {
            try {
              await notifApi.clearAll();
              // The badge goes; the list does not — this screen is the record.
              setUnreadCount(0);
              setInbox((prev) => prev.map((r) => ({ ...r, isRead: true })));
            } catch { /* empty */ }
          },
        },
      ],
    );
  };

  const openDetail = (receipt: Receipt) => {
    if (!receipt.isRead) handleMarkOneRead(receipt._id);
    // Straight to what it is about when the notification names a destination;
    // otherwise its body is all there is, so show that.
    if (hasTarget(receipt)) router.push(notificationPath(receipt) as any);
    else setSelected(receipt);
  };

  // Arriving with ?receipt= opens that one, once the list has actually loaded.
  const openedFromLink = useRef<string | null>(null);
  useEffect(() => {
    if (!openReceiptId || inboxLoading || openedFromLink.current === openReceiptId) return;
    const r = inbox.find(x => x._id === openReceiptId);
    if (!r) return;
    openedFromLink.current = String(openReceiptId);
    openDetail(r);
  }, [openReceiptId, inboxLoading, inbox]);

  // Tab list
  const tabs: { key: TabType; label: string }[] = [
    { key: 'inbox', label: 'Inbox' },
    ...(canSeeSent ? [{ key: 'sent' as TabType, label: 'Sent' }] : []),
    ...(isAdmin    ? [{ key: 'all'  as TabType, label: 'All Notifications' }] : []),
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 8, marginRight: 4 }}>
              {tab === 'inbox' && inbox.length > 0 && (
                <TouchableOpacity onPress={handleClearAll} style={hdr.btn}>
                  <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          ),
        }}
      />

      <View style={s.root}>
        {/* Tab bar */}
        {tabs.length > 1 && (
          <View style={s.tabBar}>
            {tabs.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[s.tabBtn, tab === t.key && s.tabBtnActive]}
                onPress={() => setTab(t.key)}
                activeOpacity={0.75}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
                  {t.key === 'inbox' && unreadCount > 0 && (
                    <View style={s.badge}>
                      <Text style={s.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── INBOX ── */}
        {tab === 'inbox' && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={inboxRefreshing} onRefresh={onRefreshInbox} tintColor={Colors.primary} />}
          >
            {inboxLoading ? (
              <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
            ) : inbox.length === 0 ? (
              <EmptyState icon="notifications-off-outline" title="You're all caught up!" sub="No notifications right now." />
            ) : (
              inbox.map((receipt) => {
                if (!receipt.notification) return null;
                return (
                  <ReceiptCard
                    key={receipt._id}
                    receipt={receipt}
                    onPress={() => openDetail(receipt)}
                    onClear={() => handleClearOne(receipt._id)}
                  />
                );
              })
            )}
          </ScrollView>
        )}

        {/* ── SENT ── */}
        {tab === 'sent' && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={sentRefreshing} onRefresh={onRefreshSent} tintColor={Colors.primary} />}
          >
            {sentLoading ? (
              <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
            ) : sent.length === 0 ? (
              <EmptyState icon="paper-plane-outline" title="No sent notifications" sub="Notifications you send will appear here." />
            ) : (
              sent.map((n) => <SentCard key={n._id} notif={n} />)
            )}
          </ScrollView>
        )}

        {/* ── ALL (admin) ── */}
        {tab === 'all' && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={allRefreshing} onRefresh={onRefreshAll} tintColor={Colors.primary} />}
          >
            {allLoading ? (
              <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
            ) : all.length === 0 ? (
              <EmptyState icon="newspaper-outline" title="No notifications yet" sub="All school notifications will appear here." />
            ) : (
              all.map((n) => <AllCard key={n._id} notif={n} />)
            )}
          </ScrollView>
        )}

        {/* FAB */}
        {canSend && (
          <TouchableOpacity
            style={s.fab}
            onPress={() => router.push('/modules/send-notification' as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={26} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Detail modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <Pressable style={s.overlay} onPress={() => setSelected(null)} />
        {selected?.notification && (
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <View style={s.sheetIconBox}>
                <Ionicons
                  name={selected.notification.senderRole === 'teacher' ? 'person' : selected.notification.senderRole?.includes('admin') ? 'shield' : 'notifications'}
                  size={22} color={Colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetTitle}>{selected.notification.title}</Text>
                <Text style={s.sheetMeta}>
                  From: {ROLE_LABEL[selected.notification.senderRole] ?? selected.notification.senderRole}
                  {'  ·  '}{fullDate(selected.notification.createdAt ?? selected.createdAt)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelected(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ paddingHorizontal: Spacing.md }} showsVerticalScrollIndicator={false}>
              <Text style={s.sheetBody}>{selected.notification.body}</Text>
            </ScrollView>
            <TouchableOpacity
              style={s.sheetRemoveBtn}
              onPress={() => { setSelected(null); handleClearOne(selected._id); }}
            >
              <Ionicons name="trash-outline" size={15} color={Colors.danger} />
              <Text style={s.sheetRemoveText}>Dismiss from badge</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ReceiptCard({ receipt, onPress, onClear }: { receipt: Receipt; onPress: () => void; onClear: () => void }) {
  const { notification: n, isRead } = receipt;
  if (!n) return null;

  return (
    <TouchableOpacity style={[rc.card, !isRead && rc.cardUnread]} onPress={onPress} activeOpacity={0.8}>
      {!isRead && <View style={rc.dot} />}
      <View style={rc.iconBox}>
        <Ionicons
          name={n.senderRole === 'teacher' ? 'person' : n.senderRole?.includes('admin') ? 'shield' : 'notifications'}
          size={18} color={Colors.primary}
        />
      </View>
      <View style={rc.body}>
        <View style={rc.row}>
          <Text style={[rc.title, !isRead && rc.titleUnread]} numberOfLines={1}>{n.title}</Text>
          <Text style={rc.time}>{timeAgo(n.createdAt ?? receipt.createdAt)}</Text>
        </View>
        <Text style={rc.bodyText} numberOfLines={2}>{n.body}</Text>
        <View style={rc.footer}>
          <View style={rc.senderPill}>
            <Text style={rc.senderText}>From: {ROLE_LABEL[n.senderRole] ?? n.senderRole}</Text>
          </View>
          <Text style={rc.tapHint}>{hasTarget(receipt) ? 'Tap to open ›' : 'Tap to read ›'}</Text>
        </View>
      </View>
      <TouchableOpacity onPress={onClear} style={rc.clearBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={16} color={Colors.textLight} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function SentCard({ notif }: { notif: SentNotif }) {
  const targetLabel = TARGET_LABEL[notif.target?.type] ?? notif.target?.type ?? '—';
  return (
    <View style={sc.card}>
      <View style={sc.top}>
        <Text style={sc.title} numberOfLines={1}>{notif.title}</Text>
        <Text style={sc.time}>{timeAgo(notif.createdAt)}</Text>
      </View>
      <Text style={sc.body}>{notif.body}</Text>
      <View style={sc.footer}>
        <View style={sc.pill}>
          <Ionicons name="people-outline" size={11} color={Colors.primary} />
          <Text style={sc.pillText}>{targetLabel}</Text>
        </View>
        {notif.recipientCount > 0 && (
          <View style={[sc.pill, { backgroundColor: Colors.successLight }]}>
            <Ionicons name="checkmark-done" size={11} color={Colors.success} />
            <Text style={[sc.pillText, { color: Colors.success }]}>{notif.recipientCount} recipients</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function AllCard({ notif }: { notif: AllNotif }) {
  const [expanded, setExpanded] = useState(false);
  const senderName  = notif.sender?.name ?? 'Unknown';
  const senderRole  = ROLE_LABEL[notif.senderRole] ?? notif.senderRole;
  const targetLabel = TARGET_LABEL[notif.target?.type] ?? notif.target?.type ?? '—';

  return (
    <TouchableOpacity style={ac.card} onPress={() => setExpanded(e => !e)} activeOpacity={0.85}>
      {/* Title row */}
      <View style={ac.topRow}>
        <View style={ac.iconBox}>
          <Ionicons
            name={notif.senderRole === 'teacher' ? 'person' : notif.senderRole?.includes('admin') ? 'shield' : 'notifications'}
            size={16} color={Colors.primary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={ac.title} numberOfLines={expanded ? undefined : 1}>{notif.title}</Text>
          <Text style={ac.date}>{fullDate(notif.createdAt)}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
      </View>

      {/* Meta pills */}
      <View style={ac.pills}>
        <View style={ac.pill}>
          <Ionicons name="person-outline" size={11} color={Colors.primary} />
          <Text style={ac.pillText}>{senderName} ({senderRole})</Text>
        </View>
        <View style={[ac.pill, { backgroundColor: Colors.surfaceAlt }]}>
          <Ionicons name="people-outline" size={11} color={Colors.textSecondary} />
          <Text style={[ac.pillText, { color: Colors.textSecondary }]}>{targetLabel}</Text>
        </View>
        {notif.recipientCount > 0 && (
          <View style={[ac.pill, { backgroundColor: Colors.successLight }]}>
            <Ionicons name="checkmark-done" size={11} color={Colors.success} />
            <Text style={[ac.pillText, { color: Colors.success }]}>{notif.recipientCount} sent</Text>
          </View>
        )}
      </View>

      {/* Body — shown when expanded */}
      {expanded && (
        <View style={ac.bodyBox}>
          <Text style={ac.body}>{notif.body}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function EmptyState({ icon, title, sub }: { icon: any; title: string; sub: string }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIconBox}>
        <Ionicons name={icon} size={36} color={Colors.textLight} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptySub}>{sub}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const hdr = StyleSheet.create({
  btn: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', paddingTop: 80 },
  tabBar: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  tabBtn: {
    paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent', marginRight: 16,
  },
  tabBtnActive: { borderBottomColor: Colors.primary },
  tabText: { ...Typography.label, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary },
  badge: {
    backgroundColor: Colors.danger, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  fab: {
    position: 'absolute', bottom: 28, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIconBox: {
    width: 72, height: 72, borderRadius: Radius.xl,
    backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyTitle: { ...Typography.h4, color: Colors.textSecondary },
  emptySub: { ...Typography.body, color: Colors.textLight, textAlign: 'center' },
  // Detail modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 32, maxHeight: '75%',
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: Spacing.md, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  sheetIconBox: {
    width: 42, height: 42, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  sheetTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  sheetMeta: { fontSize: 11, color: Colors.textSecondary },
  sheetBody: { fontSize: 14, color: Colors.text, lineHeight: 22, paddingTop: 16, paddingBottom: 16 },
  sheetRemoveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: Spacing.md, marginTop: 8,
    paddingVertical: 12, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.dangerLight, backgroundColor: Colors.dangerLight,
  },
  sheetRemoveText: { fontSize: 13, fontWeight: '600', color: Colors.danger },
});

const rc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.sm + 2, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
    position: 'relative', overflow: 'hidden',
  },
  cardUnread: { borderColor: Colors.primary + '40', backgroundColor: '#F0F4FF' },
  dot: {
    position: 'absolute', top: 14, left: 8,
    width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.primary,
  },
  iconBox: {
    width: 36, height: 36, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    marginRight: 10, marginLeft: 8, flexShrink: 0,
  },
  body: { flex: 1, paddingRight: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 3 },
  title: { flex: 1, fontSize: 13, fontWeight: '500', color: Colors.text, marginRight: 6 },
  titleUnread: { fontWeight: '700' },
  time: { fontSize: 10, color: Colors.textLight, flexShrink: 0 },
  bodyText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  senderPill: {
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  senderText: { fontSize: 10, color: Colors.textSecondary, fontWeight: '500' },
  tapHint: { fontSize: 10, color: Colors.primary, fontWeight: '500' },
  clearBtn: { padding: 4, alignSelf: 'flex-start', marginLeft: 4 },
});

const sc = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  title: { flex: 1, ...Typography.label, color: Colors.text, marginRight: 8 },
  time: { fontSize: 10, color: Colors.textLight },
  body: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 8 },
  footer: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.full,
    paddingHorizontal: 9, paddingVertical: 3,
  },
  pillText: { fontSize: 10, fontWeight: '600', color: Colors.primary },
});

const ac = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  iconBox: {
    width: 32, height: 32, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  title: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  date: { fontSize: 10, color: Colors.textLight },
  pills: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 4 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primaryLight + '18', borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  pillText: { fontSize: 10, fontWeight: '600', color: Colors.primary },
  bodyBox: {
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  body: { fontSize: 13, color: Colors.text, lineHeight: 20 },
});
