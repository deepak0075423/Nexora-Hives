import api from './axios';

// ── Notifications ────────────────────────────────────────────────────────────
export const getNotifications = ()            => api.get('/super-admin/notifications');
export const sendNotification = (data: object) => api.post('/super-admin/notifications/send', data);

// ── Schools list (for notification targeting) ────────────────────────────────
export const getSchools       = ()            => api.get('/super-admin/schools');
