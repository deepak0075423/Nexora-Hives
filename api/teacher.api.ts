import api from './axios';

export const getDashboard        = () => api.get('/teacher/dashboard');
export const getModules          = () => api.get('/teacher/modules');
export const getMySection        = () => api.get('/teacher/my-section');
export const getTimetable        = () => api.get('/teacher/timetable');
export const getAttendance       = () => api.get('/teacher/attendance');
export const markAttendance      = (data: object) => api.post('/teacher/attendance/mark', data);
export const getMyAttendance     = () => api.get('/teacher/my-attendance');
export const markSelfAttendance  = (data: object) => api.post('/teacher/my-attendance/mark', data);
export const getCorrectionRequests = () => api.get('/teacher/correction-requests');
export const reviewCorrection    = (data: object) => api.post('/teacher/correction-requests/review', data);
export const getExams            = () => api.get('/teacher/exams');
export const getExamDetail       = (id: string) => api.get(`/teacher/exams/${id}`);
export const createExam          = (data: object) => api.post('/teacher/exams', data);
export const publishExam         = (id: string) => api.post(`/teacher/exams/${id}/publish`);
export const getQuestions        = (id: string) => api.get(`/teacher/exams/${id}/questions`);
export const addQuestion         = (id: string, data: object) => api.post(`/teacher/exams/${id}/questions`, data);
export const getSubmissions      = (id: string) => api.get(`/teacher/exams/${id}/submissions`);
export const getAnalytics        = (id: string) => api.get(`/teacher/exams/${id}/analytics`);
export const getMarksEntry       = () => api.get('/teacher/results/marks-entry');
export const getMarksForm        = (examId: string, subjectId: string) => api.get(`/teacher/results/marks-entry/${examId}/${subjectId}`);
export const saveMarks           = (examId: string, subjectId: string, data: object) => api.post(`/teacher/results/marks-entry/${examId}/${subjectId}/save`, data);
export const getClassTests       = () => api.get('/teacher/results/class-tests');
export const createClassTest     = (data: object) => api.post('/teacher/results/class-tests', data);
export const saveTestMarks       = (id: string, data: object) => api.post(`/teacher/results/class-tests/${id}/marks/save`, data);
export const getLeaves           = () => api.get('/teacher/leave');
export const getLeaveBalance     = () => api.get('/teacher/leave/balance');
export const applyLeave          = (data: FormData) => api.post('/teacher/leave/apply', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const cancelLeave         = (id: string) => api.delete(`/teacher/leave/${id}`);
export const getDocuments        = () => api.get('/teacher/documents');
export const getHolidays         = () => api.get('/teacher/holidays');
export const sendNotification    = (data: object) => api.post('/teacher/notifications/send', data);
export const getNotifications    = () => api.get('/teacher/notifications');

// Library (teacher browse)
export const getLibrary          = () => api.get('/library/teacher');
export const searchLibrary       = (q: string) => api.get('/library/teacher/search', { params: { q } });
export const getMyBooks          = () => api.get('/library/teacher/my-books');
