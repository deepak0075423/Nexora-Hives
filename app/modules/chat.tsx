import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Stack, useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import * as chatApi from '@/api/chat.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import { unwrap } from '@/components/ui/kit';
import { chatStore, useChatStore } from '@/components/chat/store';
import {
  Avatar, ChatRow, SearchField, Tabs, Btn, Sheet, SheetItem, ConnectionStrip,
} from '@/components/chat/parts';
import { NewChatSheet, CreateGroupSheet } from '@/components/chat/dialogs';
import { C, chatName, isGroup, listTime, shortName, backendRole, errText } from '@/components/chat/format';

const TABS_STAFF = [['all', 'All'], ['unread', 'Unread'], ['teacher', 'Teachers'], ['student', 'Students'], ['group', 'Groups']];
const TABS_FAMILY = [['all', 'All'], ['unread', 'Unread'], ['teacher', 'Teachers'], ['group', 'Groups']];

const VIEWS: Record<string, { label: string; icon: any; test: (c: any) => boolean }> = {
  parent:       { label: 'Parents', icon: 'people-outline', test: (c) => c.peerRole === 'parent' },
  school_admin: { label: 'Admins', icon: 'shield-checkmark-outline', test: (c) => c.peerRole === 'school_admin' },
  muted:        { label: 'Muted', icon: 'notifications-off-outline', test: (c) => c.isMuted },
  archived:     { label: 'Archived', icon: 'archive-outline', test: (c) => c.isArchived },
};

function filterChats(chats: any[], tab: string, view: string, q: string) {
  let list = view === 'archived' ? chats.filter((c) => c.isArchived) : chats.filter((c) => !c.isArchived);
  if (view && view !== 'archived' && VIEWS[view]) list = list.filter(VIEWS[view].test);
  if (tab === 'unread') list = list.filter((c) => c.unreadCount > 0);
  else if (tab === 'group') list = list.filter(isGroup);
  else if (tab !== 'all') list = list.filter((c) => c.peerRole === tab);
  const term = q.trim().toLowerCase();
  if (term) list = list.filter((c) => chatName(c).toLowerCase().includes(term) || (c.lastMessage?.content || '').toLowerCase().includes(term));
  return list;
}

/**
 * Chat — every role's conversations, live over the WebSocket gateway. The web
 * redesign at phone width: search and filter, All / Unread / Teachers /
 * Students / Groups, New Chat and Create Group, and for a school admin the
 * View All Chats browser. `?user=<id>` opens (or starts) that conversation.
 */
export default function ChatListScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ user?: string }>();
  const role = backendRole(user?.role);
  const staff = role === 'school_admin' || role === 'teacher';
  const myId = String(user?._id || '');

  useEffect(() => { if (user?._id) chatStore.init(user); }, [user?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const chats = useChatStore((s) => s.chats);
  const loading = useChatStore((s) => s.chatsLoading);
  const disabled = useChatStore((s) => s.disabled);
  const typing = useChatStore((s) => s.typing);
  const threads = useChatStore((s) => s.threads);
  const conn = useChatStore((s) => s.conn);

  const [tab, setTab] = useState('all');
  const [view, setView] = useState('');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [optionsFor, setOptionsFor] = useState<any>(null);
  const [dlg, setDlg] = useState<{ newChat?: boolean; createGroup?: boolean }>({});

  // Back on the list: nothing is on screen, so nothing is being read.
  useFocusEffect(useCallback(() => { chatStore.setActive(null); }, []));

  const openThread = useCallback((chatId: string, extra: Record<string, string> = {}) => {
    router.push({ pathname: '/modules/chat-thread', params: { id: chatId, ...extra } } as any);
  }, [router]);

  const startDirect = useCallback(async (userId: string) => {
    try {
      const row = unwrap(await chatApi.startDirectChat(userId));
      if (!row?._id) throw new Error('Could not open chat');
      chatStore.upsertChat(row);
      openThread(row._id);
    } catch (e) { Alert.alert('Chat', errText(e)); }
  }, [openThread]);

  // Deep link from another screen (employee directory, a profile): open that person's chat.
  const deepLinked = useRef('');
  useEffect(() => {
    const target = params.user;
    if (!target || !user?._id || deepLinked.current === target) return;
    deepLinked.current = target;
    startDirect(String(target));
  }, [params.user, user?._id, startDirect]);

  // Message search (server), debounced.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setSearching(false); return undefined; }
    setSearching(true);
    const t = setTimeout(async () => {
      try { const d = unwrap(await chatApi.searchMessages({ q: term })); setHits(Array.isArray(d) ? d : []); }
      catch { setHits([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const visible = useMemo(() => filterChats(chats, tab, view, q), [chats, tab, view, q]);
  const unreadChats = chats.filter((c) => !c.isArchived && c.unreadCount > 0).length;
  const tabs = (staff ? TABS_STAFF : TABS_FAMILY).map(([key, label]) => ({ key, label, count: key === 'unread' ? unreadChats : undefined }));
  const viewKeys = staff ? ['parent', 'school_admin', 'muted', 'archived'] : ['school_admin', 'muted', 'archived'];
  const countFor = (k: string) => (k === 'archived' ? chats.filter((c) => c.isArchived).length : chats.filter((c) => !c.isArchived && VIEWS[k].test(c)).length);

  const nameIn = (chatId: string, userId: string) => {
    const m = threads[chatId]?.items.find((x: any) => String(x.sender?._id) === String(userId));
    return m?.sender?.name || '';
  };
  const typingLabelFor = (c: any) => {
    const ids = Object.keys(typing[c._id] || {});
    if (!ids.length) return '';
    if (!isGroup(c)) return 'typing…';
    if (ids.length > 1) return `${ids.length} people are typing…`;
    const n = nameIn(c._id, ids[0]);
    return `${n ? shortName(n) : 'Someone'} is typing…`;
  };

  const toggleMute = async (c: any) => {
    setOptionsFor(null);
    try { const d = unwrap(await chatApi.toggleMute(c._id)); chatStore.patchChat(c._id, { isMuted: !!d?.isMuted }); }
    catch (e) { Alert.alert('Chat', errText(e)); }
  };
  const toggleArchive = async (c: any) => {
    setOptionsFor(null);
    try { const d = unwrap(await chatApi.toggleArchive(c._id)); chatStore.patchChat(c._id, { isArchived: !!d?.isArchived }); }
    catch (e) { Alert.alert('Chat', errText(e)); }
  };
  const markAllRead = () => {
    setFilterOpen(false);
    chats.filter((c) => c.unreadCount > 0 && !c.isArchived).forEach((c) => chatStore.markRead(c._id));
  };

  if (disabled) return (<><Stack.Screen options={{ title: 'Chat' }} /><ModuleDisabled /></>);

  const term = q.trim();
  return (
    <>
      <Stack.Screen options={{ title: 'Chat' }} />
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <ConnectionStrip conn={conn} />
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.brand}
            onRefresh={async () => { setRefreshing(true); await chatStore.loadChats(); setRefreshing(false); }} />}
        >
          <View style={s.topRow}>
            <SearchField value={q} onChange={setQ} placeholder="Search chats..." style={{ flex: 1 }} />
            <TouchableOpacity style={[s.filterBtn, !!view && s.filterOn]} onPress={() => setFilterOpen(true)} accessibilityLabel="Filter conversations">
              <Ionicons name="options-outline" size={21} color={view ? C.brand : '#374151'} />
            </TouchableOpacity>
          </View>

          <Tabs tabs={tabs} value={tab} onChange={setTab} style={{ marginTop: 10 }} />

          <View style={s.actions}>
            <Btn icon="add" label="New Chat" onPress={() => setDlg({ newChat: true })} style={{ flex: staff ? 0.93 : 1 }} />
            {staff && <Btn kind="ghost" icon="people-outline" label="Create Group" onPress={() => setDlg({ createGroup: true })} style={{ flex: 1 }} />}
          </View>

          {role === 'school_admin' && (
            <TouchableOpacity style={s.allCard} onPress={() => router.push('/modules/chat-all' as any)} accessibilityLabel="View All Chats">
              <View style={s.allIcon}><Ionicons name="people-outline" size={22} color={C.brand} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.allTitle}>View All Chats</Text>
                <Text style={s.allSub}>Browse and search all conversations</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </TouchableOpacity>
          )}

          {!!view && (
            <TouchableOpacity style={s.viewChip} onPress={() => setView('')} accessibilityLabel="Clear filter">
              <Text style={s.viewChipText}>Showing: {VIEWS[view]?.label}</Text>
              <Ionicons name="close" size={14} color={C.brand} />
            </TouchableOpacity>
          )}

          <View style={{ marginTop: 10 }}>
            {loading ? (
              <Text style={s.empty}>Loading conversations…</Text>
            ) : (
              <>
                {!!term && visible.length > 0 && <Text style={s.label}>CHATS</Text>}
                {visible.map((c) => (
                  <ChatRow key={c._id} chat={c} myId={myId} typingLabel={typingLabelFor(c)}
                    onPress={() => openThread(c._id)} onLongPress={() => setOptionsFor(c)} />
                ))}
                {!visible.length && !term && (
                  <View style={s.emptyBox}>
                    <Text style={s.emptyTitle}>{chats.length === 0 ? 'No conversations yet' : 'Nothing here'}</Text>
                    <Text style={s.empty}>{chats.length === 0 ? 'Start one with New Chat.' : tab === 'unread' ? 'You are all caught up.' : 'No conversations match this view.'}</Text>
                  </View>
                )}
                {term.length >= 2 && (
                  <>
                    <Text style={[s.label, { marginTop: 14 }]}>MESSAGES</Text>
                    {searching ? <Text style={s.empty}>Searching…</Text>
                      : !hits.length ? (!visible.length ? <Text style={s.empty}>Nothing matches “{term}”.</Text> : null)
                        : hits.map((m) => (
                          <TouchableOpacity key={m._id} style={s.hit} onPress={() => openThread(m.chat._id, { jump: m._id })}>
                            <Avatar name={m.chat?.name || m.sender?.name} size={42} group={m.chat?.type !== 'direct'} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <View style={s.hitTop}>
                                <Text style={s.hitName} numberOfLines={1}>{m.chat?.name || m.sender?.name}</Text>
                                <Text style={s.hitTime}>{listTime(m.createdAt)}</Text>
                              </View>
                              <Text style={s.hitText} numberOfLines={2}>
                                {String(m.sender?._id) === myId ? 'You' : shortName(m.sender?.name || '')}: {m.content}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                  </>
                )}
              </>
            )}
          </View>
        </ScrollView>
      </View>

      <Sheet visible={filterOpen} onClose={() => setFilterOpen(false)} title="Show">
        <SheetItem icon="chatbubbles-outline" label="All conversations" on={!view} onPress={() => { setView(''); setFilterOpen(false); }} />
        {viewKeys.map((k) => (
          <SheetItem key={k} icon={VIEWS[k].icon} label={VIEWS[k].label} on={view === k} hint={countFor(k)}
            onPress={() => { setView(view === k ? '' : k); setFilterOpen(false); }} />
        ))}
        {unreadChats > 0 && <SheetItem icon="checkmark-done-outline" label="Mark all as read" onPress={markAllRead} />}
      </Sheet>

      <Sheet visible={!!optionsFor} onClose={() => setOptionsFor(null)} title={optionsFor ? chatName(optionsFor) : ''}>
        {optionsFor && (
          <>
            <SheetItem icon={optionsFor.isMuted ? 'notifications-outline' : 'notifications-off-outline'}
              label={optionsFor.isMuted ? 'Unmute notifications' : 'Mute notifications'} onPress={() => toggleMute(optionsFor)} />
            <SheetItem icon="archive-outline" label={optionsFor.isArchived ? 'Unarchive' : 'Archive chat'} onPress={() => toggleArchive(optionsFor)} />
          </>
        )}
      </Sheet>

      <NewChatSheet visible={!!dlg.newChat} onClose={() => setDlg({})} myRole={role}
        onPick={(c) => { setDlg({}); startDirect(c._id); }} />
      <CreateGroupSheet visible={!!dlg.createGroup} onClose={() => setDlg({})} myRole={role}
        onCreated={(row) => { setDlg({}); if (row?._id) { chatStore.upsertChat(row); openThread(row._id); } }}
        onOpenExisting={async (chatId) => { setDlg({}); await chatStore.refreshChat(chatId); openThread(chatId); }} />
    </>
  );
}

const s = StyleSheet.create({
  topRow: { flexDirection: 'row', gap: 10 },
  filterBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: C.field, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  filterOn: { borderColor: C.brand, backgroundColor: C.brandSoft },
  actions: { flexDirection: 'row', gap: 12, marginTop: 14 },
  allCard: { flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 14, paddingVertical: 11, paddingHorizontal: 13, borderWidth: 1, borderColor: '#E3E6EE', borderRadius: 10, backgroundColor: '#fff' },
  allIcon: { width: 44, height: 44, borderRadius: 9, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  allTitle: { fontSize: 15.5, fontWeight: '600', color: C.ink },
  allSub: { fontSize: 13, color: C.muted, marginTop: 1 },
  viewChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingLeft: 12, paddingRight: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: C.brandSoft },
  viewChipText: { fontSize: 13, fontWeight: '600', color: C.brand },
  label: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.faint, marginBottom: 4 },
  emptyBox: { alignItems: 'center', paddingVertical: 36, gap: 4 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.ink2 },
  empty: { fontSize: 14, color: C.muted, textAlign: 'center', paddingVertical: 8 },
  hit: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line2 },
  hitTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hitName: { flex: 1, fontSize: 15, fontWeight: '600', color: C.ink },
  hitTime: { fontSize: 12, color: C.muted },
  hitText: { fontSize: 13.5, color: C.ink3, marginTop: 2 },
});
