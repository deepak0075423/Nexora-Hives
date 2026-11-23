import api from './axios';

export const getDashboard        = () => api.get('/teacher/dashboard');
export const getModules          = () => api.get('/teacher/modules');
export const getMySection        = () => api.get('/teacher/my-section');
export const getMySections       = () => api.get('/teacher/sections');
export const getSectionDetail    = (id: string) => api.get(`/teacher/sections/${id}`);
export const getTimetable        = () => api.get('/teacher/timetable');
export const getAttendance       = (params?: object) => api.get('/teacher/attendance', { params });
export const markAttendance      = (data: object) => api.post('/teacher/attendance/mark', data);
export const getMyAttendance     = (params?: object) => api.get('/teacher/my-attendance', { params });
export const clockIn             = () => api.post('/teacher/my-attendance/clock-in');
export const clockOut            = () => api.post('/teacher/my-attendance/clock-out');
export const submitRegularization = (data: object) => api.post('/teacher/regularization', data);
export const getMyRegularizations = () => api.get('/teacher/regularization');
export const reviewCorrection    = (data: object) => api.post('/teacher/correction-requests/review', data);
// Attendance workspace (school-backend controllers/teacherAttendance.controller.js) — registers are
// day-wise or subject-wise per the school's setting.
export const getAttendanceCalendar  = (params?: object) => api.get('/teacher/attendance/calendar', { params });
export const getRecentRegisters     = (params?: object) => api.get('/teacher/attendance/recent', { params });
export const getAttendanceRanking   = (params?: object) => api.get('/teacher/attendance/ranking', { params });
// { data, total, page, pages, counts, sections, mode } — read with the envelope, not unwrap()
export const getStudentCorrections  = (params?: object) => api.get('/teacher/attendance/corrections', { params });
export const createStudentCorrection = (data: object) => api.post('/teacher/attendance/corrections', data);
export const requestCorrectionInfo  = (id: string, data: object) => api.post(`/teacher/attendance/corrections/${id}/request-info`, data);
export const getExams            = () => api.get('/teacher/exams');
export const getExamDetail       = (id: string) => api.get(`/teacher/exams/${id}`);
export const createExam          = (data: object) => api.post('/teacher/exams', data);
export const publishExam         = (id: string) => api.post(`/teacher/exams/${id}/publish`);
export const getQuestions        = (id: string) => api.get(`/teacher/exams/${id}/questions`);
export const addQuestion         = (id: string, data: object) => api.post(`/teacher/exams/${id}/questions`, data);
export const getSubmissions      = (id: string) => api.get(`/teacher/exams/${id}/submissions`);
export const getAnalytics        = (id: string) => api.get(`/teacher/exams/${id}/analytics`);
export const getExamBoard        = (params?: object) => api.get('/teacher/exams/board', { params });
export const getExamMeta         = () => api.get('/teacher/exams/meta');
export const updateExam          = (id: string, data: object) => api.put(`/teacher/exams/${id}`, data);
export const deleteExam          = (id: string) => api.delete(`/teacher/exams/${id}`);
export const updateQuestion      = (id: string, qid: string, data: object) => api.put(`/teacher/exams/${id}/questions/${qid}`, data);
export const deleteQuestion      = (id: string, qid: string) => api.delete(`/teacher/exams/${id}/questions/${qid}`);
export const getStudentResponse  = (id: string, studentId: string) => api.get(`/teacher/exams/${id}/submissions/${studentId}`);
export const getResultApproval   = (id: string) => api.get(`/teacher/exams/${id}/result-approval`);
export const subjectApproveResults = (id: string) => api.post(`/teacher/exams/${id}/subject-approve`);
export const approveResults      = (id: string, data: object) => api.post(`/teacher/exams/${id}/result-approval`, data);
export const getExamAnalytics    = (params?: object) => api.get('/teacher/exams/analytics', { params });
export const getExamReport       = (id: string) => api.get(`/teacher/exams/${id}/report`);
export const getMarksEntry       = () => api.get('/teacher/results/marks-entry');
export const getMarksForm        = (examId: string, subjectId: string) => api.get(`/teacher/results/marks-entry/${examId}/${subjectId}`);
export const saveMarks           = (examId: string, subjectId: string, data: object) => api.post(`/teacher/results/marks-entry/${examId}/${subjectId}/save`, data);
export const getClassTests       = () => api.get('/teacher/results/class-tests');
export const createClassTest     = (data: object) => api.post('/teacher/results/class-tests', data);
export const saveTestMarks       = (id: string, data: object) => api.post(`/teacher/results/class-tests/${id}/marks/save`, data);
export const getLeaves           = (params?: object) => api.get('/teacher/leave', { params });
export const getLeaveBalance     = () => api.get('/teacher/leave/balance');
export const applyLeave          = (data: FormData) => api.post('/teacher/leave/apply', data, { headers: { 'Content-Type': 'multipart/form-data' } });
// Withdraws a pending request, or approved leave that has not started yet
export const cancelLeave         = (id: string) => api.delete(`/teacher/leave/${id}`);
// Back early from approved leave: { toDate } is the new last day
export const endLeaveEarly       = (id: string, data: object) => api.post(`/teacher/leave/${id}/end-early`, data);

// The rules behind each leave type, and whether I qualify for it
export const getLeaveTypePolicies = ()                 => api.get('/teacher/leave/policies');
// Balance for the picked type + what the picked dates will actually cost
export const getLeaveApplyPreview = (params: object)   => api.get('/teacher/leave/apply-preview', { params });
// Designation-based approvers (e.g. Principal) work their queue here
export const getLeaveApprovals    = (params?: object)  => api.get('/teacher/leave/approvals', { params });
export const approveLeaveRequest  = (id: string, data?: object) => api.post(`/teacher/leave/approvals/${id}/approve`, data ?? {});
export const rejectLeaveRequest   = (id: string, data?: object) => api.post(`/teacher/leave/approvals/${id}/reject`, data ?? {});

// ── Comp Off ─────────────────────────────────────────────────────────────────
export const getMyCompOff        = (params?: object) => api.get('/teacher/leave/compoff', { params });
export const previewCompOffDate  = (params: object)  => api.get('/teacher/leave/compoff/preview', { params });
export const getMyCompOffLedger  = ()                => api.get('/teacher/leave/compoff/ledger');
export const applyCompOff        = (data: object)    => api.post('/teacher/leave/compoff', data);
export const submitCompOffDraft  = (id: string, data?: object) => api.post(`/teacher/leave/compoff/${id}/apply`, data ?? {});
export const cancelCompOff       = (id: string)      => api.delete(`/teacher/leave/compoff/${id}`);
// Designation-based approvers (e.g. Principal) work their queue from here
export const getCompOffApprovals = (params?: object) => api.get('/teacher/leave/compoff/approvals', { params });
export const approveCompOff      = (id: string, data?: object) => api.post(`/teacher/leave/compoff/${id}/approve`, data ?? {});
export const rejectCompOff       = (id: string, data?: object) => api.post(`/teacher/leave/compoff/${id}/reject`, data ?? {});
export const getDocuments        = (params?: object) => api.get('/teacher/documents', { params });
export const getDocumentCategories = () => api.get('/teacher/document-categories');
// Up to 10 files of 10 MB each: the 30-second default cut a Word file or a
// photo off part-way on mobile data, while a small PDF got through in time.
const DOC_SEND = { timeout: 5 * 60 * 1000 };
export const uploadDocument      = (data: FormData) => api.post('/teacher/documents', data, DOC_SEND);
export const updateDocument      = (id: string, data: FormData) => api.put(`/teacher/documents/${id}`, data, DOC_SEND);
export const getAssignmentAnalytics = (id: string) => api.get(`/teacher/documents/${id}/assignment/analytics`);
export const publishDocument        = (id: string) => api.post(`/teacher/documents/${id}/publish`);
export const getDocumentVersions    = (id: string) => api.get(`/teacher/documents/${id}/versions`);
export const restoreDocumentVersion = (id: string, vid: string) => api.post(`/teacher/documents/${id}/versions/${vid}/restore`);
export const getDocumentReaders     = (id: string) => api.get(`/teacher/documents/${id}/readers`);
export const deleteDocument      = (id: string) => api.delete(`/teacher/documents/${id}`);
export const archiveDocument     = (id: string, archived = true) => api.post(`/teacher/documents/${id}/archive`, { archived });
export const markDocumentRead    = (id: string) => api.post(`/teacher/documents/${id}/read`);
export const markDocumentsRead   = (ids: string[]) => api.post('/teacher/documents/read', { ids });
// Marking and reminding — the teacher who set the work only (the route checks).
export const reviewAssignment    = (id: string, studentId: string, data: object) => api.post(`/teacher/documents/${id}/submissions/${studentId}/review`, data);
export const remindAssignment    = (id: string, data?: object) => api.post(`/teacher/documents/${id}/remind`, data || {});
// One document opened — the same head and roster the office reads, behind
// the teacher's access check. Comments: your own to edit and delete only.
export const getAssignmentDetail   = (id: string, params?: object) => api.get(`/teacher/documents/${id}/assignment`, { params });
export const getDocumentComments   = (id: string)       => api.get(`/teacher/documents/${id}/comments`);
export const addDocumentComment    = (id: string, data: object) => api.post(`/teacher/documents/${id}/comments`, data);
export const updateDocumentComment = (cid: string, data: object) => api.patch(`/teacher/documents/comments/${cid}`, data);
export const deleteDocumentComment = (cid: string)      => api.delete(`/teacher/documents/comments/${cid}`);
export const getHolidays         = () => api.get('/teacher/holidays');
export const sendNotification    = (data: object) => api.post('/teacher/notifications/send', data);
export const getNotifications    = () => api.get('/teacher/notifications');

// Library (teacher browse)
export const getLibrary          = () => api.get('/library/teacher');
export const searchLibrary       = (params?: object) => api.get('/library/teacher/search', { params });
export const getMyBooks          = () => api.get('/library/teacher/my-books');
export const getMyFines          = () => api.get('/library/teacher/my-fines');
