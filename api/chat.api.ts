import api from './axios';

// ── Chats & messages ─────────────────────────────────────────────────────────
export const getChats       = ()                 => api.get('/chat/chats');
export const getChat        = (chatId: string)   => api.get(`/chat/chats/${chatId}`);
export const getChatProfile = (chatId: string)   => api.get(`/chat/chats/${chatId}/profile`);
export const markRead       = (chatId: string, messageId?: string | null) => api.post(`/chat/chats/${chatId}/read`, { messageId });
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
export const addMembers          = (chatId: string, memberIds: string[]) => api.post(`/chat/group/${chatId}/member`, { memberIds });
export const syncGroup           = (chatId: string) => api.post(`/chat/group/${chatId}/sync`);
export const getGroupCandidates  = (chatId: string) => api.get(`/chat/group/${chatId}/candidates`);

// ── Class & subject groups (made by their teachers) ──────────────────────────
export const getClassGroupOptions = ()             => api.get('/chat/class-groups/options');
export const getClassGroupRoster  = (params: object) => api.get('/chat/class-groups/roster', { params });
export const createClassGroup     = (data: object) => api.post('/chat/class-groups', data);

// ── School admin: View All Chats (read-only) ─────────────────────────────────
export const getAdminPeople      = (params?: object) => api.get('/chat/admin/people', { params });
export const getAdminPersonChats = (userId: string)  => api.get(`/chat/admin/people/${userId}`);

// ── Per-chat preferences ─────────────────────────────────────────────────────
export const toggleMute    = (chatId: string) => api.post(`/chat/${chatId}/mute`);
export const toggleArchive = (chatId: string) => api.post(`/chat/${chatId}/archive`);
