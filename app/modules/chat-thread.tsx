import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '@/contexts/AuthContext';
import * as chatApi from '@/api/chat.api';
import { unwrap, confirmAsync } from '@/components/ui/kit';
import { chatStore, useChatStore } from '@/components/chat/store';
import {
  ThreadHeader, ConnectionStrip, Notice, MessageList, Composer, Sheet, SheetItem, Btn, type MsgActions,
} from '@/components/chat/parts';
import {
  MessageActionsSheet, ForwardSheet, HistorySheet, InfoSheet, AddMembersSheet, EditGroupSheet,
} from '@/components/chat/dialogs';
import { C, chatName, isGroup, shortName, backendRole, errText } from '@/components/chat/format';

const EMPTY: any[] = [];

/**
 * One conversation, live. Sends go over the socket with an acknowledgement
 * (REST and an offline queue behind it — see components/chat/store). A school
 * admin who opens a conversation they are not in reads it as an observer.
 */
export default function ChatThreadScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id: string; jump?: string }>();
  const id = String(params.id || '');
  const myId = String(user?._id || '');
  const role = backendRole(user?.role);
  const isAdmin = role === 'school_admin';

  useEffect(() => { if (user?._id) chatStore.init(user); }, [user?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const chats = useChatStore((s) => s.chats);
  const chatsLoading = useChatStore((s) => s.chatsLoading);
  const thread = useChatStore((s) => s.threads[id]);
  const typingMap = useChatStore((s) => s.typing[id]);
  const online = useChatStore((s) => s.online);
  const conn = useChatStore((s) => s.conn);

  const member = useMemo(() => chats.find((c) => c._id === id) || null, [chats, id]);
  const [observed, setObserved] = useState<any>(null);
  const [missing, setMissing] = useState(false);
  const chat = member || observed;
  const observer = !!chat && !member;

  // On screen = being read; leaving it stops that.
  useFocusEffect(useCallback(() => {
    chatStore.setActive(id);
    return () => { chatStore.setActive(null); chatStore.stopTyping(); };
  }, [id]));

  // Removed from the group while looking at it.
  useEffect(() => {
    chatStore.onChatGone = (gone) => { if (gone === id) { Alert.alert('Chat', 'You are no longer a member of that group'); router.back(); } };
    return () => { chatStore.onChatGone = null; };
  }, [id, router]);

  // A conversation the list does not hold: made a moment ago, or — for an
  // admin — one to read as an observer. Anyone else is told it is not theirs.
  const lookedUp = useRef('');
  useEffect(() => {
    if (!id || chatsLoading || member || lookedUp.current === id) return;
    lookedUp.current = id;
    (async () => {
      if (await chatStore.refreshChat(id)) return;
      if (!isAdmin) { setMissing(true); return; }
      try {
        const p = unwrap(await chatApi.getChatProfile(id));
        if (!p?._id) throw new Error('missing');
        const names = (p.members || []).map((m: any) => m.name);
        setObserved({
          _id: p._id, type: p.type, name: p.name, description: p.description, isReadOnly: p.isReadOnly, kind: p.kind,
          displayName: p.type === 'direct' ? names.join(' ↔ ') : p.name, avatarName: p.type === 'direct' ? names[0] : p.name,
          memberCount: p.memberCount, classSection: p.classSection?._id || null, sectionLabel: p.classSection?.label || '',
          subjectName: p.subject?.name || '', unreadCount: 0,
        });
      } catch { setMissing(true); }
    })();
  }, [id, chatsLoading, member, isAdmin]);

  // Load the thread once we know what it is. Unread messages count as just received.
  const opened = useRef('');
  const openMark = useRef<{ lastReadAt?: string; unread: number } | null>(null);
  useEffect(() => {
    if (!chat || opened.current === chat._id) return;
    opened.current = chat._id;
    openMark.current = !observer && chat.unreadCount > 0 ? { lastReadAt: chat.lastReadAt, unread: chat.unreadCount } : null;
    chatStore.openThread(chat._id, {
      observer,
      freshAfter: openMark.current ? (chat.lastReadAt || new Date(0).toISOString()) : null,
    });
    if (!observer && chat.unreadCount > 0) {
      if (chatStore.state.threads[chat._id]?.loaded) chatStore.markRead(chat._id);
      else chatStore.patchChat(chat._id, { unreadCount: 0 });
    }
  }, [chat?._id, observer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Who is in it / what they teach — the header line and the info sheet.
  const [profile, setProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const profileKey = chat ? `${chat._id}:${chat.memberCount}:${chat._profileStamp || ''}:${tick}` : '';
  useEffect(() => {
    if (!chat) return;
    setProfileLoading(true);
    chatApi.getChatProfile(chat._id)
      .then((res) => { const p = unwrap(res); setProfile(p || null); chatStore.mergeOnline((p?.members || []).filter((m: any) => m._id !== myId)); })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [profileKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Composer state ──────────────────────────────────────────────────────────
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [actionMsg, setActionMsg] = useState<any>(null);
  const [forwardMsg, setForwardMsg] = useState<any>(null);
  const [historyMsg, setHistoryMsg] = useState<any>(null);
  const [sheet, setSheet] = useState<'' | 'menu' | 'info' | 'add' | 'edit'>('');
  const [syncing, setSyncing] = useState(false);
  const [jumpTo, setJumpTo] = useState<string | null>(params.jump ? String(params.jump) : null);

  const items = thread?.items || EMPTY;
  const members: any[] = profile?.members || EMPTY;
  const classKind = profile?.kind || '';
  const iAmGroupAdmin = members.some((m) => m._id === myId && m.memberRole === 'admin');
  const canAddMembers = classKind ? !!profile?.manage?.canManage : iAmGroupAdmin;
  const canLeaveGroup = classKind ? !!profile?.manage?.canLeave : true;

  const nameIn = (userId: string) => members.find((m) => m._id === String(userId))?.name
    || items.find((m: any) => String(m.sender?._id) === String(userId))?.sender?.name || '';
  const typingIds = Object.keys(typingMap || {});
  const typingNames = typingIds.map((u) => nameIn(u) || 'Someone');
  const typingLabel = !chat || !typingIds.length ? '' : !isGroup(chat) ? 'typing…'
    : typingIds.length > 1 ? `${typingIds.length} people are typing…` : `${shortName(typingNames[0])} is typing…`;
  const peerOnline = !!chat?.otherUser && online.has(chat.otherUser._id);
  const onlineCount = members.filter((m) => m._id !== myId && online.has(m._id)).length;

  const unreadFrom = useMemo(() => {
    const mark = openMark.current;
    if (!mark || !thread?.loaded) return null;
    const since = mark.lastReadAt ? new Date(mark.lastReadAt).getTime() : 0;
    return items.find((m: any) => String(m.sender?._id) !== myId && new Date(m.createdAt).getTime() > since)?._id || null;
  }, [thread?.loaded, items, myId]);

  const disabledReason = !chat ? null
    : observer ? 'Viewing as administrator — you are not part of this conversation'
      : chat.isReadOnly && !['school_admin', 'teacher'].includes(role) ? 'Only admins and teachers can post in this channel'
        : null;

  const onSend = (text: string) => {
    if (!chat) return;
    if (editing) {
      chatStore.editMessage(chat._id, editing, text).catch((e) => Alert.alert('Chat', errText(e)));
      setEditing(null); setDraft('');
      return;
    }
    chatStore.send(chat._id, { content: text, replyTo });
    chatStore.stopTyping();
    setReplyTo(null); setDraft('');
  };

  const actions: MsgActions = {
    open: (m) => setActionMsg(m),
    react: (m, e) => { chatStore.react(id, m, e).catch((err) => Alert.alert('Chat', errText(err))); },
    jump: (mid) => setJumpTo(mid),
    retry: (m) => chatStore.retry(id, m.clientId),
    discard: (m) => chatStore.discard(id, m.clientId),
    history: (m) => setHistoryMsg(m),
  };

  // ── Conversation actions ────────────────────────────────────────────────────
  const toggleMute = async () => {
    try { const d = unwrap(await chatApi.toggleMute(id)); chatStore.patchChat(id, { isMuted: !!d?.isMuted }); }
    catch (e) { Alert.alert('Chat', errText(e)); }
  };
  const toggleArchive = async () => {
    try { const d = unwrap(await chatApi.toggleArchive(id)); chatStore.patchChat(id, { isArchived: !!d?.isArchived }); }
    catch (e) { Alert.alert('Chat', errText(e)); }
  };
  const leaveGroup = async () => {
    setSheet('');
    if (!(await confirmAsync('Leave group', `Leave “${chatName(chat)}”? You will stop receiving its messages.`, 'Leave'))) return;
    try { await chatApi.removeMember(id, myId); chatStore.removeChat(id); router.back(); }
    catch (e) { Alert.alert('Chat', errText(e)); }
  };
  const removeMember = async (m: any) => {
    if (!(await confirmAsync('Remove member', `Remove ${m.name} from “${chatName(chat)}”?`, 'Remove'))) return;
    try { await chatApi.removeMember(id, m._id); chatStore.refreshChat(id); setTick((n) => n + 1); }
    catch (e) { Alert.alert('Chat', errText(e)); }
  };
  const syncClassGroup = async () => {
    setSyncing(true);
    try {
      const d = unwrap(await chatApi.syncGroup(id)) || {};
      Alert.alert('Chat', d.added || d.removed ? `Updated: ${d.added || 0} joined, ${d.removed || 0} left` : 'Already matches the class');
      chatStore.refreshChat(id); setTick((n) => n + 1);
    } catch (e) { Alert.alert('Chat', errText(e)); }
    finally { setSyncing(false); }
  };
  const messagePerson = async (m: any) => {
    setSheet('');
    try {
      const row = unwrap(await chatApi.startDirectChat(m._id));
      if (row?._id) { chatStore.upsertChat(row); router.push({ pathname: '/modules/chat-thread', params: { id: row._id } } as any); }
    } catch (e) { Alert.alert('Chat', errText(e)); }
  };

  // Message actions from the long-press sheet.
  const reply = () => { const m = actionMsg; setActionMsg(null); setEditing(null); setReplyTo(m); };
  const edit = () => { const m = actionMsg; setActionMsg(null); setReplyTo(null); setEditing(m); setDraft(m.content || ''); };
  const copy = async () => { const m = actionMsg; setActionMsg(null); await Clipboard.setStringAsync(m.content || ''); };
  const forward = () => { const m = actionMsg; setActionMsg(null); setForwardMsg(m); };
  const history = () => { const m = actionMsg; setActionMsg(null); setHistoryMsg(m); };
  const remove = async () => {
    const m = actionMsg; setActionMsg(null);
    const mine = String(m.sender?._id) === myId;
    const ok = await confirmAsync('Delete message', mine ? 'Delete this message for everyone?' : `Delete ${m.sender?.name || 'this person'}'s message for everyone? It stays visible to school admins.`, 'Delete');
    if (!ok) return;
    try { await chatStore.deleteMessage(id, m); } catch (e) { Alert.alert('Chat', errText(e)); }
  };

  const menu = !chat ? [] : observer ? [
    { icon: 'information-circle-outline', label: isGroup(chat) ? 'Group info' : 'Conversation info', run: () => setSheet('info') },
    { icon: 'refresh', label: 'Refresh', run: () => { setSheet(''); chatStore.forgetThread(id); opened.current = ''; setTick((n) => n + 1); chatStore.openThread(id, { observer: true }); } },
  ] : [
    { icon: 'information-circle-outline', label: isGroup(chat) ? 'Group info' : 'Contact info', run: () => setSheet('info') },
    isGroup(chat) && canAddMembers && { icon: 'person-add-outline', label: 'Add members', run: () => setSheet('add') },
    isGroup(chat) && iAmGroupAdmin && { icon: 'create-outline', label: 'Edit group', run: () => setSheet('edit') },
    classKind && profile?.manage?.canSync && { icon: 'refresh', label: `Sync with Class ${profile?.classSection?.label || ''}`, run: () => { setSheet(''); syncClassGroup(); } },
    { icon: chat.isMuted ? 'notifications-outline' : 'notifications-off-outline', label: chat.isMuted ? 'Unmute notifications' : 'Mute notifications', run: () => { setSheet(''); toggleMute(); } },
    { icon: 'archive-outline', label: chat.isArchived ? 'Unarchive' : 'Archive chat', run: () => { setSheet(''); toggleArchive(); } },
    isGroup(chat) && canLeaveGroup && { icon: 'log-out-outline', label: 'Leave group', danger: true, run: leaveGroup },
  ].filter(Boolean) as any[];

  if (!chat) {
    return (
      <>
        <Stack.Screen options={{ title: 'Chat' }} />
        <View style={s.center}>
          {missing ? (
            <>
              <Text style={s.centerTitle}>Conversation not available</Text>
              <Text style={s.centerText}>It may have been removed, or you are no longer a member.</Text>
              <Btn small kind="ghost" label="Back to chats" onPress={() => router.back()} />
            </>
          ) : <ActivityIndicator color={C.brand} />}
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ThreadHeader chat={chat} profile={profile} online={online} onlineCount={onlineCount} typingLabel={typingLabel}
          observer={observer} avatarName={chat.avatarName} onBack={() => router.back()} onInfo={() => setSheet('info')} onMenu={() => setSheet('menu')} />
        <ConnectionStrip conn={conn} />
        {observer && <Notice>You are reading this conversation as the school administrator. Its members are not notified.</Notice>}
        <MessageList
          chatId={chat._id}
          items={items}
          chat={chat}
          loading={!thread || (thread.loading && !thread.loaded)}
          error={thread?.error}
          onRetryLoad={() => chatStore.openThread(chat._id, { observer })}
          hasMore={!!thread?.hasMore}
          loadingOlder={!!thread?.loadingOlder}
          onLoadOlder={() => chatStore.loadOlder(chat._id)}
          myId={myId} isAdmin={isAdmin} observer={observer}
          peerOnline={peerOnline} typingNames={typingNames} unreadFrom={unreadFrom}
          actions={actions} jumpTo={jumpTo} onJumped={() => setJumpTo(null)}
        />
        <Composer draft={draft} setDraft={setDraft} replyTo={replyTo} editing={editing} myId={myId}
          onCancel={() => { if (editing) setDraft(''); setReplyTo(null); setEditing(null); }}
          onSend={onSend} onTyping={() => chatStore.emitTyping(chat._id)} disabledReason={disabledReason} />
      </KeyboardAvoidingView>

      <Sheet visible={sheet === 'menu'} onClose={() => setSheet('')} title={chatName(chat)}>
        {menu.map((m) => <SheetItem key={m.label} icon={m.icon} label={m.label} danger={m.danger} onPress={m.run} />)}
      </Sheet>
      <InfoSheet visible={sheet === 'info'} chat={chat} profile={profile} loading={profileLoading} myId={myId} online={online}
        observer={observer} onClose={() => setSheet('')}
        onMute={toggleMute} onArchive={toggleArchive}
        onAddMembers={() => setSheet('add')} onEditGroup={() => setSheet('edit')}
        onRemoveMember={removeMember} onLeave={leaveGroup} onMessage={messagePerson}
        onSync={syncClassGroup} syncing={syncing} />
      <AddMembersSheet visible={sheet === 'add'} onClose={() => setSheet('')} myRole={role} chat={chat}
        existing={members.map((m) => m._id)} classGroup={!!classKind} staffOnly={role === 'teacher' && !classKind}
        onAdded={() => { setSheet(''); chatStore.refreshChat(id); setTick((n) => n + 1); }} />
      <EditGroupSheet visible={sheet === 'edit'} onClose={() => setSheet('')} chat={chat}
        onSaved={(patch) => { setSheet(''); chatStore.patchChat(id, patch); }} />
      <MessageActionsSheet msg={actionMsg} myId={myId} isAdmin={isAdmin} onClose={() => setActionMsg(null)}
        onReact={(e) => { const m = actionMsg; setActionMsg(null); actions.react(m, e); }}
        onReply={reply} onForward={forward} onCopy={copy} onEdit={edit} onDelete={remove} onHistory={history} />
      <ForwardSheet msg={forwardMsg} chats={chats} onClose={() => setForwardMsg(null)}
        onPick={(target) => {
          const m = forwardMsg; setForwardMsg(null);
          if (!m?.content) { Alert.alert('Chat', 'Only text messages can be forwarded'); return; }
          chatStore.send(target._id, { content: m.content, isForwarded: true });
          Alert.alert('Chat', `Forwarded to ${chatName(target)}`);
        }} />
      <HistorySheet msg={historyMsg} onClose={() => setHistoryMsg(null)} />
    </>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, backgroundColor: '#fff' },
  centerTitle: { fontSize: 17, fontWeight: '700', color: C.ink },
  centerText: { fontSize: 14, color: C.muted, textAlign: 'center' },
});
