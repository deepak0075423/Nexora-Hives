import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  RefreshControl, TouchableOpacity, Alert, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import * as notifApi from '@/api/notifications.api';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  teacher: 'Teacher', school_admin: 'Admin', admin: 'Admin',
  super_admin: 'Super Admin', 'super-admin': 'Super Admin',
  student: 'Student', parent: 'Parent',
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
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const CAN_SEND = ['teacher', 'admin', 'super-admin'] as const;

// ── Screen ────────────────────────────────────────────────────────────────────

export default function NotificationsTab() {
  const { user }  = useAuth();
  const { lastEventAt } = useNotifications();
  const insets    = useSafeAreaInsets();
  const router    = useRouter();
  const role      = user?.role ?? 'student';
  const canSend   = (CAN_SEND as readonly string[]).includes(role);

  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox');

  // Inbox state
  const [inbox, setInbox]             = useState<Receipt[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  // Sent state
  const [sent, setSent]               = useState<SentNotif[]>([]);
  const [sentLoading, setSentLoading] = useState(false);
  const [sentLoaded, setSentLoaded]   = useState(false);
  const [sentRefreshing, setSentRefreshing] = useState(false);

  // Detail modal
  const [selected, setSelected] = useState<Receipt | null>(null);

  const loadInbox = useCallback(async () => {
    try {
      const [inboxRes, countRes]: [any, any] = await Promise.all([
        notifApi.getInbox(),
        notifApi.getUnreadCount(),
      ]);
      const data = (inboxRes as any)?.data ?? inboxRes ?? [];
      setInbox(Array.isArray(data) ? data : data.receipts ?? data.items ?? []);
      setUnreadCount((countRes as any)?.count ?? 0);
    } catch { /* empty */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

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

  useEffect(() => { loadInbox(); }, [loadInbox]);

  // Real-time: reload when a notification arrives over the socket
  useEffect(() => {
    if (lastEventAt) loadInbox();
  }, [lastEventAt, loadInbox]);

  useEffect(() => {
    if (tab === 'sent' && !sentLoaded) loadSent();
  }, [tab]);

  const onRefreshInbox = () => { setRefreshing(true); loadInbox(); };
  const onRefreshSent  = () => { setSentRefreshing(true); loadSent(); };

  const handleMarkOneRead = async (id: string) => {
    try {
      await notifApi.markOneRead(id);
      setInbox(prev => prev.map(r => r._id === id ? { ...r, isRead: true } : r));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* empty */ }
  };

  const handleClearOne = (id: string) => {
    Alert.alert('Remove', 'Remove this notification?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await notifApi.clearOne(id);
            const r = inbox.find(x => x._id === id);
            setInbox(prev => prev.filter(x => x._id !== id));
            if (r && !r.isRead) setUnreadCount(prev => Math.max(0, prev - 1));
            if (selected?._id === id) setSelected(null);
          } catch { /* empty */ }
        },
      },
    ]);
  };

  const openDetail = (receipt: Receipt) => {
    if (!receipt.isRead) handleMarkOneRead(receipt._id);
    setSelected(receipt);
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Notifications</Text>
          {tab === 'inbox' && unreadCount > 0 && (
            <Text style={s.sub}>{unreadCount} unread</Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {canSend && (
            <TouchableOpacity
              style={[s.headerBtn, { backgroundColor: Colors.primary }]}
              onPress={() => router.push('/modules/send-notification' as any)}
            >
              <Ionicons name="paper-plane" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tab bar — only show if user can send (has sent tab) */}
      {canSend && (
        <View style={s.tabBar}>
          <TouchableOpacity
            style={[s.tabBtn, tab === 'inbox' && s.tabBtnActive]}
            onPress={() => setTab('inbox')}
          >
            <Text style={[s.tabText, tab === 'inbox' && s.tabTextActive]}>Inbox</Text>
            {unreadCount > 0 && tab !== 'inbox' && (
              <View style={s.tabBadge}><Text style={s.tabBadgeText}>{unreadCount}</Text></View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabBtn, tab === 'sent' && s.tabBtnActive]}
            onPress={() => setTab('sent')}
          >
            <Text style={[s.tabText, tab === 'sent' && s.tabTextActive]}>Sent</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Inbox */}
      {tab === 'inbox' && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefreshInbox} tintColor={Colors.primary} />}
          contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingTop: 8, paddingBottom: 100 }}
        >
          {loading ? (
            <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
          ) : inbox.length === 0 ? (
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Ionicons name="notifications-off-outline" size={36} color={Colors.textLight} />
              </View>
              <Text style={s.emptyTitle}>You're all caught up!</Text>
              <Text style={s.emptySub}>No new notifications.</Text>
            </View>
          ) : (
            inbox.map((receipt) => {
              if (!receipt.notification) return null;
              const n = receipt.notification;
              return (
                <TouchableOpacity
                  key={receipt._id}
                  style={[s.card, !receipt.isRead && s.cardUnread]}
                  onPress={() => openDetail(receipt)}
                  activeOpacity={0.8}
                >
                  {!receipt.isRead && <View style={s.dot} />}
                  <View style={s.iconBox}>
                    <Ionicons
                      name={n.senderRole === 'teacher' ? 'person' : n.senderRole?.includes('admin') ? 'shield' : 'notifications'}
                      size={18}
                      color={Colors.primary}
                    />
                  </View>
                  <View style={s.body}>
                    <View style={s.row}>
                      <Text style={[s.cardTitle, !receipt.isRead && s.cardTitleUnread]} numberOfLines={1}>
                        {n.title}
                      </Text>
                      <Text style={s.cardTime}>{timeAgo(n.createdAt ?? receipt.createdAt)}</Text>
                    </View>
                    <Text style={s.cardBody} numberOfLines={2}>{n.body}</Text>
                    <View style={s.cardFooter}>
                      <View style={s.senderPill}>
                        <Text style={s.senderText}>From: {ROLE_LABEL[n.senderRole] ?? n.senderRole}</Text>
                      </View>
                      <Text style={s.tapHint}>Tap to read</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleClearOne(receipt._id)}
                    style={s.closeBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={15} color={Colors.textLight} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Sent */}
      {tab === 'sent' && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={sentRefreshing} onRefresh={onRefreshSent} tintColor={Colors.primary} />}
          contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingTop: 8, paddingBottom: 100 }}
        >
          {sentLoading ? (
            <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
          ) : sent.length === 0 ? (
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Ionicons name="paper-plane-outline" size={36} color={Colors.textLight} />
              </View>
              <Text style={s.emptyTitle}>No sent notifications</Text>
              <Text style={s.emptySub}>Notifications you send will appear here.</Text>
            </View>
          ) : (
            sent.map((n) => (
              <View key={n._id} style={s.sentCard}>
                <View style={s.sentTop}>
                  <Text style={s.sentTitle} numberOfLines={1}>{n.title}</Text>
                  <Text style={s.cardTime}>{timeAgo(n.createdAt)}</Text>
                </View>
                <Text style={s.sentBody}>{n.body}</Text>
                <View style={s.sentPills}>
                  <View style={s.pill}>
                    <Ionicons name="people-outline" size={11} color={Colors.primary} />
                    <Text style={s.pillText}>{TARGET_LABEL[n.target?.type] ?? n.target?.type}</Text>
                  </View>
                  {n.recipientCount > 0 && (
                    <View style={[s.pill, { backgroundColor: Colors.successLight }]}>
                      <Ionicons name="checkmark-done" size={11} color={Colors.success} />
                      <Text style={[s.pillText, { color: Colors.success }]}>{n.recipientCount} sent</Text>
                    </View>
                  )}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Detail modal */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={s.overlay} onPress={() => setSelected(null)} />
        {selected?.notification && (
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <View style={s.sheetIconBox}>
                <Ionicons
                  name={selected.notification.senderRole === 'teacher' ? 'person' : selected.notification.senderRole?.includes('admin') ? 'shield' : 'notifications'}
                  size={22}
                  color={Colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetTitle}>{selected.notification.title}</Text>
                <Text style={s.sheetMeta}>
                  From: {ROLE_LABEL[selected.notification.senderRole] ?? selected.notification.senderRole}
                  {'  ·  '}{timeAgo(selected.notification.createdAt ?? selected.createdAt)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelected(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={s.sheetScroll} showsVerticalScrollIndicator={false}>
              <Text style={s.sheetBody}>{selected.notification.body}</Text>
            </ScrollView>
            <TouchableOpacity
              style={s.sheetRemoveBtn}
              onPress={() => { setSelected(null); handleClearOne(selected._id); }}
            >
              <Ionicons name="trash-outline" size={15} color={Colors.danger} />
              <Text style={s.sheetRemoveText}>Remove from inbox</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  title: { ...Typography.h3, color: Colors.text },
  sub: { fontSize: 11, color: Colors.primary, fontWeight: '500', marginTop: 1 },
  headerBtn: {
    width: 34, height: 34, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  tabBar: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  tabBtn: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 6,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: Colors.primary },
  tabText: { ...Typography.label, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary },
  tabBadge: {
    backgroundColor: Colors.danger, borderRadius: 10,
    paddingHorizontal: 5, paddingVertical: 1, minWidth: 18, alignItems: 'center',
  },
  tabBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  center: { alignItems: 'center', paddingTop: 80 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: Radius.xl,
    backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyTitle: { ...Typography.h4, color: Colors.textSecondary },
  emptySub: { ...Typography.body, color: Colors.textLight },
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
  cardTitle: { flex: 1, fontSize: 13, fontWeight: '500', color: Colors.text, marginRight: 6 },
  cardTitleUnread: { fontWeight: '700' },
  cardBody: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  cardTime: { fontSize: 10, color: Colors.textLight, flexShrink: 0 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  senderPill: {
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  senderText: { fontSize: 10, color: Colors.textSecondary, fontWeight: '500' },
  tapHint: { fontSize: 10, color: Colors.primary, fontWeight: '500' },
  closeBtn: { padding: 4, alignSelf: 'flex-start', marginLeft: 4 },

  // Sent tab
  sentCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  sentTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  sentTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.text, marginRight: 8 },
  sentBody: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 8 },
  sentPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surfaceAlt, borderRadius: Radius.full,
    paddingHorizontal: 9, paddingVertical: 3,
  },
  pillText: { fontSize: 10, fontWeight: '600', color: Colors.primary },

  // Detail modal
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
  },
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
  sheetScroll: { paddingHorizontal: Spacing.md, paddingTop: 16 },
  sheetBody: { fontSize: 14, color: Colors.text, lineHeight: 22, paddingBottom: 16 },
  sheetRemoveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: Spacing.md, marginTop: 8,
    paddingVertical: 12, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.dangerLight, backgroundColor: Colors.dangerLight,
  },
  sheetRemoveText: { fontSize: 13, fontWeight: '600', color: Colors.danger },
});
