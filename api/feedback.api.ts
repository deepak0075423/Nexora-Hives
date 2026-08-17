import api from './axios';

// ── Student ───────────────────────────────────────────────────────────────────
export const getSummary          = () => api.get('/feedback/student/summary');
export const getPending          = () => api.get('/feedback/student/pending');
export const getCompleted        = () => api.get('/feedback/student/completed');
export const getForm             = (id: string) => api.get(`/feedback/student/assignments/${id}`);
export const getMySubmission     = (id: string) => api.get(`/feedback/student/assignments/${id}/submission`);
export const submitFeedback      = (id: string, d: any) => api.post(`/feedback/student/assignments/${id}/submit`, d);

// ── Teacher (own results) ─────────────────────────────────────────────────────
export const getTeacherDashboard = (params?: any) => api.get('/feedback/teacher/dashboard', { params });
export const getTeacherTrends    = (params?: any) => api.get('/feedback/teacher/trends', { params });
export const getTeacherBreakdown = (params?: any) => api.get('/feedback/teacher/breakdown', { params });

// ── Admin / Principal ─────────────────────────────────────────────────────────
export const getDashboard         = (params?: any) => api.get('/feedback/dashboard', { params });
export const getMeta              = () => api.get('/feedback/meta');
export const getTeacherAnalytics  = (id: string, params?: any) => api.get(`/feedback/teachers/${id}`, { params });
export const getCampaignAnalytics = (id: string) => api.get(`/feedback/campaigns/${id}/analytics`);
export const getReport            = (params?: any) => api.get('/feedback/reports', { params });

// ── Admin campaign management ─────────────────────────────────────────────────
export const getCampaigns     = (params?: any) => api.get('/feedback/campaigns', { params });
export const getCampaign      = (id: string) => api.get(`/feedback/campaigns/${id}`);
export const activateCampaign = (id: string) => api.post(`/feedback/campaigns/${id}/activate`);
export const closeCampaign    = (id: string) => api.post(`/feedback/campaigns/${id}/close`);
export const sendReminders    = (id: string) => api.post(`/feedback/campaigns/${id}/reminders`);
export const syncAssignments  = (id: string) => api.post(`/feedback/campaigns/${id}/sync`);
export const getCampaignAssignments = (id: string, params?: any) =>
  api.get(`/feedback/campaigns/${id}/assignments`, { params });
