import api from './axios';

// ── Chats & messages ─────────────────────────────────────────────────────────
export const getChats       = ()                 => api.get('/chat/chats');
export const getMessages    = (chatId: string, params?: object) => api.get(`/chat/chats/${chatId}/messages`, { params });
export const sendMessage    = (chatId: string, data: object)    => api.post(`/chat/chats/${chatId}/messages`, data);
export const getChatMembers = (chatId: string)   => api.get(`/chat/chats/${chatId}/members`);

// ── Contacts / search / unread ───────────────────────────────────────────────
export const getContacts    = (params?: object)  => api.get('/chat/contacts', { params });
export const searchMessages = (params: object)   => api.get('/chat/search', { params });
export const getUnreadCount = ()                 => api.get('/chat/unread-count');
export const heartbeat      = ()                 => api.post('/chat/heartbeat');

// ── Create chats ─────────────────────────────────────────────────────────────
export const startDirectChat = (targetUserId: string) => api.post('/chat/direct', { targetUserId });
export const createGroup     = (data: object)          => api.post('/chat/group', data);

// ── Message actions ──────────────────────────────────────────────────────────
export const editMessage    = (msgId: string, content: string) => api.patch(`/chat/messages/${msgId}`, { content });
export const deleteMessage  = (msgId: string)  => api.delete(`/chat/messages/${msgId}`);
export const toggleReaction = (msgId: string, emoji: string) => api.post(`/chat/messages/${msgId}/react`, { emoji });

// ── Group management ─────────────────────────────────────────────────────────
export const updateGroupSettings = (chatId: string, data: object)   => api.patch(`/chat/group/${chatId}/settings`, data);
export const addMember           = (chatId: string, memberId: string) => api.post(`/chat/group/${chatId}/member`, { memberId });
export const removeMember        = (chatId: string, memberId: string) => api.delete(`/chat/group/${chatId}/member/${memberId}`);

// ── Per-chat preferences ─────────────────────────────────────────────────────
export const toggleMute    = (chatId: string) => api.post(`/chat/${chatId}/mute`);
export const toggleArchive = (chatId: string) => api.post(`/chat/${chatId}/archive`);
