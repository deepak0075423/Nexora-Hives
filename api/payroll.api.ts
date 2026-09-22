import api from './axios';

/** Drop empty values so a cleared filter does not travel as `?department=`. */
const qs = (params: Record<string, any> = {}) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.append(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : '';
};

// ── Admin: shell ─────────────────────────────────────────────────────────────
export const getOverview    = (p?: object) => api.get(`/payroll/admin/overview${qs(p)}`);
export const getDashboard   = () => api.get('/payroll/admin/dashboard');
export const getEmployees   = (p?: object) => api.get(`/payroll/admin/employees${qs(p)}`);
export const getSettings    = () => api.get('/payroll/admin/settings');
export const updateSettings = (data: object) => api.put('/payroll/admin/settings', data);
export const getAuditLog    = (p?: object) => api.get(`/payroll/admin/audit${qs(p)}`);

// ── Salary structures ────────────────────────────────────────────────────────
export const getStructures      = (p?: object) => api.get(`/payroll/admin/structures${qs(p)}`);
export const getLibrary         = () => api.get('/payroll/admin/structures/library');
export const previewStructure   = (data: object) => api.post('/payroll/admin/structures/preview', data);
export const createFromTemplate = (data: object) => api.post('/payroll/admin/structures/template', data);
export const createStructure    = (data: object) => api.post('/payroll/admin/structures', data);
export const updateStructure    = (id: string, data: object) => api.put(`/payroll/admin/structures/${id}`, data);
export const deleteStructure    = (id: string) => api.delete(`/payroll/admin/structures/${id}`);
export const toggleStructure    = (id: string, data?: object) => api.patch(`/payroll/admin/structures/${id}/toggle`, data || {});
export const setDefaultStructure = (id: string) => api.patch(`/payroll/admin/structures/${id}/default`, {});
export const duplicateStructure  = (id: string, data?: object) => api.post(`/payroll/admin/structures/${id}/duplicate`, data || {});

// ── Assignments ──────────────────────────────────────────────────────────────
export const getAssignments   = (p?: object) => api.get(`/payroll/admin/assignments${qs(p)}`);
export const getAssignment    = (id: string) => api.get(`/payroll/admin/assignments/${id}`);
export const assignEmployee   = (data: object) => api.post('/payroll/admin/assignments', data);
export const bulkAssign       = (data: object) => api.post('/payroll/admin/assignments/bulk', data);
export const copyAssignments  = (data: object) => api.post('/payroll/admin/assignments/copy', data);
export const updateAssignment = (id: string, data: object) => api.put(`/payroll/admin/assignments/${id}`, data);
export const deleteAssignment = (id: string) => api.delete(`/payroll/admin/assignments/${id}`);
export const deactivateAssignment = (id: string, data?: object) => api.patch(`/payroll/admin/assignments/${id}/deactivate`, { ...(data || {}), isActive: false });
export const activateAssignment   = (id: string, data?: object) => api.patch(`/payroll/admin/assignments/${id}/activate`, { ...(data || {}), isActive: true });
export const updateCtc        = (id: string, data: object) => api.put(`/payroll/admin/assignments/${id}/ctc`, data);
export const getCtcHistory    = (id: string) => api.get(`/payroll/admin/assignments/${id}/ctc-history`);
export const getSettlement    = (id: string, p?: object) => api.get(`/payroll/admin/assignments/${id}/settlement${qs(p)}`);
export const applySettlement  = (id: string, data: object) => api.post(`/payroll/admin/assignments/${id}/settlement`, data);

// ── Payroll runs ─────────────────────────────────────────────────────────────
export const getPayrollRuns  = (p?: object) => api.get(`/payroll/admin/runs${qs(p)}`);
export const getRunDetail    = (id: string, p?: object) => api.get(`/payroll/admin/runs/${id}${qs(p)}`);
export const createRun       = (data: object) => api.post('/payroll/admin/runs', data);
export const recomputeRun    = (id: string, data?: object) => api.post(`/payroll/admin/runs/${id}/recompute`, data || {});
export const updateRunStatus = (id: string, status: string) => api.patch(`/payroll/admin/runs/${id}/status`, { status });
export const publishRun      = (id: string) => api.post(`/payroll/admin/runs/${id}/publish`, {});
export const unpublishRun    = (id: string) => api.post(`/payroll/admin/runs/${id}/unpublish`, {});
export const cancelRun       = (id: string, data?: object) => api.patch(`/payroll/admin/runs/${id}/cancel`, data || {});
export const deleteRun       = (id: string) => api.delete(`/payroll/admin/runs/${id}`);
export const updateRunEntry  = (id: string, entryId: string, data: object) => api.put(`/payroll/admin/runs/${id}/entries/${entryId}`, data);
export const holdRunEntry    = (id: string, entryId: string, data?: object) => api.patch(`/payroll/admin/runs/${id}/entries/${entryId}/hold`, data || {});

// ── Advances and loans ───────────────────────────────────────────────────────
export const getAdvances   = (p?: object) => api.get(`/payroll/admin/advances${qs(p)}`);
export const createAdvance = (data: object) => api.post('/payroll/admin/advances', data);
export const closeAdvance  = (id: string, data?: object) => api.patch(`/payroll/admin/advances/${id}/close`, data || {});

// ── Reimbursement claims ─────────────────────────────────────────────────────
export const getClaims   = (p?: object) => api.get(`/payroll/admin/claims${qs(p)}`);
export const createClaim = (data: object) => api.post('/payroll/admin/claims', data);
export const decideClaim = (id: string, data: object) => api.patch(`/payroll/admin/claims/${id}`, data);
export const deleteClaim = (id: string) => api.delete(`/payroll/admin/claims/${id}`);

// ── Reports ──────────────────────────────────────────────────────────────────
export const getReportsOverview = (p?: object) => api.get(`/payroll/admin/reports/overview${qs(p)}`);
export const getReports     = (p?: object) => api.get(`/payroll/admin/reports${qs(p)}`);
export const generateReport = (data: object) => api.post('/payroll/admin/reports', data);
export const deleteReport   = (id: string) => api.delete(`/payroll/admin/reports/${id}`);

// ── My own pay ───────────────────────────────────────────────────────────────
// `/me/*` rather than `/teacher/*`: school admins are paid by this module too,
// and the old path refused them their own payslip.
export const getMyCtc         = () => api.get('/payroll/me/ctc');
export const getMyPayslips    = (p?: object) => api.get(`/payroll/me/payslips${qs(p)}`);
export const getPayslipDetail = (id: string) => api.get(`/payroll/me/payslips/${id}`);

/**
 * Downloads come back as a Blob and are handed to the phone's share sheet —
 * see saveAndShare() in components/payroll/parts.tsx. They are NOT opened as
 * URLs: every one of these endpoints is behind the session token, and a plain
 * browser open would arrive unauthenticated.
 */
export const downloadMyPayslip   = (id: string) => api.get(`/payroll/me/payslips/${id}/download`, { responseType: 'blob' });
export const downloadMyStatement = (p?: object) => api.get(`/payroll/me/statement${qs(p)}`, { responseType: 'blob' });
export const downloadRunExport   = (id: string) => api.get(`/payroll/admin/runs/${id}/export`, { responseType: 'blob' });
export const downloadBankFile    = (id: string) => api.get(`/payroll/admin/runs/${id}/bank-file`, { responseType: 'blob' });
export const downloadReport      = (id: string) => api.get(`/payroll/admin/reports/${id}/download`, { responseType: 'blob' });
export const adminDownloadPayslip = (id: string) => api.get(`/payroll/admin/payslips/${id}/download`, { responseType: 'blob' });
