import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Modal, Image, Linking,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { BASE_URL } from '@/api/axios';
import * as chatApi from '@/api/chat.api';
import { getSocket } from '@/utils/socket';
import { unwrap, Empty, Input, Toggle, ActionBtn, LoaderView } from '@/components/ui/kit';

const FILE_BASE = BASE_URL.replace(/\/api\/?$/, '');
const fileHref = (u?: string) => !u ? '' : u.startsWith('http') ? u : `${FILE_BASE}${u.startsWith('/') ? '' : '/'}${u}`;

// Quick reactions (same set as web)
const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
// Composer emoji picker (same set as web)
const PICKER_EMOJIS = [
  '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😍','🥰','😘',
  '😋','😜','🤪','😎','🤩','🥳','😏','😒','😔','😞','😢','😭','😤','😠','😡','🤯',
  '😳','🥺','😱','😨','😰','😥','🤔','🤗','🤭','🙄','😴','🤤','😷','🤒','🤕','🤢',
  '👍','👎','👌','✌️','🤞','🤝','👏','🙌','🙏','💪','🫶','👋','🖐️','✋','👀','🧠',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💖','💯','🔥','✨','🎉',
  '🎊','🥳','🎁','🏆','⭐','🌟','💡','✅','❌','⚠️','❓','❗','📚','📝','🕐','☕',
];

// 1–3 emojis only → render large, like WhatsApp
const EMOJI_ONLY_RE = /^(?:\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})*(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})*)*){1,3}$/u;
const isEmojiOnly = (text?: string) => {
  const t = String(text ?? '').replace(/\s/g, '');
  return t.length > 0 && t.length <= 24 && EMOJI_ONLY_RE.test(t);
};

const timeOf = (d?: string) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
const dayOf = (d?: string) => d ? new Date(d).toDateString() : '';

export default function ChatThreadScreen() {
  const { id, name, type = 'direct', ro } = useLocalSearchParams<{ id: string; name?: string; type?: string; ro?: string }>();
  const { user } = useAuth();
  const myId = user?._id;
  const isGroup = type !== 'direct';
  const canSendReadOnly = ['admin', 'super-admin', 'teacher'].includes(user?.role ?? '');
  const readOnlyBlocked = ro === '1' && !canSendReadOnly;

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [members, setMembers] = useState<any[]>([]);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [showEmoji, setShowEmoji] = useState(false);

  const [actionMsg, setActionMsg] = useState<any>(null);   // long-pressed message
  const [forwardMsg, setForwardMsg] = useState<any>(null); // message being forwarded
  const [myChats, setMyChats] = useState<any[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const [groupEdit, setGroupEdit] = useState({ name: '', description: '', isReadOnly: false });
  const [savingGroup, setSavingGroup] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);

  const scrollRef = useRef<ScrollView>(null);

  const loadMembers = useCallback(async () => {
    if (!id) return;
    try { setMembers(unwrap(await chatApi.getChatMembers(id)) ?? []); } catch {}
  }, [id]);

  const load = async (silent = false) => {
    if (!id) return;
    try {
      const res: any = await chatApi.getMessages(id, { limit: 40 });
      const list = unwrap(res) ?? [];
      // Signature covers edits, deletes and reactions on ANY message — not just the last
      const sig = (arr: any[]) => arr.map(m =>
        `${m._id}:${m.isDeleted ? 1 : 0}:${m.isEdited ? 1 : 0}:${(m.reactions ?? []).length}:${(m.content ?? '').length}`).join('|');
      setMessages(prev => (silent && sig(prev) === sig(list)) ? prev : list);
      setHasMore(!!(res as any)?.hasMore);
    } catch (err: any) {
      if (!silent) Alert.alert('Error', err.message);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!id) return;
    // Initial load — getMessages also marks the chat read server-side
    load();
    loadMembers();

    // Live updates over the WebSocket gateway (socket is connected app-wide by
    // NotificationProvider and joined to this user's chat rooms) — no polling.
    const sock = getSocket();
    if (!sock) return;

    const onMessage = (msg: any) => {
      if (String(msg.chat) !== String(id)) return;
      setMessages(prev =>
        prev.some(x => String(x._id) === String(msg._id)) ? prev : [...prev, msg]);
      // Mark incoming messages from others as read while the thread is open
      if (String(msg.sender?._id ?? msg.sender) !== String(myId)) {
        sock.emit('chat:read', { chatId: id, messageId: msg._id });
      }
    };
    const onEdited = ({ messageId, content }: any) =>
      setMessages(prev => prev.map(m =>
        String(m._id) === String(messageId) ? { ...m, content, isEdited: true } : m));
    const onDeleted = ({ messageId }: any) =>
      setMessages(prev => prev.map(m =>
        String(m._id) === String(messageId) ? { ...m, isDeleted: true, content: '' } : m));
    const onReaction = ({ messageId, reactions }: any) =>
      setMessages(prev => prev.map(m =>
        String(m._id) === String(messageId) ? { ...m, reactions } : m));
    const onMembership = () => loadMembers();

    sock.on('chat:message',         onMessage);
    sock.on('chat:message_edited',  onEdited);
    sock.on('chat:message_deleted', onDeleted);
    sock.on('chat:reaction',        onReaction);
    sock.on('chat:member_added',    onMembership);
    sock.on('chat:member_removed',  onMembership);
    sock.on('chat:group_updated',   onMembership);

    return () => {
      sock.off('chat:message',         onMessage);
      sock.off('chat:message_edited',  onEdited);
      sock.off('chat:message_deleted', onDeleted);
      sock.off('chat:reaction',        onReaction);
      sock.off('chat:member_added',    onMembership);
      sock.off('chat:member_removed',  onMembership);
      sock.off('chat:group_updated',   onMembership);
    };
  }, [id, myId, loadMembers]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80);
    return () => clearTimeout(t);
  }, [messages.length, loading]);

  const loadOlder = async () => {
    if (!messages.length || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res: any = await chatApi.getMessages(id!, { limit: 40, before: messages[0].createdAt });
      const older = unwrap(res) ?? [];
      setMessages(prev => [...older, ...prev]);
      setHasMore(!!(res as any)?.hasMore);
    } catch {}
    finally { setLoadingOlder(false); }
  };

  // ── Send / edit ─────────────────────────────────────────────────────────────

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText('');
    setShowEmoji(false);
    try {
      if (editing) {
        await chatApi.editMessage(editing._id, content);
        setMessages(prev => prev.map(m => m._id === editing._id ? { ...m, content, isEdited: true } : m));
        setEditing(null);
      } else {
        const d = unwrap(await chatApi.sendMessage(id!, {
          content, type: 'text', replyTo: replyTo?._id ?? null,
        }));
        if (d?._id) setMessages(prev => [...prev, d]);
        setReplyTo(null);
      }
    } catch (err: any) {
      setText(content);
      Alert.alert('Error', err.message);
    } finally { setSending(false); }
  };

  // ── Message actions ─────────────────────────────────────────────────────────

  const canEdit = (m: any) =>
    String(m.sender?._id ?? m.sender) === String(myId) &&
    !m.isDeleted && (m.type ?? 'text') === 'text' &&
    Date.now() - new Date(m.createdAt).getTime() < 86_400_000;

  const canDelete = (m: any) =>
    (String(m.sender?._id ?? m.sender) === String(myId) || ['admin', 'super-admin'].includes(user?.role ?? '')) && !m.isDeleted;

  const react = async (m: any, emoji: string) => {
    setActionMsg(null);
    try {
      const reactions = unwrap(await chatApi.toggleReaction(m._id, emoji));
      setMessages(prev => prev.map(x => x._id === m._id ? { ...x, reactions } : x));
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  const copyMsg = async (m: any) => {
    setActionMsg(null);
    await Clipboard.setStringAsync(m.content ?? '');
  };

  const startReply = (m: any) => { setActionMsg(null); setEditing(null); setReplyTo(m); };
  const startEdit = (m: any) => { setActionMsg(null); setReplyTo(null); setEditing(m); setText(m.content ?? ''); };

  const removeMsg = async (m: any) => {
    setActionMsg(null);
    Alert.alert('Delete Message', 'Delete this message for everyone?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await chatApi.deleteMessage(m._id);
            setMessages(prev => prev.map(x => x._id === m._id ? { ...x, isDeleted: true, content: '' } : x));
          } catch (err: any) { Alert.alert('Error', err.message); }
        },
      },
    ]);
  };

  const openForward = async (m: any) => {
    setActionMsg(null);
    setForwardMsg(m);
    try { setMyChats(unwrap(await chatApi.getChats()) ?? []); } catch {}
  };

  const forwardTo = async (chat: any) => {
    try {
      await chatApi.sendMessage(chat._id, { content: forwardMsg.content, type: 'text', isForwarded: true });
      setForwardMsg(null);
      Alert.alert('Forwarded', `Sent to ${chat.displayName ?? chat.name}`);
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  // ── Group management ────────────────────────────────────────────────────────

  const me = members.find((m: any) => String(m.user?._id ?? m.user) === String(myId));
  const amGroupAdmin = isGroup && (me?.role === 'admin' || ['admin', 'super-admin'].includes(user?.role ?? ''));

  const openInfo = () => {
    setGroupEdit({
      name: (name as string) ?? '',
      description: '',
      isReadOnly: ro === '1',
    });
    setShowInfo(true);
    loadMembers();
  };

  const saveGroup = async () => {
    setSavingGroup(true);
    try {
      await chatApi.updateGroupSettings(id!, groupEdit);
      Alert.alert('Saved', 'Group settings updated');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSavingGroup(false); }
  };

  const openAddMember = async () => {
    setAddingMember(true);
    try { setContacts(unwrap(await chatApi.getContacts()) ?? []); }
    catch (err: any) { Alert.alert('Error', err.message); }
  };

  const addMember = async (contact: any) => {
    try {
      await chatApi.addMember(id!, contact._id);
      setAddingMember(false);
      loadMembers();
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  const removeMember = async (m: any) => {
    const uid = m.user?._id ?? m.user;
    Alert.alert('Remove Member', `Remove ${m.user?.name ?? 'this member'} from the group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try { await chatApi.removeMember(id!, uid); loadMembers(); }
          catch (err: any) { Alert.alert('Error', err.message); }
        },
      },
    ]);
  };

  // ── Read ticks (direct chats) ───────────────────────────────────────────────

  const otherReadAt = !isGroup
    ? members.find((m: any) => String(m.user?._id ?? m.user) !== String(myId))?.lastReadAt
    : null;

  const Tick = ({ m }: { m: any }) => {
    if (isGroup || m.isDeleted) return null;
    const read = otherReadAt && new Date(otherReadAt) >= new Date(m.createdAt);
    return (
      <Ionicons name={read ? 'checkmark-done' : 'checkmark'} size={12}
        color={read ? '#7DD3FC' : 'rgba(255,255,255,0.55)'} style={{ marginLeft: 3 }} />
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const memberById = (m: any) => (typeof m.user === 'object' ? m.user : { _id: m.user });

  return (
    <>
      <Stack.Screen options={{
        title: (name as string) || 'Chat',
        headerRight: isGroup ? () => (
          <TouchableOpacity onPress={openInfo} hitSlop={10} accessibilityLabel="group-info">
            <Ionicons name="information-circle-outline" size={22} color={Colors.text} />
          </TouchableOpacity>
        ) : undefined,
      }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: Colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={{ paddingTop: 60, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : messages.length === 0 ? (
            <Empty icon="chatbubble-outline" text="Say hello 👋" />
          ) : (
            <>
              {hasMore && (
                <TouchableOpacity onPress={loadOlder} style={ct.older}>
                  <Text style={ct.olderText}>{loadingOlder ? 'Loading…' : 'Load older messages'}</Text>
                </TouchableOpacity>
              )}
              {messages.map((m: any, i: number) => {
                const mine = String(m.sender?._id ?? m.sender) === String(myId);
                const showDay = i === 0 || dayOf(m.createdAt) !== dayOf(messages[i - 1]?.createdAt);
                const emojiBig = !m.isDeleted && isEmojiOnly(m.content) && !(m.attachments ?? []).length;
                const reactions: any[] = m.reactions ?? [];
                const grouped: Record<string, { count: number; mine: boolean }> = {};
                reactions.forEach((r: any) => {
                  grouped[r.emoji] = grouped[r.emoji] ?? { count: 0, mine: false };
                  grouped[r.emoji].count++;
                  if (String(r.user) === String(myId)) grouped[r.emoji].mine = true;
                });
                return (
                  <React.Fragment key={m._id ?? i}>
                    {showDay && (
                      <View style={ct.dayWrap}>
                        <Text style={ct.dayText}>
                          {new Date(m.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Text>
                      </View>
                    )}
                    <View style={[ct.bubbleRow, mine && { justifyContent: 'flex-end' }]}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onLongPress={() => !m.isDeleted && setActionMsg(m)}
                        style={[ct.bubble, mine ? ct.bubbleMine : ct.bubbleOther, emojiBig && ct.bubbleEmoji]}
                      >
                        {!mine && isGroup && m.sender?.name && (
                          <Text style={ct.sender}>{m.sender.name}</Text>
                        )}
                        {m.isForwarded && (
                          <Text style={[ct.forwarded, mine && { color: 'rgba(255,255,255,0.6)' }]}>↪ Forwarded</Text>
                        )}
                        {m.replyTo?.content ? (
                          <View style={ct.reply}>
                            <Text style={ct.replyName}>{m.replyTo.sender?.name ?? ''}</Text>
                            <Text style={ct.replyText} numberOfLines={1}>{m.replyTo.content}</Text>
                          </View>
                        ) : null}

                        {/* Attachments */}
                        {(m.attachments ?? []).map((att: any, j: number) => (
                          att.fileType?.startsWith('image/') ? (
                            <TouchableOpacity key={j} onPress={() => Linking.openURL(fileHref(att.fileUrl))}>
                              <Image source={{ uri: fileHref(att.fileUrl) }} style={ct.attImage} resizeMode="cover" />
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity key={j} style={ct.attFile} onPress={() => Linking.openURL(fileHref(att.fileUrl))}>
                              <Ionicons name="document" size={16} color={mine ? '#fff' : Colors.primary} />
                              <Text style={[ct.attFileName, mine && { color: '#fff' }]} numberOfLines={1}>
                                {att.originalName ?? 'File'}
                              </Text>
                            </TouchableOpacity>
                          )
                        ))}

                        {m.isDeleted ? (
                          <Text style={[ct.deleted, mine && { color: 'rgba(255,255,255,0.6)' }]}>⊘ Message deleted</Text>
                        ) : m.content ? (
                          <Text style={[emojiBig ? ct.msgEmoji : ct.msgText, mine && !emojiBig && { color: '#fff' }]}>
                            {m.content}
                          </Text>
                        ) : null}

                        <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end' }}>
                          <Text style={[ct.msgTime, mine && !emojiBig && { color: 'rgba(255,255,255,0.6)' }]}>
                            {timeOf(m.createdAt)}{m.isEdited ? ' · edited' : ''}
                          </Text>
                          {mine && <Tick m={m} />}
                        </View>
                      </TouchableOpacity>
                    </View>

                    {/* Reaction chips */}
                    {Object.keys(grouped).length > 0 && (
                      <View style={[ct.reactRow, mine && { justifyContent: 'flex-end' }]}>
                        {Object.entries(grouped).map(([emoji, g]) => (
                          <TouchableOpacity key={emoji} style={[ct.reactChip, g.mine && ct.reactChipMine]} onPress={() => react(m, emoji)}>
                            <Text style={ct.reactChipText}>{emoji}{g.count > 1 ? ` ${g.count}` : ''}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </React.Fragment>
                );
              })}
            </>
          )}
        </ScrollView>

        {/* Composer */}
        {readOnlyBlocked ? (
          <View style={ct.readOnly}>
            <Ionicons name="lock-closed" size={14} color={Colors.textSecondary} />
            <Text style={ct.readOnlyText}>This is a read-only channel — only teachers and admins can post.</Text>
          </View>
        ) : (
          <View>
            {(replyTo || editing) && (
              <View style={ct.contextBar}>
                <View style={{ flex: 1 }}>
                  <Text style={ct.contextTitle}>
                    {editing ? '✏️ Editing message' : `↩︎ Replying to ${replyTo?.sender?.name ?? ''}`}
                  </Text>
                  <Text style={ct.contextText} numberOfLines={1}>{(editing ?? replyTo)?.content}</Text>
                </View>
                <TouchableOpacity onPress={() => { setReplyTo(null); setEditing(null); if (editing) setText(''); }} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={Colors.textLight} />
                </TouchableOpacity>
              </View>
            )}

            {showEmoji && (
              <ScrollView style={ct.emojiPanel} contentContainerStyle={ct.emojiWrap}>
                {PICKER_EMOJIS.map((e, i) => (
                  <TouchableOpacity key={`${e}${i}`} onPress={() => setText(t => t + e)} style={ct.emojiBtn}>
                    <Text style={{ fontSize: 24 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={ct.composer}>
              <TouchableOpacity onPress={() => setShowEmoji(v => !v)} style={ct.emojiToggle} accessibilityLabel="emoji-toggle">
                <Ionicons name={showEmoji ? 'close' : 'happy-outline'} size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
              <TextInput
                style={ct.input}
                value={text}
                onChangeText={setText}
                placeholder="Type a message…"
                placeholderTextColor={Colors.textLight}
                multiline
              />
              <TouchableOpacity
                style={[ct.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
                onPress={send}
                disabled={!text.trim() || sending}
                accessibilityLabel="send-message"
              >
                <Ionicons name={editing ? 'checkmark' : 'send'} size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Message action sheet */}
      <Modal visible={!!actionMsg} transparent animationType="fade" onRequestClose={() => setActionMsg(null)}>
        <TouchableOpacity style={ct.sheetBackdrop} activeOpacity={1} onPress={() => setActionMsg(null)}>
          <View style={ct.sheet}>
            <View style={ct.quickReacts}>
              {EMOJIS.map(e => (
                <TouchableOpacity key={e} onPress={() => react(actionMsg, e)} style={ct.quickReactBtn}>
                  <Text style={{ fontSize: 26 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <SheetAction icon="arrow-undo" label="Reply" onPress={() => startReply(actionMsg)} />
            <SheetAction icon="copy" label="Copy" onPress={() => copyMsg(actionMsg)} />
            <SheetAction icon="arrow-redo" label="Forward" onPress={() => openForward(actionMsg)} />
            {actionMsg && canEdit(actionMsg) && <SheetAction icon="pencil" label="Edit" onPress={() => startEdit(actionMsg)} />}
            {actionMsg && canDelete(actionMsg) && <SheetAction icon="trash" label="Delete" danger onPress={() => removeMsg(actionMsg)} />}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Forward picker */}
      <Modal visible={!!forwardMsg} transparent animationType="slide" onRequestClose={() => setForwardMsg(null)}>
        <View style={ct.modalRoot}>
          <View style={ct.modalCard}>
            <View style={ct.modalHeader}>
              <Text style={ct.modalTitle}>Forward to…</Text>
              <TouchableOpacity onPress={() => setForwardMsg(null)}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {myChats.filter((c: any) => c._id !== id).map((c: any) => (
                <TouchableOpacity key={c._id} style={ct.pickRow} onPress={() => forwardTo(c)}>
                  <View style={[ct.pickAvatar, c.type !== 'direct' && { backgroundColor: Colors.accent }]}>
                    {c.type !== 'direct'
                      ? <Ionicons name="people" size={14} color="#fff" />
                      : <Text style={{ color: '#fff', fontWeight: '700' }}>{(c.displayName ?? c.name ?? '?')[0]}</Text>}
                  </View>
                  <Text style={ct.pickName} numberOfLines={1}>{c.displayName ?? c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Group info */}
      <Modal visible={showInfo} transparent animationType="slide" onRequestClose={() => setShowInfo(false)}>
        <View style={ct.modalRoot}>
          <View style={ct.modalCard}>
            <View style={ct.modalHeader}>
              <Text style={ct.modalTitle}>{addingMember ? 'Add Member' : 'Group Info'}</Text>
              <TouchableOpacity onPress={() => addingMember ? setAddingMember(false) : setShowInfo(false)}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>
              {addingMember ? (
                contacts.length === 0 ? <LoaderView /> :
                contacts
                  .filter((c: any) => !members.some((m: any) => String(m.user?._id ?? m.user) === String(c._id)))
                  .slice(0, 40)
                  .map((c: any) => (
                    <TouchableOpacity key={c._id} style={ct.pickRow} onPress={() => addMember(c)}>
                      <View style={ct.pickAvatar}>
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{c.name?.[0] ?? '?'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={ct.pickName}>{c.name}</Text>
                        <Text style={ct.pickRole}>{(c.role ?? '').replace('_', ' ')}</Text>
                      </View>
                      <Ionicons name="add-circle" size={20} color={Colors.success} />
                    </TouchableOpacity>
                  ))
              ) : (
                <>
                  {amGroupAdmin && (
                    <>
                      <Input label="Group Name" value={groupEdit.name} onChange={v => setGroupEdit(g => ({ ...g, name: v }))} />
                      <Toggle label="Read-only" sub="Only teachers and admins can send messages"
                        value={groupEdit.isReadOnly} onChange={v => setGroupEdit(g => ({ ...g, isReadOnly: v }))} />
                      <ActionBtn label={savingGroup ? 'Saving…' : 'Save Settings'} tone="success" onPress={saveGroup} />
                      <View style={{ height: 10 }} />
                    </>
                  )}
                  <View style={ct.membersHead}>
                    <Text style={ct.modalTitle}>Members ({members.length})</Text>
                    {amGroupAdmin && <ActionBtn label="+ Add" tone="info" small onPress={openAddMember} />}
                  </View>
                  {members.map((m: any, i: number) => {
                    const u = memberById(m);
                    const self = String(u._id) === String(myId);
                    return (
                      <View key={i} style={ct.pickRow}>
                        <View style={ct.pickAvatar}>
                          <Text style={{ color: '#fff', fontWeight: '700' }}>{u.name?.[0] ?? '?'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={ct.pickName}>{u.name ?? 'Member'}{self ? ' (you)' : ''}</Text>
                          <Text style={ct.pickRole}>{m.role === 'admin' ? 'group admin' : (u.role ?? '').replace('_', ' ')}</Text>
                        </View>
                        {amGroupAdmin && !self && (
                          <TouchableOpacity onPress={() => removeMember(m)} hitSlop={8}>
                            <Ionicons name="remove-circle-outline" size={20} color={Colors.danger} />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function SheetAction({ icon, label, onPress, danger }: { icon: string; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={ct.sheetAction} onPress={onPress}>
      <Ionicons name={icon as any} size={18} color={danger ? Colors.danger : Colors.text} />
      <Text style={[ct.sheetActionText, danger && { color: Colors.danger }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const ct = StyleSheet.create({
  older: { alignItems: 'center', paddingVertical: 8 },
  olderText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  dayWrap: { alignItems: 'center', marginVertical: 10 },
  dayText: {
    fontSize: 10, color: Colors.textSecondary, backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, overflow: 'hidden',
  },
  bubbleRow: { flexDirection: 'row', marginBottom: 2 },
  bubble: { maxWidth: '80%', borderRadius: Radius.lg, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: Colors.surface, borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  bubbleEmoji: { backgroundColor: 'transparent', borderWidth: 0, paddingVertical: 2 },
  sender: { fontSize: 11, fontWeight: '700', color: Colors.accent, marginBottom: 2 },
  forwarded: { fontSize: 10, fontStyle: 'italic', color: Colors.textSecondary, marginBottom: 2 },
  reply: {
    borderLeftWidth: 3, borderLeftColor: Colors.accent, backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4,
  },
  replyName: { fontSize: 10, fontWeight: '700', color: Colors.accent },
  replyText: { fontSize: 11, color: Colors.textSecondary },
  msgText: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  msgEmoji: { fontSize: 44, lineHeight: 52 },
  deleted: { fontSize: 13, fontStyle: 'italic', color: Colors.textLight },
  msgTime: { fontSize: 9, color: Colors.textLight, marginTop: 3 },
  attImage: { width: 200, height: 150, borderRadius: Radius.md, marginBottom: 4 },
  attFile: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: Radius.sm,
    paddingHorizontal: 8, paddingVertical: 6, marginBottom: 4,
  },
  attFileName: { fontSize: 12, color: Colors.text, flexShrink: 1 },

  reactRow: { flexDirection: 'row', gap: 4, marginBottom: 8, marginTop: 2, paddingHorizontal: 4 },
  reactChip: {
    backgroundColor: Colors.surface, borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border,
  },
  reactChipMine: { borderColor: Colors.accent, backgroundColor: Colors.accentLight },
  reactChipText: { fontSize: 12 },

  readOnly: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: Spacing.md, backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  readOnlyText: { fontSize: 12, color: Colors.textSecondary },

  contextBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surfaceAlt, paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  contextTitle: { fontSize: 11, fontWeight: '700', color: Colors.accent },
  contextText: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  emojiPanel: { maxHeight: 210, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border },
  emojiWrap: { flexDirection: 'row', flexWrap: 'wrap', padding: 8 },
  emojiBtn: { width: '10%', alignItems: 'center', paddingVertical: 6 },
  emojiToggle: { paddingBottom: 10 },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: Spacing.sm + 4, paddingBottom: Platform.OS === 'ios' ? 24 : Spacing.sm + 4,
    backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  input: {
    flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: Radius.xl,
    paddingHorizontal: 14, paddingVertical: 10, maxHeight: 110,
    fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: Colors.border,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.md, paddingBottom: Spacing.xl,
  },
  quickReacts: {
    flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.divider, marginBottom: 6,
  },
  quickReactBtn: { padding: 4 },
  sheetAction: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 6 },
  sheetActionText: { fontSize: 15, color: Colors.text, fontWeight: '500' },

  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.md, paddingBottom: Spacing.xl,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  modalTitle: { ...Typography.h4, color: Colors.text },
  membersHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, marginTop: 4 },
  pickRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  pickAvatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  pickName: { ...Typography.label, color: Colors.text },
  pickRole: { fontSize: 11, color: Colors.textSecondary, textTransform: 'capitalize', marginTop: 1 },
});
