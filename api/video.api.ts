import api from './axios';

// ── Student ───────────────────────────────────────────────────────────────────
export const studentDashboard  = () => api.get('/video/student/dashboard');
export const studentShelf      = (kind: string) => api.get('/video/student/shelf', { params: { kind } });
export const studentPlayer     = (id: string) => api.get(`/video/student/videos/${id}/player`);
export const reportProgress    = (d: object) => api.post('/video/student/progress', d);
export const interact          = (d: object) => api.post('/video/student/interact', d);

// ── Teacher ───────────────────────────────────────────────────────────────────
export const teacherScope       = () => api.get('/video/teacher/scope');
export const teacherCatalog     = (params?: object) => api.get('/video/teacher/catalog', { params });
export const teacherAddVideo    = (d: object) => api.post('/video/teacher/videos', d);
export const teacherMyVideos    = () => api.get('/video/teacher/videos');
export const teacherAssignments = () => api.get('/video/teacher/assignments');
export const teacherAssign      = (d: object) => api.post('/video/teacher/assignments', d);

// ── School Admin ──────────────────────────────────────────────────────────────
export const adminOverview      = () => api.get('/video/school/overview');
export const adminBrowse        = (params?: object) => api.get('/video/school/browse', { params });
export const adminEnable        = (id: string, d: object) => api.post(`/video/school/videos/${id}/enable`, d);
export const adminApprovals     = (status: string) => api.get('/video/school/approvals', { params: { status } });
export const adminApprove       = (id: string) => api.post(`/video/school/approvals/${id}/approve`);
export const adminReject        = (id: string, d: object) => api.post(`/video/school/approvals/${id}/reject`, d);
