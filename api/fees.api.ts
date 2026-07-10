import api from './axios';

// ── Admin ────────────────────────────────────────────────────────────────────
export const getAdminDashboard   = () => api.get('/fees/admin/dashboard');
export const getFeeCategories    = () => api.get('/fees/admin/fee-categories');
export const createFeeCategory   = (data: object) => api.post('/fees/admin/fee-categories', data);
export const updateFeeCategory   = (id: string, data: object) => api.put(`/fees/admin/fee-categories/${id}`, data);
export const getFeeHeads         = () => api.get('/fees/admin/fee-heads');
export const createFeeHead       = (data: object) => api.post('/fees/admin/fee-heads', data);
export const getFeeStructures    = () => api.get('/fees/admin/fee-structures');
export const createFeeStructure  = (data: object) => api.post('/fees/admin/fee-structures', data);
export const getFineRules        = () => api.get('/fees/admin/fine-rules');
export const createFineRule      = (data: object) => api.post('/fees/admin/fine-rules', data);
export const getConcessions      = () => api.get('/fees/admin/concessions');
export const createConcession    = (data: object) => api.post('/fees/admin/concessions', data);
export const getStudentFees      = (params?: object) => api.get('/fees/admin/student-fees', { params });
export const getStudentFeeDetail = (id: string) => api.get(`/fees/admin/student-fees/${id}`);
export const getPayments         = (params?: object) => api.get('/fees/admin/payments', { params });
export const recordPayment       = (data: object) => api.post('/fees/admin/payments/record', data);
export const approvePayment      = (id: string) => api.post(`/fees/admin/payments/${id}/approve`);
export const rejectPayment       = (id: string) => api.post(`/fees/admin/payments/${id}/reject`);
export const getSchoolLedger     = () => api.get('/fees/admin/ledger');
export const getFeeSettings      = () => api.get('/fees/admin/settings');
export const updateFeeSettings   = (data: object) => api.put('/fees/admin/settings', data);
export const getCollectionReport = (params?: object) => api.get('/fees/admin/reports/collection', { params });
export const getDuesReport       = (params?: object) => api.get('/fees/admin/reports/dues', { params });

// ── Student ──────────────────────────────────────────────────────────────────
export const getMyFees     = () => api.get('/fees/student/my-fees');
export const getMyLedger   = () => api.get('/fees/student/ledger');
export const getMyPayments = () => api.get('/fees/student/payments');
export const payNow        = (data: object) => api.post('/fees/student/pay', data);

// ── Parent ───────────────────────────────────────────────────────────────────
export const getMyChildren = () => api.get('/fees/parent/fees');
export const getChildFees  = (childId: string) => api.get(`/fees/parent/child/${childId}/fees`);
export const parentPayNow  = (childId: string, data: object) => api.post(`/fees/parent/child/${childId}/pay`, data);
