import api from './axios';

// ── Notifications ────────────────────────────────────────────────────────────
export const getNotifications       = (page = 1)    => api.get('/admin/notifications', { params: { page, limit: 30 } });
export const sendNotification       = (data: object) => api.post('/admin/notifications/send', data);

// ── Classes (for notification targeting) ────────────────────────────────────
export const getClassesWithSections = ()            => api.get('/admin/classes-with-sections');
