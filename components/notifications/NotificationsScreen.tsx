import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl,
  TouchableOpacity, Alert, Modal, Pressable, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import * as notifApi from '@/api/notifications.api';
import { notificationPath, hasTarget } from '@/utils/notificationLink';
import {
  FilterChips, KINDS, NotifRow, PRIORITIES, READ_STATES, SORTS, TARGET_LABEL,
  type Receipt, fullWhen, moduleIcon, plain, timeAgo,
} from './parts';

/**
 * Notifications — one screen, every role, both routes.
 *
 * A mailbox in three boxes: **Inbox** is everything that has reached this
 * account and not been put away, **Archived** is what has, and **Sent** is what
 * this account has sent. The mobile half of
 * school-frontend/src/pages/shared/Notifications.jsx, and the same decisions:
 *
 *  • Every filter is a server parameter. An account a year old has thousands of
 *    receipts, and narrowing only the twenty already fetched answers a
 *    different question than the one asked.
 *  • Sending is the only structural difference between roles — a student has no
 *    way to send one, so they get no Sent tab to leave empty.
 *  • Delete removes this reader's receipt, never the notification, which is one
 *    row shared with everybody else who received it.
 *
 * Rendered by both `app/(tabs)/notifications.tsx` and `app/modules/alerts.tsx`,
 * which were two near-identical screens before this.
 */

type Box = 'inbox' | 'sent' | 'archived';

const CAN_SEND = ['teacher', 'admin', 'super-admin'];

const EMPTY_FILTERS = { module: '', priority: '', kind: '', read: '', sort: 'newest' };

export default function NotificationsScreen() {
  const { user } = useAuth();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { refreshUnread, lastEventAt } = useNotifications();

  const role    = String(user?.role ?? 'student');
  const canSend = CAN_SEND.includes(role);

  const [tab,     setTab]     = useState<Box>('inbox');
  const [rows,    setRows]    = useState<Receipt[]>([]);
  const [sent,    setSent]    = useState<any[]>([]);
  const [boxes,   setBoxes]   = useState({ inbox: 0, unread: 0, archived: 0, sent: 0 });
  const [modules, setModules] = useState<{ value: string; label: string }[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy,       setBusy]       = useState(false);

  const [search,  setSearch]  = useState('');
  const [term,    setTerm]    = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [selecting, setSelecting] = useState(false);
  const [picked,    setPicked]    = useState<string[]>([]);
  const [detail,    setDetail]    = useState<Receipt | null>(null);

  // A request per keystroke is a request per keystroke; wait for a pause.
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const isSent = tab === 'sent';
  const activeFilters = useMemo(
    () => Object.keys(EMPTY_FILTERS).filter(
      (k) => (filters as any)[k] !== (EMPTY_FILTERS as any)[k]).length,
    [filters],
  );

  const load = useCallback(async () => {
    try {
      if (isSent) {
        const res: any = await notifApi.getSent({ q: term || undefined, limit: 30 });
        setSent(Array.isArray(res?.data) ? res.data : []);
        return;
      }
      const res: any = await notifApi.getAllNotifs({
        box: tab, q: term || undefined, limit: 30,
        module:   filters.module   || undefined,
        priority: filters.priority || undefined,
        kind:     filters.kind     || undefined,
        read:     filters.read     || undefined,
        sort:     filters.sort,
      });
      setRows(Array.isArray(res?.data) ? res.data : []);
      // Counted over the whole mailbox, never the filter, so a search does not
      // make "Inbox 3" drop to zero.
      if (res?.boxes) setBoxes(res.boxes);
      if (res?.modules?.length) setModules(res.modules);
    } catch { /* the screen keeps what it had */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [isSent, tab, term, filters]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // A notification arriving while this screen is open belongs at the top of it,
  // not behind a pull-to-refresh. `lastEventAt` bumps on every live event.
  useEffect(() => { if (lastEventAt) load(); }, [lastEventAt, load]);

  const onRefresh = () => { setRefreshing(true); load(); refreshUnread(); };

  // ── Opening one ────────────────────────────────────────────────────────────
  const openRow = useCallback(async (r: Receipt) => {
    if (!r.isRead) {
      try { await notifApi.markOneRead(r._id); refreshUnread(); } catch { /* it still opens */ }
    }
    // A notification that names a destination goes there; one whose body is the
    // whole point opens in the sheet.
    if (hasTarget(r.link)) {
      const path = notificationPath(r.link);
      if (path) { router.push(path as any); return; }
    }
    setDetail({ ...r, isRead: true });
    load();
  }, [router, load, refreshUnread]);

  // ── Acting on several ──────────────────────────────────────────────────────
  const startSelecting = (r: Receipt) => { setSelecting(true); setPicked([r._id]); };
  const toggle = (r: Receipt) =>
    setPicked((p) => (p.includes(r._id) ? p.filter((x) => x !== r._id) : [...p, r._id]));
  const stopSelecting = () => { setSelecting(false); setPicked([]); };

  const runBulk = async (action: string) => {
    if (!picked.length) return;
    setBusy(true);
    try {
      await notifApi.bulkNotifications(picked, action);
      stopSelecting(); setDetail(null); load(); refreshUnread();
    } catch (e: any) { Alert.alert('That did not work', e?.message ?? 'Please try again.'); }
    finally { setBusy(false); }
  };

  const confirmDeleteSelected = () => Alert.alert(
    `Delete ${picked.length} notification${picked.length === 1 ? '' : 's'}?`,
    'They will be removed from your list permanently. Archiving keeps them instead.',
    [{ text: 'Cancel', style: 'cancel' },
     { text: 'Delete', style: 'destructive', onPress: () => runBulk('delete') }],
  );

  const confirmDeleteAll = () => {
    const n = tab === 'archived' ? boxes.archived : boxes.inbox;
    Alert.alert(
      tab === 'archived' ? 'Empty the archive?' : 'Delete every notification in your inbox?',
      `All ${n} will be removed permanently — including any you have not read. This cannot be undone.`,
      [{ text: 'Cancel', style: 'cancel' }, {
        text: `Delete all ${n}`, style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await notifApi.deleteAllNotifications(tab === 'archived' ? 'archived' : 'inbox');
            stopSelecting(); setDetail(null); load(); refreshUnread();
          } catch (e: any) { Alert.alert('That did not work', e?.message ?? 'Please try again.'); }
          finally { setBusy(false); }
        },
      }],
    );
  };

  const markEverything = async () => {
    try { await notifApi.markAllRead(); load(); refreshUnread(); }
    catch (e: any) { Alert.alert('That did not work', e?.message ?? 'Please try again.'); }
  };

  const sweepRead = async () => {
    try { await notifApi.archiveRead(); load(); refreshUnread(); }
    catch (e: any) { Alert.alert('That did not work', e?.message ?? 'Please try again.'); }
  };

  const oneAction = async (r: Receipt, action: string) => {
    setBusy(true);
    try {
      await notifApi.bulkNotifications([r._id], action);
      setDetail(null); load(); refreshUnread();
    } catch (e: any) { Alert.alert('That did not work', e?.message ?? 'Please try again.'); }
    finally { setBusy(false); }
  };

  // ── Arriving from a push or a deep link ────────────────────────────────────
  // /n/:id sends readers here with ?receipt= when a notification has nowhere
  // more specific to go, so it opens on itself instead of a bare list.
  const { receipt: openReceiptId } = useLocalSearchParams<{ receipt?: string }>();
  const [handled, setHandled] = useState<string | null>(null);
  useEffect(() => {
    if (!openReceiptId || loading || handled === String(openReceiptId)) return;
    setHandled(String(openReceiptId));
    const hit = rows.find((r) => String(r._id) === String(openReceiptId));
    if (hit) { openRow(hit); return; }
    // Behind a filter or further down the list — fetch that one on its own
    // rather than leaving the reader on a list with no sign of what they tapped.
    notifApi.resolveNotification(String(openReceiptId))
      .then((res: any) => { if (res?.data) setDetail(res.data); load(); })
      .catch(() => { /* it simply does not open */ });
  }, [openReceiptId, loading, rows, handled, openRow, load]);

  const TABS: { key: Box; label: string; count: number; accent?: boolean }[] = [
    { key: 'inbox',    label: 'Inbox',    count: boxes.unread, accent: true },
    ...(canSend ? [{ key: 'sent' as Box, label: 'Sent', count: boxes.sent }] : []),
    { key: 'archived', label: 'Archived', count: boxes.archived },
  ];

  const anyFilter = !!term || activeFilters > 0;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.h1}>{selecting ? `${picked.length} selected` : 'Notifications'}</Text>
          {!selecting && boxes.unread > 0 && <Text style={s.sub}>{boxes.unread} unread</Text>}
        </View>

        {selecting ? (
          <View style={s.headActions}>
            <TouchableOpacity style={s.iconBtn} disabled={busy} onPress={() => runBulk('read')}>
              <Ionicons name="checkmark-done-outline" size={18} color={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={s.iconBtn} disabled={busy}
              onPress={() => runBulk(tab === 'archived' ? 'restore' : 'archive')}>
              <Ionicons name={tab === 'archived' ? 'mail-open-outline' : 'file-tray-full-outline'}
                size={18} color={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.iconBtn, s.iconBtnDanger]} disabled={busy}
              onPress={confirmDeleteSelected}>
              <Ionicons name="trash-outline" size={18} color={Colors.danger} />
            </TouchableOpacity>
            <TouchableOpacity style={s.iconBtn} onPress={stopSelecting}>
              <Ionicons name="close" size={18} color={Colors.text} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.headActions}>
            {tab === 'inbox' && boxes.unread > 0 && (
              <TouchableOpacity style={s.iconBtn} onPress={markEverything}>
                <Ionicons name="checkmark-done-outline" size={18} color={Colors.text} />
              </TouchableOpacity>
            )}
            {tab === 'inbox' && boxes.inbox > boxes.unread && (
              <TouchableOpacity style={s.iconBtn} onPress={sweepRead}>
                <Ionicons name="file-tray-full-outline" size={18} color={Colors.text} />
              </TouchableOpacity>
            )}
            {tab !== 'sent' && (tab === 'archived' ? boxes.archived : boxes.inbox) > 0 && (
              <TouchableOpacity style={[s.iconBtn, s.iconBtnDanger]} onPress={confirmDeleteAll}>
                <Ionicons name="trash-outline" size={18} color={Colors.danger} />
              </TouchableOpacity>
            )}
            {canSend && (
              <TouchableOpacity style={[s.iconBtn, { backgroundColor: Colors.primary }]}
                onPress={() => router.push('/modules/send-notification' as any)}>
                <Ionicons name="paper-plane" size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Boxes */}
      <View style={s.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[s.tabBtn, tab === t.key && s.tabBtnOn]}
            onPress={() => { setTab(t.key); stopSelecting(); }}>
            <Text style={[s.tabText, tab === t.key && s.tabTextOn]}>{t.label}</Text>
            {t.count > 0 && (
              <View style={[s.tabBadge, t.accent && s.tabBadgeAccent]}>
                <Text style={[s.tabBadgeText, t.accent && { color: '#fff' }]}>{t.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Search + filters */}
      <View style={s.tools}>
        <View style={s.searchBox}>
          <Ionicons name="search" size={15} color={Colors.textLight} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={isSent ? 'Search what you have sent…' : 'Search notifications…'}
            placeholderTextColor={Colors.textLight}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={Colors.textLight} />
            </TouchableOpacity>
          )}
        </View>
        {!isSent && (
          <TouchableOpacity style={[s.filterBtn, activeFilters > 0 && s.filterBtnOn]}
            onPress={() => setSheetOpen(true)}>
            <Ionicons name="options-outline" size={17}
              color={activeFilters > 0 ? '#fff' : Colors.text} />
            {activeFilters > 0 && <Text style={s.filterCount}>{activeFilters}</Text>}
          </TouchableOpacity>
        )}
      </View>

      {/* The list */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingTop: 4, paddingBottom: 110 }}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : isSent ? (
          sent.length === 0 ? (
            <Empty icon="paper-plane-outline" title={anyFilter ? 'Nothing matches that' : 'You have not sent anything yet'}
              sub={anyFilter ? 'Try another search term.' : 'Notifications you send are listed here.'} />
          ) : sent.map((n) => (
            <View key={n._id} style={s.sentCard}>
              <Text style={s.title} numberOfLines={1}>{plain(n.title)}</Text>
              {!!n.body && <Text style={s.body} numberOfLines={2}>{plain(n.body)}</Text>}
              <View style={s.sentMeta}>
                <Text style={s.metaText}>{TARGET_LABEL[n.target?.type] || n.target?.type || '—'}</Text>
                <Text style={s.metaDot}>•</Text>
                <Text style={s.metaText}>{n.recipientCount} recipient{n.recipientCount === 1 ? '' : 's'}</Text>
                <Text style={s.metaDot}>•</Text>
                <Text style={s.metaText}>{timeAgo(n.createdAt)}</Text>
              </View>
              {/* The figure that matters about a broadcast: not that it went
                  out, but how much of the audience opened it. */}
              {n.delivered > 0 && (
                <View style={s.readRow}>
                  <View style={s.readTrack}>
                    <View style={[s.readFill, { width: `${Math.round((n.opened / n.delivered) * 100)}%` }]} />
                  </View>
                  <Text style={s.readText}>
                    {n.opened} of {n.delivered} opened
                  </Text>
                </View>
              )}
            </View>
          ))
        ) : rows.length === 0 ? (
          <Empty
            icon={tab === 'archived' ? 'file-tray-full-outline' : 'notifications-off-outline'}
            title={anyFilter ? 'Nothing matches those filters'
              : tab === 'archived' ? 'Nothing archived yet' : "You're all caught up!"}
            sub={anyFilter ? 'Try a different module, priority or search term.'
              : tab === 'archived' ? 'Notifications you put away move here and stay searchable.'
              : 'Anything your school sends you arrives here.'}
          />
        ) : rows.map((r) => (
          <NotifRow key={r._id} row={r}
            picked={picked.includes(r._id)} selecting={selecting}
            onOpen={openRow} onToggle={toggle} onLongPress={startSelecting} />
        ))}
      </ScrollView>

      {/* Filters */}
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={s.scrim} onPress={() => setSheetOpen(false)} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>Filter</Text>
            <TouchableOpacity onPress={() => setFilters(EMPTY_FILTERS)}>
              <Text style={s.sheetReset}>Reset</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <FilterChips label="Type" value={filters.kind} options={KINDS}
              onPick={(v) => setFilters((f) => ({ ...f, kind: v }))} />
            <FilterChips label="Module" value={filters.module} options={modules}
              onPick={(v) => setFilters((f) => ({ ...f, module: v }))} />
            <FilterChips label="Priority" value={filters.priority} options={PRIORITIES}
              onPick={(v) => setFilters((f) => ({ ...f, priority: v }))} />
            <FilterChips label="Read status" value={filters.read} options={READ_STATES}
              onPick={(v) => setFilters((f) => ({ ...f, read: v }))} />
            <FilterChips label="Sort by" value={filters.sort} options={SORTS}
              onPick={(v) => setFilters((f) => ({ ...f, sort: v || 'newest' }))} />
          </ScrollView>
          <TouchableOpacity style={s.sheetDone} onPress={() => setSheetOpen(false)}>
            <Text style={s.sheetDoneText}>Show results</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* One notification, opened */}
      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <Pressable style={s.scrim} onPress={() => setDetail(null)} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
          {detail && (
            <>
              <View style={s.detailHead}>
                <View style={s.mark}>
                  <Ionicons name={moduleIcon(detail.module?.key)} size={20} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.detailTitle}>{plain(detail.notification?.title)}</Text>
                  <Text style={s.metaText}>
                    {detail.module?.label || 'General'} · {fullWhen(detail.createdAt)}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setDetail(null)}>
                  <Ionicons name="close" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                <Text style={s.detailBody}>{plain(detail.notification?.body)}</Text>
                <Text style={[s.metaText, { marginTop: Spacing.md }]}>
                  From {detail.sender?.name || 'System'}
                </Text>
              </ScrollView>
              <View style={s.detailActions}>
                {hasTarget(detail.link) && (
                  <TouchableOpacity style={[s.detailBtn, s.detailBtnPrimary]}
                    onPress={() => {
                      const path = notificationPath(detail.link);
                      setDetail(null);
                      if (path) router.push(path as any);
                    }}>
                    <Text style={s.detailBtnPrimaryText}>Go to what it is about</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={s.detailBtn} disabled={busy}
                  onPress={() => oneAction(detail, detail.isCleared ? 'restore' : 'archive')}>
                  <Text style={s.detailBtnText}>{detail.isCleared ? 'Move to Inbox' : 'Archive'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const Empty = ({ icon, title, sub }: { icon: any; title: string; sub: string }) => (
  <View style={s.empty}>
    <View style={s.emptyIcon}><Ionicons name={icon} size={34} color={Colors.textLight} /></View>
    <Text style={s.emptyTitle}>{title}</Text>
    <Text style={s.emptySub}>{sub}</Text>
  </View>
);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  h1:  { ...Typography.h2, color: Colors.text },
  sub: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  headActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  iconBtnDanger: { borderColor: Colors.dangerLight, backgroundColor: Colors.dangerLight },

  tabBar: {
    flexDirection: 'row', gap: 6, marginHorizontal: Spacing.md, marginBottom: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, borderRadius: Radius.md,
  },
  tabBtnOn:   { backgroundColor: Colors.background },
  tabText:    { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  tabTextOn:  { color: Colors.primary, fontWeight: '700' },
  tabBadge: {
    minWidth: 20, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999,
    backgroundColor: Colors.background, alignItems: 'center',
  },
  // The unread count is the one number here that is asking for something, so
  // it is the one that is filled in.
  tabBadgeAccent: { backgroundColor: Colors.primary },
  tabBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary },

  tools: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text, padding: 0 },
  filterBtn: {
    width: 40, height: 40, borderRadius: Radius.lg, flexDirection: 'row', gap: 3,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  filterBtnOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterCount: { color: '#fff', fontSize: 11, fontWeight: '700' },

  center: { paddingVertical: 60, alignItems: 'center' },
  empty:  { alignItems: 'center', paddingVertical: 56, paddingHorizontal: Spacing.lg },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  emptyTitle: { ...Typography.h3, color: Colors.text, textAlign: 'center' },
  emptySub:   { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },

  title: { ...Typography.body, fontWeight: '600', color: Colors.text },
  body:  { ...Typography.caption, color: Colors.textSecondary, marginTop: 3 },
  metaText: { fontSize: 11, color: Colors.textLight },
  metaDot:  { fontSize: 11, color: Colors.border },

  sentCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  sentMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, flexWrap: 'wrap' },
  readRow:  { marginTop: 10, gap: 5 },
  readTrack: { height: 5, borderRadius: 3, backgroundColor: Colors.divider, overflow: 'hidden' },
  readFill:  { height: 5, borderRadius: 3, backgroundColor: Colors.primary },
  readText:  { fontSize: 11, color: Colors.textSecondary },

  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,.45)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: Spacing.lg, maxHeight: '85%',
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  sheetTitle: { ...Typography.h3, color: Colors.text, flex: 1 },
  sheetReset: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  sheetDone: {
    backgroundColor: Colors.primary, borderRadius: Radius.lg,
    paddingVertical: 13, alignItems: 'center', marginTop: Spacing.sm,
  },
  sheetDoneText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  mark: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  detailHead:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: Spacing.md },
  detailTitle: { ...Typography.h3, color: Colors.text, marginBottom: 3 },
  detailBody:  { ...Typography.body, color: Colors.text, lineHeight: 22 },
  detailActions: { flexDirection: 'row', gap: 8, marginTop: Spacing.lg },
  detailBtn: {
    flex: 1, paddingVertical: 12, borderRadius: Radius.lg, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  detailBtnText: { fontSize: 14, fontWeight: '600', color: Colors.text },
  detailBtnPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  detailBtnPrimaryText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
