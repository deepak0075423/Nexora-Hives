/**
 * The chat module's building blocks for the phone — the web chat redesign
 * (school-frontend/src/pages/chat) at phone width: avatars, underline tabs,
 * conversation rows, the thread header, the message list, the composer and
 * bottom sheets.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView, TextInput, Modal, Image, Platform,
  KeyboardAvoidingView, ActivityIndicator, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedEmoji from './AnimatedEmoji';
import { singleEmoji } from './emojiMotion';
import {
  C, avatarColor, initials, chatName, isGroup, listTime, clock, dayLabel, sameDay, lastSeen,
  previewText, personLine, fitsInline, fileHref, ROLE_LABEL,
} from './format';

type Ion = React.ComponentProps<typeof Ionicons>['name'];

// ─── Avatar ───────────────────────────────────────────────────────────────────

/** `group`: false for a person, true for a named group (one letter), 'glyph' for a class group. */
export function Avatar({ name, size = 50, group = false, image, online = false }: {
  name?: string; size?: number; group?: boolean | 'glyph'; image?: string; online?: boolean;
}) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (group === 'glyph') {
    return (
      <View style={[st.avatar, box, { backgroundColor: '#E2E1FB' }]} accessibilityElementsHidden importantForAccessibility="no">
        <Ionicons name="people-outline" size={Math.round(size * 0.46)} color="#6D5DD3" />
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no">
      <View style={[st.avatar, box, { backgroundColor: image ? '#E5E7EB' : avatarColor(name || '') }]}>
        {image
          ? <Image source={{ uri: fileHref(image) }} style={box} />
          : <Text style={[st.avatarText, { fontSize: Math.round(size * 0.35) }]}>{initials(name, !!group)}</Text>}
      </View>
      {online && <View style={[st.dot, { width: Math.max(10, size * 0.24), height: Math.max(10, size * 0.24), borderRadius: size }]} />}
    </View>
  );
}

export const chatAvatarKind = (chat: any): boolean | 'glyph' => (isGroup(chat) ? (chat.classSection ? 'glyph' : true) : false);

// ─── Inputs & tabs ────────────────────────────────────────────────────────────

export function SearchField({ value, onChange, placeholder, autoFocus, style }: {
  value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean; style?: any;
}) {
  return (
    <View style={[st.search, style]}>
      <Ionicons name="search" size={18} color={C.muted} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#8B93A5"
        style={st.searchInput} autoCorrect={false} autoCapitalize="none" autoFocus={autoFocus} accessibilityLabel={placeholder} />
      {!!value && (
        <TouchableOpacity onPress={() => onChange('')} hitSlop={8} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={18} color={C.faint} />
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Underline tabs; scrolls sideways when they do not fit. */
export function Tabs({ tabs, value, onChange, style }: {
  tabs: { key: string; label: string; count?: number }[]; value: string; onChange: (k: string) => void; style?: any;
}) {
  return (
    <View style={[st.tabsWrap, style]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
        {tabs.map((t) => {
          const on = t.key === value;
          return (
            <TouchableOpacity key={t.key} onPress={() => onChange(t.key)} style={st.tab} accessibilityRole="tab"
              accessibilityState={{ selected: on }} accessibilityLabel={t.label}>
              <Text style={[st.tabText, on && st.tabTextOn]}>{t.label}</Text>
              {!!t.count && <View style={st.count}><Text style={st.countText}>{t.count > 99 ? '99+' : t.count}</Text></View>}
              {on && <View style={st.tabLine} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function Chips({ options, value, onChange }: {
  options: [string, string][]; value: string; onChange: (k: string) => void;
}) {
  return (
    <View style={st.chips}>
      {options.map(([k, label]) => (
        <TouchableOpacity key={k || 'all'} onPress={() => onChange(k)} style={[st.chip, value === k && st.chipOn]} accessibilityLabel={label}>
          <Text style={[st.chipText, value === k && st.chipTextOn]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function Btn({ label, icon, onPress, kind = 'primary', disabled, small, style }: {
  label: string; icon?: Ion; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; small?: boolean; style?: any;
}) {
  const color = kind === 'primary' ? '#fff' : kind === 'danger' ? C.danger : C.ink2;
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityLabel={label}
      style={[st.btn, small && st.btnSm, kind === 'primary' ? st.btnPrimary : kind === 'danger' ? st.btnDanger : st.btnGhost, disabled && { opacity: 0.55 }, style]}>
      {icon && <Ionicons name={icon} size={small ? 16 : 19} color={color} />}
      <Text style={[st.btnText, small && { fontSize: 13.5 }, { color }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Conversation row ─────────────────────────────────────────────────────────

export function ChatRow({ chat, myId, typingLabel, onPress, onLongPress }: {
  chat: any; myId: string; typingLabel?: string; onPress: () => void; onLongPress?: () => void;
}) {
  const unread = chat.unreadCount || 0;
  const deleted = !typingLabel && chat.lastMessage?.isDeleted;
  return (
    <TouchableOpacity style={st.row} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7} accessibilityLabel={`Open ${chatName(chat)}`}>
      <Avatar name={chatName(chat)} group={chatAvatarKind(chat)} image={chat.displayAvatar} />
      <View style={st.rowBody}>
        <View style={st.rowLine}>
          <View style={st.rowNameWrap}>
            <Text style={st.rowName} numberOfLines={1}>{chatName(chat)}</Text>
            {chat.type === 'broadcast' && <Ionicons name="megaphone-outline" size={14} color={C.faint} />}
            {chat.isMuted && <Ionicons name="notifications-off-outline" size={14} color={C.faint} />}
          </View>
          <Text style={st.rowTime}>{listTime(chat.lastMessage?.createdAt || chat.lastActivity)}</Text>
        </View>
        <View style={st.rowLine}>
          <Text style={[st.rowPreview, !!typingLabel && st.rowTyping, deleted && st.rowDeleted]} numberOfLines={1}>
            {typingLabel || previewText(chat, myId)}
          </Text>
          {unread > 0 && (
            <View style={[st.badge, chat.isMuted && { backgroundColor: '#B8BCCB' }]}>
              <Text style={st.badgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Sheets ───────────────────────────────────────────────────────────────────

/** A bottom sheet: title, scrolling body, optional footer. Tall ones fill most of the screen. */
export function Sheet({ visible, title, subtitle, onClose, children, footer, tall, scroll = true }: {
  visible: boolean; title: string; subtitle?: string; onClose: () => void; children: React.ReactNode;
  footer?: React.ReactNode; tall?: boolean; scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={st.sheetRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[st.sheet, tall && { height: '88%' }, { paddingBottom: footer ? 0 : 16 + insets.bottom }]}>
          <View style={st.grabber} />
          <View style={st.sheetHead}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.sheetTitle} numberOfLines={2}>{title}</Text>
              {!!subtitle && <Text style={st.sheetSub}>{subtitle}</Text>}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={C.muted} />
            </TouchableOpacity>
          </View>
          {scroll
            ? <ScrollView style={tall ? { flex: 1 } : { maxHeight: 520 }} contentContainerStyle={st.sheetBody} keyboardShouldPersistTaps="handled">{children}</ScrollView>
            : <View style={[st.sheetBody, tall && { flex: 1 }]}>{children}</View>}
          {footer ? <View style={[st.sheetFoot, { paddingBottom: 12 + insets.bottom }]}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SheetItem({ icon, label, onPress, danger, on, hint }: {
  icon: Ion; label: string; onPress: () => void; danger?: boolean; on?: boolean; hint?: string | number;
}) {
  const color = danger ? C.danger : on ? C.brand : C.ink2;
  return (
    <TouchableOpacity style={st.sheetItem} onPress={onPress} accessibilityLabel={label}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[st.sheetItemText, { color }, on && { fontWeight: '700' }]}>{label}</Text>
      {hint !== undefined && <Text style={st.sheetHint}>{hint}</Text>}
      {on && <Ionicons name="checkmark" size={18} color={C.brand} />}
    </TouchableOpacity>
  );
}

// ─── Strips ───────────────────────────────────────────────────────────────────

export function ConnectionStrip({ conn }: { conn: string }) {
  if (conn === 'connected') return null;
  const offline = conn === 'offline';
  return (
    <View style={[st.conn, offline && st.connOff]} accessibilityRole="alert">
      {offline ? <Ionicons name="cloud-offline-outline" size={15} color="#991B1B" /> : <ActivityIndicator size="small" color={C.amberInk} />}
      <Text style={[st.connText, offline && { color: '#991B1B' }]}>
        {offline ? 'You are offline — messages will send when you reconnect' : 'Reconnecting to live chat…'}
      </Text>
    </View>
  );
}

export function Notice({ icon = 'eye-outline', children, action }: { icon?: Ion; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <View style={st.notice}>
      <Ionicons name={icon} size={15} color={C.amberInk} />
      <Text style={st.noticeText}>{children}</Text>
      {action}
    </View>
  );
}

// ─── Thread header ────────────────────────────────────────────────────────────

export function ThreadHeader({ chat, profile, online, onlineCount, typingLabel, observer, onBack, onInfo, onMenu, avatarName, subtitle }: {
  chat: any; profile?: any; online: Set<string>; onlineCount?: number; typingLabel?: string; observer?: boolean;
  onBack: () => void; onInfo?: () => void; onMenu?: () => void; avatarName?: string; subtitle?: string;
}) {
  const insets = useSafeAreaInsets();
  const group = isGroup(chat);
  const peer = chat?.otherUser;
  const peerOnline = !group && !!peer && online.has(peer._id);

  let status: React.ReactNode;
  if (subtitle) status = <Text style={st.headAway} numberOfLines={1}>{subtitle}</Text>;
  else if (typingLabel) status = <Text style={st.headTyping} numberOfLines={1}>{typingLabel}</Text>;
  else if (group) status = <Text style={st.headAway} numberOfLines={1}>{chat.memberCount} member{chat.memberCount === 1 ? '' : 's'}{onlineCount ? `, ${onlineCount} online` : ''}</Text>;
  else if (peerOnline) status = <View style={st.headStatus}><View style={st.headDot} /><Text style={st.headOnline}>Online</Text></View>;
  else if (!peer && observer) status = <Text style={st.headAway}>Direct conversation</Text>;
  else status = <Text style={st.headAway} numberOfLines={1}>{peer ? lastSeen(peer.lastSeenAt) : ''}</Text>;

  let ctx: string[] = [];
  if (group) {
    const label = chat.sectionLabel || profile?.classSection?.label;
    if (chat.kind === 'class') ctx.push(`Class group · Class ${label}`);
    else if (chat.kind === 'subject') ctx.push(`${chat.subjectName || profile?.subject?.name || 'Subject'} · Class ${label}`);
    else if (chat.type === 'broadcast') ctx.push('Announcements');
    if (chat.isReadOnly && chat.type !== 'broadcast') ctx.push('Only teachers post');
    if (chat.description) ctx.push(chat.description);
  } else if (profile?.person) ctx = personLine(profile.person);
  else if (peer) ctx = [ROLE_LABEL[peer.role] || ''];
  ctx = ctx.filter(Boolean);

  return (
    <View style={[st.head, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity onPress={onBack} hitSlop={10} accessibilityLabel="Back" style={st.headBack}>
        <Ionicons name="chevron-back" size={26} color={C.ink2} />
      </TouchableOpacity>
      <Avatar name={avatarName || chatName(chat)} size={44} group={chatAvatarKind(chat)} image={chat?.displayAvatar} />
      <TouchableOpacity style={st.headWho} onPress={onInfo} disabled={!onInfo} accessibilityLabel={group ? 'Group info' : 'Contact info'}>
        <View style={st.headNameRow}>
          <Text style={st.headName} numberOfLines={1}>{chatName(chat)}</Text>
          {observer && <View style={st.tagWarn}><Text style={st.tagWarnText}>Observer</Text></View>}
          {chat?.isMuted && !observer && <Ionicons name="notifications-off-outline" size={14} color={C.faint} />}
        </View>
        {status}
        {ctx.length > 0 && <Text style={st.headCtx} numberOfLines={1}>{ctx.join('  |  ')}</Text>}
      </TouchableOpacity>
      {onMenu && (
        <TouchableOpacity onPress={onMenu} hitSlop={10} accessibilityLabel="Conversation options">
          <Ionicons name="ellipsis-vertical" size={22} color={C.ink2} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function tickState(msg: any, chat: any, peerOnline: boolean) {
  if (msg.status === 'sending' || msg.status === 'queued') return 'pending';
  if (msg.status === 'failed') return 'failed';
  const t = new Date(msg.createdAt).getTime();
  const readUpTo = chat?.readUpTo ? new Date(chat.readUpTo).getTime() : 0;
  if (readUpTo && readUpTo >= t) return 'read';
  if (chat?.type === 'direct') {
    if (peerOnline) return 'delivered';
    const d = chat?.deliveredUpTo ? new Date(chat.deliveredUpTo).getTime() : 0;
    return d >= t ? 'delivered' : 'sent';
  }
  return 'delivered';
}

function Ticks({ state }: { state: string }) {
  if (state === 'pending') return <Ionicons name="time-outline" size={13} color={C.faint} />;
  if (state === 'read') return <Ionicons name="checkmark-done" size={16} color={C.brand} />;
  if (state === 'delivered') return <Ionicons name="checkmark-done" size={16} color={C.faint} />;
  if (state === 'sent') return <Ionicons name="checkmark" size={15} color={C.faint} />;
  return null;
}

export type MsgActions = {
  open: (m: any) => void;           // long-press: the action sheet
  react: (m: any, e: string) => void;
  jump: (id: string) => void;
  retry: (m: any) => void;
  discard: (m: any) => void;
  history: (m: any) => void;
};

function Bubble({ msg, mine, chat, peerOnline, isAdmin, observer, myId, actions, hideTicks }: {
  msg: any; mine: boolean; chat: any; peerOnline: boolean; isAdmin: boolean; observer: boolean; myId: string;
  actions: MsgActions; hideTicks?: boolean;
}) {
  const deletedForAll = msg.isDeleted && !(isAdmin && msg.content);
  // Exactly one emoji: large, and animated when it arrived live.
  const emojiChar = !msg.isDeleted && !(msg.attachments || []).length ? singleEmoji(msg.content) : null;
  const inline = !emojiChar && fitsInline(msg);
  const failed = msg.status === 'failed';
  const pending = msg.status === 'sending' || msg.status === 'queued';
  const interactive = !observer && !msg.isDeleted && !pending && !failed;
  const open = interactive ? () => actions.open(msg) : undefined;

  const meta = (
    <View style={st.meta}>
      {msg.isEdited && !msg.isDeleted && (
        <Text style={[st.metaText, st.edited]} onPress={isAdmin && (msg.editHistory || []).length ? () => actions.history(msg) : undefined}>edited</Text>
      )}
      <Text style={st.metaText}>{msg.status === 'queued' ? 'waiting' : clock(msg.createdAt)}</Text>
      {mine && !deletedForAll && !hideTicks && <Ticks state={tickState(msg, chat, peerOnline)} />}
    </View>
  );

  const counts = (msg.reactions || []).reduce((acc: any, r: any) => {
    acc[r.emoji] = acc[r.emoji] || { n: 0, mine: false };
    acc[r.emoji].n += 1;
    if (String(r.user) === myId) acc[r.emoji].mine = true;
    return acc;
  }, {});

  const header = (
    <>
      {msg.isDeleted && !deletedForAll && <Text style={st.adminNote}>Deleted — visible to admins only</Text>}
      {msg.isForwarded && !deletedForAll && (
        <View style={st.fwd}><Ionicons name="arrow-redo-outline" size={12} color={C.muted} /><Text style={st.fwdText}>Forwarded</Text></View>
      )}
      {msg.replyTo && !deletedForAll && (
        <TouchableOpacity style={[st.quote, emojiChar && { backgroundColor: mine ? C.bubbleOut : C.bubbleIn }]} onPress={() => actions.jump(msg.replyTo._id)}>
          <Text style={st.quoteWho}>{String(msg.replyTo.sender?._id) === myId ? 'You' : (msg.replyTo.sender?.name || 'Message')}</Text>
          <Text style={st.quoteText} numberOfLines={2}>{msg.replyTo.isDeleted ? 'Deleted message' : (msg.replyTo.content || 'Attachment')}</Text>
        </TouchableOpacity>
      )}
    </>
  );

  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      {emojiChar ? (
        <Pressable onLongPress={open} delayLongPress={350} style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
          {header}
          <AnimatedEmoji char={emojiChar} animate={!!msg.fresh} playKey={msg.clientId || msg._id} onLongPress={open} />
          <View style={{ paddingHorizontal: 4 }}>{meta}</View>
        </Pressable>
      ) : (
        <Pressable onLongPress={open} delayLongPress={350}
          style={[st.bubble, mine ? st.bubbleOut : st.bubbleIn, deletedForAll && st.bubbleDeleted, pending && { opacity: 0.78 }, failed && st.bubbleFailed]}>
          {deletedForAll ? (
            <Text style={st.deletedText}>This message was deleted</Text>
          ) : (
            <>
              {header}
              {(msg.attachments || []).map((a: any, i: number) => (
                /^image\//.test(a.fileType || '')
                  ? <Image key={i} source={{ uri: fileHref(a.fileUrl) }} style={st.attImage} />
                  : <View key={i} style={st.attFile}><Ionicons name="document-outline" size={16} color={C.brand} /><Text style={st.attName} numberOfLines={1}>{a.originalName || 'Attachment'}</Text></View>
              ))}
              {inline ? (
                <View style={st.inline}>
                  <Text style={st.msgText}>{msg.content}</Text>
                  {meta}
                </View>
              ) : (
                <>
                  {!!msg.content && <Text style={[st.msgText, msg.isDeleted && st.struck]}>{msg.content}</Text>}
                  {meta}
                </>
              )}
            </>
          )}
          {deletedForAll && meta}
          {failed && (
            <View style={st.fail}>
              <Ionicons name="alert-circle" size={14} color="#B91C1C" />
              <Text style={st.failText} numberOfLines={1}>{msg.error || 'Not sent'}</Text>
              <Text style={st.failBtn} onPress={() => actions.retry(msg)}>Retry</Text>
              <Text style={st.failBtn} onPress={() => actions.discard(msg)}>Discard</Text>
            </View>
          )}
        </Pressable>
      )}
      {Object.keys(counts).length > 0 && (
        <View style={st.reacts}>
          {Object.entries(counts).map(([e, c]: any) => (
            <TouchableOpacity key={e} style={[st.react, c.mine && st.reactMine]} disabled={observer} onPress={() => actions.react(msg, e)}>
              <Text style={{ fontSize: 13 }}>{e}{c.n > 1 ? ` ${c.n}` : ''}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * The thread. Sticks to the bottom while the reader is there, holds still with
 * a "new messages" pill when they have scrolled up — the pill lives OUTSIDE the
 * ScrollView so it stays pinned instead of scrolling with the messages — and
 * keeps the same message in view when older history loads above.
 */
export function MessageList({
  chatId, items, chat, loading, error, onRetryLoad, hasMore, loadingOlder, onLoadOlder, myId, isAdmin, observer,
  peerOnline, typingNames, unreadFrom, actions, hideTicks = false, jumpTo, onJumped,
}: {
  chatId: string; items: any[]; chat: any; loading: boolean; error?: string; onRetryLoad?: () => void;
  hasMore: boolean; loadingOlder: boolean; onLoadOlder: () => void; myId: string; isAdmin: boolean; observer: boolean;
  peerOnline: boolean; typingNames: string[]; unreadFrom?: string | null; actions: MsgActions; hideTicks?: boolean;
  jumpTo?: string | null; onJumped?: () => void;
}) {
  const scroller = useRef<ScrollView>(null);
  const [fresh, setFresh] = useState(0);
  const pinned = useRef(true);
  const opened = useRef<string | null>(null);
  const lastId = useRef<string | null>(null);
  const lastCount = useRef(0);
  const offsets = useRef<Record<string, number>>({});
  const group = isGroup(chat);

  // Newest message changed: follow it when the reader is at the bottom (or it
  // is their own), otherwise count it on the pill.
  useEffect(() => {
    if (loading) return;
    const last = items[items.length - 1];
    const id = last?._id || null;
    if (opened.current !== chatId) {
      opened.current = chatId;
      lastId.current = id; lastCount.current = items.length;
      setFresh(0);
      pinned.current = true;
      setTimeout(() => {
        const y = unreadFrom ? offsets.current.__unread : undefined;
        if (y != null) { scroller.current?.scrollTo({ y: Math.max(0, y - 80), animated: false }); pinned.current = false; }
        else scroller.current?.scrollToEnd({ animated: false });
      }, 60);
      return;
    }
    if (id !== lastId.current) {
      const mineNow = last && String(last.sender?._id) === myId;
      if (pinned.current || mineNow) {
        setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 40);
        setFresh(0);
      } else if (items.length > lastCount.current) {
        setFresh((n) => n + (items.length - lastCount.current));
      }
      lastId.current = id;
    }
    lastCount.current = items.length;
  }, [items, loading, chatId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pinned.current && typingNames.length) setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 40);
  }, [typingNames.length]);

  // A reply quote or a search hit: bring that message into view.
  useEffect(() => {
    if (!jumpTo || loading) return;
    const y = offsets.current[jumpTo];
    if (y != null) { scroller.current?.scrollTo({ y: Math.max(0, y - 120), animated: true }); pinned.current = false; }
    onJumped?.();
  }, [jumpTo, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    pinned.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 120;
    if (pinned.current && fresh) setFresh(0);
    if (contentOffset.y < 60 && hasMore && !loadingOlder) onLoadOlder();
  };

  const jumpDown = () => { scroller.current?.scrollToEnd({ animated: true }); setFresh(0); pinned.current = true; };

  const rows: React.ReactNode[] = [];
  let prev: any = null;
  for (const m of items) {
    if (!prev || !sameDay(prev.createdAt, m.createdAt)) {
      const label = dayLabel(m.createdAt);
      rows.push(
        <View key={`d-${m.clientId || m._id}`} style={st.dayRow}>
          {label === 'Today' && <View style={st.dayRule} />}
          <Text style={st.dayPill}>{label}</Text>
          {label === 'Today' && <View style={st.dayRule} />}
        </View>,
      );
      prev = null;
    }
    if (unreadFrom && m._id === unreadFrom) {
      rows.push(
        <View key="unread" style={st.unreadRule} onLayout={(e) => { offsets.current.__unread = e.nativeEvent.layout.y; }}>
          <View style={st.unreadLine} /><Text style={st.unreadText}>Unread messages</Text><View style={st.unreadLine} />
        </View>,
      );
      prev = null;
    }
    const mine = String(m.sender?._id) === myId;
    const cont = prev && String(prev.sender?._id) === String(m.sender?._id)
      && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60000;
    const showWho = group && !mine && !cont;
    rows.push(
      <View key={m.clientId || m._id} style={[st.msgRow, mine && { justifyContent: 'flex-end' }, cont && { marginTop: 4 }]}
        onLayout={(e) => { offsets.current[m._id] = e.nativeEvent.layout.y; }}>
        {group && !mine && <View style={st.msgAv}>{showWho ? <Avatar name={m.sender?.name} size={30} /> : null}</View>}
        <View style={[st.msgCol, mine && { alignItems: 'flex-end' }]}>
          {showWho && (
            <Text style={[st.sender, { color: avatarColor(m.sender?.name || '') }]} numberOfLines={1}>
              {m.sender?.name}{m.sender?.role ? <Text style={st.senderRole}>{`  ·  ${ROLE_LABEL[m.sender.role] || m.sender.role}`}</Text> : null}
            </Text>
          )}
          <Bubble msg={m} mine={mine} chat={chat} peerOnline={peerOnline} isAdmin={isAdmin} observer={observer}
            myId={myId} actions={actions} hideTicks={hideTicks} />
        </View>
      </View>,
    );
    prev = m;
  }

  return (
    <View style={st.threadWrap}>
      <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={st.thread} onScroll={onScroll} scrollEventThrottle={64}
        keyboardShouldPersistTaps="handled" maintainVisibleContentPosition={{ minIndexForVisible: 1 }}>
        {loading ? (
          <View style={st.center}><ActivityIndicator color={C.brand} /></View>
        ) : error && !items.length ? (
          <View style={st.center}>
            <Text style={st.centerText}>{error}</Text>
            {onRetryLoad && <Btn small kind="ghost" icon="refresh" label="Try again" onPress={onRetryLoad} />}
          </View>
        ) : (
          <>
            <View style={st.older}>
              {loadingOlder ? <Text style={st.olderText}>Loading earlier messages…</Text>
                : hasMore ? <Btn small kind="ghost" label="Load earlier messages" onPress={onLoadOlder} /> : null}
            </View>
            {!items.length && (
              <View style={[st.center, { paddingTop: 50 }]}>
                <View style={st.centerIcon}><Ionicons name="chatbubbles-outline" size={30} color={C.brand} /></View>
                <Text style={st.centerTitle}>{observer ? 'No messages' : 'Say hello'}</Text>
                <Text style={st.centerText}>{observer ? 'Nobody has written here yet.' : `This is the start of your conversation${chat?.type === 'direct' ? ` with ${chatName(chat)}` : ''}.`}</Text>
              </View>
            )}
            {rows}
            {typingNames.length > 0 && (
              <View style={[st.msgRow, { marginTop: 12 }]}>
                {group && <View style={st.msgAv}><Avatar name={typingNames[0]} size={30} /></View>}
                <TypingDots />
              </View>
            )}
          </>
        )}
      </ScrollView>
      {fresh > 0 && (
        <TouchableOpacity style={st.jump} onPress={jumpDown} accessibilityLabel={`${fresh} new messages`}>
          <Ionicons name="arrow-down" size={15} color="#fff" />
          <Text style={st.jumpText}>{fresh} new message{fresh === 1 ? '' : 's'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function TypingDots() {
  const [n, setN] = useState(0);
  useEffect(() => { const t = setInterval(() => setN((x) => (x + 1) % 3), 380); return () => clearInterval(t); }, []);
  return (
    <View style={st.typing} accessibilityLabel="typing">
      {[0, 1, 2].map((i) => <View key={i} style={[st.typingDot, i === n && { opacity: 1, transform: [{ translateY: -3 }] }]} />)}
    </View>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────────

const EMOJI = [
  '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😍','🥰','😘',
  '😋','😜','🤪','😎','🤩','🥳','😏','😒','😔','😞','😢','😭','😤','😠','😡','🤯',
  '😳','🥺','😱','😨','😰','😥','🤔','🤗','🤭','🙄','😴','🤤','😷','🤒','🤕','🤢',
  '👍','👎','👌','✌️','🤞','🤝','👏','🙌','🙏','💪','🫶','👋','🖐️','✋','👀','🧠',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💖','💯','🔥','✨','🎉',
  '🎊','🎁','🏆','⭐','🌟','💡','✅','❌','⚠️','❓','❗','📚','📝','📅','🕐','☕',
];
const MAX = 4000;

export function Composer({ draft, setDraft, replyTo, editing, onCancel, onSend, onTyping, disabledReason, myId }: {
  draft: string; setDraft: (t: string) => void; replyTo: any; editing: any; onCancel: () => void;
  onSend: (text: string) => void; onTyping: () => void; disabledReason?: string | null; myId: string;
}) {
  const insets = useSafeAreaInsets();
  const [emojiOpen, setEmojiOpen] = useState(false);
  if (disabledReason) {
    return (
      <View style={[st.composeNotice, { paddingBottom: 14 + insets.bottom }]}>
        <Ionicons name="lock-closed-outline" size={15} color={C.muted} />
        <Text style={st.composeNoticeText}>{disabledReason}</Text>
      </View>
    );
  }
  const text = draft || '';
  const over = [...text].length > MAX;
  const canSend = text.trim().length > 0 && !over;
  const submit = () => { if (canSend) { onSend(text); setEmojiOpen(false); } };
  const ctx = editing || replyTo;

  return (
    <View style={st.composeWrap}>
      {ctx && (
        <View style={st.bar}>
          <Ionicons name={editing ? 'create-outline' : 'arrow-undo-outline'} size={18} color={C.brand} />
          <View style={st.barBody}>
            <Text style={st.barTitle}>{editing ? 'Editing message' : `Replying to ${String(replyTo.sender?._id) === myId ? 'yourself' : (replyTo.sender?.name || 'message')}`}</Text>
            <Text style={st.barText} numberOfLines={1}>{ctx.content || 'Attachment'}</Text>
          </View>
          <TouchableOpacity onPress={onCancel} hitSlop={8} accessibilityLabel="Cancel"><Ionicons name="close" size={20} color={C.muted} /></TouchableOpacity>
        </View>
      )}
      {emojiOpen && (
        <ScrollView style={st.emojiPanel} contentContainerStyle={st.emojiGrid} keyboardShouldPersistTaps="handled">
          {EMOJI.map((e, i) => (
            <TouchableOpacity key={`${e}${i}`} style={st.emojiBtn} onPress={() => setDraft(text + e)} accessibilityLabel={e}>
              <Text style={{ fontSize: 24 }}>{e}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <View style={[st.compose, { paddingBottom: 10 + insets.bottom }]}>
        <View style={st.input}>
          <TouchableOpacity onPress={() => setEmojiOpen((o) => !o)} style={st.emojiToggle} accessibilityLabel="Emoji">
            <Ionicons name={emojiOpen ? 'close' : 'happy-outline'} size={24} color={C.ink3} />
          </TouchableOpacity>
          <TextInput value={text} onChangeText={(v) => { setDraft(v); if (v) onTyping(); }}
            placeholder="Type a message..." placeholderTextColor={C.faint} multiline style={st.textInput}
            numberOfLines={Platform.OS === 'web' ? 1 : undefined}
            accessibilityLabel="Message" />
        </View>
        <TouchableOpacity style={[st.send, !canSend && { backgroundColor: C.brandMuted }]} onPress={submit} disabled={!canSend}
          accessibilityLabel={editing ? 'Save edit' : 'Send message'}>
          <Ionicons name={editing ? 'checkmark' : 'send'} size={20} color="#fff" style={editing ? undefined : { marginLeft: 2 }} />
        </TouchableOpacity>
      </View>
      {[...text].length > MAX - 400 && (
        <Text style={[st.counter, over && { color: C.danger }]}>{[...text].length}/{MAX}</Text>
      )}
    </View>
  );
}


// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { color: '#fff', fontWeight: '600' },
  dot: { position: 'absolute', right: 0, bottom: 0, backgroundColor: C.online, borderWidth: 2, borderColor: '#fff' },

  search: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderWidth: 1, borderColor: C.field, borderRadius: 10, backgroundColor: '#fff' },
  searchInput: { flex: 1, fontSize: 15, color: C.ink, paddingVertical: 0, minWidth: 0 },

  tabsWrap: { borderBottomWidth: 1, borderBottomColor: C.line },
  tab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingTop: 12, paddingBottom: 12 },
  tabText: { fontSize: 14.5, fontWeight: '500', color: C.ink3 },
  tabTextOn: { color: C.brand, fontWeight: '700' },
  tabLine: { position: 'absolute', left: 0, right: 0, bottom: -1, height: 2.5, borderRadius: 2, backgroundColor: C.brand },
  count: { minWidth: 20, height: 20, paddingHorizontal: 6, marginLeft: 6, borderRadius: 10, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  countText: { color: '#fff', fontSize: 11.5, fontWeight: '700' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: C.field, backgroundColor: '#fff' },
  chipOn: { backgroundColor: C.brand, borderColor: C.brand },
  chipText: { fontSize: 13, fontWeight: '500', color: C.ink3 },
  chipTextOn: { color: '#fff' },

  btn: { height: 44, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  btnSm: { height: 36, paddingHorizontal: 12, gap: 6 },
  btnPrimary: { backgroundColor: C.brand },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D8DBE4' },
  btnDanger: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#F3C7C7' },
  btnText: { fontSize: 15, fontWeight: '600' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 11, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.line2 },
  rowBody: { flex: 1, minWidth: 0 },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowNameWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowName: { flexShrink: 1, fontSize: 15.5, fontWeight: '600', color: C.ink },
  rowTime: { fontSize: 12.5, color: C.muted },
  rowPreview: { flex: 1, minWidth: 0, marginTop: 3, fontSize: 14, color: C.ink3 },
  rowTyping: { color: C.brand, fontWeight: '500' },
  rowDeleted: { fontStyle: 'italic', color: C.muted },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 6, marginTop: 3, borderRadius: 10, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11.5, fontWeight: '700' },

  sheetRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '92%' },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D7DAE3', marginTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: C.ink },
  sheetSub: { fontSize: 13, color: C.muted, marginTop: 2 },
  sheetBody: { padding: 16 },
  sheetFoot: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: '#FBFBFD' },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 4 },
  sheetItemText: { flex: 1, fontSize: 15, fontWeight: '500' },
  sheetHint: { fontSize: 13, color: C.faint },

  conn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: C.amberBg, borderBottomWidth: 1, borderBottomColor: '#FDE7BD' },
  connOff: { backgroundColor: '#FEF2F2', borderBottomColor: '#FBD5D5' },
  connText: { fontSize: 12.5, fontWeight: '500', color: C.amberInk, flexShrink: 1 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: '#FFFAF0', borderBottomWidth: 1, borderBottomColor: '#FDE7BD' },
  noticeText: { flex: 1, fontSize: 12.5, color: C.amberInk },

  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.line },
  headBack: { paddingRight: 2 },
  headWho: { flex: 1, minWidth: 0 },
  headNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headName: { flexShrink: 1, fontSize: 17, fontWeight: '700', color: C.ink },
  headStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  headDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.online },
  headOnline: { fontSize: 13, fontWeight: '500', color: C.ink2 },
  headAway: { fontSize: 13, color: C.muted, marginTop: 1 },
  headTyping: { fontSize: 13, color: C.brand, fontWeight: '500', marginTop: 1 },
  headCtx: { fontSize: 12, color: C.muted, marginTop: 2 },
  tagWarn: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: '#FFF4E0' },
  tagWarnText: { fontSize: 11, fontWeight: '600', color: '#B45309' },

  threadWrap: { flex: 1, backgroundColor: C.canvas },
  thread: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 14 },
  older: { alignItems: 'center', minHeight: 30, justifyContent: 'center', paddingVertical: 4 },
  olderText: { fontSize: 12.5, color: C.muted },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16, marginBottom: 6 },
  dayRule: { flex: 1, height: 1, backgroundColor: '#E3E6EE' },
  dayPill: { fontSize: 13, fontWeight: '600', color: '#374151', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E3E6EE', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 5 },
  unreadRule: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, marginBottom: 2 },
  unreadLine: { flex: 1, height: 1, backgroundColor: '#C9C6FB' },
  unreadText: { fontSize: 12, fontWeight: '700', color: C.brand },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 12 },
  msgAv: { width: 30 },
  msgCol: { maxWidth: '82%', minWidth: 0 },
  sender: { fontSize: 12.5, fontWeight: '600', marginLeft: 4, marginBottom: 3 },
  senderRole: { color: C.muted, fontWeight: '500' },
  bubble: { paddingHorizontal: 14, paddingTop: 9, paddingBottom: 7, borderRadius: 12, maxWidth: '100%' },
  bubbleIn: { backgroundColor: C.bubbleIn },
  bubbleOut: { backgroundColor: C.bubbleOut },
  bubbleDeleted: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: '#D5D8E1' },
  bubbleFailed: { backgroundColor: '#FDECEC' },
  inline: { flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  msgText: { fontSize: 15, lineHeight: 21, color: C.ink2, flexShrink: 1 },
  struck: { textDecorationLine: 'line-through', opacity: 0.75 },
  deletedText: { fontSize: 14, fontStyle: 'italic', color: C.muted },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 3 },
  metaText: { fontSize: 11.5, color: C.muted },
  edited: { fontStyle: 'italic' },
  adminNote: { fontSize: 11, fontWeight: '700', color: C.danger, marginBottom: 3 },
  fwd: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  fwdText: { fontSize: 11.5, fontStyle: 'italic', color: C.muted },
  quote: { borderLeftWidth: 3, borderLeftColor: C.brand, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5, marginBottom: 6 },
  quoteWho: { fontSize: 12, fontWeight: '700', color: C.brand },
  quoteText: { fontSize: 12.5, color: C.ink3 },
  attImage: { width: 200, height: 150, borderRadius: 8, marginBottom: 6 },
  attFile: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  attName: { fontSize: 13.5, color: C.brand, flexShrink: 1 },
  fail: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  failText: { fontSize: 12, color: '#B91C1C', flexShrink: 1 },
  failBtn: { fontSize: 12.5, fontWeight: '700', color: '#B91C1C', textDecorationLine: 'underline' },
  reacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -3, paddingHorizontal: 6 },
  react: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
  reactMine: { borderColor: '#C9C6FB', backgroundColor: C.brandSoft },

  typing: { flexDirection: 'row', gap: 4, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: C.bubbleIn },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#9AA1B2', opacity: 0.5 },

  jump: { position: 'absolute', right: 16, bottom: 14, zIndex: 6, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: C.brand, shadowColor: C.brand, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  jumpText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  center: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 40, paddingHorizontal: 20 },
  centerIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  centerTitle: { fontSize: 17, fontWeight: '700', color: C.ink },
  centerText: { fontSize: 14, color: C.muted, textAlign: 'center' },

  composeWrap: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  barBody: { flex: 1, minWidth: 0, borderLeftWidth: 3, borderLeftColor: C.brand, paddingLeft: 9 },
  barTitle: { fontSize: 12.5, fontWeight: '700', color: C.brand },
  barText: { fontSize: 13, color: C.ink3 },
  emojiPanel: { maxHeight: 220, borderBottomWidth: 1, borderBottomColor: C.line },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 6 },
  emojiBtn: { width: '12.5%', alignItems: 'center', paddingVertical: 6 },
  compose: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12, paddingTop: 10 },
  input: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingLeft: 8, paddingRight: 14, borderWidth: 1, borderColor: '#DFE2EA', borderRadius: 24, backgroundColor: '#fff' },
  emojiToggle: { width: 34, height: 34, borderRadius: 17, marginBottom: 6, alignItems: 'center', justifyContent: 'center' },
  textInput: { flex: 1, minWidth: 0, fontSize: 15.5, color: C.ink, maxHeight: 120, paddingTop: Platform.OS === 'ios' ? 14 : 12, paddingBottom: Platform.OS === 'ios' ? 14 : 12 },
  send: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', right: 74, bottom: 2, fontSize: 11, color: C.faint },
  composeNotice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 14, paddingHorizontal: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line },
  composeNoticeText: { fontSize: 13.5, color: C.muted, flexShrink: 1, textAlign: 'center' },
});
