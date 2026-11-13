/**
 * Video Learning — the phone app's calls (school-backend routes/api/video.js).
 * Board → Class → Subject → Book → Chapter → Videos.
 */
import api from './axios';

// ── Student ───────────────────────────────────────────────────────────────────
export const studentHome    = () => api.get('/video/student/home');
export const studentBook    = (id: string) => api.get(`/video/student/books/${id}`);
export const studentChapter = (id: string) => api.get(`/video/student/chapters/${id}`);
export const studentVideo   = (id: string) => api.get(`/video/student/videos/${id}`);
export const studentHistory =(params?: object) => api.get('/video/student/history', { params });

// ── Teacher ───────────────────────────────────────────────────────────────────
export const teacherWorkspace = () => api.get('/video/teacher/workspace');
export const teacherBook      = (id: string, section?: string) => api.get(`/video/teacher/books/${id}`, { params: { section } });
export const teacherReleases  = (params?: object) => api.get('/video/teacher/releases', { params });
export const teacherRelease   = (d: object) => api.post('/video/teacher/releases', d);
export const teacherUnpublish = (id: string) => api.post(`/video/teacher/releases/${id}/unpublish`);
export const teacherPublish   = (id: string) => api.post(`/video/teacher/releases/${id}/publish`);
export const teacherRevoke    = (id: string, reason = '') => api.post(`/video/teacher/releases/${id}/revoke`, { reason });
export const teacherAnalytics = (params?: object) => api.get('/video/teacher/analytics', { params });
export const teacherStudents  = (params?: object) => api.get('/video/teacher/analytics/students', { params });

// ── School Admin ──────────────────────────────────────────────────────────────
export const schoolAnalytics = (params?: object) => api.get('/video/school/analytics', { params });
export const schoolRequests  = (params?: object) => api.get('/video/school/requests', { params });
export const schoolSetup     = () => api.get('/video/school/setup');
