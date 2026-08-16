import api from './axios';

// ── Dashboard & modules ──────────────────────────────────────────────────────
export const getDashboard   = () => api.get('/admin/dashboard');
export const getModules     = () => api.get('/admin/modules');

// ── School settings ──────────────────────────────────────────────────────────
export const getSchoolSettings    = ()             => api.get('/admin/school-settings');
export const updateSchoolSettings = (data: object) => api.put('/admin/school-settings', data);
// Multipart variant — use when uploading a logo image
export const updateSchoolSettingsForm = (fd: FormData) =>
  api.put('/admin/school-settings', fd, { headers: { 'Content-Type': 'multipart/form-data' } });

// ── SMTP settings (per-school outgoing email) ────────────────────────────────
export const getSmtpSettings    = ()             => api.get('/admin/smtp-settings');
export const updateSmtpSettings = (data: object) => api.put('/admin/smtp-settings', data);
export const testSmtpSettings   = (to?: string)  => api.post('/admin/smtp-settings/test', { to });

// ── Teachers ─────────────────────────────────────────────────────────────────
export const getTeachers        = (params?: object) => api.get('/admin/teachers', { params });
export const getTeacher         = (id: string)       => api.get(`/admin/teachers/${id}`);
export const createTeacher      = (data: object)     => api.post('/admin/teachers', data);
// Full seven-step intake posts multipart (ID scans + experience papers)
export const createTeacherForm  = (fd: FormData)     =>
  api.post('/admin/teachers', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
export const previewAdmissionNumber = (format?: string) =>
  api.get('/admin/admission-number/preview', { params: format ? { format } : {} });
export const previewEmployeeId      = (format?: string) =>
  api.get('/admin/employee-id/preview', { params: format ? { format } : {} });
export const updateClass        = (id: string, data: object) => api.put(`/admin/classes/${id}`, data);
export const shuffleSections    = (id: string) => api.post(`/admin/classes/${id}/shuffle-sections`);
export const lockSectionShuffle = (id: string) => api.post(`/admin/classes/${id}/lock-sections`);
export const assignSectionRollNumbers = (id: string) => api.post(`/admin/sections/${id}/assign-roll-numbers`);
export const updateStudentRollNumber  = (sectionId: string, studentId: string, rollNumber: string) =>
  api.put(`/admin/sections/${sectionId}/students/${studentId}/roll-number`, { rollNumber });
export const getHolidayTypes    = () => api.get('/admin/holiday-types');
export const updateHolidayTypes = (holidayTypes: string[]) => api.put('/admin/holiday-types', { holidayTypes });
export const deleteTeacher      = (id: string)       => api.delete(`/admin/teachers/${id}`);
export const updateTeacher      = (id: string, data: object) => api.put(`/admin/users/${id}`, data);
export const getDesignations    = ()                 => api.get('/admin/designations');
export const updateDesignations = (designations: string[]) => api.put('/admin/designations', { designations });

// ── Students ─────────────────────────────────────────────────────────────────
export const getStudents   = (params?: object) => api.get('/admin/students', { params });
export const getStudent    = (id: string)       => api.get(`/admin/students/${id}`);
export const createStudent = (data: object)     => api.post('/admin/students', data);
export const updateStudent = (id: string, data: object) => api.put(`/admin/students/${id}`, data);
export const deleteStudent = (id: string)       => api.delete(`/admin/students/${id}`);
export const parentLookup  = (q: string)        => api.get('/admin/students/parent-lookup', { params: { q } });
export const pincodeLookup = (pin: string)      => api.get(`/admin/pincode/${pin}`);

// ── Shared user ops ──────────────────────────────────────────────────────────
export const toggleUser  = (id: string)    => api.patch(`/admin/users/${id}/toggle`);
export const deleteUser  = (id: string)    => api.delete(`/admin/users/${id}`);
export const checkEmail  = (email: string) => api.get('/admin/users/check-email', { params: { email } });

// ── Admins ───────────────────────────────────────────────────────────────────
export const getAdmins   = (params?: object) => api.get('/admin/admins', { params });
export const createAdmin = (data: object)     => api.post('/admin/admins', data);
export const deleteAdmin = (id: string)       => api.delete(`/admin/admins/${id}`);

// ── Academic years ───────────────────────────────────────────────────────────
export const getAcademicYears   = ()             => api.get('/admin/academic-years');
export const createAcademicYear = (data: object) => api.post('/admin/academic-years', data);
export const updateAcademicYear = (id: string, data: object) => api.put(`/admin/academic-years/${id}`, data);
export const deleteAcademicYear = (id: string)   => api.delete(`/admin/academic-years/${id}`);
export const setActiveYear      = (id: string)   => api.patch(`/admin/academic-years/${id}/set-active`);

// ── Classes & sections ───────────────────────────────────────────────────────
export const getClasses             = (params?: object) => api.get('/admin/classes', { params });
export const createClass            = (data: object)     => api.post('/admin/classes', data);
export const getClassDetail         = (id: string)       => api.get(`/admin/classes/${id}`);
export const deleteClass            = (id: string)       => api.delete(`/admin/classes/${id}`);
export const createSection          = (classId: string, data: object) => api.post(`/admin/classes/${classId}/sections`, data);
export const getClassesWithSections = (all?: boolean)    => api.get('/admin/classes-with-sections', all ? { params: { all: 'true' } } : {});

export const getSectionDetail            = (id: string) => api.get(`/admin/sections/${id}`);
export const deleteSection               = (id: string) => api.delete(`/admin/sections/${id}`);
export const updateSectionTeacher        = (id: string, data: object) => api.put(`/admin/sections/${id}/teachers`, data);
export const getSectionSubjectTeachers   = (id: string) => api.get(`/admin/sections/${id}/subjects`);
export const assignStudentToSection      = (sectionId: string, studentId: string) => api.post(`/admin/sections/${sectionId}/assign-student`, { studentId });
export const removeStudentFromSection    = (sectionId: string, studentId: string) => api.delete(`/admin/sections/${sectionId}/remove-student`, { data: { studentId } });
export const assignSectionSubjectTeacher = (id: string, data: object) => api.post(`/admin/sections/${id}/subjects/assign`, data);
export const removeSectionSubjectTeacher = (id: string, subjectId: string, teacherId: string) => api.delete(`/admin/sections/${id}/subjects/${subjectId}/teachers/${teacherId}`);

// ── Subjects ─────────────────────────────────────────────────────────────────
export const getSubjects   = ()             => api.get('/admin/subjects');
export const createSubject = (data: object) => api.post('/admin/subjects', data);
export const updateSubject = (id: string, data: object) => api.put(`/admin/subjects/${id}`, data);
export const deleteSubject = (id: string)   => api.delete(`/admin/subjects/${id}`);

// ── Leave ────────────────────────────────────────────────────────────────────
export const getLeaveTypes          = ()             => api.get('/admin/leave/types');
export const createLeaveType        = (data: object) => api.post('/admin/leave/types', data);
export const updateLeaveType        = (id: string, data: object) => api.put(`/admin/leave/types/${id}`, data);
export const deleteLeaveType        = (id: string)   => api.delete(`/admin/leave/types/${id}`);
export const getLeaveRequests       = (params?: object) => api.get('/admin/leave/requests', { params });
export const approveLeave           = (id: string, data?: object) => api.post(`/admin/leave/requests/${id}/approve`, data ?? {});
export const rejectLeave            = (id: string, data?: object) => api.post(`/admin/leave/requests/${id}/reject`, data ?? {});
export const getLeaveAllocations    = (params?: object) => api.get('/admin/leave/allocations', { params });
export const allocateLeave          = (data: object) => api.post('/admin/leave/allocations', data);
export const getTeacherLeaveBalance = (teacherId: string) => api.get('/admin/leave/balance', { params: { teacherId } });
export const getLeaveReports        = (params?: object) => api.get('/admin/leave/reports', { params });

// ── Timetable ────────────────────────────────────────────────────────────────
export const getSectionTimetable = (sectionId: string, yearId?: string) =>
  api.get(`/admin/sections/${sectionId}/timetable`, { params: yearId ? { yearId } : {} });
export const getSectionEntries   = (sectionId: string, yearId?: string) =>
  api.get(`/admin/sections/${sectionId}/timetable/entries`, { params: yearId ? { yearId } : {} });
export const saveTimetableEntries = (sectionId: string, data: object) =>
  api.put(`/admin/sections/${sectionId}/timetable/entries`, data);

// ── Documents ────────────────────────────────────────────────────────────────
export const getDocuments          = (params?: object) => api.get('/admin/documents', { params });
export const getDocument           = (id: string)       => api.get(`/admin/documents/${id}`);
export const deleteDocument        = (id: string)       => api.delete(`/admin/documents/${id}`);
export const archiveDocument       = (id: string)       => api.post(`/admin/documents/${id}/archive`);
export const getDocumentCategories = ()                 => api.get('/admin/document-categories');
export const createDocumentCategory = (data: object)    => api.post('/admin/document-categories', data);
export const deleteDocumentCategory = (id: string)      => api.delete(`/admin/document-categories/${id}`);

// ── Holidays ─────────────────────────────────────────────────────────────────
export const getHolidays   = ()             => api.get('/admin/holidays');
export const createHoliday = (data: object) => api.post('/admin/holidays', data);
export const updateHoliday = (id: string, data: object) => api.put(`/admin/holidays/${id}`, data);
export const deleteHoliday = (id: string)   => api.delete(`/admin/holidays/${id}`);

// ── Aptitude exams (overview) ────────────────────────────────────────────────
export const getExams = (params?: object) => api.get('/admin/exams', { params });

// ── Results (formal exams) ───────────────────────────────────────────────────
export const getFormalExams   = (params?: object) => api.get('/admin/results/exams', { params });
export const createFormalExam = (data: object)     => api.post('/admin/results/exams', data);
export const getFormalExam    = (id: string)       => api.get(`/admin/results/exams/${id}`);
export const deleteFormalExam = (id: string)       => api.delete(`/admin/results/exams/${id}`);
export const approveFormalExam = (id: string)      => api.post(`/admin/results/exams/${id}/approve`);
export const rejectFormalExam  = (id: string, data?: object) => api.post(`/admin/results/exams/${id}/reject`, data ?? {});
export const reopenFormalExam  = (id: string, data?: object) => api.post(`/admin/results/exams/${id}/reopen`, data ?? {});
export const getMarksReview    = (id: string)      => api.get(`/admin/results/exams/${id}/marks-review`);
export const getResultSectionSubjects = (sectionId: string) => api.get(`/admin/results/sections/${sectionId}/subjects`);

// ── Notifications ────────────────────────────────────────────────────────────
export const getNotifications = (page = 1)      => api.get('/admin/notifications', { params: { page, limit: 30 } });
export const sendNotification = (data: object)  => api.post('/admin/notifications/send', data);

// ── Attendance (staff) ───────────────────────────────────────────────────────
export const getRegularizationRequests = (params?: object) => api.get('/admin/regularization-requests', { params });
export const reviewRegularization      = (data: object)     => api.post('/admin/regularization-requests/review', data);
export const getMyAttendance           = (params?: object)  => api.get('/admin/my-attendance', { params });
export const clockIn                   = ()                 => api.post('/admin/my-attendance/clock-in');
export const clockOut                  = ()                 => api.post('/admin/my-attendance/clock-out');
