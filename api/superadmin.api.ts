import api from './axios';

// ── Dashboard ────────────────────────────────────────────────────────────────
export const getDashboard = () => api.get('/super-admin/dashboard');

// ── Schools ──────────────────────────────────────────────────────────────────
export const getSchools   = (params?: object) => api.get('/super-admin/schools', { params });
export const getSchool    = (id: string)       => api.get(`/super-admin/schools/${id}`);
export const createSchool = (data: object)     => api.post('/super-admin/schools', data);
export const updateSchool = (id: string, data: object) => api.put(`/super-admin/schools/${id}`, data);
export const deleteSchool = (id: string)       => api.delete(`/super-admin/schools/${id}`);
// What the delete dialog needs before it will offer the button: a school that
// still has accounts cannot be deleted, and the blocking accounts are listed.
export const checkSchoolDeletable = (id: string) => api.get(`/super-admin/schools/${id}/delete-check`);

// ── Users ────────────────────────────────────────────────────────────────────
export const getUsers          = (params?: object) => api.get('/super-admin/users', { params });
export const getUser           = (id: string)       => api.get(`/super-admin/users/${id}`);
export const createUser        = (data: object)     => api.post('/super-admin/users', data);
export const updateUser        = (id: string, data: object) => api.put(`/super-admin/users/${id}`, data);
export const deleteUser        = (id: string)       => api.delete(`/super-admin/users/${id}`);
export const toggleUser        = (id: string)       => api.patch(`/super-admin/users/${id}/toggle`);
export const generateLoginLink = (id: string)       => api.post(`/super-admin/users/${id}/login-link`);

// ── Permissions (per-school module flags) ────────────────────────────────────
export const getPermissions    = ()             => api.get('/super-admin/permissions');
export const updatePermissions = (data: object) => api.put('/super-admin/permissions', data);

// ── Logs ─────────────────────────────────────────────────────────────────────
export const getLogs = (params?: object) => api.get('/super-admin/logs', { params });

// ── Notifications ────────────────────────────────────────────────────────────
export const getNotifications = ()             => api.get('/super-admin/notifications');
export const sendNotification = (data: object) => api.post('/super-admin/notifications/send', data);
