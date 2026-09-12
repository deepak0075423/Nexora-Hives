import api from './axios';

// ── Inbox / receipts (all authenticated users) ──────────────────────────────
export const getInbox           = (page = 1) => api.get('/notifications/inbox',     { params: { page, limit: 20 } });
export const getUnreadCount     = ()          => api.get('/notifications/unread-count');

/** What the notifications screen lists. Every filter is a server parameter. */
export interface NotifQuery {
  page?: number;
  limit?: number;
  /** 'inbox' | 'archived' | 'all' — omitted, every receipt comes back. */
  box?: string;
  q?: string;
  module?: string;
  priority?: string;
  /** 'activity' (a module raised it) | 'announcement' (a person sent it) */
  kind?: string;
  /** 'read' | 'unread' */
  read?: string;
  sort?: string;
}

export const getAllNotifs = (params: NotifQuery = {}) =>
  api.get('/notifications/all', { params: { page: 1, limit: 20, ...params } });

export const getSent = (params: NotifQuery = {}) =>
  api.get('/notifications/sent', { params: { page: 1, limit: 20, ...params } });

// ── Actions ──────────────────────────────────────────────────────────────────
export const markAllRead        = ()           => api.post('/notifications/mark-all-read');
export const clearAll           = ()           => api.post('/notifications/clear-all');
/** Clears every notification already read, and only those. */
export const archiveRead        = ()           => api.post('/notifications/archive-read');
export const markOneRead        = (id: string) => api.patch(`/notifications/${id}/mark-read`);
export const markOneUnread      = (id: string) => api.patch(`/notifications/${id}/mark-unread`);
/** Archive one. The DELETE is the bell's "clear", which is the same thing. */
export const clearOne           = (id: string) => api.delete(`/notifications/${id}`);
export const restoreOne         = (id: string) => api.post(`/notifications/${id}/restore`);

/**
 * The selection bar. `action` is read | unread | archive | restore | delete —
 * delete removes the reader's receipt, never the notification itself, which is
 * one row shared with everybody else who received it.
 */
export const bulkNotifications  = (ids: string[], action: string) =>
  api.post('/notifications/bulk', { ids, action });
/** Empties one box — 'inbox', 'archived' or 'all'. */
export const deleteAllNotifications = (box: string) =>
  api.post('/notifications/delete-all', { box });

// ── Helper for admin send form ───────────────────────────────────────────────
export const getSectionsByClass = (classId: string) => api.get(`/notifications/classes/${classId}/sections`);

// Where one notification goes — and marks it read. Behind every deep link, push
// tap and emailed "Open in Aksharum" button, so a link works from any device.
export const resolveNotification = (receiptId: string) => api.get(`/notifications/${receiptId}/resolve`);
