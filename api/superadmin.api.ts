import api from './axios';

// ── Dashboard ────────────────────────────────────────────────────────────────
export const getDashboard = () => api.get('/super-admin/dashboard');

// ── Schools ──────────────────────────────────────────────────────────────────
export const getSchools   = (params?: object) => api.get('/super-admin/schools', { params });
export const getSchool    = (id: string)       => api.get(`/super-admin/schools/${id}`);
export const createSchool = (data: object)     => api.post('/super-admin/schools', data);
export const updateSchool = (id: string, data: object) => api.put(`/super-admin/schools/${id}`, data);
export const deleteSchool = (id: string)       => api.delete(`/super-admin/schools/${id}`);

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

// ── Designation permissions (per school) ─────────────────────────────────────
// The same matrix a school admin edits, addressed by school.
export const getDesignationMatrix   = (schoolId: string) => api.get(`/super-admin/schools/${schoolId}/designations`);
export const saveDesignationMatrix  = (schoolId: string, designations: object[]) =>
  api.put(`/super-admin/schools/${schoolId}/designations`, { designations });
export const createDesignation      = (schoolId: string, data: object) =>
  api.post(`/super-admin/schools/${schoolId}/designations/new`, data);
export const updateDesignation      = (schoolId: string, id: string, data: object) =>
  api.put(`/super-admin/schools/${schoolId}/designations/${id}`, data);
export const deleteDesignation      = (schoolId: string, id: string) =>
  api.delete(`/super-admin/schools/${schoolId}/designations/${id}`);
export const getDesignationTeachers = (schoolId: string, id: string) =>
  api.get(`/super-admin/schools/${schoolId}/designations/${id}/teachers`);

// ── Logs ─────────────────────────────────────────────────────────────────────
export const getLogs = (params?: object) => api.get('/super-admin/logs', { params });

// ── Notifications ────────────────────────────────────────────────────────────
export const getNotifications = ()             => api.get('/super-admin/notifications');
export const sendNotification = (data: object) => api.post('/super-admin/notifications/send', data);
