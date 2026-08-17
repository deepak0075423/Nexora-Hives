import api from './axios';

// Student Analytics — one API for both school admins and teachers. The backend
// resolves the caller's scope (whole school vs. own sections) from the token, so
// the app never branches on role for data access.
export const getScope    = ()                => api.get('/analytics/scope');
export const getOverview = (params?: object)  => api.get('/analytics/overview', { params });
export const getStudents = (params?: object)  => api.get('/analytics/students', { params });
export const getStudentAnalytics = (id: string) => api.get(`/analytics/students/${id}`);
