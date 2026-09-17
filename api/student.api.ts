import api from './axios';

export const getDashboard     = () => api.get('/student/dashboard');
export const getModules       = () => api.get('/student/modules');
export const getMyClass       = () => api.get('/student/my-class');
export const getTimetable     = () => api.get('/student/timetable');
export const getMyAttendance  = (params?: object) => api.get('/student/my-attendance', { params });
// Attendance — one answer for the month, the year and requests (school-backend services/studentAttendanceView.js)
export const getAttendanceOverview = (params?: object) => api.get('/student/attendance/overview', { params });
// The registers of one day and my mark on each — what a correction can be about.
export const getAttendanceDay   = (params: object) => api.get('/student/attendance/day', { params });
export const getClassRanking    = () => api.get('/student/attendance-ranking');
export const getMyCorrections   = () => api.get('/student/correction');
// Multipart: date, attendance, requestedStatus, reason, attachments[] (≤3, 5 MB each)
export const submitCorrection   = (data: FormData) => api.post('/student/correction/submit', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const replyCorrection    = (id: string, data: FormData) => api.post(`/student/correction/${id}/reply`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const getExams         = () => api.get('/student/exams');
export const getAttempt       = (id: string) => api.get(`/student/exams/${id}/attempt`);
export const saveAnswer       = (id: string, data: object) => api.post(`/student/exams/${id}/save-answer`, data);
export const submitExam       = (id: string) => api.post(`/student/exams/${id}/submit`);
export const logViolation     = (id: string) => api.post(`/student/exams/${id}/violation`);
export const getExamResult    = (id: string) => api.get(`/student/exams/${id}/result`);
export const getDocuments     = () => api.get('/student/documents');
export const getDocument      = (id: string) => api.get(`/student/documents/${id}`);
export const getHolidays      = () => api.get('/student/holidays');
export const getResults       = () => api.get('/student/results');
export const getResultDetail  = (id: string) => api.get(`/student/results/${id}`);
export const getClassTests    = () => api.get('/student/results/class-tests');

// Fees
export const getMyFees        = () => api.get('/fees/student/my-fees');
export const getMyLedger      = () => api.get('/fees/student/ledger');
export const getMyPayments    = () => api.get('/fees/student/payments');

// Library
export const getLibrary       = () => api.get('/library/student');
export const searchLibrary    = (params?: object) => api.get('/library/student/search', { params });
export const getMyBooks       = () => api.get('/library/student/my-books');
export const getMyFines       = () => api.get('/library/student/my-fines');
