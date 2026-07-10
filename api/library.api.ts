import api from './axios';

// ── Librarian / Admin (manage) ───────────────────────────────────────────────
export const getDashboard         = ()             => api.get('/library/dashboard');
export const getBooks             = (params?: object) => api.get('/library/books', { params });
export const getBook              = (id: string)   => api.get(`/library/books/${id}`);
export const createBook           = (data: object) => api.post('/library/books', data);
export const updateBook           = (id: string, data: object) => api.put(`/library/books/${id}`, data);
export const deleteBook           = (id: string)   => api.delete(`/library/books/${id}`);
export const getIssuances         = (params?: object) => api.get('/library/issuances', { params });
export const getIssueForm         = (params?: object) => api.get('/library/issue', { params });
export const issueBook            = (data: object) => api.post('/library/issue', data);
export const getReturnForm        = (params?: object) => api.get('/library/return', { params });
export const returnBook           = (data: object) => api.post('/library/return', data);
export const renewBook            = (id: string)   => api.post(`/library/issuances/${id}/renew`);
export const getReservations      = (params?: object) => api.get('/library/reservations', { params });
export const markReservationReady = (id: string)   => api.post(`/library/reservations/${id}/mark-ready`);
export const cancelReservation    = (id: string)   => api.delete(`/library/reservations/${id}`);
export const getFines             = (params?: object) => api.get('/library/fines', { params });
export const collectFine          = (id: string)   => api.post(`/library/fines/${id}/collect`);
export const waiveFine            = (id: string, data?: object) => api.post(`/library/fines/${id}/waive`, data ?? {});
export const getPolicy            = ()             => api.get('/library/policy');
export const updatePolicy         = (data: object) => api.put('/library/policy', data);
export const getAuditLog          = (params?: object) => api.get('/library/audit-log', { params });
