import api from './axios';

// ── Admin ────────────────────────────────────────────────────────────────────
export const getDashboard    = () => api.get('/payroll/admin/dashboard');
export const getStructures   = () => api.get('/payroll/admin/structures');
export const createStructure = (data: object) => api.post('/payroll/admin/structures', data);
export const getAssignments  = () => api.get('/payroll/admin/assignments');
export const assignEmployee  = (data: object) => api.post('/payroll/admin/assignments', data);
export const getPayrollRuns  = () => api.get('/payroll/admin/runs');
export const createRun       = (data: object) => api.post('/payroll/admin/runs', data);
export const getRunDetail    = (id: string) => api.get(`/payroll/admin/runs/${id}`);
export const updateRunStatus = (id: string, status: string) => api.patch(`/payroll/admin/runs/${id}/status`, { status });
export const publishRun      = (id: string) => api.post(`/payroll/admin/runs/${id}/publish`);
export const updateRunEntry  = (id: string, entryId: string, data: object) => api.put(`/payroll/admin/runs/${id}/entries/${entryId}`, data);
export const getReports      = () => api.get('/payroll/admin/reports');
export const getAuditLog     = () => api.get('/payroll/admin/audit');

// ── Teacher ──────────────────────────────────────────────────────────────────
export const getMyCtc        = () => api.get('/payroll/teacher/ctc');
export const getMyPayslips   = () => api.get('/payroll/teacher/payslips');
export const getPayslipDetail = (id: string) => api.get(`/payroll/teacher/payslips/${id}`);
