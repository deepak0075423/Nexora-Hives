import api from './axios';

// ── Student ───────────────────────────────────────────────────────────────────
export const getSummary          = () => api.get('/feedback/student/summary');
export const getPending          = () => api.get('/feedback/student/pending');
export const getCompleted        = () => api.get('/feedback/student/completed');
// Never submitted, and the window has closed — kept apart so the to-do list only holds what can still be done.
export const getMissed           = () => api.get('/feedback/student/missed');
export const getForm             = (id: string) => api.get(`/feedback/student/assignments/${id}`);
export const getMySubmission     = (id: string) => api.get(`/feedback/student/assignments/${id}/submission`);
export const submitFeedback      = (id: string, d: any) => api.post(`/feedback/student/assignments/${id}/submit`, d);

// ── Teacher (own results) ─────────────────────────────────────────────────────
export const getTeacherDashboard = (params?: any) => api.get('/feedback/teacher/dashboard', { params });
export const getTeacherTrends    = (params?: any) => api.get('/feedback/teacher/trends', { params });
export const getTeacherBreakdown = (params?: any) => api.get('/feedback/teacher/breakdown', { params });

// ── Admin / Principal analytics ───────────────────────────────────────────────
export const getDashboard         = (params?: any) => api.get('/feedback/dashboard', { params });
export const getMeta              = () => api.get('/feedback/meta');
export const getTeacherAnalytics  = (id: string, params?: any) => api.get(`/feedback/teachers/${id}`, { params });
export const getCampaignAnalytics = (id: string) => api.get(`/feedback/campaigns/${id}/analytics`);
export const getReport            = (params?: any) => api.get('/feedback/reports', { params });

// ── Campaigns (school admin) ──────────────────────────────────────────────────
export const getCampaigns       = (params?: any) => api.get('/feedback/campaigns', { params });
// The create/edit form's pickers: classes, sections, subjects and teachers of
// the CURRENT academic year only, plus the links that decide who is reached.
export const getCampaignOptions = () => api.get('/feedback/campaign-options');
export const getCampaign        = (id: string) => api.get(`/feedback/campaigns/${id}`);
export const createCampaign     = (d: any) => api.post('/feedback/campaigns', d);
export const updateCampaign     = (id: string, d: any) => api.put(`/feedback/campaigns/${id}`, d);
export const deleteCampaign     = (id: string) => api.delete(`/feedback/campaigns/${id}`);
export const activateCampaign   = (id: string) => api.post(`/feedback/campaigns/${id}/activate`);
export const closeCampaign      = (id: string) => api.post(`/feedback/campaigns/${id}/close`);
export const archiveCampaign    = (id: string) => api.post(`/feedback/campaigns/${id}/archive`);
export const duplicateCampaign  = (id: string, d: any = {}) => api.post(`/feedback/campaigns/${id}/duplicate`, d);
export const sendReminders      = (id: string) => api.post(`/feedback/campaigns/${id}/reminders`);
export const syncAssignments    = (id: string) => api.post(`/feedback/campaigns/${id}/sync`);
export const getCampaignAssignments = (id: string, params?: any) =>
  api.get(`/feedback/campaigns/${id}/assignments`, { params });

// ── Question bank, categories, templates ──────────────────────────────────────
export const getQuestions   = (params?: any) => api.get('/feedback/questions', { params });
export const createQuestion = (d: any) => api.post('/feedback/questions', d);
export const updateQuestion = (id: string, d: any) => api.put(`/feedback/questions/${id}`, d);
export const deleteQuestion = (id: string) => api.delete(`/feedback/questions/${id}`);

export const getCategories  = (params?: any) => api.get('/feedback/categories', { params });
export const createCategory = (d: any) => api.post('/feedback/categories', d);
export const updateCategory = (id: string, d: any) => api.put(`/feedback/categories/${id}`, d);
export const deleteCategory = (id: string) => api.delete(`/feedback/categories/${id}`);

export const getTemplates   = () => api.get('/feedback/templates');
export const createTemplate = (d: any) => api.post('/feedback/templates', d);
export const updateTemplate = (id: string, d: any) => api.put(`/feedback/templates/${id}`, d);
export const deleteTemplate = (id: string) => api.delete(`/feedback/templates/${id}`);

// ── Settings & audit ──────────────────────────────────────────────────────────
export const getSettings    = () => api.get('/feedback/settings');
export const updateSettings = (d: any) => api.put('/feedback/settings', d);
export const seedDefaults   = () => api.post('/feedback/settings/seed');
export const getAuditLog    = (params?: any) => api.get('/feedback/audit', { params });

/** Where a report export is fetched from — the same query the on-screen table read. */
export const reportPath = (params: Record<string, any>) => {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `/feedback/reports?${qs}`;
};
