import api from './axios';

export const getDashboard     = () => api.get('/student/dashboard');
export const getMyClass       = () => api.get('/student/my-class');
export const getTimetable     = () => api.get('/student/timetable');
export const getMyAttendance  = (params?: object) => api.get('/student/my-attendance', { params });
export const getExams         = () => api.get('/student/exams');
export const getAttempt       = (id: string) => api.get(`/student/exams/${id}/attempt`);
export const saveAnswer       = (id: string, data: object) => api.post(`/student/exams/${id}/save-answer`, data);
export const submitExam       = (id: string) => api.post(`/student/exams/${id}/submit`);
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
export const searchLibrary    = (q: string) => api.get('/library/student/search', { params: { q } });
export const getMyBooks       = () => api.get('/library/student/my-books');
export const getMyFines       = () => api.get('/library/student/my-fines');
