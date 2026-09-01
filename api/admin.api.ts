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

// Payment gateway — school-level, shared by every module that takes money
export const getPaymentGateway    = ()             => api.get('/admin/payment-gateway');
export const updatePaymentGateway = (data: object) => api.put('/admin/payment-gateway', data);

// Receipt designs, per module and payment mode
export const getReceiptTemplates   = (module: string) => api.get('/admin/receipt-templates', { params: { module } });
export const updateReceiptTemplate = (data: object)   => api.put('/admin/receipt-templates', data);

// ── Designations & module permissions ────────────────────────────────────────
// getDesignations is the plain name list the teacher form's dropdown consumes;
// getDesignationMatrix carries the per-module access grid.
export const getDesignationMatrix   = ()                     => api.get('/admin/designations/matrix');
export const saveDesignationMatrix  = (designations: object[]) => api.put('/admin/designations/matrix', { designations });
export const createDesignation      = (data: object)         => api.post('/admin/designations', data);
export const updateDesignation      = (id: string, data: object) => api.put(`/admin/designations/${id}`, data);
export const deleteDesignation      = (id: string)           => api.delete(`/admin/designations/${id}`);
export const getDesignationTeachers = (id: string)           => api.get(`/admin/designations/${id}/teachers`);

// ── Teachers ─────────────────────────────────────────────────────────────────
export const getTeachers        = (params?: object) => api.get('/admin/teachers', { params });
export const getTeacher         = (id: string)       => api.get(`/admin/teachers/${id}`);
export const createTeacher      = (data: object)     => api.post('/admin/teachers', data);
// Full seven-step intake posts multipart (ID scans + experience papers)
export const createTeacherForm  = (fd: FormData)     =>
  api.post('/admin/teachers', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
// The full record, edited with the same wizard that created it. Partial by
// design: uploads already on file are kept when none are re-picked.
export const updateTeacherForm = (id: string, fd: FormData) =>
  api.put(`/admin/teachers/${id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
export const getTeacherDetail  = (id: string) => api.get(`/admin/teachers/${id}`);
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
// Everything still pointing at a teacher — classes, subjects, books, periods.
// The Delete / Deactivate sheet shows this before it will do anything.
export const getTeacherDependencies = (id: string) => api.get(`/admin/teachers/${id}/dependencies`);
// `force` clears the teacher out of every timetable period and nothing else;
// the server refuses it while any other dependency is still outstanding.
export const deleteTeacher      = (id: string, force = false) =>
  api.delete(`/admin/teachers/${id}${force ? '?force=true' : ''}`);
export const updateTeacher      = (id: string, data: object) => api.put(`/admin/users/${id}`, data);
export const getDesignations    = ()                 => api.get('/admin/designations');
export const updateDesignations = (designations: string[]) => api.put('/admin/designations', { designations });

// ── Students ─────────────────────────────────────────────────────────────────
export const getStudents   = (params?: object) => api.get('/admin/students', { params });
export const getStudent    = (id: string)       => api.get(`/admin/students/${id}`);
export const createStudent = (data: object)     => api.post('/admin/students', data);
export const updateStudent = (id: string, data: object) => api.put(`/admin/students/${id}`, data);
// Full admission intake posts multipart (certificates + ID scans); up to 20
// uploads can ride along, so it gets a longer timeout than the default.
const UPLOAD_CFG = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 };
export const createStudentForm = (fd: FormData) => api.post('/admin/students', fd, UPLOAD_CFG);
export const updateStudentForm = (id: string, fd: FormData) => api.put(`/admin/students/${id}`, fd, UPLOAD_CFG);
export const deleteStudent = (id: string)       => api.delete(`/admin/students/${id}`);
export const parentLookup  = (q: string)        => api.get('/admin/students/parent-lookup', { params: { q } });
export const pincodeLookup = (pin: string)      => api.get(`/admin/pincode/${pin}`);

// ── Shared user ops ──────────────────────────────────────────────────────────
export const toggleUser  = (id: string, force = false) => api.patch(`/admin/users/${id}/toggle`, force ? { force: true } : {});
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
export const getAssignableStudents       = (sectionId: string, params?: any) => api.get(`/admin/sections/${sectionId}/assignable-students`, { params });
export const assignStudentsToSection     = (sectionId: string, studentIds: string[]) => api.post(`/admin/sections/${sectionId}/assign-student`, { studentIds });
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
// What a delete would take with it — teachers holding days, plus the things
// that block the delete outright. Powers the delete confirm.
export const getLeaveTypeImpact     = (id: string)   => api.get(`/admin/leave/types/${id}/impact`);
export const getLeaveRequests       = (params?: object) => api.get('/admin/leave/requests', { params });
export const approveLeave           = (id: string, data?: object) => api.post(`/admin/leave/requests/${id}/approve`, data ?? {});
export const rejectLeave            = (id: string, data?: object) => api.post(`/admin/leave/requests/${id}/reject`, data ?? {});
export const getLeaveAllocations    = (params?: object) => api.get('/admin/leave/allocations', { params });
export const allocateLeave          = (data: object) => api.post('/admin/leave/allocations', data);
// Zeroes allocated + carried-forward days, keeping used/pending history
export const clearLeaveAllocations  = (data: object) => api.post('/admin/leave/allocations/clear', data);
export const runCarryForward        = (data: object) => api.post('/admin/leave/allocations/carry-forward', data);
// Year-end: lapse whatever carry-forward did not move
export const getYearClosePreview    = (params: object) => api.get('/admin/leave/year-close/preview', { params });
export const closeAcademicYear      = (data: object) => api.post('/admin/leave/year-close', data);
// Final settlement for someone leaving
export const settleEmployeeLeave    = (data: object) => api.post('/admin/leave/settle', data);
export const runLeaveAccrual        = ()             => api.post('/admin/leave/accrual/run');
export const adminApplyLeave        = (data: FormData) => api.post('/admin/leave/requests', data, { headers: { 'Content-Type': 'multipart/form-data' } });
// Balance for the picked type + what the picked dates will actually cost
export const getLeaveApplyPreview   = (params: object) => api.get('/admin/leave/apply-preview', { params });
export const getTeacherLeaveBalance = (teacherId: string) => api.get('/admin/leave/balance', { params: { teacherId } });
export const getLeaveReports        = (params?: object) => api.get('/admin/leave/reports', { params });
// Undoes an approved leave and returns the days to the balance. For Comp Off it
// also refills the ledger lots the leave was spent from — and it is the
// prerequisite for withdrawing a Comp Off credit whose days were already used.
export const reverseApprovedLeave   = (id: string, data?: object) => api.post(`/admin/leave/requests/${id}/reverse`, data ?? {});

// Per-leave-type policies — every leave type carries its own rule set
export const getLeavePolicies  = ()                       => api.get('/admin/leave/policies');
export const getLeavePolicy    = (leaveTypeId: string)    => api.get(`/admin/leave/policies/${leaveTypeId}`);
export const updateLeavePolicy = (leaveTypeId: string, data: object) => api.put(`/admin/leave/policies/${leaveTypeId}`, data);

// ── Comp Off (inside the leave module) ───────────────────────────────────────
export const getCompOffRequests  = (params?: object) => api.get('/admin/leave/compoff', { params });
export const approveCompOff      = (id: string, data?: object) => api.post(`/admin/leave/compoff/${id}/approve`, data ?? {});
export const rejectCompOff       = (id: string, data?: object) => api.post(`/admin/leave/compoff/${id}/reject`, data ?? {});
export const cancelCompOff       = (id: string, data?: object) => api.post(`/admin/leave/compoff/${id}/cancel`, data ?? {});
export const getCompOffBalances  = (params?: object) => api.get('/admin/leave/compoff/balances', { params });
export const getCompOffLedger    = (params?: object) => api.get('/admin/leave/compoff/ledger', { params });
export const getCompOffPolicy    = ()                => api.get('/admin/leave/compoff/policy');
export const runCompOffExpiry    = ()                => api.post('/admin/leave/compoff/expire/run');

// ── Timetable ────────────────────────────────────────────────────────────────
export const getSectionTimetable = (sectionId: string, yearId?: string) =>
  api.get(`/admin/sections/${sectionId}/timetable`, { params: yearId ? { yearId } : {} });
export const getSectionEntries   = (sectionId: string, yearId?: string) =>
  api.get(`/admin/sections/${sectionId}/timetable/entries`, { params: yearId ? { yearId } : {} });
// Teachers available to a section, each with what they already carry this year.
export const getSectionTeacherOptions = (sectionId: string) =>
  api.get(`/admin/sections/${sectionId}/teacher-options`);

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
