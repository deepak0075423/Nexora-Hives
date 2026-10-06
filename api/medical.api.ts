import api, { BASE_URL } from './axios';

/**
 * The Medical Room on the phone (Oct 2026) — the same endpoints the web uses
 * (school-backend routes/api/medical.js). The server decides what each caller
 * may see; nothing here filters medical information on the phone.
 */

const UPLOAD = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 };

// ─── Teacher ─────────────────────────────────────────────────────────────────
export const teacherMedMeta = () => api.get('/medical/teacher/meta');
export const teacherMedOverview = () => api.get('/medical/teacher/overview');
/** Students to send: `mine` keeps to the sections the teacher teaches. Identity only. */
export const teacherMedStudents = (q: string, mine: boolean) => api.get('/medical/teacher/students', { params: { q, mine: mine ? 1 : undefined } });
export const sendToMedicalRoom = (body: any) => api.post('/medical/teacher/requests', body);
export const withdrawMedRequest = (id: string, reason: string) => api.post(`/medical/teacher/requests/${id}/cancel`, { reason });
export const teacherMedAlerts = () => api.get('/medical/teacher/alerts');
export const teacherMedEmergency = (id: string) => api.get(`/medical/teacher/students/${id}/emergency`);
// In an emergency, any student's card — with a reason; logged, and the Medical Room is told.
export const teacherEmergencyAccess = (body: any) => api.post('/medical/teacher/emergency-access', body);
export const teacherMedIncidents = () => api.get('/medical/teacher/incidents');
export const teacherReportIncident = (body: any) => api.post('/medical/teacher/incidents', body);
// A member of staff's own health record.
export const myStaffHealth = () => api.get('/medical/me/health');
export const saveMyStaffHealth = (body: any) => api.put('/medical/me/health', body);

// ─── Student and parent ──────────────────────────────────────────────────────
export const myMedRecord = () => api.get('/medical/student/record');
export const myMedHistory = (params?: any) => api.get('/medical/student/history', { params });
export const medChildren = () => api.get('/medical/parent/children');
export const childMedRecord = (child: string) => api.get('/medical/parent/record', { params: { child } });
export const childMedHistory = (child: string, params?: any) => api.get('/medical/parent/history', { params: { child, ...params } });
export const childEmergency = (child: string) => api.get('/medical/parent/emergency', { params: { child } });
/** fields: student, kind, action, target, payload (JSON), note — and `file` when one is attached. */
export const sendMedUpdate = (fd: FormData) => api.post('/medical/parent/updates', fd, UPLOAD);
export const withdrawMedUpdate = (id: string) => api.post(`/medical/parent/updates/${id}/withdraw`, {});
export const authorizeMedPlan = (id: string) => api.post(`/medical/parent/plans/${id}/authorize`, { confirm: true });
export const confirmMedCarePlan = (id: string) => api.post(`/medical/parent/care-plans/${id}/confirm`, {});
export const answerUrgentNotice = (id: string, body: any) => api.post(`/medical/parent/urgent/${id}/ack`, body);
export const uploadChildCertificate = (id: string, fd: FormData) => api.post(`/medical/parent/exclusions/${id}/certificate`, fd, UPLOAD);
export const giveFamilyConsent = (body: any) => api.post('/medical/parent/consent', body);
export const withdrawFamilyConsent = (id: string, reason: string) => api.post(`/medical/parent/consent/${id}/withdraw`, { reason });

/** A ten-minute signed link to a medical file the caller may read; open `${BASE_URL}${url}`. */
export const medFileLink = (id: string) => api.get(`/medical/files/${id}`, { params: { link: 1 } });

// ─── The nurse's desk (school admin, or a teacher who administers the module) ─
export const deskOverview = () => api.get('/medical/admin/overview');
export const deskMeta = () => api.get('/medical/admin/meta');
export const deskRoom = () => api.get('/medical/admin/room');
export const deskAlerts = () => api.get('/medical/admin/alerts');
export const deskBoard = (screen: string, params?: any) => api.get(`/medical/admin/board/${screen}`, { params });
export const deskAdministration = (day?: string) => api.get('/medical/admin/administration', { params: { day } });
export const deskStudents = (q: string, limit = 20) => api.get('/medical/admin/students', { params: { q, limit } });
export const deskEmergency = (id: string) => api.get(`/medical/admin/students/${id}/emergency`);
// Readings, triage, protocols and the body map.
export const careLibrary = () => api.get('/medical/admin/care-library');
export const addVisitReading = (id: string, body: any) => api.post(`/medical/admin/visits/${id}/readings`, body);
export const setVisitTriage = (id: string, body: any) => api.post(`/medical/admin/visits/${id}/triage`, body);
export const setVisitProtocol = (id: string, body: any) => api.post(`/medical/admin/visits/${id}/protocol`, body);
export const setVisitInjuries = (id: string, injuries: any[]) => api.put(`/medical/admin/visits/${id}/injuries`, { injuries });
export const uploadMedDocument = (studentId: string, fd: FormData) => api.post(`/medical/admin/students/${studentId}/documents`, fd, UPLOAD);
export const exclusionRules = () => api.get('/medical/admin/exclusion-rules');
export const searchStaff = (q: string) => api.get('/medical/admin/staff-health/search', { params: { q } });
export const logFridge = (body: any) => api.post('/medical/admin/fridge', body);
export const sendStepUpCode = () => api.post('/medical/admin/step-up/send', {});
export const verifyStepUpCode = (code: string) => api.post('/medical/admin/step-up/verify', { code });
// Safeguarding: any member of staff raises a concern; the leads read the log (on the web).
export const safeguardingMe = () => api.get('/medical/safeguarding/me');
export const raiseConcern = (body: any) => api.post('/medical/safeguarding/concerns', body);
export const myConcerns = () => api.get('/medical/safeguarding/mine');
// Urgent news to families: who has been reached.
export const deskUrgent = () => api.get('/medical/admin/urgent');
export const logUrgentAttempt = (id: string, body: any) => api.post(`/medical/admin/urgent/${id}/attempt`, body);
export const closeUrgentNotice = (id: string, body: any) => api.post(`/medical/admin/urgent/${id}/close`, body);

export const acceptMedRequest = (id: string, note?: string) => api.post(`/medical/admin/requests/${id}/accept`, { note });
export const cancelMedRequest = (id: string, reason: string) => api.post(`/medical/admin/requests/${id}/cancel`, { reason });

export const createMedVisit = (body: any) => api.post('/medical/admin/visits', body);
export const getMedVisit = (id: string) => api.get(`/medical/admin/visits/${id}`);
export const updateMedVisit = (id: string, body: any) => api.put(`/medical/admin/visits/${id}`, body);
export const setMedVisitStatus = (id: string, body: any) => api.post(`/medical/admin/visits/${id}/status`, body);

export const createMedIncident = (body: any) => api.post('/medical/admin/incidents', body);
export const treatMedIncident = (id: string) => api.post(`/medical/admin/incidents/${id}/treat`, {});

/** status: given | missed | refused (a refusal needs a note). */
export const recordMedDose = (id: string, body: any) => api.post(`/medical/admin/doses/${id}/record`, body);
/** A dose now — against a plan, or from stock / the family's own. */
export const giveMedDose = (body: any) => api.post('/medical/admin/doses/give', body);
// Before a medicine is given: the safety check (allergy, gap, daily maximum) and what was given lately.
export const checkDoseSafety = (body: any) => api.post('/medical/admin/safety/check', body);
// Sent home: the people on record who may collect the student, and who did.
export const visitCollectors = (id: string) => api.get(`/medical/admin/visits/${id}/collectors`);
export const recordVisitCollection = (id: string, body: any) => api.post(`/medical/admin/visits/${id}/collection`, body);

/** Where the school's files (photos) are served — the API's root, without /api. */
export const FILE_ROOT = String(BASE_URL).replace(/\/api\/?$/, '');
export const photoUrl = (p?: string | null) => (!p ? '' : /^(https?:|data:)/.test(p) ? p : `${FILE_ROOT}${p.startsWith('/') ? '' : '/'}${p}`);
export const apiUrl = (path: string) => `${BASE_URL}${path}`;

// ─── Health programmes (Oct 2026) ───────────────────────────────────────────
// The desk: a campaign's roster on the day, the outbreak watch, families' "off sick" reports.
export const deskCampaigns = (params?: any) => api.get('/medical/admin/campaigns', { params });
export const deskCampaign = (id: string, params?: any) => api.get(`/medical/admin/campaigns/${id}`, { params });
export const recordCampaign = (id: string, body: any) => api.post(`/medical/admin/campaigns/${id}/record`, body);
export const markCampaignRest = (id: string, body: any) => api.post(`/medical/admin/campaigns/${id}/mark-rest`, body);
export const deskOutbreak = (id: string) => api.get(`/medical/admin/outbreaks/${id}`);
export const outbreakAct = (id: string, body: any) => api.post(`/medical/admin/outbreaks/${id}/act`, body);
export const outbreakNoticeDraft = (id: string, audience: string) => api.get(`/medical/admin/outbreaks/${id}/notice-draft`, { params: { audience } });
export const sendOutbreakNotice = (id: string, body: any) => api.post(`/medical/admin/outbreaks/${id}/notice`, body);
export const deskIllnessReports = (params?: any) => api.get('/medical/admin/illness-reports', { params });
export const markIllnessSeen = (id: string) => api.post(`/medical/admin/illness-reports/${id}/seen`, {});
// The family: a campaign's yes/no, a referral's answer (with the doctor's report), "my child is unwell".
export const answerCampaign = (body: any) => api.post('/medical/parent/campaigns/answer', body);
export const answerReferral = (id: string, body: any) => api.post(`/medical/parent/referrals/${id}/answer`, body);
export const answerReferralWithReport = (id: string, fd: FormData) => api.post(`/medical/parent/referrals/${id}/answer`, fd, UPLOAD);
export const reportIllness = (body: any) => api.post('/medical/parent/illness', body);
export const withdrawIllness = (id: string) => api.post(`/medical/parent/illness/${id}/withdraw`, {});

// ─── The nurse's phone (Oct 2026): scan, a class's checkup sheet, add to a record, offline cards ───
/** A scanned ID card (its QR address, code or number) or an admission number → the student. */
export const resolveStudent = (q: string) => api.get('/medical/admin/resolve', { params: { q } });
/** A scanned medicine pack → the item and what is usable. */
export const itemByCode = (code: string) => api.get('/medical/admin/items/by-code', { params: { code } });
export const checkupSession = (id: string) => api.get(`/medical/admin/checkups/sessions/${id}`);
export const saveCheckupSheet = (body: any) => api.post('/medical/admin/checkups/sheet', body);
export const assessGrowth = (body: any) => api.post('/medical/admin/growth/assess', body);
export const addStudentAllergy = (id: string, body: any) => api.post(`/medical/admin/students/${id}/allergies`, body);
export const addStudentCondition = (id: string, body: any) => api.post(`/medical/admin/students/${id}/conditions`, body);
export const addStudentVaccination = (id: string, body: any) => api.post(`/medical/admin/students/${id}/vaccinations`, body);
export const offlineCards = () => api.get('/medical/admin/offline-cards', { timeout: 120000 });
/** The language the Medical Room writes to this parent in: '' (the school's choice), 'en' or 'hi'. */
export const setFamilyLanguage = (language: string) => api.post('/medical/parent/language', { language });
