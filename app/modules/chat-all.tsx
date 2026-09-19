import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import * as chatApi from '@/api/chat.api';
import { unwrap } from '@/components/ui/kit';
import { Avatar, SearchField, Tabs, Chips, Btn, Notice, MessageList, type MsgActions } from '@/components/chat/parts';
import { HistorySheet } from '@/components/chat/dialogs';
import { C, ROLE_LABEL, listTime, shortName, backendRole, errText } from '@/components/chat/format';

const ROLES: [string, string][] = [['', 'Everyone'], ['teacher', 'Teachers'], ['student', 'Students'], ['parent', 'Parents'], ['school_admin', 'Admins']];
const personLine = (p: any) => {
  const role = ROLE_LABEL[p.role] || p.role || '';
  return p.line && p.line !== role ? `${role} · ${p.line}` : role;
};
const groupLabel = (c: any) => (c.kind === 'class' ? 'Class group' : c.kind === 'subject' ? `${c.subjectName || 'Subject'} group` : c.type === 'broadcast' ? 'Announcements' : 'Group');

/**
 * View All Chats — the school admin's read-only view of every conversation, as
 * a drill-down on the phone: people who have chatted → one person's
 * conversations (one-to-one and groups) → the full history. Each level is its
 * own screen (?u=person, ?u=person&c=chat), so Back walks up the way it came.
 */
export default function ChatAllScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ u?: string; c?: string }>();
  const u = params.u ? String(params.u) : '';
  const c = params.c ? String(params.c) : '';

  if (user && backendRole(user.role) !== 'school_admin') {
    return (
      <>
        <Stack.Screen options={{ title: 'All Chats' }} />
        <View style={s.center}>
          <Text style={s.centerTitle}>For school admins only</Text>
          <Btn small kind="ghost" label="Back" onPress={() => router.back()} />
        </View>
      </>
    );
  }
  if (c) return <ObservedThread chatId={c} personId={u} />;
  if (u) return <PersonChats userId={u} />;
  return <People />;
}

// ─── Level 1: people who have chatted ─────────────────────────────────────────

function People() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [state, setState] = useState<{ rows: any[]; total: number; counts: any; page: number; pages: number; loading: boolean }>(
    { rows: [], total: 0, counts: {}, page: 1, pages: 1, loading: true });
  const req = useRef(0);

  const load = useCallback(async (page = 1, append = false) => {
    const n = ++req.current;
    setState((x) => ({ ...x, loading: true }));
    try {
      const res: any = await chatApi.getAdminPeople({ q: q.trim() || undefined, role: role || undefined, page, limit: 40 });
      if (n !== req.current) return;
      setState((x) => ({
        rows: append ? [...x.rows, ...(res?.data || [])] : (res?.data || []),
        total: res?.total || 0, counts: res?.counts || {}, page: res?.page || page, pages: res?.pages || 1, loading: false,
      }));
    } catch (e) {
      if (n === req.current) setState((x) => ({ ...x, loading: false }));
      Alert.alert('All Chats', errText(e));
    }
  }, [q, role]);

  useEffect(() => { const t = setTimeout(() => load(), q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);

  const chips = ROLES.map(([k, label]) => [k, k && state.counts?.[k] ? `${label} · ${state.counts[k]}` : label] as [string, string]);

  return (
    <>
      <Stack.Screen options={{ title: 'All Chats' }} />
      <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => load()} tintColor={C.brand} />}
        onScroll={(e) => {
          const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
          if (contentSize.height - contentOffset.y - layoutMeasurement.height < 200 && !state.loading && state.page < state.pages) load(state.page + 1, true);
        }} scrollEventThrottle={200}>
        <Text style={s.lead}>{state.loading && !state.rows.length ? 'Loading…' : `${state.total} ${state.total === 1 ? 'person has' : 'people have'} chatted · read-only`}</Text>
        <SearchField value={q} onChange={setQ} placeholder="Search people..." />
        <View style={{ height: 10 }} />
        <Chips options={chips} value={role} onChange={setRole} />
        <View style={{ marginTop: 8 }}>
          {state.loading && !state.rows.length ? <ActivityIndicator style={{ marginTop: 30 }} color={C.brand} />
            : !state.rows.length ? <Text style={s.empty}>{q ? `No one matches “${q}”.` : 'Nobody has chatted yet.'}</Text>
              : state.rows.map((p) => (
                <TouchableOpacity key={p._id} style={s.row} onPress={() => router.push({ pathname: '/modules/chat-all', params: { u: p._id } } as any)} accessibilityLabel={p.name}>
                  <Avatar name={p.name} size={46} image={p.profileImage} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={s.line}>
                      <Text style={s.name} numberOfLines={1}>{p.name}</Text>
                      {!p.isActive && <Text style={s.left}>Inactive</Text>}
                    </View>
                    <Text style={s.sub} numberOfLines={1}>{personLine(p)}</Text>
                  </View>
                  <View style={s.side}>
                    <Text style={s.time}>{listTime(p.lastActivity)}</Text>
                    <Text style={s.count}>{p.conversations} chat{p.conversations === 1 ? '' : 's'}</Text>
                  </View>
                </TouchableOpacity>
              ))}
          {state.loading && state.rows.length > 0 && <Text style={s.empty}>Loading more…</Text>}
        </View>
      </ScrollView>
    </>
  );
}

// ─── Level 2: one person's conversations ──────────────────────────────────────

function PersonChats({ userId }: { userId: string }) {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');

  const load = useCallback(async () => {
    try { setData(unwrap(await chatApi.getAdminPersonChats(userId))); setError(''); }
    catch (e) { setError(errText(e)); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const p = data?.person;
  const convs = useMemo(() => {
    const list: any[] = data?.conversations || [];
    const term = q.trim().toLowerCase();
    return list.filter((c) => (kind === 'all' || (kind === 'direct' ? c.type === 'direct' : c.type !== 'direct'))
      && (!term || c.displayName.toLowerCase().includes(term) || (c.lastMessage?.content || '').toLowerCase().includes(term)));
  }, [data, q, kind]);

  if (!p) {
    return (
      <>
        <Stack.Screen options={{ title: 'Conversations' }} />
        <View style={s.center}>{error ? <Text style={s.centerText}>{error}</Text> : <ActivityIndicator color={C.brand} />}</View>
      </>
    );
  }
  const st = p.stats;
  return (
    <>
      <Stack.Screen options={{ title: p.name }} />
      <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.brand} />}>
        <View style={s.person}>
          <Avatar name={p.name} size={56} image={p.profileImage} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={s.line}><Text style={s.personName} numberOfLines={1}>{p.name}</Text>{!p.isActive && <Text style={s.left}>Inactive</Text>}</View>
            <Text style={s.sub}>{personLine(p)}</Text>
            <View style={s.stats}>
              <Text style={s.stat}><Text style={s.statB}>{st.conversations}</Text> conversation{st.conversations === 1 ? '' : 's'}</Text>
              <Text style={s.stat}><Text style={s.statB}>{st.direct}</Text> direct</Text>
              <Text style={s.stat}><Text style={s.statB}>{st.groups}</Text> group{st.groups === 1 ? '' : 's'}</Text>
              <Text style={s.stat}><Text style={s.statB}>{st.messagesSent}</Text> sent</Text>
            </View>
          </View>
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <SearchField value={q} onChange={setQ} placeholder={`Search ${shortName(p.name)}'s conversations...`} />
          <Tabs value={kind} onChange={setKind} style={{ marginTop: 8 }} tabs={[
            { key: 'all', label: 'All' }, { key: 'direct', label: 'Direct', count: st.direct }, { key: 'group', label: 'Groups', count: st.groups },
          ]} />
          {!convs.length ? (
            <Text style={s.empty}>{q ? `Nothing matches “${q}”.` : `${shortName(p.name)} has no ${kind === 'all' ? '' : kind === 'direct' ? 'direct ' : 'group '}conversations.`}</Text>
          ) : convs.map((cv) => {
            const direct = cv.type === 'direct';
            const last = cv.lastMessage;
            const who = last ? (last.sender?._id === p._id ? shortName(p.name) : shortName(last.sender?.name || '')) : '';
            return (
              <TouchableOpacity key={cv._id} style={s.row} onPress={() => router.push({ pathname: '/modules/chat-all', params: { u: userId, c: cv._id } } as any)} accessibilityLabel={cv.displayName}>
                <Avatar name={cv.displayName} size={46} image={cv.with?.profileImage} group={direct ? false : (cv.classSection ? 'glyph' : true)} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={s.line}>
                    <Text style={s.name} numberOfLines={1}>{cv.displayName}</Text>
                    {!cv.stillMember && <Text style={s.left}>Left</Text>}
                    <Text style={s.time}>{listTime(last?.createdAt || cv.lastActivity)}</Text>
                  </View>
                  <View style={s.line}>
                    <Text style={[s.preview, last?.isDeleted && { fontStyle: 'italic' }]} numberOfLines={1}>
                      {!last ? 'No messages' : last.isDeleted ? `${who}: message deleted` : `${who}: ${last.content || 'Attachment'}`}
                    </Text>
                    <Text style={s.count}>{cv.messageCount}</Text>
                  </View>
                  <Text style={s.meta} numberOfLines={1}>{direct ? personLine(cv.with || { role: '' }) : `${groupLabel(cv)} · ${cv.memberCount} members`}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </>
  );
}

// ─── Level 3: the conversation, read-only ─────────────────────────────────────

function ObservedThread({ chatId, personId }: { chatId: string; personId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [t, setT] = useState<{ items: any[]; hasMore: boolean; loading: boolean; loadingOlder: boolean; error: string }>(
    { items: [], hasMore: false, loading: true, loadingOlder: false, error: '' });
  const [profile, setProfile] = useState<any>(null);
  const [person, setPerson] = useState<any>(null);
  const [historyMsg, setHistoryMsg] = useState<any>(null);
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  const ref = useRef(t);
  ref.current = t;

  const load = useCallback(async () => {
    setT({ items: [], hasMore: false, loading: true, loadingOlder: false, error: '' });
    try {
      const res: any = await chatApi.getMessages(chatId, { limit: 60 });
      setT({ items: (unwrap(res) || []).map((m: any) => ({ ...m, status: 'sent' })), hasMore: !!res?.hasMore, loading: false, loadingOlder: false, error: '' });
    } catch (e) { setT((x) => ({ ...x, loading: false, error: errText(e) })); }
  }, [chatId]);

  useEffect(() => {
    load();
    chatApi.getChatProfile(chatId).then((r) => setProfile(unwrap(r))).catch(() => {});
    if (personId) chatApi.getAdminPersonChats(personId).then((r) => setPerson(unwrap(r))).catch(() => {});
  }, [chatId, personId, load]);

  /** Older pages; `all` keeps going until the start of the conversation. */
  const older = async (all = false) => {
    const cur = ref.current;
    if (cur.loadingOlder || !cur.hasMore || !cur.items.length) return;
    setT((x) => ({ ...x, loadingOlder: true }));
    let before = cur.items[0].createdAt;
    let more = true;
    let got: any[] = [];
    try {
      for (let guard = 0; more && guard < (all ? 60 : 1); guard++) {
        const res: any = await chatApi.getMessages(chatId, { before, limit: 100 });
        const page = (unwrap(res) || []).map((m: any) => ({ ...m, status: 'sent' }));
        got = [...page, ...got];
        more = !!res?.hasMore && page.length > 0;
        before = page[0]?.createdAt;
      }
      setT((x) => ({ ...x, items: [...got, ...x.items], hasMore: more, loadingOlder: false }));
    } catch {
      setT((x) => ({ ...x, loadingOlder: false }));
    }
  };

  const conv = person?.conversations?.find((x: any) => x._id === chatId);
  const who = person?.person;
  const direct = (conv?.type || profile?.type) === 'direct';
  const title = conv
    ? (direct ? `${who?.name} ↔ ${conv.displayName}` : conv.displayName)
    : profile ? (direct ? (profile.members || []).map((m: any) => m.name).join(' ↔ ') : profile.name) : 'Conversation';
  const sub = conv
    ? [direct ? 'Direct conversation' : `${groupLabel(conv)} · ${conv.memberCount} members`, `${conv.messageCount} message${conv.messageCount === 1 ? '' : 's'}`,
      who ? `${shortName(who.name)} sent ${conv.sentCount}` : '', !conv.stillMember && who ? `${shortName(who.name)} has left` : ''].filter(Boolean).join(' · ')
    : profile ? (direct ? 'Direct conversation' : `${groupLabel(profile)} · ${profile.memberCount} members`) : '';
  const chat = { _id: chatId, type: conv?.type || profile?.type || 'group', kind: conv?.kind || profile?.kind };

  const actions: MsgActions = {
    open: () => {}, react: () => {}, retry: () => {}, discard: () => {},
    jump: (id) => setJumpTo(id),
    history: (m) => setHistoryMsg(m),
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={[s.head, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back"><Ionicons name="chevron-back" size={26} color={C.ink2} /></TouchableOpacity>
          {direct && conv ? (
            <View style={s.pair}>
              <Avatar name={who?.name} size={38} image={who?.profileImage} />
              <View style={s.pairB}><Avatar name={conv.displayName} size={38} image={conv.with?.profileImage} /></View>
            </View>
          ) : <Avatar name={title} size={44} group={direct ? false : ((conv?.classSection || profile?.classSection) ? 'glyph' : true)} />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.headTitle} numberOfLines={1}>{title}</Text>
            <Text style={s.headSub} numberOfLines={1}>{sub}</Text>
          </View>
          <TouchableOpacity onPress={load} hitSlop={10} accessibilityLabel="Refresh"><Ionicons name="refresh" size={21} color={C.ink2} /></TouchableOpacity>
        </View>
        <Notice action={t.hasMore ? <Text style={s.full} onPress={() => older(true)}>{t.loadingOlder ? 'Loading…' : 'Full history'}</Text> : null}>
          Read-only. {who && conv ? `${shortName(who.name)}'s messages are on the right. ` : ''}Members are not notified.
        </Notice>
        <MessageList chatId={chatId} items={t.items} chat={chat} loading={t.loading} error={t.error} onRetryLoad={load}
          hasMore={t.hasMore} loadingOlder={t.loadingOlder} onLoadOlder={() => older(false)}
          myId={personId || ''} isAdmin observer hideTicks peerOnline={false} typingNames={[]} unreadFrom={null}
          actions={actions} jumpTo={jumpTo} onJumped={() => setJumpTo(null)} />
      </View>
      <HistorySheet msg={historyMsg} onClose={() => setHistoryMsg(null)} />
    </>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, backgroundColor: '#fff' },
  centerTitle: { fontSize: 17, fontWeight: '700', color: C.ink },
  centerText: { fontSize: 14, color: C.muted, textAlign: 'center' },
  lead: { fontSize: 13, color: C.muted, marginBottom: 10 },
  empty: { fontSize: 14, color: C.muted, textAlign: 'center', paddingVertical: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, flexGrow: 1, fontSize: 15, fontWeight: '600', color: C.ink },
  sub: { fontSize: 13, color: C.ink3, marginTop: 2 },
  preview: { flex: 1, minWidth: 0, fontSize: 13.5, color: C.ink3, marginTop: 2 },
  meta: { fontSize: 12, color: C.muted, marginTop: 2 },
  side: { alignItems: 'flex-end', gap: 4 },
  time: { fontSize: 12, color: C.muted },
  count: { fontSize: 11.5, fontWeight: '600', color: C.ink3, backgroundColor: '#F1F2F6', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 1 },
  left: { fontSize: 11, fontWeight: '600', color: '#B45309', backgroundColor: '#FFF4E0', borderRadius: 999, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 1 },
  person: { flexDirection: 'row', gap: 14, padding: 16, borderBottomWidth: 1, borderBottomColor: C.line2 },
  personName: { flexShrink: 1, fontSize: 17, fontWeight: '700', color: C.ink },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  stat: { fontSize: 12, color: C.ink3, backgroundColor: '#F4F5FA', borderRadius: 7, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4 },
  statB: { fontWeight: '700', color: C.ink },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.line },
  pair: { width: 64, height: 46 },
  pairB: { position: 'absolute', left: 24, top: 8, borderRadius: 22, borderWidth: 2, borderColor: '#fff' },
  headTitle: { fontSize: 16, fontWeight: '700', color: C.ink },
  headSub: { fontSize: 12.5, color: C.muted, marginTop: 1 },
  full: { fontSize: 12.5, fontWeight: '700', color: C.amberInk, textDecorationLine: 'underline' },
});
