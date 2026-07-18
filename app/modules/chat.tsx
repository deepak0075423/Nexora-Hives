import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import * as chatApi from '@/api/chat.api';
import ModuleDisabled from '@/components/ModuleDisabled';
import {
  unwrap, LoaderView, Empty, FAB, FormModal, SearchBar, Input, Select,
  Toggle, SegTabs, ActionBtn,
} from '@/components/ui/kit';

const ONLINE_WINDOW = 60_000;
const isOnline = (lastSeenAt?: string) =>
  !!lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW;

function timeLabel(d?: string) {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function ChatListScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const canCreateGroup = ['teacher', 'admin', 'super-admin'].includes(user?.role ?? '');

  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Message search
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);

  // New chat / group modal
  const [showNew, setShowNew] = useState(false);
  const [newTab, setNewTab] = useState('direct');
  const [contactQ, setContactQ] = useState('');
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', description: '', type: 'group', isReadOnly: false });
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const d = unwrap(await chatApi.getChats());
      setChats(Array.isArray(d) ? d : []);
    } catch (err: any) {
      if (err?.data?.code === 'MODULE_DISABLED') setDisabled(true);
    } finally { setLoading(false); setRefreshing(false); }
  };

  // Reload + refresh presence whenever the screen gains focus
  useFocusEffect(useCallback(() => {
    load();
    chatApi.heartbeat().catch(() => {});
  }, []));

  // Debounced message search
  useFocusEffect(useCallback(() => {
    if (search.trim().length < 2) { setSearchResults(null); return; }
    const t = setTimeout(async () => {
      try {
        const d = unwrap(await chatApi.searchMessages({ q: search.trim() }));
        setSearchResults(Array.isArray(d) ? d : d?.results ?? []);
      } catch { setSearchResults([]); }
    }, 400);
    return () => clearTimeout(t);
  }, [search]));

  const openThread = (c: any) => {
    router.push({
      pathname: '/modules/chat-thread',
      params: {
        id: c._id,
        name: c.displayName ?? c.name ?? 'Chat',
        type: c.type ?? 'direct',
        ro: c.isReadOnly ? '1' : '',
      },
    } as any);
  };

  // Long-press options — custom sheet (RN Alert menus don't render on web)
  const [optionsChat, setOptionsChat] = useState<any>(null);

  const doMute = async () => {
    const c = optionsChat; setOptionsChat(null);
    try { await chatApi.toggleMute(c._id); load(); } catch (e: any) { Alert.alert('Error', e.message); }
  };
  const doArchive = async () => {
    const c = optionsChat; setOptionsChat(null);
    try { await chatApi.toggleArchive(c._id); load(); } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const openNew = async () => {
    setShowNew(true);
    setNewTab('direct');
    setGroupForm({ name: '', description: '', type: 'group', isReadOnly: false });
    setGroupMembers([]);
    setContactsLoading(true);
    try { setContacts(unwrap(await chatApi.getContacts()) ?? []); }
    catch (err: any) { Alert.alert('Error', err.message); }
    finally { setContactsLoading(false); }
  };

  const startChat = async (contact: any) => {
    try {
      const d = unwrap(await chatApi.startDirectChat(contact._id));
      const chatId = d?._id ?? d?.chat?._id;
      if (!chatId) throw { message: 'Could not open chat' };
      setShowNew(false);
      router.push({ pathname: '/modules/chat-thread', params: { id: chatId, name: contact.name, type: 'direct', ro: '' } } as any);
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  const toggleMember = (id: string) =>
    setGroupMembers(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);

  const submitGroup = async () => {
    if (!groupForm.name.trim()) return Alert.alert('Required', 'Group name is required');
    if (groupMembers.length === 0) return Alert.alert('Required', 'Pick at least one member');
    setCreating(true);
    try {
      const d = unwrap(await chatApi.createGroup({ ...groupForm, memberIds: groupMembers }));
      setShowNew(false);
      load();
      if (d?._id) {
        router.push({ pathname: '/modules/chat-thread', params: { id: d._id, name: d.name, type: d.type ?? 'group', ro: d.isReadOnly ? '1' : '' } } as any);
      }
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setCreating(false); }
  };

  const filteredContacts = contacts.filter(c =>
    !contactQ || c.name?.toLowerCase().includes(contactQ.toLowerCase()) || c.role?.toLowerCase().includes(contactQ.toLowerCase()));

  const visibleChats = chats.filter(c => showArchived ? c.isArchived : !c.isArchived);
  const archivedCount = chats.filter(c => c.isArchived).length;

  if (disabled) return (
    <>
      <Stack.Screen options={{ title: 'Chat' }} />
      <ModuleDisabled />
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Chat' }} />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 110 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        >
          <SearchBar value={search} onChange={setSearch} placeholder="Search messages…" />

          {/* Message search results */}
          {searchResults !== null ? (
            searchResults.length === 0 ? <Empty icon="search-outline" text="No messages found" /> : (
              <>
                <Text style={cs.sectionLabel}>Messages</Text>
                {searchResults.slice(0, 25).map((m: any, i: number) => (
                  <TouchableOpacity key={m._id ?? i} style={cs.row} activeOpacity={0.7}
                    onPress={() => {
                      const chat = m.chat && typeof m.chat === 'object' ? m.chat : chats.find(c => c._id === (m.chat ?? m.chatId));
                      openThread(chat ?? { _id: m.chat ?? m.chatId, displayName: m.chatName ?? 'Chat', type: m.chatType ?? 'direct' });
                    }}>
                    <View style={cs.avatarSm}>
                      <Ionicons name="search" size={14} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={cs.name} numberOfLines={1}>{m.sender?.name ?? 'Message'}</Text>
                      <Text style={cs.preview} numberOfLines={2}>{m.content}</Text>
                    </View>
                    <Text style={cs.time}>{timeLabel(m.createdAt)}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )
          ) : (
            <>
              {/* Archived toggle */}
              {archivedCount > 0 && (
                <TouchableOpacity style={cs.archiveRow} onPress={() => setShowArchived(v => !v)}>
                  <Ionicons name="archive-outline" size={15} color={Colors.textSecondary} />
                  <Text style={cs.archiveText}>
                    {showArchived ? '← Back to chats' : `Archived (${archivedCount})`}
                  </Text>
                </TouchableOpacity>
              )}

              {loading ? <LoaderView /> : visibleChats.length === 0 ? (
                <Empty icon="chatbubbles-outline"
                  text={showArchived ? 'No archived chats' : 'No conversations yet. Tap the button below to start one.'} />
              ) : (
                visibleChats.map((c: any) => {
                  const last = c.lastMessage;
                  const lastText = last?.isDeleted ? 'Message deleted'
                    : last?.type && last.type !== 'text' ? `📎 ${last.type}`
                    : last?.content ?? 'No messages yet';
                  const online = c.type === 'direct' && isOnline(c.otherUser?.lastSeenAt);
                  return (
                    <TouchableOpacity
                      key={c._id} style={cs.row} activeOpacity={0.7}
                      onPress={() => openThread(c)}
                      onLongPress={() => setOptionsChat(c)}
                    >
                      <View>
                        <View style={[cs.avatar, c.type !== 'direct' && { backgroundColor: Colors.accent }]}>
                          {c.type === 'broadcast' ? <Ionicons name="megaphone" size={17} color="#fff" />
                            : c.type === 'group' ? <Ionicons name="people" size={18} color="#fff" />
                            : <Text style={cs.avatarText}>{(c.displayName ?? c.name ?? '?')[0]?.toUpperCase()}</Text>}
                        </View>
                        {online && <View style={cs.onlineDot} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={cs.topRow}>
                          <Text style={cs.name} numberOfLines={1}>{c.displayName ?? c.name ?? 'Chat'}</Text>
                          <Text style={cs.time}>{timeLabel(c.lastActivity ?? last?.createdAt)}</Text>
                        </View>
                        <View style={cs.topRow}>
                          <Text style={cs.preview} numberOfLines={1}>
                            {last?.sender?.name && c.type !== 'direct' ? `${last.sender.name}: ` : ''}{lastText}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            {c.isMuted && <Ionicons name="volume-mute" size={12} color={Colors.textLight} />}
                            {c.unreadCount > 0 && (
                              <View style={cs.unread}>
                                <Text style={cs.unreadText}>{c.unreadCount > 99 ? '99+' : c.unreadCount}</Text>
                              </View>
                            )}
                            <TouchableOpacity onPress={() => setOptionsChat(c)} hitSlop={8}>
                              <Ionicons name="ellipsis-vertical" size={14} color={Colors.textLight} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}
        </ScrollView>
        <FAB icon="chatbubble-ellipses" onPress={openNew} />
      </View>

      {/* Chat options sheet (mute / archive) */}
      <FormModal
        visible={!!optionsChat}
        title={optionsChat?.displayName ?? optionsChat?.name ?? 'Chat'}
        onClose={() => setOptionsChat(null)}
      >
        <TouchableOpacity style={cs.optionRow} onPress={doMute}>
          <Ionicons name={optionsChat?.isMuted ? 'volume-high-outline' : 'volume-mute-outline'} size={19} color={Colors.text} />
          <Text style={cs.optionText}>{optionsChat?.isMuted ? 'Unmute notifications' : 'Mute notifications'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={cs.optionRow} onPress={doArchive}>
          <Ionicons name={optionsChat?.isArchived ? 'arrow-up-circle-outline' : 'archive-outline'} size={19} color={Colors.text} />
          <Text style={cs.optionText}>{optionsChat?.isArchived ? 'Unarchive chat' : 'Archive chat'}</Text>
        </TouchableOpacity>
      </FormModal>

      {/* New chat / group modal */}
      <FormModal
        visible={showNew}
        title={newTab === 'group' ? 'New Group' : 'New Chat'}
        onClose={() => setShowNew(false)}
        onSubmit={newTab === 'group' ? submitGroup : undefined}
        submitting={creating}
        submitLabel="Create Group"
      >
        {canCreateGroup && (
          <SegTabs
            tabs={[{ key: 'direct', label: 'Direct' }, { key: 'group', label: 'New Group' }]}
            active={newTab} onChange={setNewTab}
          />
        )}

        {newTab === 'group' && (
          <>
            <Input label="Group Name *" value={groupForm.name} onChange={v => setGroupForm(f => ({ ...f, name: v }))} placeholder="e.g. Class 10-A Updates" />
            <Input label="Description" value={groupForm.description} onChange={v => setGroupForm(f => ({ ...f, description: v }))} placeholder="Optional" />
            <Select label="Type" value={groupForm.type} onChange={v => setGroupForm(f => ({ ...f, type: v }))}
              options={[{ label: 'Group (everyone can chat)', value: 'group' }, { label: 'Broadcast (announcements)', value: 'broadcast' }]} />
            <Toggle label="Read-only" sub="Only teachers and admins can send messages"
              value={groupForm.isReadOnly} onChange={v => setGroupForm(f => ({ ...f, isReadOnly: v }))} />
            <Text style={cs.sectionLabel}>Members ({groupMembers.length} selected)</Text>
          </>
        )}

        <SearchBar value={contactQ} onChange={setContactQ} placeholder="Search people…" />
        {contactsLoading ? <LoaderView /> : filteredContacts.length === 0 ? (
          <Empty icon="people-outline" text="No contacts you're allowed to chat with" />
        ) : (
          filteredContacts.slice(0, 40).map((c: any) => {
            const selected = groupMembers.includes(c._id);
            return (
              <TouchableOpacity key={c._id} style={cs.contactRow}
                onPress={() => newTab === 'group' ? toggleMember(c._id) : startChat(c)}
                activeOpacity={0.7}>
                <View style={cs.avatarSm}>
                  <Text style={cs.avatarText}>{c.name?.[0]?.toUpperCase() ?? '?'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={cs.name}>{c.name}</Text>
                  <Text style={cs.role}>{(c.role ?? '').replace('_', ' ')}{c.meta ? ` · ${c.meta}` : ''}</Text>
                </View>
                {newTab === 'group'
                  ? <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={20} color={selected ? Colors.accent : Colors.textLight} />
                  : <Ionicons name="chatbubble-outline" size={16} color={Colors.accent} />}
              </TouchableOpacity>
            );
          })
        )}
      </FormModal>
    </>
  );
}

const cs = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.sm + 4, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  avatar: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarSm: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.success, borderWidth: 2, borderColor: Colors.surface,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { ...Typography.label, color: Colors.text, flexShrink: 1 },
  time: { fontSize: 10, color: Colors.textLight },
  preview: { fontSize: 12, color: Colors.textSecondary, flex: 1, marginTop: 2 },
  role: { fontSize: 11, color: Colors.textSecondary, textTransform: 'capitalize', marginTop: 1 },
  unread: {
    minWidth: 18, height: 18, borderRadius: 9, backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  unreadText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  archiveRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 4, marginBottom: 6,
  },
  archiveText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  sectionLabel: { ...Typography.h4, color: Colors.text, marginBottom: 8, marginTop: 4 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  optionText: { fontSize: 15, color: Colors.text, fontWeight: '500' },
});
