import api from './axios';

/**
 * Results on the phone (Oct 2026) — the same read models the web pages use
 * (school-backend controllers/resultPortal, services/resultTeacher,
 * resultFamily, resultSchedule), so the two can never disagree.
 */

// ─── Teacher ──────────────────────────────────────────────────────────────────
export const teacherBoard     = () => api.get('/teacher/results/board');
export const teacherSchedule  = () => api.get('/teacher/results/schedule');
/** One subject's marks sheet: { exam, subject, config, sheet, editable, correcting, students }. */
export const teacherSheet     = (examId: string, subjectId: string) => api.get(`/teacher/results/sheets/${examId}/${subjectId}`);
export const saveSheet        = (examId: string, subjectId: string, body: object) => api.post(`/teacher/results/marks-entry/${examId}/${subjectId}/save`, body);
/** A class test as the same marks sheet. */
export const testSheet        = (id: string) => api.get(`/teacher/results/class-tests/${id}/sheet`);
export const saveTestSheet    = (id: string, body: { marks: object[]; submit: boolean }) => api.post(`/teacher/results/class-tests/${id}/marks/save`, body);
export const approveTest      = (id: string) => api.post(`/teacher/results/class-test-validation/${id}/approve`, {});
export const rejectTest       = (id: string, reason: string) => api.post(`/teacher/results/class-test-validation/${id}/reject`, { reason });
/** The class teacher's review of an exam: every student's marks in every subject. */
export const examReview       = (examId: string) => api.get(`/teacher/results/review/${examId}`);
export const validateExam     = (examId: string) => api.post(`/teacher/results/validation/${examId}/approve`, {});
export const rejectExam       = (examId: string, reason: string) => api.post(`/teacher/results/validation/${examId}/reject`, { reason });

// ─── Student and parent ───────────────────────────────────────────────────────
export const studentOverview  = () => api.get('/student/results/overview');
export const studentSchedule  = () => api.get('/student/results/schedule');
export const parentOverview   = (childId?: string) => api.get('/parent/results/overview', { params: childId ? { childId } : {} });
export const parentSchedule   = (childId?: string) => api.get('/parent/results/schedule', { params: childId ? { childId } : {} });

// ─── Class tests (the teacher's own) ──────────────────────────────────────────
/** The sections and subjects this teacher may set a test in. */
export const testOptions      = () => api.get('/teacher/results/test-options');
export const createTest       = (data: object) => api.post('/teacher/results/class-tests', data);
export const updateTest       = (id: string, data: object) => api.put(`/teacher/results/class-tests/${id}`, data);
export const deleteTest       = (id: string) => api.delete(`/teacher/results/class-tests/${id}`);
export const reopenTest       = (id: string) => api.post(`/teacher/results/class-tests/${id}/reopen`);

// ─── Electives (a class teacher's own sections) ───────────────────────────────
export const teacherElectives    = (params: object = {}) => api.get('/teacher/results/electives', { params });
export const teacherSaveElective = (data: { sectionId: string; subjectId: string; students: string[] | null }) => api.put('/teacher/results/electives', data);

// ─── Re-exams (a subject teacher's papers) ────────────────────────────────────
export const teacherReExam     = (examId: string) => api.get(`/teacher/results/exams/${examId}/re-exam`);
export const saveTeacherReExam = (examId: string, body: object) => api.put(`/teacher/results/exams/${examId}/re-exam`, body);

// ─── Report cards ─────────────────────────────────────────────────────────────
type CardScope = { academicYear?: string; sectionId?: string; term?: string };
/** A class teacher's section: years, sections, and every student's card. */
export const teacherReportCards  = (params: CardScope) => api.get('/teacher/results/report-cards', { params });
export const saveReportCardNotes = (data: object) => api.put('/teacher/results/report-cards/notes', data);
/** Server-made PDFs (axios `blob`), for the share sheet. */
export const teacherReportCardsPdf = (params: CardScope & { studentId?: string }) =>
  api.get('/teacher/results/report-cards/pdf', { params, responseType: 'blob' });
/** Release a section's cards to families (or take it back); then email them to parents. */
export const teacherReleaseCards = (data: CardScope & { released?: boolean }) => api.post('/teacher/results/report-cards/release', data);
export const teacherSendCards    = (data: CardScope) => api.post('/teacher/results/report-cards/send', data);
const famParams = (childId?: string, academicYear?: string, term?: string) =>
  ({ ...(childId ? { childId } : null), ...(academicYear ? { academicYear } : null), ...(term ? { term } : null) });
export const studentReportCard    = (academicYear?: string, term?: string) => api.get('/student/results/report-card', { params: famParams(undefined, academicYear, term) });
export const parentReportCard     = (childId?: string, academicYear?: string, term?: string) =>
  api.get('/parent/results/report-card', { params: famParams(childId, academicYear, term) });
export const studentReportCardPdf = (academicYear?: string, term?: string) =>
  api.get('/student/results/report-card/pdf', { params: famParams(undefined, academicYear, term), responseType: 'blob' });
export const parentReportCardPdf  = (childId?: string, academicYear?: string, term?: string) =>
  api.get('/parent/results/report-card/pdf', { params: famParams(childId, academicYear, term), responseType: 'blob' });

// ─── Admit cards (the school's PDF, once the timetable is shared) ─────────────
export const studentAdmitCard = (examId: string) => api.get('/student/results/admit-card', { params: { examId }, responseType: 'blob' });
export const parentAdmitCard  = (childId: string | undefined, examId: string) =>
  api.get('/parent/results/admit-card', { params: { examId, ...(childId ? { childId } : null) }, responseType: 'blob' });

// ─── Re-checks (a family asks for a paper to be checked again) ────────────────
export const studentRecheck = (data: { examId: string; subjectId: string; reason: string }) => api.post('/student/results/recheck', data);
export const parentRecheck  = (data: { examId: string; subjectId: string; reason: string; childId?: string }) => api.post('/parent/results/recheck', data);

// ─── The office (Oct 2026: the phone gets the web's office screens) ───────────
const A = '/admin/results';
export const office = {
  overview:   () => api.get(`${A}/overview`),
  /** { data, total, page, pages, tab, tabs } — tab: all|draft|marks|validation|published|archived. */
  exams:      (params: object) => api.get(`${A}/exams`, { params }),
  exam:       (id: string) => api.get(`${A}/exams/${id}`),
  results:    (id: string) => api.get(`${A}/exams/${id}/result`),
  /** The exam's marks register (Excel) and admit cards (PDF), for the share sheet. */
  register:   (id: string) => api.get(`${A}/exams/${id}/register.xlsx`, { responseType: 'blob' }),
  admitCards: (id: string) => api.get(`${A}/exams/${id}/admit-cards.pdf`, { responseType: 'blob' }),
  formMeta:   () => api.get(`${A}/form-meta`),
  formSubjects: (params: object) => api.get(`${A}/form-subjects`, { params }),
  create:     (data: object) => api.post(`${A}/exams`, data),
  update:     (id: string, data: object) => api.put(`${A}/exams/${id}`, data),
  remove:     (id: string) => api.delete(`${A}/exams/${id}`),
  /** open | draft | validate | approve | reject | reopen | archive | restore */
  step:       (id: string, step: string, data: object = {}) => api.post(`${A}/exams/${id}/${step}`, data),
  options:    (id: string, data: object) => api.put(`${A}/exams/${id}/options`, data),
  sheet:      (id: string, subjectId: string) => api.get(`${A}/exams/${id}/marks/${subjectId}`),
  saveSheet:  (id: string, subjectId: string, body: object) => api.put(`${A}/exams/${id}/marks/${subjectId}`, body),
  returnSubject: (id: string, data: { subjectId: string; reason: string }) => api.post(`${A}/exams/${id}/return-subject`, data),
  correct:    (id: string, data: object) => api.post(`${A}/exams/${id}/correct`, data),
  withheld:   (id: string, data: { students: string[]; withhold: boolean; reason?: string }) => api.put(`${A}/exams/${id}/withheld`, data),
  feeDues:    (id: string) => api.get(`${A}/exams/${id}/fee-dues`),
  decide:     (id: string, data: { student: string; decision: string | null; reason?: string }) => api.put(`${A}/exams/${id}/promotion-decision`, data),
  reExam:     (id: string) => api.get(`${A}/exams/${id}/re-exam`),
  saveReExam: (id: string, body: object) => api.put(`${A}/exams/${id}/re-exam`, body),
  analytics:  (params: object = {}) => api.get(`${A}/analytics`, { params }),
  merit:      (params: object = {}) => api.get(`${A}/merit`, { params }),
  rechecks:   (params: object = {}) => api.get(`${A}/rechecks`, { params }),
  answerRecheck: (id: string, data: object) => api.put(`${A}/rechecks/${id}`, data),
  tests:      (params: object = {}) => api.get(`${A}/class-tests`, { params }),
  testSheet:  (id: string) => api.get(`${A}/class-tests/${id}/sheet`),
  approveTest: (id: string) => api.post(`${A}/class-tests/${id}/approve`, {}),
  rejectTest: (id: string, reason: string) => api.post(`${A}/class-tests/${id}/reject`, { reason }),
  handOverTest: (id: string, teacherId: string) => api.post(`${A}/class-tests/${id}/hand-over`, { teacherId }),
  deleteTest: (id: string) => api.delete(`${A}/class-tests/${id}`),
  settings:   () => api.get(`${A}/settings`),
  saveSettings: (data: object) => api.put(`${A}/settings`, data),
  electives:  (params: object = {}) => api.get(`${A}/electives`, { params }),
  saveElective: (data: { sectionId: string; subjectId: string; students: string[] | null }) => api.put(`${A}/electives`, data),
  reportCards: (params: CardScope) => api.get(`${A}/report-cards`, { params }),
  saveNotes:  (data: object) => api.put(`${A}/report-cards/notes`, data),
  reportCardsPdf: (params: CardScope & { studentId?: string }) => api.get(`${A}/report-cards/pdf`, { params, responseType: 'blob' }),
  releaseCards: (data: CardScope & { released?: boolean }) => api.post(`${A}/report-cards/release`, data),
  sendCards:  (data: CardScope) => api.post(`${A}/report-cards/send`, data),
};
