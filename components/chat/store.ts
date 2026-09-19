/**
 * Live chat state for the phone — one store shared by the chat list and the
 * thread screen (they are separate screens here, where the web has one page).
 * The same design as the web's useChatLive (school-frontend/src/pages/chat):
 *
 * Sending
 *   1. an optimistic bubble appears at once (status 'sending')
 *   2. it goes over the socket and waits for the gateway's ack, which carries
 *      the saved message — or the reason it was refused ('failed', retryable)
 *   3. no socket / no ack → the same attempt goes over REST; the server dedupes
 *      on clientId, so an ack that was merely slow never makes a second copy
 *   4. no network at all → 'queued', sent in order when the connection returns
 *
 * Staying in sync
 *   The gateway says `chat:ready` once a (re)connected socket has joined its
 *   rooms; that is when the list reloads and each open thread catches up. The
 *   list is patched in place from events — nothing polls.
 */
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as chatApi from '@/api/chat.api';
import { connectSocket, emitWithAck, getSocket, onSocketState, socketState, type SocketState } from '@/utils/socket';
import { newClientId, backendRole } from './format';
import { unwrap, MODULE_BLOCKED_CODES } from '@/components/ui/kit';

export type Msg = any;
export type Chat = any;
export type Thread = {
  items: Msg[]; hasMore: boolean; loading: boolean; loaded: boolean;
  loadingOlder?: boolean; observer?: boolean; error?: string;
};
export type ChatState = {
  chats: Chat[];
  chatsLoading: boolean;
  disabled: boolean;
  threads: Record<string, Thread>;
  typing: Record<string, Record<string, number>>;
  online: Set<string>;
  conn: SocketState;
  error: string;
};

const SEND_ACK_MS = 6000;
const TYPING_TTL_MS = 6000;
const PENDING = new Set(['sending', 'queued', 'failed']);

const byTime = (a: Msg, b: Msg) => {
  const pa = PENDING.has(a.status), pb = PENDING.has(b.status);
  if (pa !== pb) return pa ? 1 : -1;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
};
const sameMessage = (a: Msg, b: Msg) => a._id === b._id || (!!a.clientId && !!b.clientId && a.clientId === b.clientId);
function mergeMessages(existing: Msg[], incoming: Msg[]) {
  const out = existing.slice();
  for (const m of incoming) {
    const i = out.findIndex((x) => sameMessage(x, m));
    if (i >= 0) out[i] = { ...out[i], ...m };
    else out.push(m);
  }
  return out.sort(byTime);
}
const asSent = (m: Msg) => ({ ...m, status: 'sent' });
const preview = (m: Msg) => ({
  _id: m._id, content: m.content, type: m.type, isDeleted: !!m.isDeleted, createdAt: m.createdAt,
  sender: m.sender ? { _id: String(m.sender._id), name: m.sender.name } : null,
  hasAttachments: (m.attachments || []).length > 0,
});
const EMPTY_THREAD: Thread = { items: [], hasMore: false, loading: false, loaded: false };

class ChatStore {
  state: ChatState = this.blank();
  private listeners = new Set<() => void>();
  me = { id: '', role: '', name: '' };
  private activeId: string | null = null;
  private appActive = AppState.currentState === 'active';
  private queue: { chatId: string; clientId: string; payload: any }[] = [];
  private inflight = new Set<string>();
  private readTimers: Record<string, any> = {};
  private summaryTimers: Record<string, any> = {};
  private bound: any = null;
  private typingTimer: any = null;
  private typingChat: string | null = null;
  private sweeper: any = null;
  private resyncTimer: any = null;
  onChatGone: ((chatId: string) => void) | null = null;

  constructor() {
    onSocketState((s) => this.set({ conn: s }));
    AppState.addEventListener('change', (s) => {
      this.appActive = s === 'active';
      if (this.appActive && this.activeId) {
        const c = this.state.chats.find((x) => x._id === this.activeId);
        if (c?.unreadCount) this.markRead(c._id);
      }
    });
    // Keep saying "typing" while typing — the other side forgets after TYPING_TTL_MS.
    setInterval(() => {
      const sock = getSocket();
      if (this.typingChat && sock?.connected) sock.emit('chat:typing', { chatId: this.typingChat });
    }, 3000);
  }

  private blank(): ChatState {
    return { chats: [], chatsLoading: true, disabled: false, threads: {}, typing: {}, online: new Set(), conn: socketState(), error: '' };
  }

  // ── store plumbing ──────────────────────────────────────────────────────────
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  get = () => this.state;
  private set(patch: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) {
    const p = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...p };
    this.listeners.forEach((fn) => fn());
  }

  /** Called by the chat screens with the signed-in user. A different user starts afresh. */
  init(user: { _id?: string; role?: string; name?: string } | null | undefined) {
    if (!user?._id) return;
    const id = String(user._id);
    if (id !== this.me.id) {
      this.me = { id, role: backendRole(user.role), name: user.name || '' };
      this.state = this.blank();
      this.queue = [];
      this.activeId = null;
      this.listeners.forEach((fn) => fn());
      this.loadChats();
    }
    this.bind();
  }

  get isAdmin() { return this.me.role === 'school_admin'; }

  setActive(chatId: string | null) { this.activeId = chatId; }
  private viewing(chatId: string) { return this.activeId === chatId && this.appActive; }

  // ── list ────────────────────────────────────────────────────────────────────
  loadChats = async () => {
    try {
      const list = unwrap(await chatApi.getChats());
      const chats = Array.isArray(list) ? list : [];
      const online = new Set(this.state.online);
      for (const c of chats) {
        if (!c.otherUser) continue;
        if (c.otherUser.isOnline) online.add(c.otherUser._id); else online.delete(c.otherUser._id);
      }
      this.set({ chats, online, chatsLoading: false, error: '' });
    } catch (err: any) {
      if (MODULE_BLOCKED_CODES.includes(err?.data?.code)) this.set({ disabled: true, chatsLoading: false });
      else this.set({ chatsLoading: false, error: err?.message || '' });
    }
  };

  patchChat(chatId: string, patch: any) {
    this.set((s) => ({
      chats: s.chats.map((c) => (c._id === chatId ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c)),
    }));
  }

  upsertChat(row: Chat) {
    if (!row?._id) return;
    this.set((s) => {
      const rest = s.chats.filter((c) => c._id !== row._id);
      return { chats: [row, ...rest].sort((a, b) => new Date(b.lastActivity || 0).getTime() - new Date(a.lastActivity || 0).getTime()) };
    });
  }

  removeChat(chatId: string) { this.set((s) => ({ chats: s.chats.filter((c) => c._id !== chatId) })); }

  /** Fetch one conversation's row and put it in the list (new chat, or counts changed). */
  refreshChat = async (chatId: string): Promise<Chat | null> => {
    if (this.inflight.has(chatId)) return null;
    this.inflight.add(chatId);
    try {
      const row = unwrap(await chatApi.getChat(chatId));
      if (!row?._id) return null;
      this.upsertChat(row);
      return row;
    } catch { return null; }
    finally { this.inflight.delete(chatId); }
  };

  private refreshChatSoon(chatId: string, ms = 500) {
    clearTimeout(this.summaryTimers[chatId]);
    this.summaryTimers[chatId] = setTimeout(() => this.refreshChat(chatId), ms);
  }

  private bumpChat(chatId: string, msg: Msg, countUnread = false) {
    this.set((s) => {
      const i = s.chats.findIndex((c) => c._id === chatId);
      if (i < 0) return {};
      const c = s.chats[i];
      const newer = !c.lastMessage || new Date(msg.createdAt) >= new Date(c.lastMessage.createdAt || 0) || c.lastMessage._id === msg._id;
      if (!newer && !countUnread) return {};
      const next = {
        ...c,
        lastMessage: newer ? preview(msg) : c.lastMessage,
        lastActivity: newer ? msg.createdAt : c.lastActivity,
        unreadCount: countUnread ? (c.unreadCount || 0) + 1 : c.unreadCount,
      };
      return { chats: [next, ...s.chats.slice(0, i), ...s.chats.slice(i + 1)] };
    });
  }

  mergeOnline(people: any[]) {
    this.set((s) => {
      const next = new Set(s.online);
      for (const p of people || []) {
        if (!p?._id || p._id === this.me.id) continue;
        if (p.isOnline) next.add(p._id); else next.delete(p._id);
      }
      return { online: next };
    });
  }

  // ── threads ─────────────────────────────────────────────────────────────────
  private setThread(chatId: string, fn: (t: Thread) => Thread) {
    this.set((s) => ({ threads: { ...s.threads, [chatId]: fn(s.threads[chatId] || EMPTY_THREAD) } }));
  }
  private upsertMessage(chatId: string, msg: Msg) {
    this.set((s) => {
      const t = s.threads[chatId];
      if (!t) return {};
      return { threads: { ...s.threads, [chatId]: { ...t, items: mergeMessages(t.items, [msg]) } } };
    });
  }
  private patchMessage(chatId: string, match: (m: Msg) => boolean, patch: any) {
    this.set((s) => {
      const t = s.threads[chatId];
      if (!t) return {};
      let hit = false;
      const items = t.items.map((m) => {
        if (!match(m)) return m;
        hit = true;
        return { ...m, ...(typeof patch === 'function' ? patch(m) : patch) };
      });
      return hit ? { threads: { ...s.threads, [chatId]: { ...t, items } } } : {};
    });
  }

  /**
   * @param freshAfter  messages from others newer than this were never on
   *                    screen (the unread ones) — they count as just received,
   *                    so a single-emoji one plays its animation.
   */
  openThread = async (chatId: string, { observer = false, freshAfter = null as string | null } = {}) => {
    const t = this.state.threads[chatId];
    if (t?.loaded) { this.catchUp(chatId); return; }
    this.setThread(chatId, (cur) => ({ ...cur, loading: true, observer }));
    try {
      const res: any = await chatApi.getMessages(chatId, { limit: 40 });
      const cutoff = freshAfter ? new Date(freshAfter).getTime() : null;
      const items = (Array.isArray(unwrap(res)) ? unwrap(res) : []).map((m: Msg) => asSent(
        cutoff != null && String(m.sender?._id) !== this.me.id && new Date(m.createdAt).getTime() > cutoff ? { ...m, fresh: true } : m,
      ));
      this.setThread(chatId, (cur) => ({ ...cur, items: mergeMessages(cur.items, items), hasMore: !!res?.hasMore, loading: false, loaded: true, observer, error: '' }));
    } catch (err: any) {
      this.setThread(chatId, (cur) => ({ ...cur, loading: false, loaded: false, error: err?.message || 'Could not load messages' }));
    }
  };

  /** Drop a cached thread (an observer view that should be read afresh). */
  forgetThread(chatId: string) {
    this.set((s) => { const next = { ...s.threads }; delete next[chatId]; return { threads: next }; });
  }

  loadOlder = async (chatId: string) => {
    const t = this.state.threads[chatId];
    if (!t || t.loadingOlder || !t.hasMore) return;
    const oldest = t.items.find((m) => !PENDING.has(m.status));
    if (!oldest) return;
    this.setThread(chatId, (cur) => ({ ...cur, loadingOlder: true }));
    try {
      const res: any = await chatApi.getMessages(chatId, { before: oldest.createdAt, limit: 40 });
      const items = (Array.isArray(unwrap(res)) ? unwrap(res) : []).map(asSent);
      this.setThread(chatId, (cur) => ({ ...cur, items: mergeMessages(cur.items, items), hasMore: !!res?.hasMore, loadingOlder: false }));
    } catch {
      this.setThread(chatId, (cur) => ({ ...cur, loadingOlder: false }));
    }
  };

  /** Everything that arrived in a loaded thread while we could not hear it. */
  catchUp = async (chatId: string) => {
    const t = this.state.threads[chatId];
    if (!t?.loaded) return;
    const sent = t.items.filter((m) => !PENDING.has(m.status));
    const newest = sent[sent.length - 1];
    try {
      const res: any = await chatApi.getMessages(chatId, newest ? { after: newest.createdAt, limit: 100 } : { limit: 40 });
      const items = (Array.isArray(unwrap(res)) ? unwrap(res) : []).map(asSent);
      if (items.length) this.setThread(chatId, (cur) => ({ ...cur, items: mergeMessages(cur.items, items) }));
      if (items.length && this.viewing(chatId)) this.markRead(chatId);
    } catch { /* next reconnect tries again */ }
  };

  // ── read ────────────────────────────────────────────────────────────────────
  markRead = (chatId: string, messageId: string | null = null) => {
    if (!this.state.chats.some((c) => c._id === chatId)) return;   // observers are not members
    this.patchChat(chatId, { unreadCount: 0, lastReadAt: new Date().toISOString() });
    clearTimeout(this.readTimers[chatId]);
    this.readTimers[chatId] = setTimeout(async () => {
      try {
        const res: any = await emitWithAck('chat:read', { chatId, messageId }, 4000);
        if (!res?.ok) throw new Error('not acked');
      } catch {
        try { await chatApi.markRead(chatId, messageId); } catch { /* next open marks it */ }
      }
    }, 250);
  };

  // ── send ────────────────────────────────────────────────────────────────────
  private settle(chatId: string, clientId: string, message: Msg) {
    if (!message?._id) return;
    this.upsertMessage(chatId, asSent({ ...message, clientId }));
    this.bumpChat(chatId, message);
    this.patchChat(chatId, { unreadCount: 0 });
  }
  private failSend(chatId: string, clientId: string, reason?: string) {
    this.patchMessage(chatId, (m) => m.clientId === clientId, { status: 'failed', error: reason || 'Not sent' });
  }

  private deliver = async (chatId: string, clientId: string, payload: any) => {
    this.patchMessage(chatId, (m) => m.clientId === clientId, { status: 'sending', error: null });
    let ack: any = null;
    try { ack = await emitWithAck('chat:send', payload, SEND_ACK_MS); } catch { ack = null; }
    if (ack?.ok) return this.settle(chatId, clientId, ack.data?.message);
    // Refused on its merits (empty, not a member, read-only, too fast…).
    if (ack && !ack.ok && ack.status && ack.status < 500) return this.failSend(chatId, clientId, ack.message);

    // No socket, no answer, or the gateway could not reach the service: REST.
    try {
      const res = await chatApi.sendMessage(chatId, payload);
      return this.settle(chatId, clientId, unwrap(res));
    } catch (err: any) {
      // The app's axios answers a network failure with status 0.
      if (err?.status) return this.failSend(chatId, clientId, err.message);
      this.patchMessage(chatId, (m) => m.clientId === clientId, { status: 'queued' });
      if (!this.queue.some((q) => q.clientId === clientId)) this.queue.push({ chatId, clientId, payload });
    }
  };

  flushQueue = async () => {
    const pending = this.queue.splice(0);
    for (const q of pending) await this.deliver(q.chatId, q.clientId, q.payload);   // in order
  };

  send(chatId: string, { content, replyTo = null, isForwarded = false }: { content: string; replyTo?: Msg | null; isForwarded?: boolean }) {
    const text = String(content || '').trim();
    if (!chatId || !text) return null;
    const clientId = newClientId();
    const optimistic = {
      _id: clientId, clientId, chat: chatId, status: 'sending', fresh: true,
      sender: { _id: this.me.id, name: this.me.name, role: this.me.role },
      content: text, type: 'text', attachments: [], reactions: [], isForwarded,
      replyTo: replyTo ? {
        _id: replyTo._id, content: replyTo.content, isDeleted: !!replyTo.isDeleted, type: replyTo.type,
        sender: replyTo.sender ? { _id: replyTo.sender._id, name: replyTo.sender.name } : null,
      } : null,
      createdAt: new Date().toISOString(),
    };
    this.upsertMessage(chatId, optimistic);
    this.bumpChat(chatId, optimistic);
    this.deliver(chatId, clientId, { chatId, clientId, content: text, replyTo: replyTo?._id || null, isForwarded });
    return clientId;
  }

  retry(chatId: string, clientId: string) {
    const m = this.state.threads[chatId]?.items.find((x) => x.clientId === clientId);
    if (!m) return;
    this.queue = this.queue.filter((q) => q.clientId !== clientId);
    this.deliver(chatId, clientId, { chatId, clientId, content: m.content, replyTo: m.replyTo?._id || null, isForwarded: !!m.isForwarded });
  }

  discard(chatId: string, clientId: string) {
    this.queue = this.queue.filter((q) => q.clientId !== clientId);
    this.set((s) => {
      const t = s.threads[chatId];
      if (!t) return {};
      return { threads: { ...s.threads, [chatId]: { ...t, items: t.items.filter((m) => m.clientId !== clientId || !PENDING.has(m.status)) } } };
    });
  }

  // ── edit / delete / react (REST; the room hears it from the writer) ─────────
  async editMessage(chatId: string, msg: Msg, content: string) {
    const text = String(content || '').trim();
    if (!text || text === msg.content) return;
    const before = { content: msg.content, isEdited: msg.isEdited, editedAt: msg.editedAt };
    this.patchMessage(chatId, (m) => m._id === msg._id, { content: text, isEdited: true, editedAt: new Date().toISOString() });
    try { await chatApi.editMessage(msg._id, text); }
    catch (err) { this.patchMessage(chatId, (m) => m._id === msg._id, before); throw err; }
  }

  async deleteMessage(chatId: string, msg: Msg) {
    await chatApi.deleteMessage(msg._id);
    this.patchMessage(chatId, (m) => m._id === msg._id, this.isAdmin ? { isDeleted: true } : { isDeleted: true, content: '', attachments: [] });
    this.patchChat(chatId, (c: Chat) => (c.lastMessage?._id === msg._id ? { lastMessage: { ...c.lastMessage, isDeleted: true, content: '' } } : {}));
  }

  async react(chatId: string, msg: Msg, emoji: string) {
    const reactions = unwrap(await chatApi.toggleReaction(msg._id, emoji));
    if (Array.isArray(reactions)) this.patchMessage(chatId, (m) => m._id === msg._id, { reactions });
  }

  // ── typing ──────────────────────────────────────────────────────────────────
  emitTyping(chatId: string) {
    const sock = getSocket();
    if (!sock?.connected || !chatId) return;
    if (this.typingChat !== chatId) { sock.emit('chat:typing', { chatId }); this.typingChat = chatId; }
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => { sock.emit('chat:stop_typing', { chatId }); this.typingChat = null; }, 2500);
  }
  stopTyping() {
    const sock = getSocket();
    clearTimeout(this.typingTimer);
    if (sock?.connected && this.typingChat) sock.emit('chat:stop_typing', { chatId: this.typingChat });
    this.typingChat = null;
  }
  private startSweeper() {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => {
      const all = this.state.typing;
      if (!Object.keys(all).length) return;
      const now = Date.now();
      let changed = false;
      const next: ChatState['typing'] = {};
      for (const [cid, who] of Object.entries(all)) {
        const kept = Object.fromEntries(Object.entries(who).filter(([, exp]) => exp > now));
        if (Object.keys(kept).length !== Object.keys(who).length) changed = true;
        if (Object.keys(kept).length) next[cid] = kept;
      }
      if (changed) this.set({ typing: next });
    }, 1500);
  }

  // ── socket ──────────────────────────────────────────────────────────────────
  private resync = () => {
    clearTimeout(this.resyncTimer);
    this.resyncTimer = setTimeout(async () => {
      await this.loadChats();
      for (const [cid, t] of Object.entries(this.state.threads)) if (t.loaded && !t.observer) this.catchUp(cid);
      this.flushQueue();
    }, 150);
  };

  private bind() {
    const sock = connectSocket();
    if (!sock || this.bound === sock) return;
    this.bound = sock;
    this.startSweeper();
    let connectedOnce = sock.connected;

    sock.on('connect', () => {
      // A gateway that predates chat:ready still gets a catch-up, a little later.
      if (connectedOnce) setTimeout(this.resync, 1200);
      connectedOnce = true;
      this.flushQueue();
    });
    sock.on('chat:ready', this.resync);

    sock.on('chat:message', (raw: Msg) => {
      if (!raw?._id || !raw.chat) return;
      // `fresh`: arrived live, so a single-emoji message plays its animation.
      const msg = asSent({ ...raw, clientId: raw.clientId || raw.tempId || null, fresh: true });
      const chatId = String(msg.chat);
      const mine = String(msg.sender?._id || msg.sender) === this.me.id;
      const viewing = this.viewing(chatId);
      this.upsertMessage(chatId, msg);
      if (!this.state.chats.some((c) => c._id === chatId)) { this.refreshChat(chatId); return; }
      this.bumpChat(chatId, msg, !mine && !viewing);
      if (mine) this.patchChat(chatId, { unreadCount: 0 });
      if (!mine) {
        const t = this.state.typing[chatId];
        if (t?.[msg.sender?._id]) {
          const { [msg.sender._id]: _gone, ...rest } = t;
          this.set((s) => ({ typing: { ...s.typing, [chatId]: rest } }));
        }
        if (viewing) this.markRead(chatId, msg._id);
      }
    });

    sock.on('chat:message_read', ({ chatId, userId, readAt }: any) => {
      if (!chatId) return;
      if (String(userId) === this.me.id) { this.patchChat(chatId, { unreadCount: 0 }); return; }
      const chat = this.state.chats.find((c) => c._id === chatId);
      if (!chat) return;
      if (chat.type === 'direct') this.patchChat(chatId, { otherReadAt: readAt, readUpTo: readAt });
      else this.refreshChatSoon(chatId, 800);   // "everyone has read" needs the slowest reader
    });

    sock.on('chat:message_edited', ({ messageId, chatId, content, editedAt, previousContent }: any) => {
      this.patchMessage(chatId, (m) => m._id === messageId, (m: Msg) => ({
        content, isEdited: true, editedAt,
        ...(this.isAdmin ? { editHistory: [...(m.editHistory || []), { content: previousContent ?? m.content, editedAt }] } : {}),
      }));
      this.patchChat(chatId, (c: Chat) => (c.lastMessage?._id === messageId ? { lastMessage: { ...c.lastMessage, content } } : {}));
    });

    sock.on('chat:message_deleted', ({ messageId, chatId }: any) => {
      this.patchMessage(chatId, (m) => m._id === messageId, this.isAdmin ? { isDeleted: true } : { isDeleted: true, content: '', attachments: [] });
      this.patchChat(chatId, (c: Chat) => (c.lastMessage?._id === messageId ? { lastMessage: { ...c.lastMessage, isDeleted: true, content: '' } } : {}));
    });

    sock.on('chat:reaction', ({ messageId, chatId, reactions }: any) => {
      this.patchMessage(chatId, (m) => m._id === messageId, { reactions: reactions || [] });
    });

    sock.on('chat:typing', ({ chatId, userId }: any) => {
      if (!chatId || String(userId) === this.me.id) return;
      this.set((s) => ({ typing: { ...s.typing, [chatId]: { ...(s.typing[chatId] || {}), [userId]: Date.now() + TYPING_TTL_MS } } }));
    });
    sock.on('chat:stop_typing', ({ chatId, userId }: any) => {
      const t = this.state.typing[chatId];
      if (!t?.[userId]) return;
      const { [userId]: _gone, ...rest } = t;
      this.set((s) => {
        const next = { ...s.typing };
        if (Object.keys(rest).length) next[chatId] = rest; else delete next[chatId];
        return { typing: next };
      });
    });

    sock.on('chat:user_online', ({ userId }: any) => {
      if (this.state.online.has(String(userId))) return;
      this.set((s) => ({ online: new Set([...s.online, String(userId)]) }));
    });
    sock.on('chat:user_offline', ({ userId }: any) => {
      const now = new Date().toISOString();
      this.set((s) => {
        const online = new Set(s.online); online.delete(String(userId));
        return {
          online,
          chats: s.chats.map((c) => (c.otherUser?._id === String(userId)
            ? { ...c, otherUser: { ...c.otherUser, lastSeenAt: now, isOnline: false }, deliveredUpTo: now } : c)),
        };
      });
    });

    sock.on('chat:group_created', ({ chatId }: any) => { if (chatId) this.refreshChat(String(chatId)); });
    sock.on('chat:member_added', ({ chatId, userId }: any) => {
      if (chatId) this.refreshChatSoon(String(chatId), String(userId) === this.me.id ? 0 : 400);
    });
    sock.on('chat:member_removed', ({ chatId, userId }: any) => {
      if (!chatId) return;
      if (String(userId) === this.me.id) { this.removeChat(String(chatId)); this.onChatGone?.(String(chatId)); }
      else this.refreshChatSoon(String(chatId), 400);
    });
    sock.on('chat:group_updated', ({ chatId, name, description, isReadOnly }: any) => {
      if (!chatId) return;
      this.patchChat(String(chatId), () => ({
        ...(name !== undefined ? { name, displayName: name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(isReadOnly !== undefined ? { isReadOnly } : {}),
        _profileStamp: Date.now(),
      }));
    });
    sock.on('chat:prefs', ({ chatId, ...prefs }: any) => { if (chatId) this.patchChat(String(chatId), prefs); });
    sock.on('chat:error', ({ message, clientId }: any) => {
      if (!clientId) return;
      for (const [cid, t] of Object.entries(this.state.threads)) {
        if (t.items.some((m) => m.clientId === clientId)) { this.failSend(cid, clientId, message); return; }
      }
    });
  }
}

export const chatStore = new ChatStore();

/** Subscribe to one slice of the chat store (return stable references from `pick`). */
export function useChatStore<T>(pick: (s: ChatState) => T): T {
  return useSyncExternalStore(chatStore.subscribe, () => pick(chatStore.state), () => pick(chatStore.state));
}
