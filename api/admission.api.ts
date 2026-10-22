import api from './axios';

/**
 * The admission module's API on the phone (school-backend routes/api/admission.js),
 * the same calls the web uses (school-frontend src/api/admission.api.js).
 *
 *   pub.*     the public portal — no sign-in
 *   portal.*  the signed-in applicant (role guest)
 *   admin.*   admission administrators (school admin, or a teacher who is the module's admin)
 *   staff.*   teachers' admission duties
 *
 * Paths ending in Url are files the server sends behind sign-in — open them
 * with openAdmissionFile (components/admission/files.ts).
 */
type Params = Record<string, any>;
const qs = (params: Params = {}) => {
  const s = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
  return s ? `?${s}` : '';
};
const P = (slug: string) => `/admission/public/portals/${encodeURIComponent(slug)}`;
const A = (id: string) => `/admission/portal/applications/${id}`;
const AD = '/admission/admin';

export const pub = {
  portal: (slug: string) => api.get(P(slug)),
  lottery: (slug: string, listId: string) => api.get(`${P(slug)}/lotteries/${listId}`),
  visits: (slug: string) => api.get(`${P(slug)}/visits`),
  pincode: (pin: string) => api.get(`/admission/public/pincodes/${pin}`),
};

export const portal = {
  me: () => api.get('/admission/portal/me'),
  updates: () => api.get('/admission/portal/updates'),
  list: () => api.get('/admission/portal/applications'),
  detail: (id: string) => api.get(A(id)),
  withdraw: (id: string, reason: string) => api.post(`${A(id)}/withdraw`, { reason }),
  upload: (id: string, form: FormData) => api.post(`${A(id)}/documents`, form, { timeout: 120000, headers: { 'Content-Type': 'multipart/form-data' } }),
  docUrl: (id: string, docId: string) => `${A(id)}/documents/${docId}/file`,
  payLink: (id: string, kind: string) => api.post(`${A(id)}/pay-link`, { kind }),
  reconcile: (id: string, paymentId: string) => api.post(`${A(id)}/payments/${paymentId}/reconcile`),
  receiptUrl: (id: string, paymentId: string) => `${A(id)}/payments/${paymentId}/receipt`,
  respond: (id: string, accept: boolean, note = '', withdrawOthers = false) => api.post(`${A(id)}/offer/respond`, { accept, note, withdrawOthers }),
  lists: (id: string) => api.get(`${A(id)}/lists`),
  ackUrl: (id: string) => `${A(id)}/acknowledgement.pdf`,
  admitUrl: (id: string, examId: string) => `${A(id)}/exams/${examId}/admit-card.pdf`,
  scoreUrl: (id: string, examId: string) => `${A(id)}/exams/${examId}/scorecard.pdf`,
  offerUrl: (id: string) => `${A(id)}/offer-letter.pdf`,
  examSlots: (id: string, examId: string) => api.get(`${A(id)}/exams/${examId}/slots`),
  chooseSlot: (id: string, examId: string, slotId: string) => api.post(`${A(id)}/exams/${examId}/slot`, { slotId }),
  examCalUrl: (id: string, examId: string) => `${A(id)}/exams/${examId}/calendar.ics`,
  visits: () => api.get('/admission/portal/visits'),
  bookVisit: (slotId: string, data: { people: number; note?: string }) => api.post(`/admission/portal/visits/${slotId}/book`, data),
  cancelVisit: (bookingId: string) => api.post(`/admission/portal/visit-bookings/${bookingId}/cancel`),
  visitCalUrl: (bookingId: string) => `/admission/portal/visit-bookings/${bookingId}/calendar.ics`,
  digilocker: (id: string) => api.get(`${A(id)}/digilocker`),
  digilockerStart: (id: string) => api.post(`${A(id)}/digilocker/start`, { client: 'app' }),
  digilockerImport: (id: string, data: { uri: string; docKey: string }) => api.post(`${A(id)}/digilocker/import`, data, { timeout: 60000 }),
  group: () => api.get('/admission/portal/group'),
  groupOrder: (order: string[]) => api.put('/admission/portal/group/preferences', { order }),
  appeals: (id: string) => api.get(`${A(id)}/appeals`),
  fileAppeal: (id: string, data: { kind: string; examId?: string; reason: string }) => api.post(`${A(id)}/appeals`, data),
  withdrawAppeal: (id: string, appealId: string) => api.post(`${A(id)}/appeals/${appealId}/withdraw`),
  privacy: () => api.get('/admission/portal/privacy'),
  privacyExportUrl: () => '/admission/portal/privacy/export',
  privacyRequest: (data: { kind: string; details?: string; application?: string }) => api.post('/admission/portal/privacy/requests', data),
  consent: (version: number) => api.post('/admission/portal/consent', { version }),
};

export const admin = {
  bootstrap: () => api.get(`${AD}/bootstrap`),
  staff: () => api.get(`${AD}/staff`),
  saveSettings: (blocks: Params) => api.put(`${AD}/settings`, blocks),
  health: () => api.get(`${AD}/health`),
  analytics: (params?: Params) => api.get(`${AD}/analytics${qs(params)}`),
  audit: (params?: Params) => api.get(`${AD}/audit${qs(params)}`),

  rounds: () => api.get(`${AD}/rounds`),
  updateRound: (id: string, data: Params) => api.put(`${AD}/rounds/${id}`, data),
  roundStatus: (id: string, status: string) => api.post(`${AD}/rounds/${id}/status`, { status }),
  roundSeats: (id: string) => api.get(`${AD}/rounds/${id}/seats`),
  roundPools: (id: string, classId?: string) => api.get(`${AD}/rounds/${id}/pools${qs({ class: classId })}`),
  releaseQuota: (id: string, data: Params) => api.post(`${AD}/rounds/${id}/quotas/release`, data),
  importRte: (id: string, data: Params) => api.post(`${AD}/rounds/${id}/rte-allotments`, data),
  rteRegister: (year?: string) => api.get(`${AD}/rte/register${qs({ year })}`),
  rteRegisterCsvUrl: (year?: string) => `${AD}/rte/register${qs({ year, format: 'csv' })}`,
  updateRteClaim: (id: string, data: Params) => api.patch(`${AD}/rte/register/${id}`, data),

  applications: (params?: Params) => api.get(`${AD}/applications${qs(params)}`),
  application: (id: string) => api.get(`${AD}/applications/${id}`),
  applicationPdfUrl: (id: string) => `${AD}/applications/${id}/application.pdf`,
  transition: (id: string, data: Params) => api.post(`${AD}/applications/${id}/transition`, data),
  approval: (id: string, approve: boolean, note?: string) => api.post(`${AD}/applications/${id}/approval`, { approve, note }),
  assign: (id: string, userId: string) => api.patch(`${AD}/applications/${id}/assign`, { userId }),
  note: (id: string, text: string) => api.post(`${AD}/applications/${id}/notes`, { text }),
  recordPayment: (id: string, data: Params) => api.post(`${AD}/applications/${id}/payments`, data),
  voidPayment: (id: string, paymentId: string, reason: string) => api.post(`${AD}/applications/${id}/payments/${paymentId}/void`, { reason }),
  refund: (id: string, paymentId: string, data: Params) => api.post(`${AD}/applications/${id}/payments/${paymentId}/refund`, data),
  payLink: (id: string, data: Params) => api.post(`${AD}/applications/${id}/pay-link`, data),
  receiptUrl: (id: string, paymentId: string) => `${AD}/applications/${id}/payments/${paymentId}/receipt`,
  addWaiver: (id: string, data: Params) => api.post(`${AD}/applications/${id}/waivers`, data),
  removeWaiver: (id: string, data: Params) => api.post(`${AD}/applications/${id}/waivers/remove`, data),
  uploadDoc: (id: string, form: FormData) => api.post(`${AD}/applications/${id}/documents`, form, { timeout: 120000, headers: { 'Content-Type': 'multipart/form-data' } }),
  clearDuplicate: (id: string) => api.post(`${AD}/applications/${id}/duplicates/clear`),
  exportUrl: (params: Params) => `${AD}/applications/export${qs(params)}`,
  offer: (id: string, data: Params = {}) => api.post(`${AD}/applications/${id}/offer`, data),
  withdrawOffer: (id: string, reason: string) => api.post(`${AD}/applications/${id}/offer/withdraw`, { reason }),
  extendOffer: (id: string, date: string) => api.post(`${AD}/applications/${id}/offer/extend`, { date }),
  respondOffer: (id: string, accept: boolean, note?: string) => api.post(`${AD}/applications/${id}/offer/respond`, { accept, note }),
  confirmation: (id: string) => api.get(`${AD}/applications/${id}/confirmation`),
  confirm: (id: string) => api.post(`${AD}/applications/${id}/confirm`),
  conversion: (id: string) => api.get(`${AD}/applications/${id}/conversion`),
  convert: (id: string, data: Params) => api.post(`${AD}/applications/${id}/convert`, data, { timeout: 120000 }),
  activate: (id: string) => api.post(`${AD}/applications/${id}/activate`),
  legalHold: (id: string, on: boolean, reason?: string) => api.post(`${AD}/applications/${id}/legal-hold`, { on, reason }),
  setQuota: (id: string, data: Params) => api.patch(`${AD}/applications/${id}/quota`, data),
  reveal: (id: string, field: string) => api.post(`${AD}/applications/${id}/reveal`, { field }),
  siblings: (id: string) => api.get(`${AD}/applications/${id}/siblings`),
  offerTransfer: (id: string, data: Params) => api.post(`${AD}/applications/${id}/transfer`, data),

  documents: (params?: Params) => api.get(`${AD}/documents${qs(params)}`),
  reviewDoc: (docId: string, data: Params) => api.post(`${AD}/documents/${docId}/review`, data),
  docUrl: (docId: string) => `${AD}/documents/${docId}/file`,
  payments: (params?: Params) => api.get(`${AD}/payments${qs(params)}`),
  offers: (params?: Params) => api.get(`${AD}/offers${qs(params)}`),

  exams: (params?: Params) => api.get(`${AD}/exams${qs(params)}`),
  exam: (id: string) => api.get(`${AD}/exams/${id}`),
  updateExam: (id: string, data: Params) => api.put(`${AD}/exams/${id}`, data),
  examSlots: (id: string) => api.get(`${AD}/exams/${id}/slots`),
  scheduleExam: (id: string) => api.post(`${AD}/exams/${id}/schedule`),
  cancelExam: (id: string, reason: string) => api.post(`${AD}/exams/${id}/cancel`, { reason }),
  eligible: (id: string) => api.get(`${AD}/exams/${id}/eligible`),
  // Scheduling candidates for an exam (not `assign`, which gives an application to a colleague).
  assignCandidates: (id: string, applicationIds: string[] | 'all') => api.post(`${AD}/exams/${id}/candidates`, { applicationIds }),
  removeCandidate: (id: string, cid: string) => api.delete(`${AD}/exams/${id}/candidates/${cid}`),
  admitUrl: (id: string, cid: string) => `${AD}/exams/${id}/candidates/${cid}/admit-card.pdf`,
  updateCandidate: (id: string, cid: string, data: Params) => api.patch(`${AD}/exams/${id}/candidates/${cid}`, data),
  attendance: (id: string, cid: string, present: boolean) => api.post(`${AD}/exams/${id}/candidates/${cid}/attendance`, { present }),
  results: (id: string) => api.get(`${AD}/exams/${id}/results`),
  marks: (id: string, rows: any[]) => api.put(`${AD}/exams/${id}/marks`, { rows }),
  submitResults: (id: string) => api.post(`${AD}/exams/${id}/results/submit`),
  approveResults: (id: string) => api.post(`${AD}/exams/${id}/results/approve`),
  publishResults: (id: string, at?: string) => api.post(`${AD}/exams/${id}/results/publish`, { at }),

  lists: (params?: Params) => api.get(`${AD}/lists${qs(params)}`),
  list: (id: string) => api.get(`${AD}/lists/${id}`),
  rebuildList: (id: string) => api.post(`${AD}/lists/${id}/rebuild`),
  decision: (id: string, entryId: string, data: Params) => api.patch(`${AD}/lists/${id}/entries/${entryId}`, data),
  submitList: (id: string) => api.post(`${AD}/lists/${id}/submit`),
  approveList: (id: string) => api.post(`${AD}/lists/${id}/approve`),
  returnList: (id: string, note: string) => api.post(`${AD}/lists/${id}/return`, { note }),
  publishList: (id: string, at?: string) => api.post(`${AD}/lists/${id}/publish`, { at }),
  closeList: (id: string) => api.post(`${AD}/lists/${id}/close`),
  drawList: (id: string, data: Params) => api.post(`${AD}/lists/${id}/draw`, data),
  verifyDraw: (id: string) => api.get(`${AD}/lists/${id}/verify`),
  cancelList: (id: string, reason: string) => api.post(`${AD}/lists/${id}/cancel`, { reason }),

  enquiries: (params?: Params) => api.get(`${AD}/enquiries${qs(params)}`),
  updateEnquiry: (id: string, data: Params) => api.patch(`${AD}/enquiries/${id}`, data),
  createEnquiry: (data: Params) => api.post(`${AD}/enquiries`, data),
  enquiryContact: (id: string, data: Params) => api.post(`${AD}/enquiries/${id}/interactions`, data),
  sources: (params?: Params) => api.get(`${AD}/sources${qs(params)}`),
  applicants: (params?: Params) => api.get(`${AD}/applicants${qs(params)}`),
  setApplicant: (userId: string, isActive: boolean) => api.patch(`${AD}/applicants/${userId}`, { isActive }),
  setSpend: (data: Params) => api.put(`${AD}/sources`, data),

  appeals: (params?: Params) => api.get(`${AD}/appeals${qs(params)}`),
  appeal: (id: string) => api.get(`${AD}/appeals/${id}`),
  assignAppeal: (id: string, userId: string) => api.patch(`${AD}/appeals/${id}/assign`, { userId }),
  decideAppeal: (id: string, data: Params) => api.post(`${AD}/appeals/${id}/decide`, data),

  visits: (params?: Params) => api.get(`${AD}/visits${qs(params)}`),
  openVisits: (data: Params) => api.post(`${AD}/visits`, data),
  updateVisit: (id: string, data: Params) => api.patch(`${AD}/visits/${id}`, data),
  cancelVisit: (id: string, reason: string) => api.post(`${AD}/visits/${id}/cancel`, { reason }),
  visitBookings: (id: string) => api.get(`${AD}/visits/${id}/bookings`),
  markVisit: (bookingId: string, status: string) => api.patch(`${AD}/visit-bookings/${bookingId}`, { status }),

  enrolPlan: (params: Params) => api.get(`${AD}/enrolment/plan${qs(params)}`),
  enrolBulk: (rows: any[]) => api.post(`${AD}/enrolment/bulk`, { rows }, { timeout: 300000 }),
  forecast: (round: string) => api.get(`${AD}/forecast${qs({ round })}`),

  myGroup: () => api.get(`${AD}/group`),
  groupListing: (listed: boolean) => api.put(`${AD}/group/listing`, { listed }),
  transfers: () => api.get(`${AD}/transfers`),
  decideTransfer: (id: string, data: Params) => api.post(`${AD}/transfers/${id}/decide`, data),
  cancelTransfer: (id: string) => api.post(`${AD}/transfers/${id}/cancel`),

  exportJobs: () => api.get(`${AD}/exports`),
  queueExport: (data: Params) => api.post(`${AD}/exports`, data),
  exportFileUrl: (id: string) => `${AD}/exports/${id}/file`,

  privacyRequests: (status?: string) => api.get(`${AD}/privacy/requests${qs({ status })}`),
  answerRequest: (id: string, data: Params) => api.patch(`${AD}/privacy/requests/${id}`, data),
  eraseRequest: (id: string) => api.post(`${AD}/privacy/requests/${id}/erase`),
  retention: () => api.get(`${AD}/privacy/retention`),
  runRetention: () => api.post(`${AD}/privacy/retention/run`),
  accessLog: (params?: Params) => api.get(`${AD}/privacy/access-log${qs(params)}`),

  suppressions: () => api.get(`${AD}/email-suppressions`),
  removeSuppression: (id: string) => api.delete(`${AD}/email-suppressions/${id}`),
  emailLogs: (params?: Params) => api.get(`${AD}/email-logs${qs(params)}`),
  retryEmail: (id: string) => api.post(`${AD}/email-logs/${id}/retry`),
};

export const staff = {
  duties: () => api.get('/admission/staff/duties'),
  application: (id: string) => api.get(`/admission/staff/applications/${id}`),
  transition: (id: string, data: Params) => api.post(`/admission/staff/applications/${id}/transition`, data),
  note: (id: string, text: string) => api.post(`/admission/staff/applications/${id}/notes`, { text }),
  documents: () => api.get('/admission/staff/documents'),
  reviewDoc: (docId: string, data: Params) => api.post(`/admission/staff/documents/${docId}/review`, data),
  docUrl: (docId: string) => `/admission/staff/documents/${docId}/file`,
};

/** The super admin's groups of schools (one admission page for several branches). */
export const groups = {
  list: () => api.get('/super-admin/admission-groups'),
  create: (data: Params) => api.post('/super-admin/admission-groups', data),
  update: (id: string, data: Params) => api.put(`/super-admin/admission-groups/${id}`, data),
  remove: (id: string) => api.delete(`/super-admin/admission-groups/${id}`),
};
