import api from './axios';

// ── Admin ─────────────────────────────────────────────────────────────────────
export const getDashboard = () => api.get('/inventory/admin/dashboard');
export const getMeta      = () => api.get('/inventory/admin/meta');
export const getItems     = (params?: any) => api.get('/inventory/admin/items', { params });
export const getStock     = (params?: any) => api.get('/inventory/admin/stock', { params });
export const getRequests  = (params?: any) => api.get('/inventory/admin/requests', { params });
export const getOrders    = (params?: any) => api.get('/inventory/admin/orders', { params });

// ── Admin: the redesigned read models ─────────────────────────────────────────
// One endpoint per screen — tiles, filter options and a page of rows, already
// joined. See school-backend/controllers/inventoryAdmin.controller.js.
export const getOverview    = () => api.get('/inventory/admin/overview');
export const getItemBoard   = (params?: any) => api.get('/inventory/admin/item-board', { params });
export const getStockBoard  = (params?: any) => api.get('/inventory/admin/stock-board', { params });
export const getRequestBoard= (params?: any) => api.get('/inventory/admin/request-board', { params });
export const getIssueBoard  = (params?: any) => api.get('/inventory/admin/issue-board', { params });

// ── Teacher (purchase requests) ───────────────────────────────────────────────
export const getTeacherMeta = () => api.get('/inventory/teacher/meta');
// The board is the list plus its tiles, tabs and paging; `getMyRequests` is the
// bare list the old screen used and is kept for anything still calling it.
export const getMyRequestBoard = (params?: any) => api.get('/inventory/teacher/request-board', { params });
export const getMyRequests  = () => api.get('/inventory/teacher/requests');
export const getMyRequest   = (id: string) => api.get(`/inventory/teacher/requests/${id}`);
export const createMyRequest = (d: any) => api.post('/inventory/teacher/requests', d);
export const cancelMyRequest = (id: string) => api.post(`/inventory/teacher/requests/${id}/cancel`);
