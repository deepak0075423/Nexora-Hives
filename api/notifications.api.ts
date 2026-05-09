import api from './axios';

// ── Inbox / receipts (all authenticated users) ──────────────────────────────
export const getInbox           = (page = 1) => api.get('/notifications/inbox',     { params: { page, limit: 20 } });
export const getAllNotifs        = (page = 1) => api.get('/notifications/all',        { params: { page, limit: 20 } });
export const getUnreadCount     = ()          => api.get('/notifications/unread-count');
export const getSent            = (page = 1) => api.get('/notifications/sent',       { params: { page, limit: 20 } });

// ── Actions ──────────────────────────────────────────────────────────────────
export const markAllRead        = ()          => api.post('/notifications/mark-all-read');
export const clearAll           = ()          => api.post('/notifications/clear-all');
export const markOneRead        = (id: string) => api.patch(`/notifications/${id}/mark-read`);
export const clearOne           = (id: string) => api.delete(`/notifications/${id}`);

// ── Helper for admin send form ───────────────────────────────────────────────
export const getSectionsByClass = (classId: string) => api.get(`/notifications/classes/${classId}/sections`);
