import api from './axios';

// ── Admin ─────────────────────────────────────────────────────────────────────
export const getDashboard = () => api.get('/inventory/admin/dashboard');
export const getMeta      = () => api.get('/inventory/admin/meta');
export const getItems     = (params?: any) => api.get('/inventory/admin/items', { params });
export const getStock     = (params?: any) => api.get('/inventory/admin/stock', { params });
export const getRequests  = (params?: any) => api.get('/inventory/admin/requests', { params });
export const getOrders    = (params?: any) => api.get('/inventory/admin/orders', { params });

// ── Teacher (purchase requests) ───────────────────────────────────────────────
export const getTeacherMeta = () => api.get('/inventory/teacher/meta');
export const getMyRequests  = () => api.get('/inventory/teacher/requests');
export const getMyRequest   = (id: string) => api.get(`/inventory/teacher/requests/${id}`);
export const createMyRequest = (d: any) => api.post('/inventory/teacher/requests', d);
export const cancelMyRequest = (id: string) => api.post(`/inventory/teacher/requests/${id}/cancel`);
